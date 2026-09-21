using System.Security.Cryptography;
using System.Text.Json;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public sealed class SecureSessionStore
{
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "bolt.gives Desktop");
    private static readonly string SessionPath = Path.Combine(DirectoryPath, "session.bin");
    private static readonly byte[] Entropy = "bolt.gives-desktop-profile-v1"u8.ToArray();

    public async Task SaveAsync(ProfileSession session)
    {
        Directory.CreateDirectory(DirectoryPath);
        var plain = JsonSerializer.SerializeToUtf8Bytes(session);
        var protectedBytes = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
        var temporaryPath = Path.Combine(DirectoryPath, $"session.{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                             16 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(protectedBytes);
                await stream.FlushAsync();
            }
            File.Move(temporaryPath, SessionPath, true);
        }
        finally
        {
            try { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); } catch (IOException) { }
        }
    }

    public async Task<ProfileSession?> LoadAsync()
    {
        try
        {
            if (!File.Exists(SessionPath)) return null;
            var protectedBytes = await File.ReadAllBytesAsync(SessionPath);
            var plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<ProfileSession>(plain);
            return session?.ExpiresAt > DateTimeOffset.UtcNow ? session : null;
        }
        catch (CryptographicException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

    public Task ClearAsync()
    {
        try { if (File.Exists(SessionPath)) File.Delete(SessionPath); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        return Task.CompletedTask;
    }
}
