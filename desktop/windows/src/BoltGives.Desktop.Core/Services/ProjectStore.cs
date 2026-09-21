using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public sealed class ProjectStore
{
    private readonly string _profileId;
    private readonly string _projectsPath;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public ProjectStore(string profileId, string? baseDirectory = null)
    {
        if (string.IsNullOrWhiteSpace(profileId)) throw new ArgumentException("A profile ID is required.", nameof(profileId));
        _profileId = profileId.Trim();
        var directory = baseDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "bolt.gives Desktop");
        var profileKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(_profileId))).ToLowerInvariant()[..24];
        _projectsPath = Path.Combine(directory, "profiles", profileKey, "projects.json");
    }

    public string StoragePath => _projectsPath;

    public async Task<List<DesktopProject>> LoadAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (!File.Exists(_projectsPath)) return [];
            await using var stream = new FileStream(_projectsPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            var projects = await JsonSerializer.DeserializeAsync<List<DesktopProject>>(stream, cancellationToken: cancellationToken) ?? [];
            return projects.Where(project => project.OwnerProfileId == _profileId).ToList();
        }
        catch (Exception error) when (error is JsonException or IOException or UnauthorizedAccessException)
        {
            PreserveCorruptStore();
            return [];
        }
    }

    public async Task SaveAsync(IEnumerable<DesktopProject> projects, CancellationToken cancellationToken = default)
    {
        var ownedProjects = projects
            .Select(project =>
            {
                project.OwnerProfileId = _profileId;
                return project;
            })
            .OrderByDescending(project => project.UpdatedAt)
            .ToList();
        var directory = Path.GetDirectoryName(_projectsPath)!;
        Directory.CreateDirectory(directory);
        var temporaryPath = Path.Combine(directory, $"projects.{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await JsonSerializer.SerializeAsync(stream, ownedProjects, JsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
            }

            File.Move(temporaryPath, _projectsPath, true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    private void PreserveCorruptStore()
    {
        try
        {
            if (!File.Exists(_projectsPath)) return;
            var corruptPath = $"{_projectsPath}.corrupt-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}";
            File.Move(_projectsPath, corruptPath, false);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
