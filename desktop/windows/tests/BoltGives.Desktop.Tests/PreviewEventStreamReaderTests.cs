using System.Text;
using System.Text.Json;
using BoltGives.Desktop.Models;
using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class PreviewEventStreamReaderTests
{
    [Fact]
    public async Task ReadsPreviewEventsWithoutAnySynchronousNetworkRead()
    {
        await using var stream = new AsyncOnlyStream(
            "data: {\"sessionId\":\"desktop-e2e\",\"status\":\"ready\",\"healthy\":true}\n\n");
        PreviewStatus? received = null;

        await PreviewEventStreamReader.ReadAsync(
            stream,
            status => received = status,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
            CancellationToken.None);

        Assert.NotNull(received);
        Assert.Equal("desktop-e2e", received.SessionId);
        Assert.Equal("ready", received.Status);
        Assert.True(received.Healthy);
    }

    private sealed class AsyncOnlyStream(string content) : Stream
    {
        private readonly MemoryStream _inner = new(Encoding.UTF8.GetBytes(content));

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => _inner.Length;
        public override long Position { get => _inner.Position; set => throw new NotSupportedException(); }
        public override void Flush() => throw new NotSupportedException();
        public override int Read(byte[] buffer, int offset, int count) =>
            throw new InvalidOperationException("A synchronous read would freeze the WPF dispatcher.");
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            _inner.ReadAsync(buffer, cancellationToken);
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing) _inner.Dispose();
            base.Dispose(disposing);
        }

        public override async ValueTask DisposeAsync()
        {
            await _inner.DisposeAsync();
            GC.SuppressFinalize(this);
        }
    }
}
