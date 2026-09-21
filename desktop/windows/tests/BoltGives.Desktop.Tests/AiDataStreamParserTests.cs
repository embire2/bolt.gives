using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class AiDataStreamParserTests
{
    [Fact]
    public void ParsesTextWithoutDisplayingProtocolFraming()
    {
        Assert.Equal("Built the app", AiDataStreamParser.ParseTextLine("0:\"Built the app\""));
        Assert.Null(AiDataStreamParser.ParseTextLine("2:[{\"type\":\"usage\"}]"));
    }

    [Fact]
    public void ParsesPlainEnglishAgentCommentary()
    {
        const string line = "2:[{\"type\":\"agent-commentary\",\"message\":\"Installing the project dependencies.\"}]";
        Assert.Equal("Installing the project dependencies.", AiDataStreamParser.ParseCommentaryLine(line));
    }

    [Fact]
    public void ParsesServerDeadlineAsAStreamFailure()
    {
        const string line = "3:\"BOLT_STREAM_TIMEOUT: hosted FREE generation exceeded 150000ms\"";
        var streamEvent = Assert.Single(AiDataStreamParser.ParseLine(line));

        Assert.Equal("error", streamEvent.Kind);
        Assert.Equal("failed", streamEvent.Status);
        Assert.Contains("BOLT_STREAM_TIMEOUT", streamEvent.Text);
    }

    [Fact]
    public void HidesAgentActionMarkupFromVisibleNativeChat()
    {
        const string content = "I built the page.\n<boltArtifact id=\"app\"><boltAction type=\"file\" filePath=\"src/App.tsx\">secret markup</boltAction></boltArtifact>\nPreview is ready.";
        var visible = AiDataStreamParser.ToVisibleChatText(content);

        Assert.Contains("I built the page.", visible);
        Assert.Contains("[Workspace updated]", visible);
        Assert.Contains("Preview is ready.", visible);
        Assert.DoesNotContain("boltAction", visible);
    }

    [Fact]
    public void HidesCanonicalCodyActionMarkupFromVisibleNativeChat()
    {
        const string content = "<codyArtifact id=\"app\"><codyAction type=\"file\" filePath=\"src/App.tsx\">code</codyAction></codyArtifact>";
        var visible = AiDataStreamParser.ToVisibleChatText(content);

        Assert.Equal("[Workspace updated]", visible);
        Assert.DoesNotContain("codyAction", visible);
    }

    [Fact]
    public void PreservesProgressUsageAndProjectMemoryForNativeFeeds()
    {
        const string line = "2:[{\"type\":\"progress\",\"status\":\"in-progress\",\"message\":\"Building Preview\"},{\"type\":\"usage\",\"totalTokens\":42},{\"type\":\"project-memory\",\"summary\":\"Calendar app\",\"runCount\":2}]";
        var events = AiDataStreamParser.ParseLine(line);

        Assert.Equal(3, events.Count);
        Assert.Equal("Building Preview", events[0].Text);
        Assert.Equal("Provider usage: 42 tokens", events[1].Text);
        Assert.Equal("project-memory", events[2].Kind);
        Assert.Contains("Calendar app", events[2].Payload);
    }

    [Theory]
    [InlineData("")]
    [InlineData("2:not-json")]
    [InlineData("8:{\"unexpected\":true}")]
    public void IgnoresMalformedOrUnknownStreamFrames(string line)
    {
        Assert.Empty(AiDataStreamParser.ParseLine(line));
    }
}
