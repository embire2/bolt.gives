using System.Security.Cryptography;
using System.Text.RegularExpressions;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public static partial class UpdateSecurity
{
    public const long MaximumInstallerBytes = 350L * 1024 * 1024;

    public static Version ValidateManifest(UpdateManifest manifest, Version currentVersion)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(currentVersion);

        if (!Version.TryParse(manifest.Version, out var targetVersion) || targetVersion <= currentVersion)
        {
            throw new InvalidOperationException("The Desktop update version is invalid or is not newer than this app.");
        }

        if (!Sha256Regex().IsMatch(manifest.Sha256))
        {
            throw new InvalidOperationException("The Desktop update manifest has an invalid SHA-256 value.");
        }

        if (manifest.InstallerSize < 0 || manifest.InstallerSize > MaximumInstallerBytes)
        {
            throw new InvalidOperationException("The Desktop update manifest has an invalid installer size.");
        }

        if (!Uri.TryCreate(manifest.InstallerUrl, UriKind.Absolute, out var installerUri) ||
            !IsTrustedInstallerUri(installerUri, manifest.Version))
        {
            throw new InvalidOperationException("The Desktop update source is not trusted.");
        }

        return targetVersion;
    }

    public static bool IsMandatoryFor(UpdateManifest manifest, Version currentVersion)
    {
        if (manifest.Mandatory) return true;
        return Version.TryParse(manifest.MinimumSupportedVersion, out var minimum) && currentVersion < minimum;
    }

    public static bool IsTrustedInstallerUri(Uri uri, string version)
    {
        if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase) ||
            !Version.TryParse(version, out _))
        {
            return false;
        }

        var expectedPath = $"/embire2/bolt.gives/releases/download/desktop-v{version}/bolt.gives-Desktop-Setup-{version}-x64.exe";
        return uri.Port == 443 &&
               string.IsNullOrEmpty(uri.Query) &&
               string.IsNullOrEmpty(uri.Fragment) &&
               Uri.UnescapeDataString(uri.AbsolutePath).Equals(expectedPath, StringComparison.Ordinal);
    }

    public static async Task<string> ComputeSha256Async(string path, CancellationToken cancellationToken = default)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken)).ToLowerInvariant();
    }

    public static bool FixedTimeHashEquals(string expected, string actual)
    {
        if (!IsSha256(expected) || !IsSha256(actual)) return false;
        return CryptographicOperations.FixedTimeEquals(Convert.FromHexString(expected), Convert.FromHexString(actual));
    }

    public static bool IsSha256(string value) => !string.IsNullOrWhiteSpace(value) && Sha256Regex().IsMatch(value);

    [GeneratedRegex("^[0-9a-fA-F]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex Sha256Regex();
}
