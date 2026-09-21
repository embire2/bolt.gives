using System.Windows;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private async void CheckUpdates_Click(object sender, RoutedEventArgs e) => await CheckForUpdatesAsync(silent: false);

    private async Task CheckForUpdatesAsync(bool silent)
    {
        try
        {
            _availableUpdate = await _updateService.CheckAsync();
            if (_availableUpdate is null)
            {
                if (!silent) MessageBox.Show(this, "Desktop is up to date.", "bolt.gives Desktop",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            UpdateBanner.Visibility = Visibility.Visible;
            UpdateText.Text = $"Desktop {_availableUpdate.Version} is available" + (_availableUpdate.Mandatory ? " and required." : ".");
            DismissUpdateButton.Visibility = _availableUpdate.Mandatory ? Visibility.Collapsed : Visibility.Visible;
            if (_availableUpdate.Mandatory && !_mandatoryDialogShown)
            {
                _mandatoryUpdateBlocked = true;
                _mandatoryDialogShown = true;
                MainTabs.IsEnabled = false;
                ProjectsList.IsEnabled = false;
                NewProjectButton.IsEnabled = false;
                var dialog = new MandatoryUpdateWindow(_availableUpdate, InstallUpdateAsync) { Owner = this };
                var launched = dialog.ShowDialog() == true;
                if (launched)
                {
                    Application.Current.Shutdown();
                    return;
                }
                Application.Current.Shutdown();
            }
        }
        catch (Exception error)
        {
            if (!silent) MessageBox.Show(this, FriendlyError(error), "Update check failed",
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private async void UpdateNow_Click(object sender, RoutedEventArgs e)
    {
        if (_availableUpdate is null) return;
        var accepted = MessageBox.Show(this,
            $"Desktop will update to {_availableUpdate.Version}. Windows will ask for administrator approval, then the old app will close before installation.",
            "Install Desktop update", MessageBoxButton.OKCancel, MessageBoxImage.Information);
        if (accepted != MessageBoxResult.OK) return;

        UpdateButton.IsEnabled = false;
        UpdateProgress.Visibility = Visibility.Visible;
        try
        {
            await InstallUpdateAsync(_availableUpdate, new Progress<DesktopUpdateProgress>(ApplyUpdateProgress));
            Application.Current.Shutdown();
        }
        catch (Exception error)
        {
            UpdateText.Text = $"Update stopped safely: {FriendlyError(error)}";
            UpdateButton.IsEnabled = true;
        }
    }

    private void DismissUpdate_Click(object sender, RoutedEventArgs e)
    {
        if (_availableUpdate?.Mandatory == true) return;
        UpdateBanner.Visibility = Visibility.Collapsed;
    }

    private async Task InstallUpdateAsync(UpdateManifest manifest, IProgress<DesktopUpdateProgress> progress)
    {
        await _updateService.DownloadAndInstallAsync(manifest, progress);
    }

    private void ApplyUpdateProgress(DesktopUpdateProgress progress)
    {
        UpdateProgress.Value = progress.Percentage;
        UpdateText.Text = progress.Message;
    }

    private async Task ShowPreviousUpdateResultAsync()
    {
        var result = await _updateService.ReadLastResultAsync();
        if (result is null) return;
        var icon = result.Success ? MessageBoxImage.Information : MessageBoxImage.Warning;
        var title = result.Success ? "Desktop update complete" : "Desktop update recovered";
        var message = result.Success
            ? result.Message
            : result.RolledBack
                ? $"The update did not complete, so Desktop restored the previous verified version.\n\n{result.Message}"
                : $"The update did not complete and automatic rollback could not be verified.\n\n{result.Message}";
        MessageBox.Show(this, message, title, MessageBoxButton.OK, icon);
    }
}
