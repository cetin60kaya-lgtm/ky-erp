using System.Data;
using FirebirdSql.Data.FirebirdClient;

namespace HKN.Personel.Native;

public sealed partial class LiveAttendanceForm
{
    readonly TextBox assistantQuery = new()
    {
        PlaceholderText = "PDKS Asistanına sor... Örn: Bu hafta kimler kart basmadı?",
        Dock = DockStyle.Fill,
        Font = new Font("Segoe UI", 10f)
    };
    readonly Button assistantAsk = new()
    {
        Text = "Analiz Et",
        Width = 110,
        Height = 34
    };
    readonly Button assistantAction = new()
    {
        Text = "İşlem Al",
        Width = 105,
        Height = 34
    };
    readonly Label assistantSummary = new()
    {
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
    };
    readonly FlowLayoutPanel assistantChips = new()
    {
        Dock = DockStyle.Fill,
        WrapContents = false,
        AutoScroll = true,
        Padding = new Padding(0, 3, 0, 0)
    };
    readonly DataGridView assistantGrid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = false,
        RowHeadersVisible = false,
        BackgroundColor = Color.White
    };

    Control BuildAssistantPanel()
    {
        var shell = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(247, 250, 255),
            Padding = new Padding(10, 8, 10, 8),
            Margin = new Padding(0, 3, 0, 6),
            BorderStyle = BorderStyle.FixedSingle
        };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            BackColor = Color.Transparent
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var askRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4 };
        askRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
        askRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        askRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 118));
        askRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 113));
        askRow.Controls.Add(new Label
        {
            Text = "✦ PDKS Asistan",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(36, 107, 230)
        }, 0, 0);
        askRow.Controls.Add(assistantQuery, 1, 0);
        askRow.Controls.Add(assistantAsk, 2, 0);
        askRow.Controls.Add(assistantAction, 3, 0);
        layout.Controls.Add(askRow, 0, 0);
        assistantChips.Controls.Add(Chip("Bugün sabah kart basmayanlar"));
        assistantChips.Controls.Add(Chip("Şu an içeride olanlar"));
        assistantChips.Controls.Add(Chip("Bugün çıkış kartı eksik"));
        assistantChips.Controls.Add(Chip("Bu hafta kimler kart basmadı?"));
        assistantChips.Controls.Add(Chip("Bu hafta geç gelenler"));
        layout.Controls.Add(assistantChips, 0, 1);

        assistantSummary.Text = "Hazır • Canlı veriyi sorabilir veya hızlı sorgulardan birini seçebilirsin.";
        layout.Controls.Add(assistantSummary, 0, 2);
        shell.Controls.Add(layout);

        assistantAsk.Click += (_, _) => RunAssistantQuery();
        assistantAction.Click += (_, _) => OpenSelectedAction();
        assistantQuery.KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            RunAssistantQuery();
        };
        assistantGrid.CellDoubleClick += (_, _) => FocusSelectedResult();
        return shell;
    }

    Button Chip(string text)
    {
        var b = new Button
        {
            Text = text,
            AutoSize = true,
            Height = 30,
            Margin = new Padding(0, 0, 7, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(45, 65, 90),
            Cursor = Cursors.Hand
        };
        b.FlatAppearance.BorderColor = Color.FromArgb(214, 225, 240);
        b.Click += (_, _) =>
        {
            assistantQuery.Text = text;
            RunAssistantQuery();
        };
        return b;
    }

    void RunAssistantQuery()
    {
        try
        {
            var query = (assistantQuery.Text ?? string.Empty).Trim();
            if (query.Length == 0) query = "Bugün sabah kart basmayanlar";
            var normalized = query.ToLower(new System.Globalization.CultureInfo("tr-TR"));
            var selected = date.Value.Date;
            var start = selected;
            var end = selected;

            if (normalized.Contains("hafta"))
            {
                var delta = ((int)selected.DayOfWeek + 6) % 7;
                start = selected.AddDays(-delta);
                end = selected;
            }

            var rows = new List<AssistantRow>();
            for (var day = start; day <= end; day = day.AddDays(1))
                rows.AddRange(FilterAssistantRows(day, normalized));

            BindAssistant(rows, query, start, end);
        }
        catch (Exception ex)
        {
            assistantSummary.Text = "Asistan sorgusu çalıştırılamadı: " + ex.Message;
            assistantSummary.ForeColor = Color.FromArgb(185, 56, 48);
        }
    }
    IEnumerable<AssistantRow> FilterAssistantRows(DateTime day, string query)
    {
        var source = AssistantDailyRows(day);
        IEnumerable<DailyRow> filtered;

        if (query.Contains("geç"))
            filtered = source.Where(x => x.Warning.Contains("Geç giriş", StringComparison.OrdinalIgnoreCase));
        else if (query.Contains("izin"))
            filtered = source.Where(x => x.FullLeave);
        else if (query.Contains("içeride"))
            filtered = source.Where(x => x.Status == "İçeride");
        else if (query.Contains("çıkış"))
            filtered = source.Where(x => x.Status is "Çıkış Kartı Yok" or "İçeride");
        else if (query.Contains("tamam"))
            filtered = source.Where(x => x.HasEntry && x.HasExit);
        else
            filtered = source.Where(x => x.Status == "Kart Basmadı");

        return filtered.Select(x => new AssistantRow(
            day,
            x.Code,
            x.Name,
            x.Group,
            x.Entry,
            x.Exit,
            x.Status,
            x.Warning));
    }

    List<DailyRow> AssistantDailyRows(DateTime day)
    {
        var next = day.AddDays(1);
        var employees = db.Query(@"select k.PKNO,k.AD,k.SOYAD,k.GRUP,coalesce(g.AD,'') GRUP_AD
            from KIMLIK k left join GRUP g on g.KOD=k.GRUP
            where (k.IGTARIH is null or k.IGTARIH<@B) and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by k.PKNO", new FbParameter("@A", day), new FbParameter("@B", next));
        var moves = db.Query(@"select PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA from GIRCIK
            where GTARIH>=@A and GTARIH<@B order by PKNO,GTARIH,GDAKIKA",
            new FbParameter("@A", day), new FbParameter("@B", next));
        var leaves = db.Query(@"select PKNO,TIP,MAZERET,SUREDAKIKA,BASSAAT,BITSAAT from OZELIZIN
            where TARIH>=@A and TARIH<@B order by PKNO",
            new FbParameter("@A", day), new FbParameter("@B", next));
        var plans = db.Query(@"select p.GKOD,p.MTKOD,b.AD PLAN_AD,b.IGIRISS,b.GGTOL,b.DCIKISS,b.ECTOL,b.DEVAMSIZLIK
            from PLANA p left join PUANBILGI b on b.KOD=p.MTKOD where p.TARIH>=@A and p.TARIH<@B",
            new FbParameter("@A", day), new FbParameter("@B", next));
        var fallback = db.Query("select KOD,AD,IGIRISS,GGTOL,DCIKISS,ECTOL,DEVAMSIZLIK from PUANBILGI");

        var moveMap = moves.AsEnumerable().GroupBy(r => S(r, "PKNO")).ToDictionary(g => g.Key, g => Movement(g));
        var leaveMap = leaves.AsEnumerable().GroupBy(r => S(r, "PKNO")).ToDictionary(g => g.Key, g => LeaveInfo(g));
        var planMap = plans.AsEnumerable().GroupBy(r => I(r, "GKOD")).ToDictionary(g => g.Key, g => ReadSchedule(g.First()));
        var fallbackMap = fallback.AsEnumerable().ToDictionary(r => I(r, "KOD"), ReadSchedule);
        var rows = new List<DailyRow>();

        foreach (DataRow employee in employees.Rows)
        {
            var code = S(employee, "PKNO");
            var group = employee["GRUP"] == DBNull.Value ? -1 : I(employee, "GRUP");
            var groupName = S(employee, "GRUP_AD");
            var schedule = planMap.GetValueOrDefault(group) ?? FallbackSchedule(groupName, day, fallbackMap);
            moveMap.TryGetValue(code, out var movement);
            leaveMap.TryGetValue(code, out var leaveInfo);
            var fullLeave = leaveInfo.Minutes > 0 && leaveInfo.Minutes >= Math.Max(420, schedule.WorkMinutes);
            var expected = schedule.WorkMinutes > 0 && !fullLeave;
            var status = Status(day, schedule, expected, fullLeave, movement.Entry, movement.Exit);
            var warning = Warning(schedule, movement.Entry, movement.Exit, status);
            rows.Add(new DailyRow(code, $"{S(employee, "AD")} {S(employee, "SOYAD")}".Trim(), groupName,
                schedule.Name, movement.Entry?.ToString("HH:mm") ?? "", movement.Exit?.ToString("HH:mm") ?? "",
                status, warning, expected, fullLeave, movement.Entry.HasValue, movement.Exit.HasValue));
        }
        return rows;
    }
    void BindAssistant(List<AssistantRow> rows, string query, DateTime start, DateTime end)
    {
        var table = new DataTable();
        foreach (var name in new[] { "Tarih", "Kart No", "Ad Soyad", "Grup", "Giriş", "Çıkış", "Durum", "Uyarı" })
            table.Columns.Add(name);
        foreach (var r in rows.OrderByDescending(x => x.Day).ThenBy(x => x.Name))
            table.Rows.Add(r.Day.ToString("dd.MM.yyyy"), r.Code, r.Name, r.Group, r.Entry, r.Exit, r.Status, r.Warning);

        assistantGrid.DataSource = table;
        if (!tabs.TabPages.ContainsKey("PDKS Asistan"))
        {
            var page = new TabPage("PDKS Asistan") { Name = "PDKS Asistan" };
            page.Controls.Add(assistantGrid);
            tabs.TabPages.Insert(0, page);
        }
        tabs.SelectedTab = tabs.TabPages["PDKS Asistan"];

        var period = start == end ? start.ToString("dd MMMM yyyy") : $"{start:dd.MM} - {end:dd.MM.yyyy}";
        assistantSummary.Text = rows.Count == 0
            ? $"✓ {query} • {period}: sorun bulunmadı."
            : $"⚠ {query} • {period}: {rows.Count} kayıt bulundu. Satıra çift tıklayarak o güne geçebilirsin.";
        assistantSummary.ForeColor = rows.Count == 0 ? Color.FromArgb(24, 145, 84) : Color.FromArgb(198, 108, 24);
    }

    void FocusSelectedResult()
    {
        if (assistantGrid.CurrentRow?.Cells["Tarih"].Value is null) return;
        if (!DateTime.TryParse(Convert.ToString(assistantGrid.CurrentRow.Cells["Tarih"].Value), out var target)) return;
        date.Value = target;
        _ = SyncAndLoadAsync(false);
    }

    void OpenSelectedAction()
    {
        if (assistantGrid.CurrentRow is null)
        {
            MessageBox.Show("Önce işlem yapılacak personeli seçin.", "PDKS Asistan", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var code = Convert.ToString(assistantGrid.CurrentRow.Cells["Kart No"].Value) ?? "";
        var name = Convert.ToString(assistantGrid.CurrentRow.Cells["Ad Soyad"].Value) ?? "";
        var status = Convert.ToString(assistantGrid.CurrentRow.Cells["Durum"].Value) ?? "";
        var when = Convert.ToString(assistantGrid.CurrentRow.Cells["Tarih"].Value) ?? "";
        Clipboard.SetText($"{code} - {name} - {when} - {status}");
        MessageBox.Show($"{name}\nKart: {code}\nTarih: {when}\nDurum: {status}\n\nPersonel bilgisi panoya kopyalandı. Giriş/Çıkış ekranından düzeltme veya kontrol yapabilirsiniz.",
            "PDKS Asistan • İşlem Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    sealed record AssistantRow(DateTime Day, string Code, string Name, string Group, string Entry, string Exit, string Status, string Warning);
}
