using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class WorkspaceArtifactParserTests
{
    [Fact]
    public void ParsesFileShellAndStartActionsInModelOrder()
    {
        const string content = """
            <boltArtifact id="app">
              <boltAction type="file" filePath="/home/project/src/App.tsx">
            export default function App() { return <main>Ready</main>; }
              </boltAction>
              <boltAction type="shell">npm install</boltAction>
              <boltAction type="start">npm run dev</boltAction>
            </boltArtifact>
            """;

        var actions = WorkspaceArtifactParser.Parse(content);

        Assert.Equal(3, actions.Count);
        Assert.Equal("src/App.tsx", actions[0].FilePath);
        Assert.Contains("<main>Ready</main>", actions[0].Content);
        Assert.Equal("shell", actions[1].Type);
        Assert.Equal("npm install", actions[1].Content);
        Assert.Equal("start", actions[2].Type);
    }

    [Fact]
    public void SupportsCanonicalActionsAndSingleQuotedAttributes()
    {
        const string content = "<codyArtifact><codyAction type='file' filePath='src/a&amp;b.ts'>ok</codyAction></codyArtifact>";

        var action = Assert.Single(WorkspaceArtifactParser.Parse(content));

        Assert.Equal("src/a&b.ts", action.FilePath);
        Assert.Equal("ok\n", action.Content);
    }

    [Theory]
    [InlineData("../outside.txt")]
    [InlineData("src/../../outside.txt")]
    [InlineData("C:\\Windows\\system.ini")]
    [InlineData("/etc/passwd")]
    public void RejectsPathsOutsideTheProject(string path)
    {
        var content = $"<boltArtifact><boltAction type=\"file\" filePath=\"{path}\">bad</boltAction></boltArtifact>";

        Assert.Throws<InvalidOperationException>(() => WorkspaceArtifactParser.Parse(content));
    }

    [Theory]
    [InlineData("echo hacked > package.json")]
    [InlineData("cat payload | tee src/App.tsx")]
    [InlineData("sed -i 's/a/b/' src/App.tsx")]
    [InlineData("python -c \"open('src/App.tsx', 'w').write('bad')\"")]
    public void RejectsGeneratedShellFileMutations(string command)
    {
        var content = $"<boltArtifact><boltAction type=\"shell\">{command}</boltAction></boltArtifact>";

        Assert.Throws<InvalidOperationException>(() => WorkspaceArtifactParser.Parse(content));
    }

    [Theory]
    [InlineData("npm install")]
    [InlineData("npm run build > /dev/null 2>&1")]
    [InlineData("pnpm test")]
    public void AllowsExpectedProjectCommands(string command)
    {
        var content = $"<boltArtifact><boltAction type=\"shell\">{command}</boltAction></boltArtifact>";

        Assert.Single(WorkspaceArtifactParser.Parse(content));
    }

    [Fact]
    public void RejectsUnsupportedGeneratedActions()
    {
        const string content = "<boltArtifact><boltAction type=\"supabase\">drop table users</boltAction></boltArtifact>";

        var error = Assert.Throws<InvalidOperationException>(() => WorkspaceArtifactParser.Parse(content));
        Assert.Contains("cannot safely execute", error.Message);
    }

    [Fact]
    public void EmitsEachCompletedStreamingActionExactlyOnce()
    {
        var parser = new StreamingWorkspaceActionParser();

        Assert.Empty(parser.Append("<boltArtifact><boltAction type=\"file\" filePath=\"src/App.tsx\">hel"));
        var file = Assert.Single(parser.Append("lo</boltAction><boltAction type=\"start\">npm run"));
        Assert.Equal("src/App.tsx", file.FilePath);
        Assert.Empty(parser.Append(" dev</bolt"));
        var start = Assert.Single(parser.Append("Action></boltArtifact>"));

        Assert.Equal("start", start.Type);
        Assert.Equal(2, parser.EmittedCount);
        Assert.True(parser.HasFileAction);
        Assert.True(parser.HasStartAction);
        Assert.True(parser.HasClosedArtifact);
        Assert.Empty(parser.Append(""));
    }
}
