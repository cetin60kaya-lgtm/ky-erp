using System.Data;
using FirebirdSql.Data.FirebirdClient;

namespace HKN.Personel.Native;

public sealed partial class LiveAttendanceForm
{
    readonly Label previewName = new()
    {
        Dock = DockStyle.Top,
        Height = 44,
        Font = new Font("Segoe UI", 13f, FontStyle.Bold),
        ForeColor = Color.FromArgb(27, 44, 68),
        TextAlign = ContentAlignment.MiddleLeft
    };

    readonly Label previewInfo = new()
    {
        Dock = DockStyle.Fill,
        Font = new Font("Segoe UI", 9f),
        ForeColor = Color.FromArgb(71, 86, 108),
        Padding = new Padding(0, 6, 0, 0)
    };

    readonly Button previewEntryExit = PreviewButton("Giriş / Çıkışa Git", true);
    readonly Button previewPerson = PreviewButton("Personel Kartını Aç", false);
    string previewCard = "";

    static Button PreviewButton(string text, bool primary)
    {
        var button = new Button
        {
            Text = text,
            Width = 148,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(31, 92, 180),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderColor = primary
            ? Color.FromArgb(36, 107, 230)
            : Color.FromArgb(196, 214, 240);
        return button;
    }

    Control BuildTrackingWorkspace()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterWidth = 7,
            SplitterDistance = 820,
            BackColor = Color.FromArgb(230, 236, 244)
        };
        split.Panel1.Padding = new Padding(0, 0, 4, 0);
        split.Panel2.Padding = new Padding(8, 0, 0, 0);
        split.Panel1.Controls.Add(tabs);
        split.Panel2.Controls.Add(BuildPersonPreview());
        return split;
    }
    Control BuildPersonPreview()
    {
        var shell = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(16, 14, 16, 14)
        };
        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 48,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 6, 0, 0),
            BackColor = Color.Transparent
        };
        actions.Controls.Add(previewEntryExit);
        actions.Controls.Add(previewPerson);

        shell.Controls.Add(previewInfo);
        shell.Controls.Add(previewName);
        shell.Controls.Add(actions);
        previewName.Text = "Personel Önizleme";
        previewInfo.Text = "Listeden bir personel seçtiğinizde son 30 günlük kart ve puantaj özeti burada görünür.";
        previewEntryExit.Enabled = false;
        previewPerson.Enabled = false;

        previewEntryExit.Click += (_, _) =>
        {
            if (openEntryExit is not null && previewCard.Length > 0)
                openEntryExit(previewCard, date.Value.Date);
        };
        previewPerson.Click += (_, _) =>
        {
            if (openPerson is not null && previewCard.Length > 0)
                openPerson(previewCard);
        };
        return shell;
    }

    void UpdatePersonPreview(DataGridView grid)
    {
        if (grid.CurrentRow is null || !grid.Columns.Contains("Kart No")) return;
        var code = Convert.ToString(grid.CurrentRow.Cells["Kart No"].Value)?.Trim() ?? "";
        if (code.Length == 0) return;
        LoadPersonPreview(code);
    }

    void LoadPersonPreview(string code)
    {
        try
        {
            var person = db.Query(@"select first 1 k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,
                coalesce(g.AD,'') GRUP_AD,coalesce(b.AD,'') BOLUM_AD,coalesce(r.AD,'') GOREV_AD
                from KIMLIK k left join GRUP g on g.KOD=k.GRUP
                left join BOLUM b on b.KOD=k.BOLUM left join GOREV r on r.KOD=k.GOREV
                where k.PKNO=@P", new FbParameter("@P", code));
            if (person.Rows.Count == 0) return;
            var row = person.Rows[0];
            var start = DateTime.Today.AddDays(-29);
            var stats = db.Query(@"select count(*) KAYIT,
                coalesce(sum(DEVAMSIZLIKG),0) DEVAMSIZ,
                coalesce(sum(GECG),0) GEC,
                coalesce(sum(ERKENG),0) ERKEN,
                coalesce(sum(EKSIKG),0) EKSIK
                from PUANTAJ where PKNO=@P and TARIH>=@A and TARIH<@B",
                new FbParameter("@P", code),
                new FbParameter("@A", start),
                new FbParameter("@B", DateTime.Today.AddDays(1)));
            var st = stats.Rows[0];
            previewCard = code;
            previewName.Text = $"{row["AD"]} {row["SOYAD"]}".Trim();
            var hire = row["IGTARIH"] == DBNull.Value
                ? "-"
                : Convert.ToDateTime(row["IGTARIH"]).ToString("dd.MM.yyyy");
            previewInfo.Text = $"Kart No: {code}\n" +
                $"Grup: {row["GRUP_AD"]}\nBölüm: {row["BOLUM_AD"]}\nGörev: {row["GOREV_AD"]}\n" +
                $"İşe giriş: {hire}\n\nSON 30 GÜN\n" +
                $"Puantaj günü: {st["KAYIT"]}\nDevamsızlık: {st["DEVAMSIZ"]}\n" +
                $"Geç kalma: {st["GEC"]}\nErken çıkış: {st["ERKEN"]}\nEksik süre: {st["EKSIK"]}";
            previewEntryExit.Enabled = true;
            previewPerson.Enabled = true;
        }
        catch (Exception ex)
        {
            previewInfo.Text = "Personel özeti yüklenemedi: " + ex.Message;
            previewEntryExit.Enabled = false;
            previewPerson.Enabled = false;
        }
    }
}
