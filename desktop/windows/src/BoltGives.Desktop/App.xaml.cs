using System.Windows;
using System.Windows.Threading;
using System.Reflection;
using BoltGives.Desktop.Services;
using BoltGives.Desktop.Views;

namespace BoltGives.Desktop;

public partial class App : Application
{
    private Mutex? _singleInstance;
    public static string DesktopVersion =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.11.0";
    public static readonly Uri ServiceOrigin = new("https://bolt.gives/");

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += HandleDispatcherException;
        _singleInstance = new Mutex(initiallyOwned: true, "Local\\bolt.gives.Desktop.Application", out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show("bolt.gives Desktop is already running for this Windows user.", "bolt.gives Desktop",
                MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        Dispatcher.InvokeAsync(StartAsync);
    }

    private async void StartAsync()
    {
        try
        {
            var sessionStore = new SecureSessionStore();
            var api = new BoltApiClient(ServiceOrigin, sessionStore);
            var session = await sessionStore.LoadAsync();

            if (session is null || !await api.ValidateSessionAsync(session))
            {
                await sessionStore.ClearAsync();
                var signIn = new SignInWindow(api, sessionStore);
                if (signIn.ShowDialog() != true)
                {
                    Shutdown();
                    return;
                }

                session = await sessionStore.LoadAsync();
            }

            if (session is null)
            {
                Shutdown();
                return;
            }

            api.SetSession(session);
            var main = new MainWindow(
                api,
                new ProjectStore(session.Profile.Id),
                new UpdateService(App.DesktopVersion));
            MainWindow = main;
            ShutdownMode = ShutdownMode.OnMainWindowClose;
            main.Show();
        }
        catch (Exception error)
        {
            MessageBox.Show($"Desktop could not start safely.\n\n{error.Message}", "bolt.gives Desktop",
                MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown();
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try { _singleInstance?.ReleaseMutex(); } catch (ApplicationException) { }
        _singleInstance?.Dispose();
        base.OnExit(e);
    }

    private static void HandleDispatcherException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show($"Desktop recovered from an unexpected error. Your saved project remains intact.\n\n{e.Exception.Message}",
            "bolt.gives Desktop", MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }
}
