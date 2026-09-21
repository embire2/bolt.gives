using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public static partial class WorkspaceArtifactParser
{
    private const int MaxActions = 128;
    private const int MaxFileCharacters = 2_000_000;
    private const int MaxCommandCharacters = 16_000;

    public static IReadOnlyList<WorkspaceAction> Parse(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return [];

        var actions = new List<WorkspaceAction>();
        foreach (Match match in ActionPattern().Matches(content))
        {
            if (actions.Count >= MaxActions)
                throw new InvalidOperationException($"A model response cannot contain more than {MaxActions} workspace actions.");

            var attributes = ParseAttributes(match.Groups["attributes"].Value);
            var type = attributes.GetValueOrDefault("type", "").Trim().ToLowerInvariant();
            var actionContent = CleanContent(match.Groups["content"].Value, type);

            switch (type)
            {
                case "file":
                    if (actionContent.Length > MaxFileCharacters)
                        throw new InvalidOperationException("A generated file exceeded the native workspace safety limit.");
                    if (!attributes.TryGetValue("filepath", out var rawPath))
                        throw new InvalidOperationException("A generated file action did not include filePath.");
                    actions.Add(new WorkspaceAction(type, actionContent, NormalizeFilePath(rawPath)));
                    break;
                case "shell":
                case "start":
                    if (actionContent.Length == 0)
                        throw new InvalidOperationException($"A generated {type} action did not include a command.");
                    if (actionContent.Length > MaxCommandCharacters)
                        throw new InvalidOperationException("A generated command exceeded the native workspace safety limit.");
                    if (GetBlockedCommandReason(actionContent) is { } blockedReason)
                        throw new InvalidOperationException(blockedReason);
                    actions.Add(new WorkspaceAction(type, actionContent));
                    break;
                default:
                    throw new InvalidOperationException($"Desktop cannot safely execute the generated action type '{type}'.");
            }
        }

        return actions;
    }

    public static string NormalizeFilePath(string rawPath)
    {
        var path = WebUtility.HtmlDecode(rawPath).Trim().Replace('\\', '/');
        foreach (var prefix in new[] { "/home/project/", "/home/bolt/project/" })
        {
            if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) path = path[prefix.Length..];
        }
        while (path.StartsWith("./", StringComparison.Ordinal)) path = path[2..];

        if (path.Length == 0 || path.StartsWith('/') || DrivePathPattern().IsMatch(path))
            throw new InvalidOperationException("Generated file paths must stay inside the current project workspace.");

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 || segments.Any(segment => segment is "." or ".." || segment.Contains('\0')))
            throw new InvalidOperationException("Generated file paths must stay inside the current project workspace.");

        return string.Join('/', segments);
    }

    public static string? GetBlockedCommandReason(string command)
    {
        var normalized = command.Trim();
        if (normalized.Length == 0) return null;

        foreach (Match match in RedirectionPattern().Matches(normalized))
        {
            var target = match.Groups["target"].Value.Trim();
            if (target is not "&1" and not "&2" and not "/dev/null")
                return "Generated shell file redirection is blocked. The model must use an atomic file action instead.";
        }

        var teeMatch = TeePattern().Match(normalized);
        if (teeMatch.Success && teeMatch.Groups["target"].Value is not "/dev/null")
            return "Generated shell file mutation through tee is blocked. The model must use an atomic file action instead.";

        if (InPlaceMutationPattern().IsMatch(normalized) || InlineWriterPattern().IsMatch(normalized))
            return "Generated shell-based file mutation is blocked. The model must use an atomic file action instead.";

        return null;
    }

    private static Dictionary<string, string> ParseAttributes(string rawAttributes)
    {
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in AttributePattern().Matches(rawAttributes))
        {
            attributes[match.Groups["name"].Value] = match.Groups["double"].Success
                ? match.Groups["double"].Value
                : match.Groups["single"].Value;
        }
        return attributes;
    }

    private static string CleanContent(string rawContent, string type)
    {
        var content = rawContent.Trim();
        if (type == "file" && content.StartsWith("```", StringComparison.Ordinal))
        {
            var firstLineEnd = content.IndexOf('\n');
            if (firstLineEnd >= 0 && content.EndsWith("```", StringComparison.Ordinal))
                content = content[(firstLineEnd + 1)..^3].TrimEnd();
        }
        return type == "file" ? content + "\n" : content;
    }

    [GeneratedRegex(@"<(?<prefix>bolt|cody)Action\b(?<attributes>[^>]*)>(?<content>[\s\S]*?)</\k<prefix>Action\s*>", RegexOptions.IgnoreCase)]
    private static partial Regex ActionPattern();

    [GeneratedRegex("""(?<name>[A-Za-z][\w-]*)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')""", RegexOptions.IgnoreCase)]
    private static partial Regex AttributePattern();

    [GeneratedRegex(@"^[A-Za-z]:[/\\]")]
    private static partial Regex DrivePathPattern();

    [GeneratedRegex(@"(?:^|[\s;|&])\d*(?:>>|>)(?![=&])\s*(?<target>[^\s;|&]+)", RegexOptions.IgnoreCase)]
    private static partial Regex RedirectionPattern();

    [GeneratedRegex(@"(?:^|\s)tee(?:\s+-a)?\s+(?<target>[^\s|;&]+)", RegexOptions.IgnoreCase)]
    private static partial Regex TeePattern();

    [GeneratedRegex(@"\bsed\b[^\n]*\s-i(?:\s|$)|\bperl\b[^\n]*\s-pi(?:\s|$)", RegexOptions.IgnoreCase)]
    private static partial Regex InPlaceMutationPattern();

    [GeneratedRegex("""\b(?:node|python3?|ruby|php)\b[^\n]*(?:writeFile|write_text|open\s*\([^)]*,\s*['"]w|File\.write)""", RegexOptions.IgnoreCase)]
    private static partial Regex InlineWriterPattern();
}

public sealed partial class StreamingWorkspaceActionParser
{
    private const int MaxResponseCharacters = 4_000_000;
    private readonly StringBuilder _buffer = new();
    private int _emittedCount;

    public int EmittedCount => _emittedCount;
    public bool HasClosedArtifact { get; private set; }
    public bool HasFileAction { get; private set; }
    public bool HasStartAction { get; private set; }

    public IReadOnlyList<WorkspaceAction> Append(string chunk)
    {
        if (string.IsNullOrEmpty(chunk)) return [];
        if (_buffer.Length + chunk.Length > MaxResponseCharacters)
            throw new InvalidOperationException("The model response exceeded the native workspace safety limit.");

        _buffer.Append(chunk);
        var completeResponse = _buffer.ToString();
        HasClosedArtifact = ArtifactClosePattern().IsMatch(completeResponse);
        var parsed = WorkspaceArtifactParser.Parse(completeResponse);
        if (parsed.Count < _emittedCount)
            throw new InvalidOperationException("The streamed workspace action order changed unexpectedly.");

        var next = parsed.Skip(_emittedCount).ToArray();
        _emittedCount = parsed.Count;
        HasFileAction = HasFileAction || next.Any(action => action.Type == "file");
        HasStartAction = HasStartAction || next.Any(action => action.Type == "start");
        return next;
    }

    [GeneratedRegex(@"</(?:bolt|cody)Artifact\s*>", RegexOptions.IgnoreCase)]
    private static partial Regex ArtifactClosePattern();
}
