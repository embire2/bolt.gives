namespace BoltGives.Desktop.Services;

public sealed record PendingPrompt(string ProjectId, string Text);

public sealed class PromptQueue
{
    private readonly Queue<PendingPrompt> _items = new();
    public int Count => _items.Count;

    public bool TryEnqueue(string projectId, string? text)
    {
        var prompt = text?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(projectId) || prompt.Length == 0 || _items.Count >= 20) return false;
        _items.Enqueue(new(projectId, prompt));
        return true;
    }

    public bool TryDequeue(out PendingPrompt? prompt)
    {
        if (_items.Count == 0)
        {
            prompt = null;
            return false;
        }

        prompt = _items.Dequeue();
        return true;
    }
}
