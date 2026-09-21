using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace BoltGives.Desktop.Services;

public sealed record ArtifactVerificationResult(bool IsTrusted, string Message);

public static class AuthenticodeVerifier
{
    private const string RootResource = "BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-identity-verification-root-2020.cer";
    private const string AocResource = "BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-id-verification-cs-aoc-ca-03.cer";
    private const string PcaResource = "BoltGives.Desktop.UpdateCore.Certificates.microsoft-enterprise-identity-verification-code-signing-pca-2020.cer";
    private const string RootHash = "D549DC2314F7A16E496A515491B273BC9C098E40A070D61EF1602870F0C402D8";
    private const string AocHash = "39C27939CF5BF64E79BAF65AD40E7A93EEE861740433D4492F5030FC777D63C2";
    private const string PcaHash = "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16";
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
            using var root = LoadPinnedCertificate(RootResource, RootHash);
            using var aoc = LoadPinnedCertificate(AocResource, AocHash);
            using var pca = LoadPinnedCertificate(PcaResource, PcaHash);
            if (!HasCodeSigningUsage(signer)) return new(false, "The artifact signer is not valid for code signing.");

            using var chain = new X509Chain();
            chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.ChainPolicy.VerificationFlags = X509VerificationFlags.IgnoreNotTimeValid;
            chain.ChainPolicy.CustomTrustStore.Add(root);
            chain.ChainPolicy.ExtraStore.Add(aoc);
            chain.ChainPolicy.ExtraStore.Add(pca);
            if (!chain.Build(signer))
            {
                var details = string.Join(", ", chain.ChainStatus.Select(item => item.Status));
                return new(false, $"The artifact does not chain to the pinned Azure signing root: {details}");
            }

            var chainHashes = chain.ChainElements
                .Select(element => element.Certificate.GetCertHashString(HashAlgorithmName.SHA256))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (!chainHashes.Contains(RootHash) || !chainHashes.Contains(AocHash) || !chainHashes.Contains(PcaHash))
                return new(false, "The artifact publisher chain does not match the pinned bolt.gives signing hierarchy.");

            return new(true, "Authenticode signature and pinned publisher chain verified.");
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

    private static X509Certificate2 LoadPinnedCertificate(string resourceName, string expectedHash)
    {
        using var stream = typeof(AuthenticodeVerifier).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new CryptographicException($"Pinned signing certificate {resourceName} is missing.");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        var certificate = new X509Certificate2(memory.ToArray());
        if (!certificate.GetCertHashString(HashAlgorithmName.SHA256).Equals(expectedHash, StringComparison.OrdinalIgnoreCase))
        {
            certificate.Dispose();
            throw new CryptographicException("A pinned signing certificate failed its SHA-256 check.");
        }
        return certificate;
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
