using System.Windows;
using BoltGives.Desktop.Services;

namespace BoltGives.Desktop.Views;

public partial class SignInWindow : Window
{
    private readonly BoltApiClient _api;
    private readonly SecureSessionStore _sessionStore;
    private string? _challengeId;

    public SignInWindow(BoltApiClient api, SecureSessionStore sessionStore)
    {
        InitializeComponent();
        _api = api;
        _sessionStore = sessionStore;
    }

    private async void SendCode_Click(object sender, RoutedEventArgs e)
    {
        var email = EmailTextBox.Text.Trim();
        if (email.Length < 5)
        {
            SetStatus("Enter the email address attached to your bolt.gives profile.", true);
            return;
        }

        await RunBusyAsync(async () =>
        {
            var challenge = await _api.RequestLoginCodeAsync(email);
            _challengeId = challenge.ChallengeId;
            CodePanel.Visibility = Visibility.Visible;
            CodeTextBox.Focus();
            SetStatus("The code has been sent. Keep this window open and enter it above.");
        });
    }

    private async void VerifyCode_Click(object sender, RoutedEventArgs e)
    {
        if (_challengeId is null || CodeTextBox.Text.Trim().Length != 6)
        {
            SetStatus("Enter all six digits from the email.", true);
            return;
        }

        await RunBusyAsync(async () =>
        {
            await _api.VerifyLoginCodeAsync(_challengeId, CodeTextBox.Text.Trim());
            DialogResult = true;
        });
    }

    private async void Register_Click(object sender, RoutedEventArgs e)
    {
        var name = NameTextBox.Text.Trim();
        var email = RegisterEmailTextBox.Text.Trim();
        var country = CountryTextBox.Text.Trim();
        if (name.Length < 2 || !email.Contains('@') || country.Length < 2)
        {
            SetStatus("Enter your name and surname, a valid email address, and your country.", true);
            return;
        }
        await RunBusyAsync(async () =>
        {
            await _api.RegisterAsync(name, email, country);
            DialogResult = true;
        });
    }

    private async Task RunBusyAsync(Func<Task> operation)
    {
        IsEnabled = false;
        SetStatus("Connecting securely...");
        try
        {
            await operation();
        }
        catch (Exception error)
        {
            SetStatus(error.Message, true);
        }
        finally
        {
            IsEnabled = true;
        }
    }

    private void SetStatus(string message, bool error = false)
    {
        StatusText.Text = message;
        StatusText.Foreground = error
            ? new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(158, 47, 47))
            : new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(82, 100, 94));
    }
}
