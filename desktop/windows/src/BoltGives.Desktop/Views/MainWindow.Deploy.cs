using System.Text.Json;
using System.Windows;
using System.Windows.Media;

namespace BoltGives.Desktop.Views;

public partial class MainWindow
{
    private async void PublishFree_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null) return;
        var project = _currentProject;
        await RunDeployAsync(async () =>
        {
            using var result = await _api.PublishFreeAsync(project.RuntimeSessionId, SubdomainTextBox.Text.Trim());
            var url = TryReadNestedString(result.RootElement, "deployment", "url");
            DeployStatusText.Text = url is null
                ? "Deployment created. DNS and HTTPS checks are still running."
                : $"Published and ready: {url}";
            if (url is not null) OpenExternal(url);
        });
    }

    private async void DeployCloudflare_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null) return;
        var project = _currentProject;
        await RunDeployAsync(async () =>
        {
            using var result = await _api.DeployCloudflareAsync(project.RuntimeSessionId, CloudflareProjectTextBox.Text.Trim());
            var url = TryReadNestedString(result.RootElement, "deployment", "deploymentUrl") ??
                      TryReadNestedString(result.RootElement, "deployment", "pagesUrl");
            DeployStatusText.Text = url is null ? "Cloudflare accepted the deployment." : $"Cloudflare deployment: {url}";
            if (url is not null) OpenExternal(url);
        });
    }

    private async void CustomDomain_Click(object sender, RoutedEventArgs e)
    {
        if (_currentProject is null) return;
        var project = _currentProject;
        await RunDeployAsync(async () =>
        {
            using var result = await _api.CreateCustomDomainCheckoutAsync(project.RuntimeSessionId, CustomDomainTextBox.Text.Trim());
            var url = result.RootElement.TryGetProperty("checkoutUrl", out var checkoutUrl) ? checkoutUrl.GetString() : null;
            DeployStatusText.Text = "Secure checkout created. Access activates only after the signed Stripe webhook confirms payment.";
            if (!string.IsNullOrWhiteSpace(url)) OpenExternal(url);
        });
    }

    private async Task RunDeployAsync(Func<Task> operation)
    {
        if (_mandatoryUpdateBlocked || _busy) return;
        DeployStatusText.Foreground = new SolidColorBrush(Color.FromRgb(23, 63, 50));
        DeployStatusText.Text = "Building and verifying the deployment artifact...";
        _busy = true;
        SetRunControls(running: true);
        try
        {
            await operation();
        }
        catch (Exception error)
        {
            DeployStatusText.Foreground = new SolidColorBrush(Color.FromRgb(158, 47, 47));
            DeployStatusText.Text = FriendlyError(error);
        }
        finally
        {
            _busy = false;
            SetRunControls(running: false);
        }
    }

    private static string? TryReadNestedString(JsonElement root, string objectName, string propertyName) =>
        root.TryGetProperty(objectName, out var nested) && nested.TryGetProperty(propertyName, out var value)
            ? value.GetString()
            : null;
}
