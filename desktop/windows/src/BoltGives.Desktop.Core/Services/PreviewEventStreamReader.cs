using System.Text.Json;
using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public static class PreviewEventStreamReader
{
    public static async Task ReadAsync(
        Stream stream,
        Action<PreviewStatus> onStatus,
        JsonSerializerOptions jsonOptions,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(onStatus);
        ArgumentNullException.ThrowIfNull(jsonOptions);

        await AsyncLineStreamReader.ReadAsync(stream, line =>
        {
            if (!line.StartsWith("data:", StringComparison.Ordinal)) return;

            try
            {
                var status = JsonSerializer.Deserialize<PreviewStatus>(line[5..].TrimStart(), jsonOptions);
                if (status is not null) onStatus(status);
            }
            catch (JsonException)
            {
            }
        }, cancellationToken).ConfigureAwait(false);
    }
}
