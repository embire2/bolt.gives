using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;
using Microsoft.Web.WebView2.Core;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private async void RefreshWorkspace_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is not null) await RefreshWorkspaceAsync(_currentProject);
    }

    private async Task RefreshWorkspaceAsync(DesktopProject project)
    {
        try
        {
            var snapshotTask = _api.GetSnapshotAsync(project.RuntimeSessionId);
            var statusTask = _api.GetPreviewStatusAsync(project.RuntimeSessionId);
            await Task.WhenAll(snapshotTask, statusTask);
            if (!ReferenceEquals(project, _currentProject)) return;

            var nextSnapshot = await snapshotTask;
            if (_snapshot.Count > 0) _previousSnapshot = new(_snapshot, StringComparer.OrdinalIgnoreCase);
            _snapshot = nextSnapshot;
            ApplyFileFilter();
            DiffTextBox.Text = BuildDiff(_previousSnapshot, _snapshot);
            ApplyPreviewStatus(project, await statusTask);
        }
        catch (Exception error)
        {
            if (!ReferenceEquals(project, _currentProject)) return;
            RuntimeStatusText.Text = $"Workspace is waiting: {FriendlyError(error)}";
            RuntimeStateText.Text = "The workspace remains saved. Use Refresh or send a follow-up prompt to retry the connection.";
        }
    }

    private void StartPreviewSubscription(DesktopProject project)
    {
        _previewEvents?.Cancel();
        _previewEvents?.Dispose();
        _previewEvents = new CancellationTokenSource();
        _ = ObservePreviewEventsAsync(project, _previewEvents.Token);
    }

    private async Task ObservePreviewEventsAsync(DesktopProject project, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await _api.SubscribePreviewEventsAsync(
                    project.RuntimeSessionId,
                    status => Dispatcher.Invoke(() =>
                    {
                        if (ReferenceEquals(project, _currentProject)) ApplyPreviewStatus(project, status);
                    }),
                    cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception error)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    if (ReferenceEquals(project, _currentProject))
                        AddTechnical($"Preview event connection will retry: {FriendlyError(error)}");
                });
            }

            try { await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    private void ApplyPreviewStatus(DesktopProject project, PreviewStatus status)
    {
        var repairMessage = status.Recovery?.Message;
        var stateMessage = status.Alert?.Description ?? repairMessage;
        var database = status.ProjectConnection is null
            ? "Supabase: not connected"
            : $"Supabase: {status.ProjectConnection.Status} ({status.ProjectConnection.Label})";
        RuntimeStateText.Text = $"Preview: {status.Status}\nHealthy: {(status.Healthy ? "yes" : "no")}\n{database}" +
                                (string.IsNullOrWhiteSpace(stateMessage) ? "" : $"\n\n{stateMessage}");

        if (status.Healthy)
        {
            RuntimeStatusText.Text = "Preview verified and ready.";
            PreviewRepairProgress.Visibility = Visibility.Collapsed;
        }
        else if (status.Status.Equals("repairing", StringComparison.OrdinalIgnoreCase) ||
                 status.Recovery?.State is "queued" or "running")
        {
            RuntimeStatusText.Text = repairMessage ?? "A Preview problem was detected. Automatic repair is running.";
            if (_previewUri is null)
            {
                PreviewEmpty.Visibility = Visibility.Visible;
                PreviewEmptyTitle.Text = "Repairing Preview";
                PreviewEmptyDetail.Text = repairMessage ?? "The runtime is applying a safe repair and will show the app when verification passes.";
                PreviewRepairProgress.Visibility = Visibility.Visible;
            }
        }
        else
        {
            RuntimeStatusText.Text = $"Preview: {status.Status}.";
        }

        if (status.Preview is not null && !string.IsNullOrWhiteSpace(status.Preview.BaseUrl))
        {
            var nextUri = PreviewNavigationPolicy.Resolve(App.ServiceOrigin, status.Preview.BaseUrl, project.RuntimeSessionId);
            if (nextUri is null)
            {
                AddTechnical("Rejected an unexpected Preview URL outside the current project runtime.");
                return;
            }

            if (_previewUri != nextUri)
            {
                _previewUri = nextUri;
                PreviewAddressText.Text = nextUri.AbsolutePath;
            }
            if (!_previewBrowserInitializationFailed && PreviewNavigationPolicy.RequiresNavigation(
                    PreviewBrowser.Source,
                    nextUri,
                    PreviewBrowser.CoreWebView2 is not null))
                _ = NavigatePreviewAsync(project, nextUri);
            PreviewEmpty.Visibility = Visibility.Collapsed;
            PreviewRepairProgress.Visibility = Visibility.Collapsed;
        }
        else if (_previewUri is null && !status.Status.Equals("repairing", StringComparison.OrdinalIgnoreCase))
        {
            PreviewEmpty.Visibility = Visibility.Visible;
            PreviewEmptyTitle.Text = "Preview is waiting for a verified app";
            PreviewEmptyDetail.Text = "Keep prompting while the agent creates files, starts the app and verifies the result.";
        }

        foreach (var log in status.RecentLogs.TakeLast(8)) AddPreviewLog(log);
    }

    private void ApplyFileFilter()
    {
        var query = FileSearchTextBox.Text.Trim();
        var selectedPath = _currentProject?.SelectedFile;
        _files.Clear();
        foreach (var path in _snapshot.Keys
                     .Where(path => query.Length == 0 || path.Contains(query, StringComparison.OrdinalIgnoreCase))
                     .OrderBy(path => path))
        {
            _files.Add(new(path));
        }

        if (_files.Count == 0)
        {
            SelectedFileText.Text = query.Length == 0 ? "No text files yet" : "No matching files";
            CodeEditor.Text = "";
            return;
        }
        FilesList.SelectedItem = _files.FirstOrDefault(file => file.Path == selectedPath) ?? _files[0];
    }

    private void FileSearch_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loaded) ApplyFileFilter();
    }

    private void FilesList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_currentProject is null || FilesList.SelectedItem is not FileEntry file) return;
        _currentProject.SelectedFile = file.Path;
        SelectedFileText.Text = file.Path;
        CodeEditor.Text = _snapshot.GetValueOrDefault(file.Path, "");
        CodeEditor.SyntaxHighlighting = ResolveHighlighting(file.Path);
    }

    private async void SaveFile_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject?.SelectedFile is not { } selectedFile) return;
        var project = _currentProject;
        var nextSnapshot = new Dictionary<string, string>(_snapshot, StringComparer.OrdinalIgnoreCase)
        {
            [selectedFile] = CodeEditor.Text,
        };
        try
        {
            await _api.SaveSnapshotAsync(project.RuntimeSessionId, nextSnapshot);
            project.UpdatedAt = DateTimeOffset.UtcNow;
            if (ReferenceEquals(project, _currentProject))
            {
                _previousSnapshot = new(_snapshot, StringComparer.OrdinalIgnoreCase);
                _snapshot = nextSnapshot;
                DiffTextBox.Text = BuildDiff(_previousSnapshot, _snapshot);
                RuntimeStatusText.Text = $"Saved {selectedFile}; Preview verification is queued.";
            }
            await PersistProjectsAsync();
        }
        catch (Exception error)
        {
            if (ReferenceEquals(project, _currentProject))
                RuntimeStatusText.Text = $"Save failed: {FriendlyError(error)}";
        }
    }

    private async void RunTerminal_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null || _busy || _mandatoryUpdateBlocked) return;
        var project = _currentProject;
        var command = TerminalCommandTextBox.Text.Trim();
        if (command.Length == 0) return;
        TerminalCommandTextBox.Clear();
        TerminalOutput.AppendText($"\n> {command}\n");
        _busy = true;
        SetRunControls(running: true);
        try
        {
            await _api.RunCommandAsync(project.RuntimeSessionId, command, streamEvent => Dispatcher.Invoke(() =>
            {
                if (!ReferenceEquals(project, _currentProject)) return;
                TerminalOutput.AppendText(streamEvent.Text);
                TerminalOutput.ScrollToEnd();
                AddTechnical($"terminal/{streamEvent.Kind}: {streamEvent.Text.Trim()}");
            }), CancellationToken.None);
            await RefreshWorkspaceAsync(project);
        }
        catch (Exception error)
        {
            TerminalOutput.AppendText($"\n{FriendlyError(error)}\n");
        }
        finally
        {
            _busy = false;
            SetRunControls(running: false);
        }
    }

    private async void TerminalCommand_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || Keyboard.Modifiers != ModifierKeys.None) return;
        e.Handled = true;
        RunTerminal_Click(sender, e);
        await Task.CompletedTask;
    }

    private void CodeEditor_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.S || !Keyboard.Modifiers.HasFlag(ModifierKeys.Control)) return;
        e.Handled = true;
        SaveFile_Click(sender, e);
    }

    private void WorkspaceTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!ReferenceEquals(e.Source, WorkspaceTabs) || _currentProject is null) return;
        if (WorkspaceTabs.SelectedIndex != 1) return;
        _ = RefreshWorkspaceAsync(_currentProject);
        if (_previewUri is not null) _ = NavigatePreviewAsync(_currentProject, _previewUri);
    }

    private void PreviewBrowser_NavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (_currentProject is null || !Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
        {
            e.Cancel = true;
            return;
        }
        if (PreviewNavigationPolicy.IsAllowed(uri, App.ServiceOrigin, _currentProject.RuntimeSessionId)) return;
        e.Cancel = true;
        if (uri.Scheme == Uri.UriSchemeHttps) OpenExternal(uri.AbsoluteUri);
    }

    private void PreviewBrowser_CoreWebView2InitializationCompleted(
        object sender,
        CoreWebView2InitializationCompletedEventArgs e)
    {
        _previewBrowserInitializationFailed = !e.IsSuccess;
        if (e.IsSuccess) return;
        PreviewEmpty.Visibility = Visibility.Visible;
        PreviewEmptyTitle.Text = "Preview runtime needs repair";
        PreviewEmptyDetail.Text = $"WebView2 could not start: {FriendlyError(e.InitializationException)}. Re-run the signed Desktop installer to repair the runtime.";
        PreviewRepairProgress.Visibility = Visibility.Collapsed;
        AddTechnical($"WebView2 initialization failed: {FriendlyError(e.InitializationException)}");
    }

    private async Task NavigatePreviewAsync(DesktopProject project, Uri previewUri, bool reload = false)
    {
        await _previewNavigationGate.WaitAsync();
        try
        {
            if (_previewBrowserInitializationFailed && !reload) return;
            if (reload) _previewBrowserInitializationFailed = false;
            await PreviewBrowser.EnsureCoreWebView2Async();
            if (!ReferenceEquals(project, _currentProject) || _previewUri != previewUri) return;

            if (PreviewBrowser.Source != previewUri)
                PreviewBrowser.Source = previewUri;
            else if (reload)
                PreviewBrowser.CoreWebView2.Reload();
        }
        catch (Exception error)
        {
            if (!ReferenceEquals(project, _currentProject)) return;
            _previewBrowserInitializationFailed = true;
            PreviewEmpty.Visibility = Visibility.Visible;
            PreviewEmptyTitle.Text = "Preview runtime needs repair";
            PreviewEmptyDetail.Text = $"WebView2 could not open Preview: {FriendlyError(error)}. Re-run the signed Desktop installer to repair the runtime.";
            PreviewRepairProgress.Visibility = Visibility.Collapsed;
            AddTechnical($"WebView2 Preview navigation failed: {FriendlyError(error)}");
        }
        finally
        {
            _previewNavigationGate.Release();
        }
    }

    private async void ReloadPreview_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is not null && _previewUri is not null)
            await NavigatePreviewAsync(_currentProject, _previewUri, reload: true);
    }

    private void OpenPreview_Click(object sender, RoutedEventArgs e)
    {
        if (_previewUri is not null) OpenExternal(_previewUri.AbsoluteUri);
    }

    private void PreviewSize_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (PreviewSizeComboBox.SelectedItem is not ComboBoxItem item || !double.TryParse(item.Tag?.ToString(), out var width)) return;
        if (width <= 0)
        {
            PreviewViewport.Width = double.NaN;
            PreviewViewport.HorizontalAlignment = HorizontalAlignment.Stretch;
        }
        else
        {
            PreviewViewport.Width = width;
            PreviewViewport.HorizontalAlignment = HorizontalAlignment.Center;
        }
    }

    private static string BuildDiff(IReadOnlyDictionary<string, string> previous, IReadOnlyDictionary<string, string> current)
    {
        if (previous.Count == 0) return "No previous snapshot is available yet.";
        var output = new StringBuilder();
        var changed = previous.Keys.Union(current.Keys, StringComparer.OrdinalIgnoreCase)
            .Where(path => !previous.TryGetValue(path, out var before) || !current.TryGetValue(path, out var after) || before != after)
            .OrderBy(path => path)
            .ToList();
        if (changed.Count == 0) return "No changes since the previous workspace refresh.";

        foreach (var path in changed)
        {
            output.AppendLine($"--- {path}");
            var beforeLines = previous.GetValueOrDefault(path, "").Replace("\r\n", "\n").Split('\n');
            var afterLines = current.GetValueOrDefault(path, "").Replace("\r\n", "\n").Split('\n');
            var max = Math.Max(beforeLines.Length, afterLines.Length);
            var emitted = 0;
            for (var index = 0; index < max && emitted < 200; index++)
            {
                var before = index < beforeLines.Length ? beforeLines[index] : null;
                var after = index < afterLines.Length ? afterLines[index] : null;
                if (before == after) continue;
                if (before is not null) output.AppendLine($"- {before}");
                if (after is not null) output.AppendLine($"+ {after}");
                emitted++;
            }
            if (emitted >= 200) output.AppendLine("... diff truncated for responsiveness ...");
            output.AppendLine();
        }
        return output.ToString();
    }

    private void AddPreviewLog(string log)
    {
        if (string.IsNullOrWhiteSpace(log) || !_seenPreviewLogs.Add(log)) return;
        _previewLogOrder.Enqueue(log);
        while (_previewLogOrder.Count > 300)
        {
            _seenPreviewLogs.Remove(_previewLogOrder.Dequeue());
        }
        AddTechnical($"preview: {log}");
    }

    private static ICSharpCode.AvalonEdit.Highlighting.IHighlightingDefinition? ResolveHighlighting(string path)
    {
        var name = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".cs" => "C#",
            ".js" or ".jsx" or ".ts" or ".tsx" or ".json" => "JavaScript",
            ".html" or ".htm" => "HTML",
            ".css" => "CSS",
            ".xml" or ".xaml" => "XML",
            _ => null,
        };
        return name is null ? null : ICSharpCode.AvalonEdit.Highlighting.HighlightingManager.Instance.GetDefinition(name);
    }
}
