export function endFailedCommandResponse(response, message) {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  if (!response.headersSent) {
    response.writeHead(500, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
  }

  response.end(
    `${JSON.stringify({ type: 'stderr', chunk: `${message}\n` })}\n${JSON.stringify({ type: 'exit', exitCode: 1 })}\n`,
  );
}
