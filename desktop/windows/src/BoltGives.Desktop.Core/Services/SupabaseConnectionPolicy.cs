using System.Text;
using System.Text.Json;

namespace BoltGives.Desktop.Services;

public static class SupabaseConnectionPolicy
{
    public static bool TryValidate(
        string projectUrl,
        string publishableKey,
        out string normalizedProjectUrl,
        out string error)
    {
        normalizedProjectUrl = "";
        error = "";
        var key = publishableKey.Trim();

        if (!Uri.TryCreate(projectUrl.Trim(), UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !uri.IsDefaultPort ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            uri.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
        {
            error = "Enter the HTTPS Project URL shown in the Supabase Connect dialog.";
            return false;
        }

        var labels = uri.DnsSafeHost.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (labels.Length != 3 ||
            !labels[1].Equals("supabase", StringComparison.OrdinalIgnoreCase) ||
            !labels[2].Equals("co", StringComparison.OrdinalIgnoreCase))
        {
            error = "The Project URL must use your project-ref.supabase.co host.";
            return false;
        }

        if (key.Length < 10)
        {
            error = "Enter the publishable or anon key shown in the Supabase Connect dialog.";
            return false;
        }

        if (key.StartsWith("sb_secret_", StringComparison.OrdinalIgnoreCase) || IsServiceRoleJwt(key))
        {
            error = "Use a Supabase publishable or anon key, not a secret or service-role key.";
            return false;
        }

        normalizedProjectUrl = $"https://{uri.DnsSafeHost.ToLowerInvariant()}";
        return true;
    }

    private static bool IsServiceRoleJwt(string key)
    {
        var parts = key.Split('.');
        if (parts.Length != 3) return false;

        try
        {
            var encoded = parts[1].Replace('-', '+').Replace('_', '/');
            encoded = encoded.PadRight(encoded.Length + ((4 - encoded.Length % 4) % 4), '=');
            using var payload = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
            return payload.RootElement.TryGetProperty("role", out var role) &&
                   role.GetString()?.Equals("service_role", StringComparison.OrdinalIgnoreCase) == true;
        }
        catch (FormatException)
        {
            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
