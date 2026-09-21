using System.Text;
using BoltGives.Desktop.Services;
using Xunit;

namespace BoltGives.Desktop.Tests;

public sealed class SupabaseConnectionPolicyTests
{
    [Fact]
    public void AcceptsOwnedSupabaseProjectAndPublishableKey()
    {
        var valid = SupabaseConnectionPolicy.TryValidate(
            "https://Calendar-Ref.supabase.co/",
            "sb_publishable_fixture-value",
            out var normalized,
            out var error);

        Assert.True(valid, error);
        Assert.Equal("https://calendar-ref.supabase.co", normalized);
    }

    [Theory]
    [InlineData("http://calendar.supabase.co")]
    [InlineData("https://calendar.supabase.co/rest/v1")]
    [InlineData("https://calendar.example.com")]
    [InlineData("https://supabase.co")]
    public void RejectsNonProjectOrigins(string projectUrl)
    {
        Assert.False(SupabaseConnectionPolicy.TryValidate(
            projectUrl,
            "sb_publishable_fixture-value",
            out _,
            out _));
    }

    [Fact]
    public void RejectsSecretAndServiceRoleKeys()
    {
        Assert.False(SupabaseConnectionPolicy.TryValidate(
            "https://calendar.supabase.co",
            "sb_secret_fixture-value",
            out _,
            out _));

        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes("{\"role\":\"service_role\"}"))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        Assert.False(SupabaseConnectionPolicy.TryValidate(
            "https://calendar.supabase.co",
            $"header.{payload}.signature",
            out _,
            out _));
    }
}
