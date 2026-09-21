using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using System.Threading.Channels;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private async void SendChatPrompt_Click(object sender, RoutedEventArgs e) => await AcceptPromptAsync(ChatPromptTextBox);
    private async void SendWorkspacePrompt_Click(object sender, RoutedEventArgs e) => await AcceptPromptAsync(WorkspacePromptTextBox);

    private async void Prompt_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || !Keyboard.Modifiers.HasFlag(ModifierKeys.Control) || sender is not TextBox input) return;
        e.Handled = true;
        await AcceptPromptAsync(input);
    }

    private async Task AcceptPromptAsync(TextBox input)
    {
        if (_mandatoryUpdateBlocked || _currentProject is null) return;
        var prompt = input.Text.Trim();
        if (prompt.Length == 0) return;
        input.Clear();

        if (_busy)
        {
            if (_promptQueue.TryEnqueue(_currentProject.Id, prompt))
            {
                AddActivity($"Follow-up queued for {_currentProject.Title}; it will run when the active step finishes.");
                UpdateQueueLabels();
            }
            return;
        }

        await RunPromptAsync(_currentProject, prompt);
    }

    private async Task RunPromptAsync(DesktopProject project, string prompt)
    {
        _busy = true;
        SetRunControls(running: true);
        _activeRun = new CancellationTokenSource();
        var runToken = _activeRun.Token;
        var user = new ChatMessage { Role = "user", Content = prompt };
        var assistant = new ChatMessage { Role = "assistant", Content = "" };
        project.Messages.Add(user);
        project.Messages.Add(assistant);
        if (project.Messages.Count == 2) project.Title = prompt.Length > 58 ? prompt[..58] + "..." : prompt;
        project.UpdatedAt = DateTimeOffset.UtcNow;
        RefreshProjectUi(project);
        RuntimeStatusText.Text = project.ChatMode == "discuss" ? "Agent is preparing an answer..." : "Agent is planning the build...";
        AddProjectActivity(project, "Agent received the prompt and is preparing the first concrete step.");
        await PersistProjectsAsync();
        var persistenceTimer = Stopwatch.StartNew();
        var actionParser = project.ChatMode == "build" ? new StreamingWorkspaceActionParser() : null;
        var actionChannel = project.ChatMode == "build"
            ? Channel.CreateUnbounded<WorkspaceAction>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = true })
            : null;
        var startGate = new WorkspaceStartGate();
        var actionExecution = actionChannel is null
            ? Task.CompletedTask
            : ConsumeWorkspaceActionsAsync(project, actionChannel.Reader, startGate, runToken);

        try
        {
            Exception? streamFailure = null;
            try
            {
                await _api.StreamChatAsync(
                    project,
                    prompt,
                    streamEvent =>
                    {
                        if (streamEvent.Kind == "text" && actionParser is not null && actionChannel is not null)
                        {
                            foreach (var action in actionParser.Append(streamEvent.Text))
                            {
                                if (!actionChannel.Writer.TryWrite(action))
                                    throw new InvalidOperationException("The native workspace action queue closed unexpectedly.");
                            }
                        }

                        Dispatcher.Invoke(() =>
                        {
                            HandleStreamEvent(project, assistant, streamEvent);
                            if (persistenceTimer.Elapsed >= TimeSpan.FromSeconds(5))
                            {
                                persistenceTimer.Restart();
                                _ = PersistProjectsAsync();
                            }
                        });
                    },
                    runToken);
            }
            catch (Exception error)
            {
                streamFailure = error;
            }
            finally
            {
                actionChannel?.Writer.TryComplete();
                startGate.Release();
            }

            Exception? actionFailure = null;
            try
            {
                await actionExecution;
            }
            catch (Exception error)
            {
                actionFailure = error;
            }

            if (actionFailure is not null) ExceptionDispatchInfo.Capture(actionFailure).Throw();
            if (streamFailure is not null)
            {
                if (!await TryAcceptCompletedDeadlineBuildAsync(project, actionParser, streamFailure))
                    ExceptionDispatchInfo.Capture(streamFailure).Throw();

                assistant.Content += "\n\nBuild completed and Preview verified. The provider stream reached its safety deadline after all workspace actions had already been applied.";
                AddProjectActivity(project, "All generated actions and Preview were verified despite a late provider deadline.");
            }

            if (project.ChatMode == "build")
            {
                if (actionParser?.EmittedCount is null or 0)
                    throw new InvalidOperationException("The coding model did not return executable workspace actions. Retry the request or choose another hosted model.");
                var generatedFiles = await _api.GetSnapshotAsync(project.RuntimeSessionId);
                if (generatedFiles.Count == 0)
                    throw new InvalidOperationException("Generation ended without creating project files. Retry the request or choose another hosted model.");
            }

            if (string.IsNullOrWhiteSpace(assistant.Content))
                assistant.Content = project.ChatMode == "discuss"
                    ? "The discussion finished without a text response. Please retry."
                    : "Workspace files were created. Open Workspace to inspect the generated project and Preview state.";
            if (ReferenceEquals(project, _currentProject))
                RuntimeStatusText.Text = "Generation finished; verifying files, database and Preview.";
            if (ReferenceEquals(project, _currentProject)) await RefreshWorkspaceAsync(project);
            await RefreshBalanceAsync();
        }
        catch (OperationCanceledException)
        {
            assistant.Content += "\n\nRun stopped. Completed files remain saved.";
            if (ReferenceEquals(project, _currentProject))
                RuntimeStatusText.Text = "Run stopped; completed work was preserved.";
            AddProjectActivity(project, "The active run was stopped. Existing files and history were preserved.");
        }
        catch (Exception error)
        {
            assistant.Content += $"\n\nDesktop request failed: {FriendlyError(error)}";
            if (ReferenceEquals(project, _currentProject))
                RuntimeStatusText.Text = "The request failed. The project remains saved and can be retried.";
            AddProjectActivity(project, $"The request stopped: {FriendlyError(error)}");
            if (ReferenceEquals(project, _currentProject) && IsUsageLimit(error))
            {
                var upgrade = MessageBox.Show(this,
                    $"{FriendlyError(error)}\n\nFREE coding is paused for this allowance period. Upgrade to Custom Domain for 10,000 monthly Agent tokens, or wait for the displayed reset time.",
                    "Agent token allowance reached", MessageBoxButton.YesNo, MessageBoxImage.Information,
                    MessageBoxResult.Yes);
                if (upgrade == MessageBoxResult.Yes) MainTabs.SelectedIndex = 2;
            }
        }
        finally
        {
            project.UpdatedAt = DateTimeOffset.UtcNow;
            await PersistProjectsAsync();
            RefreshProjectUi(project);
            _busy = false;
            _activeRun?.Dispose();
            _activeRun = null;
            SetRunControls(running: false);
            await DispatchNextQueuedPromptAsync();
        }
    }

    private async Task ConsumeWorkspaceActionsAsync(
        DesktopProject project,
        ChannelReader<WorkspaceAction> actions,
        WorkspaceStartGate startGate,
        CancellationToken cancellationToken)
    {
        await foreach (var action in actions.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (action.Type == "file")
            {
                var filePath = action.FilePath ?? throw new InvalidOperationException("A generated file action had no path.");
                await Dispatcher.InvokeAsync(() =>
                {
                    if (ReferenceEquals(project, _currentProject))
                        AddActivity($"Writing {filePath} to the private project workspace.");
                });
                await _api.SaveSnapshotAsync(
                    project.RuntimeSessionId,
                    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { [filePath] = action.Content });
                await Dispatcher.InvokeAsync(() =>
                {
                    if (ReferenceEquals(project, _currentProject)) AddTechnical($"file/complete: {filePath}");
                });
                continue;
            }

            if (action.Type == "start")
            {
                await startGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                var currentPreview = await _api.GetPreviewStatusAsync(project.RuntimeSessionId).ConfigureAwait(false);
                if (currentPreview.Healthy)
                {
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (ReferenceEquals(project, _currentProject))
                            AddActivity("The server already verified Preview; the duplicate generated start command was skipped.");
                    });
                    continue;
                }
            }

            var label = action.Type == "start" ? "Starting and verifying Preview" : "Running a generated verification command";
            await Dispatcher.InvokeAsync(() =>
            {
                if (ReferenceEquals(project, _currentProject)) AddActivity($"{label}: {action.Content}");
            });
            var result = await _api.RunCommandAsync(
                project.RuntimeSessionId,
                action.Content,
                streamEvent => Dispatcher.Invoke(() =>
                {
                    if (!ReferenceEquals(project, _currentProject)) return;
                    var detail = streamEvent.Text.Trim();
                    if (detail.Length > 0) AddTechnical($"{action.Type}/{streamEvent.Kind}: {detail}");
                }),
                cancellationToken,
                action.Type);

            if (result.ExitCode != 0)
            {
                var output = result.Output.Trim();
                throw new InvalidOperationException(
                    $"Generated {action.Type} command failed with exit code {result.ExitCode}." +
                    (output.Length == 0 ? "" : $" {output[..Math.Min(output.Length, 500)]}"));
            }
            if (action.Type == "start" && !result.PreviewReady)
                throw new InvalidOperationException("The generated start command exited without a verified Preview.");
        }
    }

    private async Task<bool> TryAcceptCompletedDeadlineBuildAsync(
        DesktopProject project,
        StreamingWorkspaceActionParser? parser,
        Exception failure)
    {
        if (!failure.Message.Contains("BOLT_STREAM_TIMEOUT", StringComparison.OrdinalIgnoreCase) ||
            parser is not { HasClosedArtifact: true, HasFileAction: true, HasStartAction: true })
            return false;

        try
        {
            var snapshotTask = _api.GetSnapshotAsync(project.RuntimeSessionId);
            var previewTask = _api.GetPreviewStatusAsync(project.RuntimeSessionId);
            await Task.WhenAll(snapshotTask, previewTask);
            return (await snapshotTask).Count > 0 && (await previewTask).Healthy;
        }
        catch
        {
            return false;
        }
    }

    private void HandleStreamEvent(DesktopProject project, ChatMessage assistant, StreamEvent streamEvent)
    {
        var isCurrentProject = ReferenceEquals(project, _currentProject);
        switch (streamEvent.Kind)
        {
            case "text":
                assistant.Content += streamEvent.Text;
                if (ReferenceEquals(project, _currentProject))
                {
                    ChatMessagesList.Items.Refresh();
                    ChatMessagesList.ScrollIntoView(assistant);
                }
                break;
            case "commentary":
                if (!isCurrentProject) break;
                RuntimeStatusText.Text = streamEvent.Text;
                AddActivity(streamEvent.Text);
                if (streamEvent.Detail.Length > 0) AddTechnical($"commentary/{streamEvent.Status}: {streamEvent.Detail}");
                break;
            case "project-memory":
                ApplyProjectMemory(project, streamEvent.Payload);
                if (isCurrentProject) AddTechnical("Project memory checkpoint saved.");
                break;
            case "usage":
                if (isCurrentProject) AddTechnical(streamEvent.Text);
                break;
            default:
                if (!isCurrentProject) break;
                AddTechnical($"{streamEvent.Kind}/{streamEvent.Status}: {streamEvent.Text}".TrimEnd('/', ':', ' '));
                if (streamEvent.Kind == "progress" && streamEvent.Text.Length > 0) RuntimeStatusText.Text = streamEvent.Text;
                break;
        }
    }

    private static void ApplyProjectMemory(DesktopProject project, string payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return;
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            project.Memory.ProjectKey = ReadString(root, "projectKey", project.Memory.ProjectKey);
            project.Memory.Summary = ReadString(root, "summary", project.Memory.Summary);
            project.Memory.Architecture = ReadString(root, "architecture", project.Memory.Architecture);
            project.Memory.LatestGoal = ReadString(root, "latestGoal", project.Memory.LatestGoal);
            if (root.TryGetProperty("runCount", out var runCount) && runCount.TryGetInt32(out var count)) project.Memory.RunCount = count;
            if (root.TryGetProperty("updatedAt", out var updatedAt) && updatedAt.ValueKind == JsonValueKind.String &&
                DateTimeOffset.TryParse(updatedAt.GetString(), out var parsed)) project.Memory.UpdatedAt = parsed;
        }
        catch (JsonException)
        {
        }
    }

    private static string ReadString(JsonElement root, string name, string fallback) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? fallback
            : fallback;

    private async Task DispatchNextQueuedPromptAsync()
    {
        while (_promptQueue.TryDequeue(out var next) && next is not null)
        {
            UpdateQueueLabels();
            var project = _projects.FirstOrDefault(item => item.Id == next.ProjectId);
            if (project is null) continue;
            ProjectsList.SelectedItem = project;
            await RunPromptAsync(project, next.Text);
            return;
        }
        UpdateQueueLabels();
    }

    private void StopRun_Click(object sender, RoutedEventArgs e)
    {
        if (_activeRun is null) return;
        RuntimeStatusText.Text = "Stopping after the current safe checkpoint...";
        _activeRun.Cancel();
    }

    private void SetRunControls(bool running)
    {
        StopChatButton.IsEnabled = running;
        StopWorkspaceButton.IsEnabled = running;
        SendChatButton.Content = running ? "Queue" : _currentProject?.ChatMode == "discuss" ? "Ask" : "Build";
    }

    private void UpdateQueueLabels()
    {
        var text = _promptQueue.Count == 0 ? "" : $"{_promptQueue.Count} follow-up{(_promptQueue.Count == 1 ? "" : "s")} queued";
        QueuedPromptText.Text = text;
        WorkspaceQueueText.Text = text;
    }

    private void RefreshProjectUi(DesktopProject project)
    {
        ProjectsList.Items.Refresh();
        if (!ReferenceEquals(project, _currentProject)) return;
        ChatMessagesList.Items.Refresh();
        if (project.Messages.Count > 0) ChatMessagesList.ScrollIntoView(project.Messages[^1]);
    }

    private void AddActivity(string message)
    {
        AppendBounded(_activity, $"{DateTime.Now:HH:mm:ss}  {message}", 300);
        ActivityList.ScrollIntoView(_activity.LastOrDefault());
    }

    private void AddProjectActivity(DesktopProject project, string message)
    {
        if (ReferenceEquals(project, _currentProject)) AddActivity(message);
    }

    private void AddTechnical(string message)
    {
        AppendBounded(_technical, $"{DateTime.Now:HH:mm:ss}  {message}", 500);
        TechnicalList.ScrollIntoView(_technical.LastOrDefault());
    }

    private static void AppendBounded(System.Collections.ObjectModel.ObservableCollection<string> target, string value, int limit)
    {
        target.Add(value);
        while (target.Count > limit) target.RemoveAt(0);
    }

    private static string FriendlyError(Exception error)
    {
        var message = error.Message.Trim();
        return message.Length > 500 ? message[..500] + "..." : message;
    }

    private static bool IsUsageLimit(Exception error) =>
        error is HttpRequestException { StatusCode: HttpStatusCode.PaymentRequired or HttpStatusCode.TooManyRequests };
}
