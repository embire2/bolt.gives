using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;
using Microsoft.Web.WebView2.Wpf;

namespace BoltGives.Desktop.Views;

public partial class MainWindow : Window
{
    private readonly BoltApiClient _api;
    private readonly ProjectStore _projectStore;
    private readonly UpdateService _updateService;
    private readonly ObservableCollection<DesktopProject> _projects = [];
    private readonly ObservableCollection<FileEntry> _files = [];
    private readonly ObservableCollection<string> _activity = [];
    private readonly ObservableCollection<string> _technical = [];
    private readonly PromptQueue _promptQueue = new();
    private readonly SemaphoreSlim _persistGate = new(1, 1);
    private readonly SemaphoreSlim _previewNavigationGate = new(1, 1);
    private Dictionary<string, string> _snapshot = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, string> _previousSnapshot = new(StringComparer.OrdinalIgnoreCase);
    private DesktopProject? _currentProject;
    private UpdateManifest? _availableUpdate;
    private CancellationTokenSource? _activeRun;
    private CancellationTokenSource? _previewEvents;
    private Uri? _previewUri;
    private readonly HashSet<string> _seenPreviewLogs = new(StringComparer.Ordinal);
    private readonly Queue<string> _previewLogOrder = new();
    private bool _busy;
    private bool _runtimeNodeSupported;
    private bool _mandatoryUpdateBlocked;
    private bool _mandatoryDialogShown;
    private bool _previewBrowserInitializationFailed;
    private bool _loaded;

    public MainWindow(
        BoltApiClient api,
        ProjectStore projectStore,
        UpdateService updateService)
    {
        InitializeComponent();
        _api = api;
        _projectStore = projectStore;
        _updateService = updateService;
        PreviewBrowser.CreationProperties = new CoreWebView2CreationProperties
        {
            UserDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "bolt.gives Desktop",
                "WebView2"),
        };
        ProjectsList.ItemsSource = _projects;
        FilesList.ItemsSource = _files;
        ActivityList.ItemsSource = _activity;
        TechnicalList.ItemsSource = _technical;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        if (_loaded) return;
        _loaded = true;
        var profile = _api.Session?.Profile ?? new Profile { Name = "Builder" };
        var firstName = profile.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "builder";
        GreetingText.Text = $"Hi {firstName}, what are we creating today?";
        DesktopVersionText.Text = $"Desktop v{App.DesktopVersion}";
        AccountNameText.Text = profile.Name;
        AccountEmailText.Text = profile.Email;
        AccountCountryText.Text = profile.Country;
        PreviewSizeComboBox.SelectedIndex = 0;

        await ShowPreviousUpdateResultAsync();
        _ = _updateService.CleanupStagingAsync(TimeSpan.FromSeconds(10));
        await CheckForUpdatesAsync(silent: true);
        if (_mandatoryUpdateBlocked) return;
        await LoadProjectsAsync();
        await RefreshBalanceAsync();
        await RefreshRuntimeNodeSupportAsync();
        await ShowTaskbarPinPromptOnceAsync();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _activeRun?.Cancel();
        _previewEvents?.Cancel();
        _activeRun?.Dispose();
        _previewEvents?.Dispose();
        _updateService.Dispose();
    }

    private async Task LoadProjectsAsync()
    {
        var saved = await _projectStore.LoadAsync();
        foreach (var project in saved.OrderByDescending(project => project.UpdatedAt)) _projects.Add(project);
        if (_projects.Count == 0) _projects.Add(CreateProject());
        ProjectsList.SelectedIndex = 0;
        await PersistProjectsAsync();
    }

    private DesktopProject CreateProject() => new()
    {
        OwnerProfileId = _api.Session?.Profile.Id ?? "",
        Title = $"New project {_projects.Count + 1}",
        Model = "gpt-5.6-sol",
        ChatMode = "build",
    };

    private async void NewProject_Click(object sender, RoutedEventArgs e)
    {
        if (_mandatoryUpdateBlocked) return;
        var project = CreateProject();
        _projects.Insert(0, project);
        ProjectsList.SelectedItem = project;
        await PersistProjectsAsync();
        MainTabs.SelectedIndex = 0;
        ChatPromptTextBox.Focus();
    }

    private async void RenameProject_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null) return;
        var dialog = new TextPromptWindow("Rename project", "Project name", _currentProject.Title) { Owner = this };
        if (dialog.ShowDialog() != true || string.IsNullOrWhiteSpace(dialog.Value)) return;
        _currentProject.Title = dialog.Value.Trim()[..Math.Min(dialog.Value.Trim().Length, 80)];
        _currentProject.UpdatedAt = DateTimeOffset.UtcNow;
        ProjectsList.Items.Refresh();
        await PersistProjectsAsync();
    }

    private async void DuplicateProject_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null || _busy) return;
        var source = _currentProject;
        var duplicate = CreateProject();
        duplicate.Title = $"{source.Title} copy";
        duplicate.Model = source.Model;
        duplicate.ChatMode = source.ChatMode;
        duplicate.Memory = new ProjectMemory
        {
            ProjectKey = source.Memory.ProjectKey,
            Summary = source.Memory.Summary,
            Architecture = source.Memory.Architecture,
            LatestGoal = source.Memory.LatestGoal,
            RunCount = source.Memory.RunCount,
            UpdatedAt = source.Memory.UpdatedAt,
        };
        duplicate.Messages = source.Messages.Select(message => new ChatMessage
        {
            Role = message.Role,
            Content = message.Content,
            CreatedAt = message.CreatedAt,
        }).ToList();
        if (_snapshot.Count > 0) await _api.SaveSnapshotAsync(duplicate.RuntimeSessionId, _snapshot);
        _projects.Insert(0, duplicate);
        ProjectsList.SelectedItem = duplicate;
        await PersistProjectsAsync();
    }

    private async void DeleteProject_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null || _busy) return;
        var project = _currentProject;
        if (MessageBox.Show(this, $"Delete '{project.Title}' from this Windows profile?", "Delete project",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        var index = _projects.IndexOf(project);
        _projects.Remove(project);
        _currentProject = null;
        if (_projects.Count == 0) _projects.Add(CreateProject());
        ProjectsList.SelectedIndex = Math.Clamp(index, 0, _projects.Count - 1);
        await PersistProjectsAsync();
    }

    private async void ProjectsList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ProjectsList.SelectedItem is not DesktopProject project || ReferenceEquals(project, _currentProject)) return;
        _currentProject = project;
        _previewUri = null;
        _seenPreviewLogs.Clear();
        _previewLogOrder.Clear();
        _snapshot = new(StringComparer.OrdinalIgnoreCase);
        _previousSnapshot = new(StringComparer.OrdinalIgnoreCase);
        ProjectIdentityText.Text = $"Project {Short(project.Id)} / runtime {Short(project.RuntimeSessionId, 20)}";
        ChatMessagesList.ItemsSource = project.Messages;
        ChatMessagesList.Items.Refresh();
        SelectComboValue(ModelComboBox, project.Model, 0);
        SelectComboValue(ChatModeComboBox, project.ChatMode, 0);
        LiveProjectNameTextBox.Text = project.Title;
        _activity.Clear();
        _technical.Clear();
        _activity.Add("Project history and runtime identity restored for this profile.");
        await Task.WhenAll(RefreshWorkspaceAsync(project), RefreshDatabaseConnectionAsync(project));
        StartPreviewSubscription(project);
    }

    private async void ModelComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_loaded || _currentProject is null || ModelComboBox.SelectedItem is not ComboBoxItem item) return;
        _currentProject.Model = item.Tag?.ToString() ?? "gpt-5.6-sol";
        _currentProject.UpdatedAt = DateTimeOffset.UtcNow;
        await PersistProjectsAsync();
    }

    private async void ChatModeComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_loaded || _currentProject is null || ChatModeComboBox.SelectedItem is not ComboBoxItem item) return;
        _currentProject.ChatMode = item.Tag?.ToString() == "discuss" ? "discuss" : "build";
        _currentProject.UpdatedAt = DateTimeOffset.UtcNow;
        SendChatButton.Content = _busy ? "Queue" : _currentProject.ChatMode == "discuss" ? "Ask" : "Build";
        await PersistProjectsAsync();
    }

    private void MainTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!ReferenceEquals(e.Source, MainTabs)) return;
        if (MainTabs.SelectedIndex == 1 && _currentProject is not null) _ = RefreshWorkspaceAsync(_currentProject);
        if (ReferenceEquals(MainTabs.SelectedItem, DatabaseTab) && _currentProject is not null)
            _ = RefreshDatabaseConnectionAsync(_currentProject);
        if (ReferenceEquals(MainTabs.SelectedItem, AccountTab)) _ = RefreshBalanceAsync();
    }

    private void ShowAccount_Click(object sender, RoutedEventArgs e) => MainTabs.SelectedItem = AccountTab;
    private void ShowDeploy_Click(object sender, RoutedEventArgs e) => MainTabs.SelectedItem = DeployTab;
    private async void RefreshBalance_Click(object sender, RoutedEventArgs e) => await RefreshBalanceAsync();

    private async Task RefreshBalanceAsync()
    {
        try
        {
            var balance = await _api.GetUsageBalanceAsync();
            BalanceText.Text = $"{balance.TokensRemaining:0} / {balance.TokensAllowance:0} tokens";
            AccountBalanceText.Text = $"{balance.TokensRemaining:0} of {balance.TokensAllowance:0}";
            AccountPlanText.Text = balance.Plan.Equals("custom-domain", StringComparison.OrdinalIgnoreCase)
                ? "Custom Domain"
                : "FREE";
            AccountResetText.Text = balance.ResetAt is null
                ? balance.PeriodLabel
                : $"Resets {balance.ResetAt.Value.ToLocalTime():g} ({balance.PeriodLabel})";
            AccountBalanceProgress.Value = balance.TokensAllowance <= 0
                ? 0
                : Math.Clamp((double)(balance.TokensRemaining / balance.TokensAllowance * 100), 0, 100);
        }
        catch
        {
            BalanceText.Text = "Balance unavailable";
            AccountBalanceText.Text = "Unavailable";
        }
    }

    private async void SignOut_Click(object sender, RoutedEventArgs e)
    {
        await _api.LogoutAsync();
        Process.Start(new ProcessStartInfo { FileName = Environment.ProcessPath!, UseShellExecute = true });
        Application.Current.Shutdown();
    }

    private void ReportBug_Click(object sender, RoutedEventArgs e) =>
        OpenExternal("https://github.com/embire2/bolt.gives/issues/new/choose");

    private async Task PersistProjectsAsync()
    {
        await _persistGate.WaitAsync();
        try
        {
            await _projectStore.SaveAsync(_projects);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            RuntimeStatusText.Text = $"Project files are still open, but local history could not be saved: {FriendlyError(error)}";
        }
        finally { _persistGate.Release(); }
    }

    private static void SelectComboValue(ComboBox comboBox, string value, int fallback)
    {
        foreach (ComboBoxItem item in comboBox.Items)
        {
            if (item.Tag?.ToString() == value)
            {
                comboBox.SelectedItem = item;
                return;
            }
        }
        comboBox.SelectedIndex = fallback;
    }

    private async Task ShowTaskbarPinPromptOnceAsync()
    {
        var directory = UpdateHandoffValidator.GetLocalStateDirectory();
        var marker = Path.Combine(directory, "taskbar-pin-prompted-v1");
        if (File.Exists(marker)) return;
        Directory.CreateDirectory(directory);
        await File.WriteAllTextAsync(marker, DateTimeOffset.UtcNow.ToString("O"));
        MessageBox.Show(this,
            "Keep bolt.gives Desktop one click away? Right-click its taskbar icon and select 'Pin to taskbar'. Windows requires your approval for taskbar pins.",
            "Pin bolt.gives Desktop", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private static string Short(string value, int length = 8) => value[..Math.Min(length, value.Length)];

    private static void OpenExternal(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return;
        _ = Process.Start(new ProcessStartInfo { FileName = uri.AbsoluteUri, UseShellExecute = true });
    }

    private sealed record FileEntry(string Path);
}
