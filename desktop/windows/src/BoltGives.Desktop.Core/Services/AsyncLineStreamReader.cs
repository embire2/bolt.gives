using System.Text;

namespace BoltGives.Desktop.Services;

public static class AsyncLineStreamReader
{
    public static async Task ReadAsync(
        Stream stream,
        Action<string> onLine,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(onLine);

        using var reader = new StreamReader(stream, Encoding.UTF8, true, leaveOpen: true);
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null) return;
            onLine(line);
        }
    }
}
