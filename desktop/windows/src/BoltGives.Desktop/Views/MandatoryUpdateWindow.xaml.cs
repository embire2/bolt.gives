using System.ComponentModel;
using System.Windows;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Views;

public partial class MandatoryUpdateWindow : Window
{
    private readonly UpdateManifest _manifest;
    private readonly Func<UpdateManifest, IProgress<DesktopUpdateProgress>, Task> _installer;
    private bool _allowClose;

    public MandatoryUpdateWindow(
        UpdateManifest manifest,
        Func<UpdateManifest, IProgress<DesktopUpdateProgress>, Task> installer)
    {
        InitializeComponent();
        _manifest = manifest;
        _installer = installer;
        TitleText.Text = $"Update to Desktop {manifest.Version}";
        FeaturesList.ItemsSource = manifest.Features.Count > 0
            ? manifest.Features.Select(feature => $"- {feature}")
            : ["- Reliability, security and compatibility improvements"];
    }

    private async void Install_Click(object sender, RoutedEventArgs e)
    {
        InstallButton.IsEnabled = false;
        try
        {
            var progress = new Progress<DesktopUpdateProgress>(item =>
            {
                Progress.Value = item.Percentage;
                StatusText.Text = item.Message;
            });
            await _installer(_manifest, progress);
            StatusText.Text = "Administrator approval received. Closing Desktop before installation...";
            _allowClose = true;
            DialogResult = true;
        }
        catch (Exception error)
        {
            StatusText.Text = $"Nothing was changed: {error.Message}";
            InstallButton.IsEnabled = true;
        }
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        _allowClose = true;
        DialogResult = false;
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (!_allowClose) e.Cancel = true;
    }
}
