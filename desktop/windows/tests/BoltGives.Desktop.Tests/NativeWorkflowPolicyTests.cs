using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class NativeWorkflowPolicyTests
{
    [Fact]
    public void PreviewRetriesAnUnchangedUriUntilWebViewCoreIsInitialized()
    {
        var preview = new Uri("https://bolt.gives/runtime/preview/session-a/4100/");

        Assert.True(PreviewNavigationPolicy.RequiresNavigation(preview, preview, coreInitialized: false));
        Assert.False(PreviewNavigationPolicy.RequiresNavigation(preview, preview, coreInitialized: true));
    }

    [Fact]
    public async Task StartActionWaitsUntilTheServerStreamSettles()
    {
        var gate = new WorkspaceStartGate();
        var wait = gate.WaitAsync(CancellationToken.None);

        Assert.False(wait.IsCompleted);
        gate.Release();
        await wait;
        Assert.True(wait.IsCompletedSuccessfully);
    }

    [Theory]
    [InlineData("/home/project/src/App.tsx", "src/App.tsx")]
    [InlineData("./package.json", "package.json")]
    public void NormalizesVisibleWorkspaceFiles(string path, string expected)
    {
        Assert.True(WorkspaceFilePolicy.TryGetVisibleRelativePath(path, out var relative));
        Assert.Equal(expected, relative);
    }

    [Theory]
    [InlineData("/home/project/.cache/npm/log.txt")]
    [InlineData("/home/project/.local/share/pnpm/store/index.json")]
    [InlineData(".npm/_logs/debug.log")]
    [InlineData(".pnpm-store/v3/files/hash")]
    [InlineData("node_modules/react/index.js")]
    [InlineData("dist/assets/app.js")]
    [InlineData("../outside.txt")]
    public void HidesRuntimeInternalsAndUnsafeWorkspaceFiles(string path)
    {
        Assert.False(WorkspaceFilePolicy.TryGetVisibleRelativePath(path, out _));
    }

    [Fact]
    public void PreviewAllowsOnlyTheCurrentGeneratedProject()
    {
        var origin = new Uri("https://bolt.gives/");
        Assert.NotNull(PreviewNavigationPolicy.Resolve(origin, "/runtime/preview/session-a/5173/", "session-a"));
        Assert.Null(PreviewNavigationPolicy.Resolve(origin, "https://bolt.gives/chat", "session-a"));
        Assert.Null(PreviewNavigationPolicy.Resolve(origin, "/runtime/preview/session-b/5173/", "session-a"));
        Assert.Null(PreviewNavigationPolicy.Resolve(origin, "https://example.com/runtime/preview/session-a/5173/", "session-a"));
    }

    [Fact]
    public void FollowUpsRemainOrderedAndProjectAware()
    {
        var queue = new PromptQueue();
        Assert.True(queue.TryEnqueue("project-a", " first "));
        Assert.True(queue.TryEnqueue("project-b", "second"));
        Assert.True(queue.TryDequeue(out var first));
        Assert.Equal(new PendingPrompt("project-a", "first"), first);
        Assert.True(queue.TryDequeue(out var second));
        Assert.Equal("project-b", second?.ProjectId);
        Assert.False(queue.TryDequeue(out _));
    }
}
