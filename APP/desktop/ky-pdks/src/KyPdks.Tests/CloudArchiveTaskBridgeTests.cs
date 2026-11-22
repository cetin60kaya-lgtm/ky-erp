using System.Text.Json;
using KyPdks.Desktop;
using Xunit;

namespace KyPdks.Tests;

public sealed class CloudArchiveTaskBridgeTests
{
    [Fact]
    public void Utf8ReplyKeepsTurkishFolderName()
    {
        const string id = "11111111111141118111111111111111";
        var reply = JsonSerializer.Serialize(new {
            id,
            payload = new { ok = true, root = @"D:\Googledrive\Drive'ım\Hakan Emp",
                evidenceCount = 6 }
        });

        var selected = CloudArchiveTaskBridge.GetMatchingPayload(reply, id);
        Assert.NotNull(selected);
        using var parsed = JsonDocument.Parse(selected);
        Assert.Equal(@"D:\Googledrive\Drive'ım\Hakan Emp",
            parsed.RootElement.GetProperty("root").GetString());
    }

    [Fact]
    public void OldReplyCannotConfirmAnotherRequest()
    {
        var reply = JsonSerializer.Serialize(new {
            id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            payload = new { ok = true, root = @"D:\Googledrive\Other" }
        });
        Assert.Null(CloudArchiveTaskBridge.GetMatchingPayload(reply,
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    }

    [Fact]
    public void BrokerErrorsAreNotSuccessfulResponses()
    {
        var reply = JsonSerializer.Serialize(new {
            id = "11111111111141118111111111111111",
            error = "Windows kullanıcı görevi erişilemez"
        });
        Assert.Throws<IOException>(() => CloudArchiveTaskBridge.GetMatchingPayload(
            reply, "11111111111141118111111111111111"));
    }
}
