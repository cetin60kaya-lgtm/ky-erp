namespace KYERP.PDKS.Core.Terminal;

public interface ITerminalDeviceAdapter
{
    string AdapterType { get; }
    Task<IReadOnlyList<ProfiledTerminalRecord>> ReadAsync(TerminalTransferProfile profile, CancellationToken cancellationToken = default);
}

public sealed class FileTerminalDeviceAdapter : ITerminalDeviceAdapter
{
    public string AdapterType => "FILE";

    public async Task<IReadOnlyList<ProfiledTerminalRecord>> ReadAsync(TerminalTransferProfile profile, CancellationToken cancellationToken = default)
    {
        profile.Validate();
        if (string.IsNullOrWhiteSpace(profile.TransferFilePath)) throw new InvalidOperationException("Aktarım dosyası yolu tanımlı değil.");
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var encoding = System.Text.Encoding.GetEncoding(profile.Encoding);
        var lines = await File.ReadAllLinesAsync(profile.TransferFilePath, encoding, cancellationToken);

        // Hedef PDKS terminal akışında timerecords.txt dosyasının 0 KB olması normaldir.
        // Cihaz yeni kayıt yazdığında aktarılır; başarılı aktarım sonunda dosya tekrar boş bırakılır.
        if (lines.Length == 0) return Array.Empty<ProfiledTerminalRecord>();

        if (profile.FormatType == TerminalFormatType.Tnf) _ = TnfFile.Parse(lines);
        var records = new List<ProfiledTerminalRecord>();
        var fingerprints = new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) throw new FormatException("Terminal aktarım dosyası boş satır içeremez.");
            var record = ProfiledTerminalParser.Parse(profile, line);
            if (!fingerprints.Add(record.SourceFingerprint)) throw new FormatException("Terminal aktarım dosyasında duplicate kayıt bulundu.");
            records.Add(record);
        }
        return records;
    }
}
