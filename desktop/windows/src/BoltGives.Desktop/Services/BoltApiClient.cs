using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public sealed class BoltApiClient
{
    private readonly HttpClient _http;
    private readonly SecureSessionStore _sessionStore;
    private ProfileSession? _session;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public BoltApiClient(Uri serviceOrigin, SecureSessionStore sessionStore)
    {
        _sessionStore = sessionStore;
        _http = new HttpClient { BaseAddress = serviceOrigin, Timeout = Timeout.InfiniteTimeSpan };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd($"bolt.gives-desktop/{App.DesktopVersion}");
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    public ProfileSession? Session => _session;

    public void SetSession(ProfileSession session)
    {
        _session = session;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "BoltProfile",
            $"{session.Id}.{session.Token}");
    }

    public async Task<bool> ValidateSessionAsync(ProfileSession session)
    {
        try
        {
            using var response = await _http.PostAsJsonAsync("runtime/profile/session", new
            {
                id = session.Id,
                token = session.Token,
            });
            if (!response.IsSuccessStatusCode) return false;
            SetSession(session);
            return true;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    public async Task<(string ChallengeId, DateTimeOffset ExpiresAt)> RequestLoginCodeAsync(string email)
    {
        using var response = await _http.PostAsJsonAsync("runtime/profile/login/code/request", new { email });
        await EnsureSuccessAsync(response);
        var payload = await response.Content.ReadFromJsonAsync<LoginCodeChallenge>(JsonOptions)
            ?? throw new InvalidOperationException("The sign-in service returned an empty response.");
        return (payload.ChallengeId, payload.ExpiresAt);
    }

    public async Task<ProfileSession> VerifyLoginCodeAsync(string challengeId, string code)
    {
        using var response = await _http.PostAsJsonAsync("runtime/profile/login/code/verify", new { challengeId, code });
        await EnsureSuccessAsync(response);
        var payload = await response.Content.ReadFromJsonAsync<ProfileSessionPayload>(JsonOptions)
            ?? throw new InvalidOperationException("The sign-in service returned an empty response.");
        var session = new ProfileSession
        {
            Profile = payload.Profile,
            Id = payload.Session.Id,
            Token = payload.Session.Token,
            ExpiresAt = payload.Session.ExpiresAt,
        };
        SetSession(session);
        await _sessionStore.SaveAsync(session);
        return session;
    }

    public async Task<ProfileSession> RegisterAsync(string name, string email, string country)
    {
        using var response = await _http.PostAsJsonAsync("runtime/profile/register", new { name, email, country });
        await EnsureSuccessAsync(response);
        var payload = await response.Content.ReadFromJsonAsync<ProfileSessionPayload>(JsonOptions)
            ?? throw new InvalidOperationException("The profile service returned an empty response.");
        var session = new ProfileSession
        {
            Profile = payload.Profile,
            Id = payload.Session.Id,
            Token = payload.Session.Token,
            ExpiresAt = payload.Session.ExpiresAt,
        };
        SetSession(session);
        await _sessionStore.SaveAsync(session);
        return session;
    }

    public async Task<UsageBalance> GetUsageBalanceAsync()
    {
        using var response = await _http.GetAsync("api/usage-balance");
        await EnsureSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<UsageBalance>(JsonOptions)
            ?? throw new InvalidOperationException("Token balance is unavailable.");
    }

    public async Task StreamChatAsync(
        DesktopProject project,
        string prompt,
        Action<StreamEvent> onEvent,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            messages = project.Messages.Where(message => !string.IsNullOrWhiteSpace(message.Content)).Select(message => new
            {
                id = message.Id,
                role = message.Role,
                content = message.Content,
            }),
            files = (object?)null,
            hostedRuntimeSessionId = project.RuntimeSessionId,
            projectContextId = project.Id,
            promptId = "default",
            contextOptimization = true,
            chatMode = project.ChatMode,
            maxLLMSteps = 14,
            apiKeys = new Dictionary<string, string>(),
            providerSettings = new Dictionary<string, object>(),
            selectedProvider = "FREE",
            selectedModel = project.Model,
            projectMemory = project.Memory.ToApiContext(),
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "api/chat")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json"),
        };
        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await AsyncLineStreamReader.ReadAsync(stream, line =>
        {
            foreach (var streamEvent in AiDataStreamParser.ParseLine(line))
            {
                if (streamEvent.Kind == "error") throw new InvalidOperationException(streamEvent.Text);
                onEvent(streamEvent);
            }
        }, cancellationToken).ConfigureAwait(false);
    }

    public async Task<Dictionary<string, string>> GetSnapshotAsync(string sessionId)
    {
        using var response = await _http.GetAsync($"runtime/sessions/{Uri.EscapeDataString(sessionId)}/snapshot");
        await EnsureSuccessAsync(response);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!document.RootElement.TryGetProperty("files", out var root)) return files;
        foreach (var property in root.EnumerateObject())
        {
            if (!WorkspaceFilePolicy.TryGetVisibleRelativePath(property.Name, out var relativePath)) continue;

            if (property.Value.ValueKind == JsonValueKind.String)
            {
                files[relativePath] = property.Value.GetString() ?? "";
                continue;
            }

            var isFile = property.Value.TryGetProperty("type", out var type) && type.GetString() == "file";
            var isBinary = property.Value.TryGetProperty("isBinary", out var binary) && binary.GetBoolean();
            if (isFile && !isBinary && property.Value.TryGetProperty("content", out var content))
            {
                files[relativePath] = content.GetString() ?? "";
            }
        }
        return files;
    }

    public async Task SaveSnapshotAsync(string sessionId, Dictionary<string, string> files)
    {
        var runtimeFiles = files.ToDictionary(
            entry => entry.Key,
            entry => new { type = "file", content = entry.Value, isBinary = false });
        using var response = await _http.PostAsJsonAsync(
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/sync",
            new { files = runtimeFiles, prune = false });
        await EnsureSuccessAsync(response);
    }

    public async Task<PreviewStatus> GetPreviewStatusAsync(string sessionId)
    {
        using var response = await _http.GetAsync($"runtime/sessions/{Uri.EscapeDataString(sessionId)}/preview-status");
        await EnsureSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<PreviewStatus>(JsonOptions) ?? new PreviewStatus();
    }

    public async Task<ProjectConnectionState?> GetProjectConnectionAsync(string sessionId)
    {
        using var response = await _http.GetAsync(
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/database-connection");
        await EnsureSuccessAsync(response);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (!document.RootElement.TryGetProperty("connection", out var connection) ||
            connection.ValueKind == JsonValueKind.Null)
            return null;
        return connection.Deserialize<ProjectConnectionState>(JsonOptions);
    }

    public async Task<ProjectConnectionState> SaveSupabaseConnectionAsync(
        string sessionId,
        string projectUrl,
        string publishableKey)
    {
        using var response = await _http.PostAsJsonAsync(
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/database-connection",
            new { provider = "supabase", supabaseUrl = projectUrl, anonKey = publishableKey });
        await EnsureSuccessAsync(response);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (!document.RootElement.TryGetProperty("connection", out var connection))
            throw new InvalidOperationException("The runtime did not confirm the Supabase connection.");
        return connection.Deserialize<ProjectConnectionState>(JsonOptions)
            ?? throw new InvalidOperationException("The runtime returned invalid Supabase connection details.");
    }

    public async Task DeleteProjectConnectionAsync(string sessionId)
    {
        using var response = await _http.DeleteAsync(
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/database-connection");
        await EnsureSuccessAsync(response);
    }

    public async Task SubscribePreviewEventsAsync(
        string sessionId,
        Action<PreviewStatus> onStatus,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/preview-events");
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await PreviewEventStreamReader.ReadAsync(stream, onStatus, JsonOptions, cancellationToken).ConfigureAwait(false);
    }

    public async Task<RuntimeCommandResult> RunCommandAsync(
        string sessionId,
        string command,
        Action<StreamEvent> onEvent,
        CancellationToken cancellationToken,
        string kind = "shell")
    {
        if (kind is not "shell" and not "start") throw new ArgumentOutOfRangeException(nameof(kind));
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/command")
        {
            Content = JsonContent.Create(new { command, kind }),
        };
        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response).ConfigureAwait(false);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        var exitCode = -1;
        var previewReady = false;
        var output = new StringBuilder();
        await AsyncLineStreamReader.ReadAsync(stream, line =>
        {
            if (string.IsNullOrWhiteSpace(line)) return;
            using var document = JsonDocument.Parse(line);
            var type = document.RootElement.GetProperty("type").GetString() ?? "status";
            var text = type switch
            {
                "stdout" or "stderr" => document.RootElement.GetProperty("chunk").GetString() ?? "",
                "status" => document.RootElement.GetProperty("message").GetString() ?? "",
                "error" => document.RootElement.GetProperty("error").GetString() ?? "",
                "ready" => "Preview is ready.\n",
                "exit" => $"\nProcess exited with code {(exitCode = document.RootElement.GetProperty("exitCode").GetInt32())}.\n",
                _ => "",
            };
            if (type is "stdout" or "stderr") output.Append(text);
            if (type == "ready") previewReady = true;
            if (type == "error") throw new InvalidOperationException(text);
            if (text.Length > 0) onEvent(new StreamEvent(type, text));
        }, cancellationToken).ConfigureAwait(false);

        return new RuntimeCommandResult(exitCode, previewReady, output.ToString());
    }

    public Task<JsonDocument> PublishFreeAsync(string sessionId, string subdomain) =>
        PostDocumentAsync($"runtime/sessions/{Uri.EscapeDataString(sessionId)}/publish", new { subdomain });

    public Task<JsonDocument> DeployCloudflareAsync(string sessionId, string projectName) =>
        PostDocumentAsync($"runtime/sessions/{Uri.EscapeDataString(sessionId)}/deploy/cloudflare", new { projectName });

    public Task<JsonDocument> CreateCustomDomainCheckoutAsync(string sessionId, string customDomain) =>
        PostDocumentAsync(
            $"runtime/sessions/{Uri.EscapeDataString(sessionId)}/custom-domain/checkout",
            new { customDomain, customerEmail = _session?.Profile.Email });

    public async Task<RuntimeNodeSupport> GetRuntimeNodeSupportAsync()
    {
        using var response = await _http.GetAsync("runtime/runtime-node/config");
        await EnsureSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<RuntimeNodeSupport>(JsonOptions)
            ?? throw new InvalidOperationException("Runtime workspace support returned an empty response.");
    }

    public async Task<RuntimeNodeWorkspace> ProvisionRuntimeNodeWorkspaceAsync(
        string projectName,
        string cliUsername,
        string cliPassword)
    {
        var profile = _session?.Profile ?? throw new InvalidOperationException("Sign in before creating a live workspace.");
        using var response = await _http.PostAsJsonAsync("runtime/runtime-node/workspaces", new
        {
            clientName = profile.Name,
            clientEmail = profile.Email,
            projectName,
            cliUsername,
            cliPassword,
        });
        await EnsureSuccessAsync(response);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (!document.RootElement.TryGetProperty("workspace", out var workspace))
            throw new InvalidOperationException("The runtime node did not return workspace details.");
        return workspace.Deserialize<RuntimeNodeWorkspace>(JsonOptions)
            ?? throw new InvalidOperationException("The runtime workspace details were invalid.");
    }

    public async Task LogoutAsync()
    {
        var session = _session;
        if (session is not null)
        {
            try
            {
                using var response = await _http.PostAsJsonAsync("runtime/profile/logout", new { id = session.Id, token = session.Token });
            }
            catch (HttpRequestException)
            {
            }
        }
        _session = null;
        _http.DefaultRequestHeaders.Authorization = null;
        await _sessionStore.ClearAsync();
    }

    private async Task<JsonDocument> PostDocumentAsync(string path, object body)
    {
        using var response = await _http.PostAsJsonAsync(path, body);
        await EnsureSuccessAsync(response);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var message = await response.Content.ReadAsStringAsync();
        try
        {
            using var document = JsonDocument.Parse(message);
            if (document.RootElement.TryGetProperty("message", out var friendly) && friendly.ValueKind == JsonValueKind.String)
                message = friendly.GetString() ?? message;
            else if (document.RootElement.TryGetProperty("error", out var apiError) && apiError.ValueKind == JsonValueKind.String)
                message = apiError.GetString() ?? message;
        }
        catch (JsonException)
        {
        }
        throw new HttpRequestException(
            string.IsNullOrWhiteSpace(message) ? $"bolt.gives returned HTTP {(int)response.StatusCode}." : message.Trim(),
            inner: null,
            response.StatusCode);
    }

    private sealed class LoginCodeChallenge
    {
        [System.Text.Json.Serialization.JsonPropertyName("challengeId")] public string ChallengeId { get; set; } = "";
        [System.Text.Json.Serialization.JsonPropertyName("expiresAt")] public DateTimeOffset ExpiresAt { get; set; }
    }

    private sealed class ProfileSessionPayload
    {
        [System.Text.Json.Serialization.JsonPropertyName("profile")] public Profile Profile { get; set; } = new();
        [System.Text.Json.Serialization.JsonPropertyName("session")] public SessionCredentials Session { get; set; } = new();
    }

    private sealed class SessionCredentials
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")] public string Id { get; set; } = "";
        [System.Text.Json.Serialization.JsonPropertyName("token")] public string Token { get; set; } = "";
        [System.Text.Json.Serialization.JsonPropertyName("expiresAt")] public DateTimeOffset ExpiresAt { get; set; }
    }
}
