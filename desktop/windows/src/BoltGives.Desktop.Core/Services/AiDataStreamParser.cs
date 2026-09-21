using System.Text.Json;
using System.Text.RegularExpressions;

namespace BoltGives.Desktop.Services;

public static class AiDataStreamParser
{
    private static readonly Regex CompleteArtifact = new(
        @"<(?:bolt|cody)Artifact\b[\s\S]*?</(?:bolt|cody)Artifact>",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex StreamingArtifact = new(
        @"<(?:bolt|cody)Artifact\b[\s\S]*$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static string ToVisibleChatText(string? content)
    {
        var withoutCompleteArtifacts = CompleteArtifact.Replace(content ?? "", "\n[Workspace updated]\n");
        return StreamingArtifact.Replace(withoutCompleteArtifacts, "\n[Updating workspace...]\n").Trim();
    }

    public static IReadOnlyList<Models.StreamEvent> ParseLine(string? line)
    {
        if (string.IsNullOrWhiteSpace(line) || line.Length < 3 || line[1] != ':') return [];

        try
        {
            return line[0] switch
            {
                '0' => ParseText(line[2..]),
                '2' => ParseData(line[2..]),
                '3' => ParseError(line[2..]),
                _ => [],
            };
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static string? ParseTextLine(string line) =>
        ParseLine(line).FirstOrDefault(item => item.Kind == "text")?.Text;

    public static string? ParseCommentaryLine(string line) =>
        ParseLine(line).FirstOrDefault(item => item.Kind == "commentary")?.Text;

    private static IReadOnlyList<Models.StreamEvent> ParseText(string payload)
    {
        var text = JsonSerializer.Deserialize<string>(payload);
        return string.IsNullOrEmpty(text) ? [] : [new("text", text)];
    }

    private static IReadOnlyList<Models.StreamEvent> ParseError(string payload)
    {
        var message = JsonSerializer.Deserialize<string>(payload);
        return string.IsNullOrWhiteSpace(message) ? [] : [new("error", message, "failed")];
    }

    private static IReadOnlyList<Models.StreamEvent> ParseData(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        if (document.RootElement.ValueKind != JsonValueKind.Array) return [];

        var events = new List<Models.StreamEvent>();
        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var type = ReadString(item, "type");
            var status = ReadString(item, "status");
            var detail = ReadString(item, "detail");
            var raw = item.GetRawText();

            switch (type)
            {
                case "agent-commentary":
                    AddIfPresent(events, new("commentary", ReadString(item, "message"), status, detail, raw));
                    break;
                case "progress":
                    AddIfPresent(events, new("progress", ReadString(item, "message"), status, ReadString(item, "label"), raw));
                    break;
                case "usage":
                    var total = ReadNumber(item, "totalTokens");
                    events.Add(new("usage", total is null ? "Usage updated" : $"Provider usage: {total:0} tokens", status, "", raw));
                    break;
                case "project-memory":
                    events.Add(new("project-memory", ReadString(item, "summary"), status, ReadString(item, "latestGoal"), raw));
                    break;
                case "run-metrics":
                    events.Add(new("run-metrics", "Run diagnostics updated", status, ReadString(item, "model"), raw));
                    break;
                default:
                    var message = ReadString(item, "message");
                    if (message.Length > 0) events.Add(new(type.Length == 0 ? "data" : type, message, status, detail, raw));
                    break;
            }
        }

        return events;
    }

    private static void AddIfPresent(List<Models.StreamEvent> events, Models.StreamEvent streamEvent)
    {
        if (!string.IsNullOrWhiteSpace(streamEvent.Text)) events.Add(streamEvent);
    }

    private static string ReadString(JsonElement item, string propertyName) =>
        item.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    private static decimal? ReadNumber(JsonElement item, string propertyName) =>
        item.TryGetProperty(propertyName, out var value) && value.TryGetDecimal(out var number) ? number : null;
}
