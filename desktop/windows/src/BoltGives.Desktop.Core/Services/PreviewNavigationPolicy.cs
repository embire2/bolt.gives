namespace BoltGives.Desktop.Services;

public static class PreviewNavigationPolicy
{
    public static bool RequiresNavigation(Uri? currentSource, Uri target, bool coreInitialized) =>
        !coreInitialized || currentSource != target;

    public static Uri? Resolve(Uri serviceOrigin, string? baseUrl, string sessionId)
    {
        if (!Uri.TryCreate(serviceOrigin, baseUrl, out var uri) || !IsAllowed(uri, serviceOrigin, sessionId)) return null;
        return uri;
    }

    public static bool IsAllowed(Uri uri, Uri serviceOrigin, string sessionId)
    {
        if (!uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Equals(serviceOrigin.Host, StringComparison.OrdinalIgnoreCase) ||
            uri.Port != serviceOrigin.Port || string.IsNullOrWhiteSpace(sessionId))
        {
            return false;
        }

        var requiredPrefix = $"/runtime/preview/{Uri.EscapeDataString(sessionId)}/";
        return uri.AbsolutePath.StartsWith(requiredPrefix, StringComparison.OrdinalIgnoreCase);
    }
}
