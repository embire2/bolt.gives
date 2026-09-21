using System.Text.Json.Serialization;

namespace BoltGives.Desktop.Models;

public sealed class Profile
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("email")] public string Email { get; set; } = "";
    [JsonPropertyName("country")] public string Country { get; set; } = "";
}

public sealed class ProfileSession
{
    public Profile Profile { get; set; } = new();
    public string Id { get; set; } = "";
    public string Token { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class ChatMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
    public string DisplayContent => Services.AiDataStreamParser.ToVisibleChatText(Content);
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class DesktopProject
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerProfileId { get; set; } = "";
    public string RuntimeSessionId { get; set; } = $"desktop-{Guid.NewGuid():N}";
    public string Title { get; set; } = "Untitled project";
    public string Model { get; set; } = "gpt-5.6-sol";
    public string ChatMode { get; set; } = "build";
    public string? SelectedFile { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<ChatMessage> Messages { get; set; } = [];
    public ProjectMemory Memory { get; set; } = new();
}

public sealed class ProjectMemory
{
    public string ProjectKey { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Architecture { get; set; } = "";
    public string LatestGoal { get; set; } = "";
    public int RunCount { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }

    public ProjectMemoryContext? ToApiContext() =>
        string.IsNullOrWhiteSpace(ProjectKey) || RunCount <= 0 || UpdatedAt is null
            ? null
            : new ProjectMemoryContext
            {
                ProjectKey = ProjectKey,
                Summary = Summary,
                Architecture = Architecture,
                LatestGoal = LatestGoal,
                RunCount = RunCount,
                UpdatedAt = UpdatedAt.Value,
            };
}

public sealed class ProjectMemoryContext
{
    [JsonPropertyName("projectKey")] public string ProjectKey { get; set; } = "";
    [JsonPropertyName("summary")] public string Summary { get; set; } = "";
    [JsonPropertyName("architecture")] public string Architecture { get; set; } = "";
    [JsonPropertyName("latestGoal")] public string LatestGoal { get; set; } = "";
    [JsonPropertyName("runCount")] public int RunCount { get; set; }
    [JsonPropertyName("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class UsageBalance
{
    [JsonPropertyName("plan")] public string Plan { get; set; } = "free";
    [JsonPropertyName("tokensAllowance")] public decimal TokensAllowance { get; set; }
    [JsonPropertyName("tokensUsed")] public decimal TokensUsed { get; set; }
    [JsonPropertyName("tokensRemaining")] public decimal TokensRemaining { get; set; }
    [JsonPropertyName("resetAt")] public DateTimeOffset? ResetAt { get; set; }
    [JsonPropertyName("periodLabel")] public string PeriodLabel { get; set; } = "";
}

public sealed class ProjectConnectionState
{
    [JsonPropertyName("provider")] public string Provider { get; set; } = "supabase";
    [JsonPropertyName("status")] public string Status { get; set; } = "configured";
    [JsonPropertyName("verifiedAt")] public DateTimeOffset? VerifiedAt { get; set; }
    [JsonPropertyName("label")] public string Label { get; set; } = "";
    [JsonPropertyName("host")] public string Host { get; set; } = "";
    [JsonPropertyName("updatedAt")] public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class PreviewStatus
{
    [JsonPropertyName("sessionId")] public string SessionId { get; set; } = "";
    [JsonPropertyName("status")] public string Status { get; set; } = "idle";
    [JsonPropertyName("healthy")] public bool Healthy { get; set; }
    [JsonPropertyName("updatedAt")] public DateTimeOffset? UpdatedAt { get; set; }
    [JsonPropertyName("preview")] public PreviewInfo? Preview { get; set; }
    [JsonPropertyName("recentLogs")] public List<string> RecentLogs { get; set; } = [];
    [JsonPropertyName("alert")] public PreviewAlert? Alert { get; set; }
    [JsonPropertyName("recovery")] public PreviewRecovery? Recovery { get; set; }
    [JsonPropertyName("projectConnection")] public ProjectConnectionState? ProjectConnection { get; set; }
}

public sealed class PreviewInfo
{
    [JsonPropertyName("baseUrl")] public string BaseUrl { get; set; } = "";
    [JsonPropertyName("port")] public int Port { get; set; }
}

public sealed class PreviewAlert
{
    [JsonPropertyName("type")] public string Type { get; set; } = "info";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("content")] public string Content { get; set; } = "";
}

public sealed class PreviewRecovery
{
    [JsonPropertyName("state")] public string State { get; set; } = "idle";
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("updatedAt")] public DateTimeOffset? UpdatedAt { get; set; }
}

public sealed class RuntimeNodeSupport
{
    [JsonPropertyName("supported")] public bool Supported { get; set; }
    [JsonPropertyName("reason")] public string? Reason { get; set; }
    [JsonPropertyName("host")] public string? Host { get; set; }
    [JsonPropertyName("port")] public int Port { get; set; } = 22;
    [JsonPropertyName("authMode")] public string AuthMode { get; set; } = "none";
    [JsonPropertyName("summary")] public RuntimeNodeSummary Summary { get; set; } = new();
}

public sealed class RuntimeNodeSummary
{
    [JsonPropertyName("total")] public int Total { get; set; }
    [JsonPropertyName("active")] public int Active { get; set; }
    [JsonPropertyName("provisioning")] public int Provisioning { get; set; }
    [JsonPropertyName("failed")] public int Failed { get; set; }
}

public sealed class RuntimeNodeWorkspace
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("projectName")] public string ProjectName { get; set; } = "";
    [JsonPropertyName("cliUsername")] public string CliUsername { get; set; } = "";
    [JsonPropertyName("workspaceDir")] public string WorkspaceDirectory { get; set; } = "";
    [JsonPropertyName("sshCommand")] public string? SshCommand { get; set; }
    [JsonPropertyName("oneTimeCliPassword")] public string? OneTimeCliPassword { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "provisioning";
    [JsonPropertyName("lastError")] public string? LastError { get; set; }
}

public sealed record StreamEvent(
    string Kind,
    string Text,
    string Status = "",
    string Detail = "",
    string Payload = "");

public sealed record WorkspaceAction(string Type, string Content, string? FilePath = null);

public sealed record RuntimeCommandResult(int ExitCode, bool PreviewReady, string Output);
