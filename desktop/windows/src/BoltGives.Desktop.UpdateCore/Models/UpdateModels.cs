using System.Text.Json.Serialization;

namespace BoltGives.Desktop.Models;

public sealed class UpdateManifest
{
    [JsonPropertyName("version")] public string Version { get; set; } = "";
    [JsonPropertyName("mandatory")] public bool Mandatory { get; set; }
    [JsonPropertyName("minimumSupportedVersion")] public string MinimumSupportedVersion { get; set; } = "";
    [JsonPropertyName("installerUrl")] public string InstallerUrl { get; set; } = "";
    [JsonPropertyName("sha256")] public string Sha256 { get; set; } = "";
    [JsonPropertyName("installerSize")] public long InstallerSize { get; set; }
    [JsonPropertyName("features")] public List<string> Features { get; set; } = [];
}

public sealed class UpdateHandoff
{
    public string Version { get; set; } = "";
    public string PreviousVersion { get; set; } = "";
    public int ParentProcessId { get; set; }
    public string InstallerPath { get; set; } = "";
    public string InstallerSha256 { get; set; } = "";
    public string ApplicationPath { get; set; } = "";
    public string InstallDirectory { get; set; } = "";
    public string ResultPath { get; set; } = "";
    public string LogPath { get; set; } = "";
    public string RollbackDirectory { get; set; } = "";
    public bool RelaunchApplication { get; set; } = true;
}

public sealed class UpdateResult
{
    public bool Success { get; set; }
    public string Version { get; set; } = "";
    public string PreviousVersion { get; set; } = "";
    public string Message { get; set; } = "";
    public bool RolledBack { get; set; }
    public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record UpdateLaunchArguments(string HandoffPath, string HandoffSha256);

[JsonSerializable(typeof(UpdateHandoff))]
[JsonSerializable(typeof(UpdateResult))]
public sealed partial class UpdateJsonContext : JsonSerializerContext
{
}
