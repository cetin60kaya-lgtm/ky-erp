using System.Net.Http.Headers;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed record PdksPhotoContent(byte[] Bytes, string ContentType);

public sealed class PdksPersonnelMediaClient : IDisposable
{
    private readonly HttpClient _http;

    public PdksPersonnelMediaClient(string baseAddress = "https://api.kyerp.net")
    {
        _http = new HttpClient { BaseAddress = new Uri(baseAddress.TrimEnd('/')), Timeout = TimeSpan.FromSeconds(30) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("KY-PDKS-Windows/1.4.0");
    }

    public async Task<PdksPhotoContent?> GetPhotoAsync(string token, string employeeId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(employeeId)) return null;
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(employeeId)}/photo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        await EnsureSuccessAsync(response, ct);
        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        return new PdksPhotoContent(bytes, response.Content.Headers.ContentType?.MediaType ?? "image/jpeg");
    }

    public async Task UploadPhotoAsync(string token, string employeeId, string filePath, CancellationToken ct = default)
    {
        if (!File.Exists(filePath)) throw new FileNotFoundException("Fotoğraf dosyası bulunamadı.", filePath);
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        var contentType = extension switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => throw new InvalidOperationException("JPG, PNG veya WEBP fotoğraf seçin."),
        };
        var info = new FileInfo(filePath);
        if (info.Length <= 0 || info.Length > 5 * 1024 * 1024) throw new InvalidOperationException("Fotoğraf en fazla 5 MB olabilir.");

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(employeeId)}/photo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var form = new MultipartFormDataContent();
        await using var stream = File.OpenRead(filePath);
        using var fileContent = new StreamContent(stream);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(fileContent, "file", Path.GetFileName(filePath));
        request.Content = form;
        using var response = await _http.SendAsync(request, ct);
        await EnsureSuccessAsync(response, ct);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var raw = await response.Content.ReadAsStringAsync(ct);
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
            var root = document.RootElement;
            if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object
                && error.TryGetProperty("message", out var message))
                throw new InvalidOperationException(message.GetString() ?? "Personel fotoğrafı işlemi başarısız.");
        }
        catch (JsonException) { }
        throw new InvalidOperationException($"Personel fotoğrafı işlemi başarısız (HTTP {(int)response.StatusCode}).");
    }

    public void Dispose() => _http.Dispose();
}
