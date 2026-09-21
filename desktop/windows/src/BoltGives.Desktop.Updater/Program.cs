using System.ComponentModel;
using System.Diagnostics;
using System.Security.Principal;
using System.Text.Json;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Updater;

internal static class Program
{
    [STAThread]
    private static async Task<int> Main(string[] args)
    {
        UpdateHandoff? handoff = null;
        UpdateLog? log = null;

        try
        {
            if (!OperatingSystem.IsWindows() || !IsAdministrator())
                throw new InvalidOperationException("Administrator approval is required to install this Desktop update.");

            var launch = UpdateLaunchArgumentParser.Parse(args);
            var handoffBytes = await File.ReadAllBytesAsync(launch.HandoffPath);
            var actualHandoffHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(handoffBytes));
            if (!UpdateSecurity.FixedTimeHashEquals(launch.HandoffSha256, actualHandoffHash))
                throw new InvalidOperationException("The privileged update handoff was changed before installation.");

            handoff = JsonSerializer.Deserialize(handoffBytes, UpdateJsonContext.Default.UpdateHandoff)
                ?? throw new InvalidOperationException("The privileged update handoff is empty.");
            UpdateHandoffValidator.Validate(handoff);
            log = new UpdateLog(handoff.LogPath);
            log.Write($"Starting Desktop {handoff.Version} update from {handoff.PreviousVersion}.");

            var actualInstallerHash = await UpdateSecurity.ComputeSha256Async(handoff.InstallerPath);
            if (!UpdateSecurity.FixedTimeHashEquals(handoff.InstallerSha256, actualInstallerHash))
                throw new InvalidOperationException("The staged installer failed its SHA-256 check.");
            AuthenticodeVerifier.VerifyOrThrow(handoff.InstallerPath);
            AuthenticodeVerifier.VerifyOrThrow(handoff.ApplicationPath);

            await StopInstalledApplicationAsync(handoff, log);
            EnsureRollbackCapacity(handoff);
            CopyDirectory(handoff.InstallDirectory, handoff.RollbackDirectory);
            log.Write("Created a rollback copy of the installed application.");

            var exitCode = await RunInstallerAsync(handoff, log);
            if (exitCode != 0) throw new InvalidOperationException($"The installer exited with code {exitCode}.");

            VerifyInstalledVersion(handoff);
            AuthenticodeVerifier.VerifyOrThrow(handoff.ApplicationPath);
            await WriteResultAsync(handoff, success: true, rolledBack: false,
                $"Desktop {handoff.Version} installed and verified successfully.");
            log.Write("The replacement application signature and version were verified.");
            TryDeleteDirectory(handoff.RollbackDirectory);
            if (handoff.RelaunchApplication)
            {
                try { LaunchApplication(handoff.ApplicationPath); }
                catch (Exception launchError) { log.Write($"Desktop was updated but could not relaunch automatically: {launchError.Message}"); }
            }
            return 0;
        }
        catch (Exception error)
        {
            var rolledBack = false;
            if (handoff is not null)
            {
                log ??= new UpdateLog(handoff.LogPath);
                log.Write($"Update failed: {error.Message}");
                rolledBack = TryRestoreRollback(handoff, log);
                await WriteResultAsync(handoff, success: false, rolledBack, error.Message);
                if (handoff.RelaunchApplication && File.Exists(handoff.ApplicationPath)) LaunchApplication(handoff.ApplicationPath);
            }
            return rolledBack ? 20 : 21;
        }
        finally
        {
            if (handoff is not null)
            {
                TryDeleteFile(handoff.InstallerPath);
            }
        }
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static async Task StopInstalledApplicationAsync(UpdateHandoff handoff, UpdateLog log)
    {
        try
        {
            using var parent = Process.GetProcessById(handoff.ParentProcessId);
            if (!parent.HasExited)
            {
                string? parentPath;
                try { parentPath = parent.MainModule?.FileName; }
                catch (Exception error) when (error is Win32Exception or InvalidOperationException)
                {
                    throw new InvalidOperationException("The updater could not verify the process requesting installation.", error);
                }
                if (!string.Equals(parentPath, handoff.ApplicationPath, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("The update request no longer belongs to the installed Desktop process.");

                log.Write("Waiting for the current Desktop process to close cleanly.");
                if (!parent.WaitForExit(45_000))
                {
                    _ = parent.CloseMainWindow();
                    if (!parent.WaitForExit(15_000)) parent.Kill(entireProcessTree: true);
                    parent.WaitForExit(10_000);
                }
            }
        }
        catch (ArgumentException)
        {
        }

        foreach (var process in Process.GetProcessesByName("BoltGives.Desktop"))
        {
            using (process)
            {
                string? executablePath;
                try { executablePath = process.MainModule?.FileName; }
                catch { continue; }
                if (!string.Equals(executablePath, handoff.ApplicationPath, StringComparison.OrdinalIgnoreCase)) continue;
                _ = process.CloseMainWindow();
                if (!process.WaitForExit(10_000)) process.Kill(entireProcessTree: true);
                if (!process.WaitForExit(10_000))
                    throw new InvalidOperationException("The current Desktop process could not be closed safely.");
            }
        }

        log.Write("Confirmed that the previous Desktop process is closed.");
        await Task.CompletedTask;
    }

    private static async Task<int> RunInstallerAsync(UpdateHandoff handoff, UpdateLog log)
    {
        var installerLog = Path.ChangeExtension(handoff.LogPath, ".installer.log");
        var startInfo = new ProcessStartInfo
        {
            FileName = handoff.InstallerPath,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add("/VERYSILENT");
        startInfo.ArgumentList.Add("/SUPPRESSMSGBOXES");
        startInfo.ArgumentList.Add("/NORESTART");
        startInfo.ArgumentList.Add("/CLOSEAPPLICATIONS");
        startInfo.ArgumentList.Add("/FORCECLOSEAPPLICATIONS");
        startInfo.ArgumentList.Add($"/DIR={handoff.InstallDirectory}");
        startInfo.ArgumentList.Add($"/LOG={installerLog}");

        using var installer = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Windows could not start the verified Desktop installer.");
        log.Write("The elevated installer started after the old application closed.");
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(12));
        try
        {
            await installer.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException)
        {
            try { installer.Kill(entireProcessTree: true); } catch { }
            throw new TimeoutException("The Desktop installer did not finish within 12 minutes.");
        }
        return installer.ExitCode;
    }

    private static void VerifyInstalledVersion(UpdateHandoff handoff)
    {
        if (!File.Exists(handoff.ApplicationPath))
            throw new InvalidOperationException("The updated Desktop executable is missing after installation.");
        var installed = FileVersionInfo.GetVersionInfo(handoff.ApplicationPath).FileVersion;
        if (!Version.TryParse(installed, out var installedVersion) ||
            !Version.TryParse(handoff.Version, out var expectedVersion) || installedVersion < expectedVersion)
        {
            throw new InvalidOperationException($"Installed Desktop version {installed ?? "unknown"} does not match {handoff.Version}.");
        }
    }

    private static void EnsureRollbackCapacity(UpdateHandoff handoff)
    {
        var sourceSize = DirectorySize(handoff.InstallDirectory);
        var root = Path.GetPathRoot(handoff.RollbackDirectory)
            ?? throw new InvalidOperationException("The rollback drive could not be resolved.");
        if (new DriveInfo(root).AvailableFreeSpace < sourceSize + 150L * 1024 * 1024)
            throw new IOException("There is not enough free disk space to create a safe rollback copy.");
    }

    private static long DirectorySize(string path) => EnumerateSafeEntries(path)
        .OfType<FileInfo>()
        .Sum(file => file.Length);

    private static void CopyDirectory(string source, string destination)
    {
        TryDeleteDirectory(destination);
        Directory.CreateDirectory(destination);
        CopyDirectoryContents(new DirectoryInfo(source), new DirectoryInfo(destination));
    }

    private static void CopyDirectoryContents(DirectoryInfo source, DirectoryInfo destination)
    {
        foreach (var entry in source.EnumerateFileSystemInfos())
        {
            if (entry.Attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new IOException("The install directory contains an unsupported reparse point.");
            if (entry is FileInfo file)
            {
                file.CopyTo(Path.Combine(destination.FullName, file.Name), true);
            }
            else if (entry is DirectoryInfo directory)
            {
                var child = destination.CreateSubdirectory(directory.Name);
                CopyDirectoryContents(directory, child);
            }
        }
    }

    private static IEnumerable<FileSystemInfo> EnumerateSafeEntries(string path)
    {
        var pending = new Stack<DirectoryInfo>();
        pending.Push(new DirectoryInfo(path));
        while (pending.Count > 0)
        {
            foreach (var entry in pending.Pop().EnumerateFileSystemInfos())
            {
                if (entry.Attributes.HasFlag(FileAttributes.ReparsePoint))
                    throw new IOException("The install directory contains an unsupported reparse point.");
                yield return entry;
                if (entry is DirectoryInfo directory) pending.Push(directory);
            }
        }
    }

    private static bool TryRestoreRollback(UpdateHandoff handoff, UpdateLog log)
    {
        if (!Directory.Exists(handoff.RollbackDirectory)) return false;
        try
        {
            foreach (var entry in new DirectoryInfo(handoff.InstallDirectory).EnumerateFileSystemInfos())
            {
                if (entry is DirectoryInfo directory) directory.Delete(true);
                else entry.Delete();
            }
            CopyDirectoryContents(new DirectoryInfo(handoff.RollbackDirectory), new DirectoryInfo(handoff.InstallDirectory));
            AuthenticodeVerifier.VerifyOrThrow(handoff.ApplicationPath);
            log.Write("Restored and verified the previous Desktop installation.");
            TryDeleteDirectory(handoff.RollbackDirectory);
            return true;
        }
        catch (Exception rollbackError)
        {
            log.Write($"Rollback failed: {rollbackError.Message}");
            return false;
        }
    }

    private static async Task WriteResultAsync(UpdateHandoff handoff, bool success, bool rolledBack, string message)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(handoff.ResultPath)!);
        var result = new UpdateResult
        {
            Success = success,
            Version = handoff.Version,
            PreviousVersion = handoff.PreviousVersion,
            Message = message,
            RolledBack = rolledBack,
        };
        await File.WriteAllTextAsync(
            handoff.ResultPath,
            JsonSerializer.Serialize(result, UpdateJsonContext.Default.UpdateResult));
    }

    private static void LaunchApplication(string applicationPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"\"{applicationPath}\"",
            UseShellExecute = true,
        };
        _ = Process.Start(startInfo);
    }

    private static void TryDeleteDirectory(string path)
    {
        try { if (Directory.Exists(path)) Directory.Delete(path, true); } catch { }
    }

    private static void TryDeleteFile(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }

    private sealed class UpdateLog
    {
        private readonly string _path;
        public UpdateLog(string path)
        {
            _path = path;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        }
        public void Write(string message) => File.AppendAllText(_path, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
    }
}
