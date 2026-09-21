namespace BoltGives.Desktop.Services;

public sealed class WorkspaceStartGate
{
    private readonly TaskCompletionSource _streamSettled = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public Task WaitAsync(CancellationToken cancellationToken) => _streamSettled.Task.WaitAsync(cancellationToken);

    public void Release() => _streamSettled.TrySetResult();
}

public static class WorkspaceFilePolicy
{
    private static readonly HashSet<string> HiddenRoots = new(StringComparer.OrdinalIgnoreCase)
    {
        ".cache",
        ".git",
        ".local",
        ".next",
        ".npm",
        ".nuxt",
        ".output",
        ".pnpm-store",
        ".vite",
        "build",
        "coverage",
        "dist",
        "node_modules",
    };

    public static bool TryGetVisibleRelativePath(string rawPath, out string relativePath)
    {
        relativePath = "";
        try
        {
            relativePath = WorkspaceArtifactParser.NormalizeFilePath(rawPath);
        }
        catch (InvalidOperationException)
        {
            return false;
        }

        var root = relativePath.Split('/', 2)[0];
        if (HiddenRoots.Contains(root))
        {
            relativePath = "";
            return false;
        }

        return true;
    }
}
