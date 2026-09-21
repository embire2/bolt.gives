using System.ComponentModel;
using System.Diagnostics;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public sealed record DesktopUpdateProgress(double Percentage, string Message);

public sealed class UpdateService : IDisposable
{
    private const string ReleasesEndpoint = "https://api.github.com/repos/embire2/bolt.gives/releases?per_page=30";
    private const string ManifestName = "bolt.gives-Desktop-update.json";
    private const string UpdaterName = "BoltGives.Desktop.Updater.exe";
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;
    private readonly Version _currentVersion;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public UpdateService(string currentVersion, HttpClient? httpClient = null)
    {
        _currentVersion = Version.Parse(currentVersion);
        _ownsHttp = httpClient is null;
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        if (!_http.DefaultRequestHeaders.UserAgent.Any())
            _http.DefaultRequestHeaders.UserAgent.ParseAdd($"bolt.gives-desktop/{currentVersion}");
        if (!_http.DefaultRequestHeaders.Accept.Any())
            _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    }

    public async Task<UpdateManifest?> CheckAsync(CancellationToken cancellationToken = default)
    {
        var releases = await _http.GetFromJsonAsync<List<GitHubRelease>>(ReleasesEndpoint, cancellationToken) ?? [];
        var desktopRelease = releases
            .Where(release => !release.Draft && !release.Prerelease && release.TagName.StartsWith("desktop-v", StringComparison.OrdinalIgnoreCase))
            .Select(release => new { Release = release, Version = ParseTagVersion(release.TagName) })
            .Where(item => item.Version is not null && item.Version > _currentVersion)
            .OrderByDescending(item => item.Version)
            .FirstOrDefault();
        var manifestAsset = desktopRelease?.Release.Assets.FirstOrDefault(asset =>
            asset.Name.Equals(ManifestName, StringComparison.OrdinalIgnoreCase));
        if (desktopRelease?.Version is null || manifestAsset is null) return null;
        if (!IsTrustedManifestUri(manifestAsset.BrowserDownloadUrl, desktopRelease.Release.TagName))
            throw new InvalidOperationException("The Desktop update manifest source is not trusted.");

        var manifest = await _http.GetFromJsonAsync<UpdateManifest>(manifestAsset.BrowserDownloadUrl, cancellationToken)
            ?? throw new InvalidOperationException("The Desktop update manifest was empty.");
        var targetVersion = UpdateSecurity.ValidateManifest(manifest, _currentVersion);
        if (targetVersion != desktopRelease.Version)
            throw new InvalidOperationException("The Desktop release tag and update manifest version do not match.");
        manifest.Mandatory = UpdateSecurity.IsMandatoryFor(manifest, _currentVersion);
        return manifest;
    }

    public async Task DownloadAndInstallAsync(
        UpdateManifest manifest,
        IProgress<DesktopUpdateProgress> progress,
        CancellationToken cancellationToken = default)
    {
        _ = UpdateSecurity.ValidateManifest(manifest, _currentVersion);
        var stateDirectory = UpdateHandoffValidator.GetLocalStateDirectory();
        var stagingDirectory = Path.Combine(stateDirectory, "updates", $"{manifest.Version}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(stagingDirectory);
        var installerPath = Path.Combine(stagingDirectory, $"bolt.gives-Desktop-Setup-{manifest.Version}-x64.exe");
        var partialPath = installerPath + ".part";

        try
        {
            progress.Report(new(1, "Connecting to the signed release channel..."));
            using var response = await _http.GetAsync(manifest.InstallerUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            var total = response.Content.Headers.ContentLength;
            if (total is > UpdateSecurity.MaximumInstallerBytes)
                throw new InvalidOperationException("The Desktop installer exceeds the allowed download size.");
            if (manifest.InstallerSize > 0 && total > 0 && manifest.InstallerSize != total)
                throw new InvalidOperationException("The Desktop installer size does not match the release manifest.");

            await using (var input = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var output = new FileStream(partialPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                             128 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                var buffer = new byte[128 * 1024];
                long readTotal = 0;
                int read;
                while ((read = await input.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    readTotal += read;
                    if (readTotal > UpdateSecurity.MaximumInstallerBytes)
                        throw new InvalidOperationException("The Desktop installer exceeded the allowed download size.");
                    await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                    var percentage = total > 0 ? 5 + (double)readTotal / total.Value * 70 : 35;
                    progress.Report(new(percentage, $"Downloading Desktop {manifest.Version}: {readTotal / 1024 / 1024:N0} MB"));
                }
                await output.FlushAsync(cancellationToken);
                if (manifest.InstallerSize > 0 && readTotal != manifest.InstallerSize)
                    throw new InvalidOperationException("The completed Desktop installer size does not match the release manifest.");
            }
            File.Move(partialPath, installerPath);

            progress.Report(new(78, "Verifying SHA-256 integrity..."));
            var actualHash = await UpdateSecurity.ComputeSha256Async(installerPath, cancellationToken);
            if (!UpdateSecurity.FixedTimeHashEquals(manifest.Sha256, actualHash))
                throw new InvalidOperationException("The downloaded Desktop update failed its SHA-256 integrity check.");

            progress.Report(new(84, "Verifying the bolt.gives publisher signature..."));
            AuthenticodeVerifier.VerifyOrThrow(installerPath);
            var installedUpdater = Path.Combine(AppContext.BaseDirectory, UpdaterName);
            AuthenticodeVerifier.VerifyOrThrow(installedUpdater);
            var stagedUpdater = Path.Combine(stagingDirectory, UpdaterName);
            File.Copy(installedUpdater, stagedUpdater, true);

            var nowKey = DateTimeOffset.UtcNow.ToString("yyyyMMddHHmmss");
            var handoff = new UpdateHandoff
            {
                Version = manifest.Version,
                PreviousVersion = _currentVersion.ToString(3),
                ParentProcessId = Environment.ProcessId,
                InstallerPath = installerPath,
                InstallerSha256 = actualHash,
                ApplicationPath = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "BoltGives.Desktop.exe"),
                InstallDirectory = Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory),
                ResultPath = GetResultPath(),
                LogPath = Path.Combine(stateDirectory, "updates", $"update-{nowKey}.log"),
                RollbackDirectory = Path.Combine(UpdateHandoffValidator.GetRollbackRoot(), $"{_currentVersion}-{nowKey}"),
            };
            UpdateHandoffValidator.Validate(handoff);
            var handoffPath = Path.Combine(stagingDirectory, "handoff.json");
            await File.WriteAllTextAsync(handoffPath, JsonSerializer.Serialize(handoff, JsonOptions), cancellationToken);
            var handoffHash = await UpdateSecurity.ComputeSha256Async(handoffPath, cancellationToken);

            progress.Report(new(92, "Waiting for Windows administrator approval..."));
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = stagedUpdater,
                    Verb = "runas",
                    UseShellExecute = true,
                    WorkingDirectory = stagingDirectory,
                };
                startInfo.ArgumentList.Add("--handoff");
                startInfo.ArgumentList.Add(handoffPath);
                startInfo.ArgumentList.Add("--handoff-sha256");
                startInfo.ArgumentList.Add(handoffHash);
                _ = Process.Start(startInfo) ?? throw new InvalidOperationException("Windows could not start the elevated updater.");
            }
            catch (Win32Exception error) when (error.NativeErrorCode == 1223)
            {
                throw new InvalidOperationException("Administrator approval was cancelled. The current app was not changed.", error);
            }

            progress.Report(new(100, "Administrator approval received. Closing the old app before installation..."));
        }
        catch
        {
            TryDeleteDirectory(stagingDirectory);
            throw;
        }
    }

    public async Task<UpdateResult?> ReadLastResultAsync(CancellationToken cancellationToken = default)
    {
        var path = GetResultPath();
        if (!File.Exists(path)) return null;
        try
        {
            var result = JsonSerializer.Deserialize<UpdateResult>(await File.ReadAllTextAsync(path, cancellationToken));
            File.Delete(path);
            return result;
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public async Task CleanupStagingAsync(TimeSpan delay, CancellationToken cancellationToken = default)
    {
        try
        {
            if (delay > TimeSpan.Zero) await Task.Delay(delay, cancellationToken);
            var updatesDirectory = Path.Combine(UpdateHandoffValidator.GetLocalStateDirectory(), "updates");
            if (!Directory.Exists(updatesDirectory)) return;
            foreach (var directory in Directory.EnumerateDirectories(updatesDirectory))
            {
                cancellationToken.ThrowIfCancellationRequested();
                TryDeleteDirectory(directory);
            }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or OperationCanceledException)
        {
        }
    }

    public void Dispose()
    {
        if (_ownsHttp) _http.Dispose();
    }

    private static Version? ParseTagVersion(string tagName) =>
        Version.TryParse(tagName["desktop-v".Length..], out var version) ? version : null;

    private static bool IsTrustedManifestUri(string value, string tagName)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase)) return false;
        var expected = $"/embire2/bolt.gives/releases/download/{tagName}/{ManifestName}";
        return uri.Port == 443 && uri.AbsolutePath.Equals(expected, StringComparison.Ordinal) &&
               string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment);
    }

    private static string GetResultPath() => Path.Combine(UpdateHandoffValidator.GetLocalStateDirectory(), "update-result.json");

    private static void TryDeleteDirectory(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { }
    }

    private sealed class GitHubRelease
    {
        [System.Text.Json.Serialization.JsonPropertyName("tag_name")] public string TagName { get; set; } = "";
        [System.Text.Json.Serialization.JsonPropertyName("draft")] public bool Draft { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("prerelease")] public bool Prerelease { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("assets")] public List<GitHubAsset> Assets { get; set; } = [];
    }

    private sealed class GitHubAsset
    {
        [System.Text.Json.Serialization.JsonPropertyName("name")] public string Name { get; set; } = "";
        [System.Text.Json.Serialization.JsonPropertyName("browser_download_url")] public string BrowserDownloadUrl { get; set; } = "";
    }
}
