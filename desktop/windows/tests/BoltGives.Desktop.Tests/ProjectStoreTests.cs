using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class ProjectStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), $"bolt-desktop-tests-{Guid.NewGuid():N}");

    [Fact]
    public async Task IsolatesProjectsByAuthenticatedProfile()
    {
        var first = new ProjectStore("profile-a", _directory);
        var second = new ProjectStore("profile-b", _directory);
        await first.SaveAsync([new DesktopProject { Title = "A project" }]);
        await second.SaveAsync([new DesktopProject { Title = "B project" }]);

        Assert.Equal("A project", Assert.Single(await first.LoadAsync()).Title);
        Assert.Equal("B project", Assert.Single(await second.LoadAsync()).Title);
        Assert.NotEqual(first.StoragePath, second.StoragePath);
    }

    [Fact]
    public async Task PreservesCorruptStateInsteadOfOverwritingIt()
    {
        var store = new ProjectStore("profile-a", _directory);
        Directory.CreateDirectory(Path.GetDirectoryName(store.StoragePath)!);
        await File.WriteAllTextAsync(store.StoragePath, "{broken");

        Assert.Empty(await store.LoadAsync());
        Assert.False(File.Exists(store.StoragePath));
        Assert.Single(Directory.GetFiles(Path.GetDirectoryName(store.StoragePath)!, "projects.json.corrupt-*"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, true);
    }
}
