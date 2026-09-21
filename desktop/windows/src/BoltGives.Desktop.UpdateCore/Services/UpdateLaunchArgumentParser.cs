using BoltGives.Desktop.Models;

namespace BoltGives.Desktop.Services;

public static class UpdateLaunchArgumentParser
{
    public static UpdateLaunchArguments Parse(IReadOnlyList<string> args)
    {
        ArgumentNullException.ThrowIfNull(args);
        var handoffPath = ReadValue(args, "--handoff");
        var handoffSha256 = ReadValue(args, "--handoff-sha256");

        if (!Path.IsPathFullyQualified(handoffPath))
            throw new InvalidOperationException("The privileged update handoff path must be absolute.");
        if (!UpdateSecurity.IsSha256(handoffSha256))
            throw new InvalidOperationException("The privileged update handoff hash is invalid.");

        return new UpdateLaunchArguments(Path.GetFullPath(handoffPath), handoffSha256);
    }

    private static string ReadValue(IReadOnlyList<string> args, string name)
    {
        for (var index = 0; index < args.Count - 1; index++)
        {
            if (args[index].Equals(name, StringComparison.OrdinalIgnoreCase)) return args[index + 1];
        }

        throw new InvalidOperationException($"Required updater argument {name} is missing.");
    }
}
