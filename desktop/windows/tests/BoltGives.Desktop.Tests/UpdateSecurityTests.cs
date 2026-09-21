using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class UpdateSecurityTests
{
    private static UpdateManifest CreateManifest() => new()
    {
        Version = "1.11.0",
        Mandatory = true,
        MinimumSupportedVersion = "1.11.0",
        InstallerUrl = "https://github.com/embire2/bolt.gives/releases/download/desktop-v1.11.0/bolt.gives-Desktop-Setup-1.11.0-x64.exe",
        Sha256 = new string('a', 64),
        InstallerSize = 100,
    };

    [Fact]
    public void AcceptsOnlyTheExactVersionedGithubReleaseAsset()
    {
        var manifest = CreateManifest();
        Assert.Equal(new Version(1, 11, 0), UpdateSecurity.ValidateManifest(manifest, new Version(1, 0, 1)));

        manifest.InstallerUrl = "https://evil.example/bolt.gives-Desktop-Setup-1.11.0-x64.exe";
        Assert.Throws<InvalidOperationException>(() => UpdateSecurity.ValidateManifest(manifest, new Version(1, 0, 1)));
    }

    [Fact]
    public void MinimumSupportedVersionForcesAnOtherwiseOptionalUpdate()
    {
        var manifest = CreateManifest();
        manifest.Mandatory = false;
        Assert.True(UpdateSecurity.IsMandatoryFor(manifest, new Version(1, 0, 1)));
        Assert.False(UpdateSecurity.IsMandatoryFor(manifest, new Version(1, 11, 0)));
    }

    [Fact]
    public void RejectsHashAndSizeTampering()
    {
        var manifest = CreateManifest();
        manifest.Sha256 = "not-a-hash";
        Assert.Throws<InvalidOperationException>(() => UpdateSecurity.ValidateManifest(manifest, new Version(1, 0, 1)));

        manifest = CreateManifest();
        manifest.InstallerSize = UpdateSecurity.MaximumInstallerBytes + 1;
        Assert.Throws<InvalidOperationException>(() => UpdateSecurity.ValidateManifest(manifest, new Version(1, 0, 1)));
    }

    [Fact]
    public void PreservesTheHashAsAValueWhenParsingUpdaterArguments()
    {
        var handoffPath = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "bolt-update-handoff.json"));
        var hash = new string('b', 64);

        var parsed = UpdateLaunchArgumentParser.Parse([
            "--handoff",
            handoffPath,
            "--handoff-sha256",
            hash,
        ]);

        Assert.Equal(handoffPath, parsed.HandoffPath);
        Assert.Equal(hash, parsed.HandoffSha256);
        Assert.False(Path.IsPathFullyQualified(parsed.HandoffSha256));
    }

    [Theory]
    [InlineData("relative-handoff.json", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("/tmp/handoff.json", "not-a-hash")]
    public void RejectsAmbiguousUpdaterArguments(string path, string hash)
    {
        Assert.Throws<InvalidOperationException>(() => UpdateLaunchArgumentParser.Parse([
            "--handoff",
            path,
            "--handoff-sha256",
            hash,
        ]));
    }

    [Fact]
    public void EmbedsEveryPinnedArtifactSigningCertificate()
    {
        var resources = typeof(AuthenticodeVerifier).Assembly.GetManifestResourceNames();

        Assert.Contains(resources, name => name.EndsWith("microsoft-enterprise-identity-verification-root-2020.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-enterprise-id-verification-cs-aoc-ca-03.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-enterprise-identity-verification-code-signing-pca-2020.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-identity-verification-root-2020.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-cs-aoc-ca-03.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-cs-aoc-ca-04.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-cs-eoc-ca-03.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-cs-eoc-ca-04.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-code-signing-pca-2021.cer"));
    }

    [Fact]
    public void RequiresTheValidatedBoltGivesPublisherIdentity()
    {
        const string expected = "CN=lovemedia2.onmicrosoft.com, O=lovemedia2.onmicrosoft.com, OU=OpenWeb.co.za, STREET=22 Ladlau Drive, L=Ballito, S=KwaZulu-Natal, C=ZA, PostalCode=4399";

        Assert.True(AuthenticodeVerifier.IsExpectedPublisherSubject(expected));
        Assert.False(AuthenticodeVerifier.IsExpectedPublisherSubject(expected.Replace("O=lovemedia2.onmicrosoft.com", "O=Imposter Ltd")));
    }

    [Fact]
    public void AcceptsEveryApprovedArtifactSigningIssuerRotation()
    {
        const string currentRoot = "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270";
        const string currentPca = "3D29798CC5D3F0644A7E0DC9CB1CADE523EA5EC83B335109B605BFEAA7D5F5C1";
        string[] currentIssuers =
        [
            "ACAA07D57D4274B290D86C156AA0D6C5633E3CD92D43751E6A0F797C5B2DFF4D",
            "15CEF5F63CA6D1F022B293E92C61C0059C49BB92EECDBCDE3A125D3C6356D94F",
            "BFF5C1A54B421E0CC12372F221FA56E6F1B0305A9C071A2AF1BF45893D2A4623",
            "BC309555FA42C563B8EEBFB7117695C6BAE89E4BA19C03CB721979A563A60929",
        ];

        foreach (var issuer in currentIssuers)
            Assert.True(AuthenticodeVerifier.MatchesApprovedHierarchy([currentRoot, currentPca, issuer]));

        Assert.True(AuthenticodeVerifier.MatchesApprovedHierarchy([
            "D549DC2314F7A16E496A515491B273BC9C098E40A070D61EF1602870F0C402D8",
            "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16",
            "39C27939CF5BF64E79BAF65AD40E7A93EEE861740433D4492F5030FC777D63C2",
        ]));
    }

    [Fact]
    public void RejectsPartialOrMixedArtifactSigningHierarchies()
    {
        Assert.False(AuthenticodeVerifier.MatchesApprovedHierarchy([
            "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270",
            "D603BCAAA62A93C0BE43BDE5E5B58047B39FFFC3D4083313E940E09BA8D3EB16",
            "ACAA07D57D4274B290D86C156AA0D6C5633E3CD92D43751E6A0F797C5B2DFF4D",
        ]));
        Assert.False(AuthenticodeVerifier.MatchesApprovedHierarchy([
            "5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270",
            "3D29798CC5D3F0644A7E0DC9CB1CADE523EA5EC83B335109B605BFEAA7D5F5C1",
        ]));
    }
}
