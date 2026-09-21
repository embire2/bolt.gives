using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace BoltGives.Desktop.Services;

public sealed record ArtifactVerificationResult(bool IsTrusted, string Message);

public static class AuthenticodeVerifier
{
    private sealed record CertificatePin(string Resource, string Hash, bool IsRoot);

    private const string LegacyRootHash = "D549DC2314F7A16E496A515491B273BC9C098E40A070D61EF1602870F0C402D8";
    private const string LegacyIssuerHash = "39C27939CF5BF64E79BAF65AD40E7A93EEE861740433D4492F5030FC777D63C2";
    private const string LegacyPcaHash = "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16";
    private const string CurrentRootHash = "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270";
    private const string CurrentPcaHash = "3D29798CC5D3F0644A7E0DC9CB1CADE523EA5EC83B335109B605BFEAA7D5F5C1";
    private const string CurrentAoc03Hash = "ACAA07D57D4274B290D86C156AA0D6C5633E3CD92D43751E6A0F797C5B2DFF4D";
    private const string CurrentAoc04Hash = "15CEF5F63CA6D1F022B293E92C61C0059C49BB92EECDBCDE3A125D3C6356D94F";
    private const string CurrentEoc03Hash = "BFF5C1A54B421E0CC12372F221FA56E6F1B0305A9C071A2AF1BF45893D2A4623";
    private const string CurrentEoc04Hash = "BC309555FA42C563B8EEBFB7117695C6BAE89E4BA19C03CB721979A563A60929";

    private static readonly CertificatePin[] CertificatePins =
    [
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-identity-verification-root-2020.cer", LegacyRootHash, true),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-id-verification-cs-aoc-ca-03.cer", LegacyIssuerHash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-identity-verification-code-signing-pca-2020.cer", LegacyPcaHash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-identity-verification-root-2020.cer", CurrentRootHash, true),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-id-verified-code-signing-pca-2021.cer", CurrentPcaHash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-id-verified-cs-aoc-ca-03.cer", CurrentAoc03Hash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-id-verified-cs-aoc-ca-04.cer", CurrentAoc04Hash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-id-verified-cs-eoc-ca-03.cer", CurrentEoc03Hash, false),
        new("BoltGives.Desktop.UpdateCore.Certificates.microsoft-id-verified-cs-eoc-ca-04.cer", CurrentEoc04Hash, false),
    ];
    private static readonly string[][] ApprovedHierarchies =
    [
        [LegacyRootHash, LegacyPcaHash, LegacyIssuerHash],
        [CurrentRootHash, CurrentPcaHash, CurrentAoc03Hash],
        [CurrentRootHash, CurrentPcaHash, CurrentAoc04Hash],
        [CurrentRootHash, CurrentPcaHash, CurrentEoc03Hash],
        [CurrentRootHash, CurrentPcaHash, CurrentEoc04Hash],
    ];
    private static readonly string[] ExpectedPublisherAttributes =
    [
        "CN=lovemedia2.onmicrosoft.com",
        "O=lovemedia2.onmicrosoft.com",
        "OU=OpenWeb.co.za",
        "C=ZA",
    ];
    private static readonly Guid GenericVerifyV2 = new("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
    private const int Success = 0;
    private const int CertUntrustedRoot = unchecked((int)0x800B0109);
    private const int CertChaining = unchecked((int)0x800B010A);
    private const int SubjectNotTrusted = unchecked((int)0x800B0004);

    public static ArtifactVerificationResult Verify(string path)
    {
        if (!OperatingSystem.IsWindows()) return new(false, "Authenticode verification requires Windows.");
        if (!File.Exists(path)) return new(false, "The signed artifact is missing.");

        var trustResult = VerifyEmbeddedSignature(path);
        if (trustResult is not (Success or CertUntrustedRoot or CertChaining or SubjectNotTrusted))
            return new(false, $"Windows rejected the Authenticode signature (0x{trustResult:X8}).");

        try
        {
            using var signer = new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
            var pinnedCertificates = CertificatePins.Select(LoadPinnedCertificate).ToList();
            try
            {
                if (!IsExpectedPublisherSubject(signer.Subject))
                    return new(false, "The artifact publisher identity does not match bolt.gives.");
                if (!HasCodeSigningUsage(signer)) return new(false, "The artifact signer is not valid for code signing.");

                using var chain = new X509Chain();
                chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                chain.ChainPolicy.VerificationFlags = X509VerificationFlags.IgnoreNotTimeValid;
                chain.ChainPolicy.CustomTrustStore.AddRange(
                    new X509Certificate2Collection(pinnedCertificates.Where(item => item.Pin.IsRoot).Select(item => item.Certificate).ToArray()));
                chain.ChainPolicy.ExtraStore.AddRange(
                    new X509Certificate2Collection(pinnedCertificates.Where(item => !item.Pin.IsRoot).Select(item => item.Certificate).ToArray()));
                if (!chain.Build(signer))
                {
                    var details = string.Join(", ", chain.ChainStatus.Select(item => item.Status));
                    return new(false, $"The artifact does not chain to a pinned Azure signing root: {details}");
                }

                var chainHashes = chain.ChainElements
                    .Select(element => element.Certificate.GetCertHashString(HashAlgorithmName.SHA256))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                if (!MatchesApprovedHierarchy(chainHashes))
                    return new(false, "The artifact publisher chain does not match a pinned bolt.gives signing hierarchy.");

                return new(true, "Authenticode signature and pinned publisher chain verified.");
            }
            finally
            {
                foreach (var item in pinnedCertificates) item.Certificate.Dispose();
            }
        }
        catch (CryptographicException error)
        {
            return new(false, $"The Authenticode certificate could not be verified: {error.Message}");
        }
    }

    public static void VerifyOrThrow(string path)
    {
        var result = Verify(path);
        if (!result.IsTrusted) throw new InvalidOperationException(result.Message);
    }

    private static bool HasCodeSigningUsage(X509Certificate2 certificate)
    {
        var usages = certificate.Extensions.OfType<X509EnhancedKeyUsageExtension>().ToList();
        return usages.Count == 0 || usages.Any(extension =>
            extension.EnhancedKeyUsages.OfType<Oid>().Any(oid => oid.Value == "1.3.6.1.5.5.7.3.3"));
    }

    internal static bool IsExpectedPublisherSubject(string subject)
    {
        var attributes = subject.Split(',').Select(attribute => attribute.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return ExpectedPublisherAttributes.All(attributes.Contains);
    }

    internal static bool MatchesApprovedHierarchy(IEnumerable<string> certificateHashes)
    {
        var hashes = certificateHashes.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return ApprovedHierarchies.Any(hierarchy => hierarchy.All(hashes.Contains));
    }

    private static (CertificatePin Pin, X509Certificate2 Certificate) LoadPinnedCertificate(CertificatePin pin)
    {
        using var stream = typeof(AuthenticodeVerifier).Assembly.GetManifestResourceStream(pin.Resource)
            ?? throw new CryptographicException($"Pinned signing certificate {pin.Resource} is missing.");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        var certificate = new X509Certificate2(memory.ToArray());
        if (!certificate.GetCertHashString(HashAlgorithmName.SHA256).Equals(pin.Hash, StringComparison.OrdinalIgnoreCase))
        {
            certificate.Dispose();
            throw new CryptographicException("A pinned signing certificate failed its SHA-256 check.");
        }
        return (pin, certificate);
    }

    private static int VerifyEmbeddedSignature(string path)
    {
        var fileInfo = new WinTrustFileInfo(path);
        var fileInfoPointer = Marshal.AllocHGlobal(Marshal.SizeOf<WinTrustFileInfo>());
        var trustDataPointer = Marshal.AllocHGlobal(Marshal.SizeOf<WinTrustData>());

        try
        {
            Marshal.StructureToPtr(fileInfo, fileInfoPointer, false);
            var trustData = new WinTrustData(fileInfoPointer) { StateAction = 1 };
            Marshal.StructureToPtr(trustData, trustDataPointer, false);
            var result = WinVerifyTrust(new IntPtr(-1), GenericVerifyV2, trustDataPointer);

            trustData = Marshal.PtrToStructure<WinTrustData>(trustDataPointer);
            trustData.StateAction = 2;
            Marshal.StructureToPtr(trustData, trustDataPointer, true);
            _ = WinVerifyTrust(new IntPtr(-1), GenericVerifyV2, trustDataPointer);
            return result;
        }
        finally
        {
            Marshal.DestroyStructure<WinTrustData>(trustDataPointer);
            Marshal.FreeHGlobal(trustDataPointer);
            Marshal.DestroyStructure<WinTrustFileInfo>(fileInfoPointer);
            Marshal.FreeHGlobal(fileInfoPointer);
        }
    }

    [DllImport("wintrust.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int WinVerifyTrust(
        IntPtr windowHandle,
        [MarshalAs(UnmanagedType.LPStruct)] Guid actionId,
        IntPtr trustData);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WinTrustFileInfo
    {
        public uint StructSize;
        [MarshalAs(UnmanagedType.LPWStr)] public string FilePath;
        public IntPtr FileHandle;
        public IntPtr KnownSubject;

        public WinTrustFileInfo(string filePath)
        {
            StructSize = (uint)Marshal.SizeOf<WinTrustFileInfo>();
            FilePath = filePath;
            FileHandle = IntPtr.Zero;
            KnownSubject = IntPtr.Zero;
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WinTrustData
    {
        public uint StructSize;
        public IntPtr PolicyCallbackData;
        public IntPtr SipClientData;
        public uint UiChoice;
        public uint RevocationChecks;
        public uint UnionChoice;
        public IntPtr FileInfo;
        public uint StateAction;
        public IntPtr StateData;
        [MarshalAs(UnmanagedType.LPWStr)] public string? UrlReference;
        public uint ProviderFlags;
        public uint UiContext;

        public WinTrustData(IntPtr fileInfo)
        {
            StructSize = (uint)Marshal.SizeOf<WinTrustData>();
            PolicyCallbackData = IntPtr.Zero;
            SipClientData = IntPtr.Zero;
            UiChoice = 2;
            RevocationChecks = 0;
            UnionChoice = 1;
            FileInfo = fileInfo;
            StateAction = 0;
            StateData = IntPtr.Zero;
            UrlReference = null;
            ProviderFlags = 0x1000;
            UiContext = 0;
        }
    }
}
