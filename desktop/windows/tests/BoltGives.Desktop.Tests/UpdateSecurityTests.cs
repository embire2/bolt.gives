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
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-cs-aoc-ca-04.cer"));
        Assert.Contains(resources, name => name.EndsWith("microsoft-id-verified-code-signing-pca-2021.cer"));
    }

    [Fact]
    public void RequiresTheValidatedBoltGivesPublisherIdentity()
    {
        const string expected = "CN=lovemedia2.onmicrosoft.com, O=lovemedia2.onmicrosoft.com, OU=OpenWeb.co.za, STREET=22 Ladlau Drive, L=Ballito, S=KwaZulu-Natal, C=ZA, PostalCode=4399";

        Assert.True(AuthenticodeVerifier.IsExpectedPublisherSubject(expected));
        Assert.False(AuthenticodeVerifier.IsExpectedPublisherSubject(expected.Replace("O=lovemedia2.onmicrosoft.com", "O=Imposter Ltd")));
    }
}
