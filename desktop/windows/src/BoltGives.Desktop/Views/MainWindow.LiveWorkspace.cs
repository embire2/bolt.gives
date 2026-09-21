using System.Windows;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private async Task RefreshRuntimeNodeSupportAsync()
    {
        try
        {
            var support = await _api.GetRuntimeNodeSupportAsync();
            _runtimeNodeSupported = support.Supported;
            LiveWorkspaceStatusText.Text = support.Supported
                ? $"Runtime node ready: {support.Host ?? "managed host"}:{support.Port} using {support.AuthMode}. {support.Summary.Active} active workspace(s)."
                : support.Reason ?? "Dedicated runtime workspaces are not configured.";
            ProvisionWorkspaceButton.IsEnabled = support.Supported;
        }
        catch (Exception error)
        {
            _runtimeNodeSupported = false;
            LiveWorkspaceStatusText.Text = FriendlyError(error);
            ProvisionWorkspaceButton.IsEnabled = false;
        }
    }

    private async void ProvisionWorkspace_Click(object sender, RoutedEventArgs e)
    {
        if (_busy || _mandatoryUpdateBlocked) return;
        var projectName = LiveProjectNameTextBox.Text.Trim();
        var username = LiveUsernameTextBox.Text.Trim();
        var password = LivePasswordBox.Password;
        if (projectName.Length < 3 || username.Length < 3 || password.Length < 10)
        {
            LiveWorkspaceStatusText.Text = "Enter a project name, a valid Linux username, and a password of at least 10 characters.";
            return;
        }

        _busy = true;
        ProvisionWorkspaceButton.IsEnabled = false;
        LiveWorkspaceStatusText.Text = "Provisioning the isolated Linux user and private project directory...";
        LiveWorkspaceResultTextBox.Clear();
        try
        {
            var workspace = await _api.ProvisionRuntimeNodeWorkspaceAsync(projectName, username, password);
            LivePasswordBox.Clear();
            LiveWorkspaceStatusText.Text = $"Workspace {workspace.Status}. Save the one-time details shown on the right.";
            LiveWorkspaceResultTextBox.Text =
                $"Project: {workspace.ProjectName}\n" +
                $"Status: {workspace.Status}\n" +
                $"SSH: {workspace.SshCommand ?? "pending"}\n" +
                $"CLI username: {workspace.CliUsername}\n" +
                $"CLI password: {workspace.OneTimeCliPassword ?? "chosen password"}\n" +
                $"Workspace: {workspace.WorkspaceDirectory}\n\n" +
                "Database: not provisioned. Use the Supabase wizard when this project needs data.";
        }
        catch (Exception error)
        {
            LiveWorkspaceStatusText.Text = FriendlyError(error);
        }
        finally
        {
            _busy = false;
            ProvisionWorkspaceButton.IsEnabled = _runtimeNodeSupported;
        }
    }
}
