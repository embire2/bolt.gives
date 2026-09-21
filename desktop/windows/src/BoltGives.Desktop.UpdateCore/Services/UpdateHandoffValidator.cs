using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public static class UpdateHandoffValidator
{
    public static void Validate(UpdateHandoff handoff)
    {
        ArgumentNullException.ThrowIfNull(handoff);
        if (!Version.TryParse(handoff.Version, out _) || !Version.TryParse(handoff.PreviousVersion, out _))
            throw new InvalidOperationException("The update handoff contains an invalid version.");
        if (handoff.ParentProcessId <= 0)
            throw new InvalidOperationException("The update handoff contains an invalid parent process.");
        if (!UpdateSecurity.IsSha256(handoff.InstallerSha256))
            throw new InvalidOperationException("The update handoff contains an invalid installer hash.");

        var applicationPath = Path.GetFullPath(handoff.ApplicationPath);
        var installDirectory = Path.TrimEndingDirectorySeparator(Path.GetFullPath(handoff.InstallDirectory));
        if (!Path.GetFileName(applicationPath).Equals("BoltGives.Desktop.exe", StringComparison.OrdinalIgnoreCase) ||
            !Path.GetDirectoryName(applicationPath)!.Equals(installDirectory, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("The update target is not a bolt.gives Desktop installation.");
        }

        if (!IsSafeInstallDirectory(installDirectory))
            throw new InvalidOperationException("The update target directory is outside an approved application location.");
        if (new DirectoryInfo(installDirectory).Attributes.HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidOperationException("The update target directory cannot be a reparse point.");

        RequireFile(handoff.InstallerPath, "The staged Desktop installer is missing.");
        RequireFile(applicationPath, "The installed Desktop application is missing.");
        RequireChildPath(handoff.ResultPath, GetLocalStateDirectory(), "The update result path is not trusted.");
        RequireChildPath(handoff.LogPath, GetLocalStateDirectory(), "The update log path is not trusted.");
        RequireChildPath(handoff.RollbackDirectory, GetRollbackRoot(), "The rollback path is not trusted.");
    }

    public static string GetLocalStateDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "bolt.gives Desktop");

    public static string GetRollbackRoot() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "bolt.gives Desktop",
        "rollback");

    public static bool IsSafeInstallDirectory(string installDirectory)
    {
        var allowedRoots = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
        }.Where(path => !string.IsNullOrWhiteSpace(path));

        return allowedRoots.Any(root => IsChildPath(installDirectory, root));
    }

    public static bool IsChildPath(string candidate, string root)
    {
        var fullCandidate = Path.TrimEndingDirectorySeparator(Path.GetFullPath(candidate));
        var fullRoot = Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));
        return fullCandidate.StartsWith(fullRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private static void RequireChildPath(string candidate, string root, string message)
    {
        if (string.IsNullOrWhiteSpace(candidate) || !IsChildPath(candidate, root))
            throw new InvalidOperationException(message);
    }

    private static void RequireFile(string path, string message)
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path) || !File.Exists(path))
            throw new InvalidOperationException(message);
    }
}
