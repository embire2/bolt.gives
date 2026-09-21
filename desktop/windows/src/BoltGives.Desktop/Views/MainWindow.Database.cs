using System.Windows;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private ProjectConnectionState? _projectConnection;
    private bool _databaseBusy;

    private async Task RefreshDatabaseConnectionAsync(DesktopProject project)
    {
        SupabaseStatusText.Text = "Checking this project's database connection...";
        try
        {
            var connection = await _api.GetProjectConnectionAsync(project.RuntimeSessionId);
            if (!ReferenceEquals(project, _currentProject)) return;
            _projectConnection = connection;
            ShowSupabaseStep(connection is null ? 1 : 3);
            SupabaseStatusText.Text = connection is null
                ? "No database is connected. This project will continue to work without one."
                : $"Connection status: {connection.Status}.";
        }
        catch (Exception error)
        {
            if (!ReferenceEquals(project, _currentProject)) return;
            _projectConnection = null;
            ShowSupabaseStep(1);
            SupabaseStatusText.Text = FriendlyError(error);
        }
    }

    private void ShowSupabaseStep(int step)
    {
        SupabaseWelcomePanel.Visibility = step == 1 ? Visibility.Visible : Visibility.Collapsed;
        SupabaseCredentialsPanel.Visibility = step == 2 ? Visibility.Visible : Visibility.Collapsed;
        SupabaseConnectedPanel.Visibility = step == 3 ? Visibility.Visible : Visibility.Collapsed;
        SupabaseProgressOne.Background = new System.Windows.Media.SolidColorBrush(
            (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#18A66A"));
        SupabaseProgressTwo.Background = new System.Windows.Media.SolidColorBrush(
            (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(step >= 2 ? "#18A66A" : "#D4DDD8"));
        SupabaseProgressThree.Background = new System.Windows.Media.SolidColorBrush(
            (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(step >= 3 ? "#18A66A" : "#D4DDD8"));

        if (step != 3 || _projectConnection is null) return;
        var isSupabase = _projectConnection.Provider.Equals("supabase", StringComparison.OrdinalIgnoreCase);
        SupabaseConnectedTitle.Text = isSupabase
            ? "STEP 3 / SUPABASE IS VERIFIED"
            : "LEGACY DATABASE CONNECTION";
        SupabaseConnectedLabel.Text = _projectConnection.Label;
        SupabaseConnectedDetail.Text = isSupabase
            ? "Restart Preview after changing credentials so the generated app receives the new environment."
            : "New database connections are Supabase-only. Move this project to Supabase to replace the legacy connection.";
        ReplaceSupabaseButton.Content = isSupabase ? "Replace credentials" : "Move to Supabase";
    }

    private void RegisterSupabase_Click(object sender, RoutedEventArgs e) =>
        OpenExternal("https://supabase.com/dashboard/sign-up");

    private void OpenSupabaseDashboard_Click(object sender, RoutedEventArgs e) =>
        OpenExternal("https://supabase.com/dashboard/projects");

    private void ShowSupabaseCredentials_Click(object sender, RoutedEventArgs e)
    {
        SupabaseValidationText.Text = "";
        ShowSupabaseStep(2);
        SupabaseProjectUrlTextBox.Focus();
    }

    private void BackFromSupabaseCredentials_Click(object sender, RoutedEventArgs e)
    {
        SupabasePublishableKeyBox.Clear();
        SupabaseValidationText.Text = "";
        ShowSupabaseStep(_projectConnection is null ? 1 : 3);
    }

    private async void ConnectSupabase_Click(object sender, RoutedEventArgs e)
    {
        if (_databaseBusy || _currentProject is null || _mandatoryUpdateBlocked) return;
        if (!SupabaseConnectionPolicy.TryValidate(
                SupabaseProjectUrlTextBox.Text,
                SupabasePublishableKeyBox.Password,
                out var projectUrl,
                out var validationError))
        {
            SupabaseValidationText.Text = validationError;
            return;
        }

        _databaseBusy = true;
        ConnectSupabaseButton.IsEnabled = false;
        ConnectSupabaseButton.Content = "Verifying...";
        SupabaseValidationText.Text = "The server is verifying this Supabase project before saving it.";
        var project = _currentProject;
        try
        {
            _projectConnection = await _api.SaveSupabaseConnectionAsync(
                project.RuntimeSessionId,
                projectUrl,
                SupabasePublishableKeyBox.Password);
            if (!ReferenceEquals(project, _currentProject)) return;
            SupabaseProjectUrlTextBox.Text = projectUrl;
            SupabasePublishableKeyBox.Clear();
            SupabaseStatusText.Text = "Supabase verified and connected. Restart Preview if it is already running.";
            ShowSupabaseStep(3);
        }
        catch (Exception error)
        {
            if (ReferenceEquals(project, _currentProject))
                SupabaseValidationText.Text = FriendlyError(error);
        }
        finally
        {
            _databaseBusy = false;
            ConnectSupabaseButton.IsEnabled = true;
            ConnectSupabaseButton.Content = "Verify and connect";
        }
    }

    private async void DisconnectSupabase_Click(object sender, RoutedEventArgs e)
    {
        if (_databaseBusy || _currentProject is null) return;
        if (MessageBox.Show(this,
                "Disconnect the database from this project? Restart Preview afterwards to clear the old environment.",
                "Disconnect Supabase",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning) != MessageBoxResult.Yes) return;

        _databaseBusy = true;
        var project = _currentProject;
        SupabaseStatusText.Text = "Removing the private connection record...";
        try
        {
            await _api.DeleteProjectConnectionAsync(project.RuntimeSessionId);
            if (!ReferenceEquals(project, _currentProject)) return;
            _projectConnection = null;
            SupabaseProjectUrlTextBox.Clear();
            SupabasePublishableKeyBox.Clear();
            SupabaseStatusText.Text = "Supabase disconnected. Restart Preview to clear the old environment.";
            ShowSupabaseStep(1);
        }
        catch (Exception error)
        {
            if (ReferenceEquals(project, _currentProject)) SupabaseStatusText.Text = FriendlyError(error);
        }
        finally
        {
            _databaseBusy = false;
        }
    }
}
