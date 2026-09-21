using System.Text.Json;
using BoltGives.Desktop.Models;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class ProjectMemoryTests
{
    [Fact]
    public void SerializesTheServerIssuedProjectKeyForHistoryAwareFollowups()
    {
        var memory = new ProjectMemory
        {
            ProjectKey = "project-memory-key",
            Summary = "Calendar app with a weekly view.",
            Architecture = "React and PostgreSQL",
            LatestGoal = "Add recurring events",
            RunCount = 2,
            UpdatedAt = DateTimeOffset.Parse("2026-08-31T10:00:00Z"),
        };

        var json = JsonSerializer.Serialize(memory.ToApiContext());

        Assert.Contains("\"projectKey\":\"project-memory-key\"", json);
        Assert.Contains("\"runCount\":2", json);
    }

    [Fact]
    public void DoesNotSendIncompleteProjectMemory()
    {
        Assert.Null(new ProjectMemory { RunCount = 1, UpdatedAt = DateTimeOffset.UtcNow }.ToApiContext());
    }
}
