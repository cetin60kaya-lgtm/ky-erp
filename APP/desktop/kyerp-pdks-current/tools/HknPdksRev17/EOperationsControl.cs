using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record EPlanItem(int Sira, string Card, string Name, DateTime Day, string Side, string Time);

internal sealed class EOperationsControl : UserControl
{
    readonly MainForm main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Value = DateTime.Today.Year, Width = 75 };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 105 };
    readonly DateTimePicker start = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly DateTimePicker end = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly NumericUpDown allCount = new() { Minimum = 0, Maximum = 31, Value = 4, Width = 65 };
    readonly CheckBox includeWeekends = new() { Text = "Hafta sonu dahil", AutoSize = true, Padding = new Padding(5, 7, 0, 0) };
    readonly DataGridView people = Grid();
    readonly DataGridView preview = Grid();
    readonly Label status = new() { Dock = DockStyle.Bottom, Height = 36, Padding = new Padding(8), Text = "Aktif personeller yükleniyor..." };
    readonly DataGridView history = Grid();
    readonly Label historyStatus = new() { Dock = DockStyle.Bottom, Height = 32, Padding = new Padding(8) };
    List<EPlanItem> plan = [];
    bool loading;

    internal EOperationsControl(MainForm owner)
    {
        main = owner;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9);
        month.Items.AddRange(CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        month.SelectedIndex = DateTime.Today.Month - 1;
        Build();
        SetMonth();
        year.ValueChanged += (_, _) => SetMonth();
        month.SelectedIndexChanged += (_, _) => SetMonth();
        start.ValueChanged += (_, _) => InvalidatePlan("Tarih değişti; önizlemeyi yenileyin.");
        end.ValueChanged += (_, _) => InvalidatePlan("Tarih değişti; önizlemeyi yenileyin.");
        includeWeekends.CheckedChanged += (_, _) => InvalidatePlan("Hafta sonu seçimi değişti; önizlemeyi yenileyin.");
        VisibleChanged += async (_, _) => { if (Visible) await LoadActiveAsync(); };
    }

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        BackgroundColor = Color.White,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
    };

    void Build()
    {
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(new TabPage("E Toplu Dağıt") { Controls = { BuildDistribution() } });
        tabs.TabPages.Add(new TabPage("E Geçmişi / İmza") { Controls = { BuildHistory() } });
        Controls.Add(tabs);
    }

    Control BuildDistribution()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(8) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 86));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, Padding = new Padding(4) };
        void Add(string title, Control control)
        {
            top.Controls.Add(new Label { Text = title, AutoSize = true, Padding = new Padding(5, 8, 2, 0) });
            top.Controls.Add(control);
        }
        Add("Yıl", year); Add("Ay", month); Add("Başlangıç", start); Add("Bitiş", end); Add("Tümüne Adet", allCount);
        top.Controls.Add(includeWeekends);
        top.Controls.Add(Button("AKTİF PERSONELİ YÜKLE", async () => await LoadActiveAsync(), 170));
        top.Controls.Add(Button("ADETİ TÜMÜNE UYGULA", ApplyCountToAll, 175));
        top.Controls.Add(Button("ÖNİZLE", PreviewPlan, 105));
        top.Controls.Add(Button("E UYGULA", ApplyPlan, 110, Color.Honeydew));
        top.Controls.Add(new Label
        {
            Text = "Hedef E Adedi = personelin bu tarih aralığında toplam kaç E kaydı olacağıdır. Mevcut E düşülür; kalan adet gerçek normal kart hareketlerinden rastgele sabah/akşam dağıtılır.",
            AutoSize = true, MaximumSize = new Size(920, 0), ForeColor = Color.DarkSlateGray, Padding = new Padding(6, 8, 0, 0)
        });

        ConfigurePeopleGrid();
        ConfigurePreviewGrid();
        var split = new SplitContainer { Dock = DockStyle.Fill, SplitterDistance = 690, FixedPanel = FixedPanel.None };
        split.Panel1.Controls.Add(people);
        split.Panel2.Controls.Add(preview);
        root.Controls.Add(top, 0, 0);
        root.Controls.Add(split, 0, 1);
        root.Controls.Add(status, 0, 2);
        return root;
    }

    Control BuildHistory()
    {
        var panel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(8) };
        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44 };
        top.Controls.Add(Button("LİSTELE", LoadHistory, 100));
        top.Controls.Add(Button("İMZA CSV", ExportHistory, 110));
        top.Controls.Add(new Label { Text = "Üstte seçili yıl / ay / tarih aralığı kullanılır.", AutoSize = true, Padding = new Padding(10, 8, 0, 0), ForeColor = Color.DimGray });
        panel.Controls.Add(history);
        panel.Controls.Add(historyStatus);
        panel.Controls.Add(top);
        return panel;
    }

    Button Button(string text, Action action, int width, Color? back = null)
    {
        var button = new Button { Text = text, Width = width, Height = 32 };
        if (back is Color color) button.BackColor = color;
        button.Click += (_, _) => action();
        return button;
    }

    Button Button(string text, Func<Task> action, int width)
    {
        var button = new Button { Text = text, Width = width, Height = 32 };
        button.Click += async (_, _) => await action();
        return button;
    }

    void ConfigurePeopleGrid()
    {
        people.ReadOnly = false;
        people.AutoGenerateColumns = false;
        people.Columns.Clear();
        void C(string name, string title, int width, bool readOnly = true)
        {
            people.Columns.Add(new DataGridViewTextBoxColumn { Name = name, HeaderText = title, DataPropertyName = name, ReadOnly = readOnly, MinimumWidth = width, FillWeight = width });
        }
        C("Kart", "Kart", 65);
        C("AdSoyad", "Ad Soyad", 170);
        C("MevcutE", "Mevcut E", 70);
        C("HedefE", "Hedef E Adedi", 90, false);
        C("Olusacak", "Oluşturulacak", 90);
        C("Sabah", "Sabah", 60);
        C("Aksam", "Akşam", 60);
        C("Durum", "Durum", 180);
        people.CellValueChanged += (_, e) => { if (!loading && e.RowIndex >= 0 && people.Columns[e.ColumnIndex].Name == "HedefE") InvalidatePlan("E adedi değişti; önizlemeyi yenileyin."); };
        people.CellValidating += (_, e) =>
        {
            if (people.Columns[e.ColumnIndex].Name != "HedefE") return;
            if (!int.TryParse(Convert.ToString(e.FormattedValue), out var value) || value < 0 || value > 31)
            {
                e.Cancel = true;
                MessageBox.Show(main, "Hedef E Adedi 0-31 arasında tam sayı olmalıdır.", "E İşlemleri");
            }
        };
    }

    void ConfigurePreviewGrid()
    {
        preview.ReadOnly = true;
        preview.AutoGenerateColumns = false;
        preview.Columns.Clear();
        foreach (var column in new[] { ("Kart","Kart"), ("AdSoyad","Ad Soyad"), ("Tarih","Tarih"), ("Taraf","Taraf"), ("Saat","Saat"), ("Islem","İşlem") })
            preview.Columns.Add(new DataGridViewTextBoxColumn { Name = column.Item1, HeaderText = column.Item2, DataPropertyName = column.Item1, ReadOnly = true });
    }

    void SetMonth()
    {
        var first = new DateTime((int)year.Value, month.SelectedIndex + 1, 1);
        start.Value = first;
        end.Value = first.AddMonths(1).AddDays(-1);
        InvalidatePlan("Dönem değişti; aktif personelleri yenileyin.");
        _ = LoadActiveAsync();
    }

    void InvalidatePlan(string message)
    {
        plan = [];
        preview.DataSource = null;
        if (!loading) status.Text = message;
    }

    async Task LoadActiveAsync()
    {
        if (loading) return;
        var db = main.Database;
        if (db is null) { status.Text = "Önce DB'ye bağlanın."; return; }
        if (start.Value.Date > end.Value.Date || start.Value.Year != end.Value.Year)
        {
            status.Text = "E dağıtımı aynı yıl içinde bir tarih aralığı olmalıdır.";
            return;
        }
        loading = true;
        try
        {
            var a = start.Value.Date;
            var b = end.Value.Date;
            var active = await Task.Run(() => PeriodPersonnelService.ReadActive(db, a, b));
            var existing = await Task.Run(() => ExistingECounts(db, a, b));
            var oldTargets = people.Rows.Cast<DataGridViewRow>()
                .Where(row => !row.IsNewRow)
                .ToDictionary(row => Convert.ToString(row.Cells["Kart"].Value) ?? "", row => Convert.ToInt32(row.Cells["HedefE"].Value ?? 0), StringComparer.OrdinalIgnoreCase);
            var table = NewPeopleTable();
            foreach (var person in active)
            {
                var current = existing.GetValueOrDefault(person.Card);
                var target = oldTargets.GetValueOrDefault(person.Card, current);
                table.Rows.Add(person.Card, person.Name, current, target, Math.Max(0, target-current), 0, 0, target < current ? "Mevcut E hedefi aşıyor" : "Hazır");
            }
            people.DataSource = table;
            plan = [];
            preview.DataSource = null;
            status.Text = $"{active.Length} aktif personel yüklendi. Her personelin yanına Hedef E Adedi yazın; sonra ÖNİZLE.";
        }
        catch (Exception ex) { status.Text = ex.Message; MessageBox.Show(main, ex.Message, "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { loading = false; }
    }

    static DataTable NewPeopleTable()
    {
        var t = new DataTable();
        t.Columns.Add("Kart", typeof(string));
        t.Columns.Add("AdSoyad", typeof(string));
        t.Columns.Add("MevcutE", typeof(int));
        t.Columns.Add("HedefE", typeof(int));
        t.Columns.Add("Olusacak", typeof(int));
        t.Columns.Add("Sabah", typeof(int));
        t.Columns.Add("Aksam", typeof(int));
        t.Columns.Add("Durum", typeof(string));
        return t;
    }

    static Dictionary<string,int> ExistingECounts(FirebirdDatabase db, DateTime start, DateTime end)
    {
        var result = new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
        var b = end.AddDays(1);
        foreach (var query in new[]
        {
            "select PKNO,count(*) ADET from GIRCIK where GTARIH>=@A and GTARIH<@B and upper(coalesce(GTUR,''))='E' group by PKNO",
            "select PKNO,count(*) ADET from GIRCIK where CTARIH>=@A and CTARIH<@B and upper(coalesce(CTUR,''))='E' group by PKNO"
        })
        {
            var table = db.Query(query, new FbParameter("@A", start), new FbParameter("@B", b));
            foreach (DataRow row in table.Rows)
            {
                var card = Convert.ToString(row["PKNO"]) ?? "";
                result[card] = result.GetValueOrDefault(card) + Convert.ToInt32(row["ADET"]);
            }
        }
        return result;
    }

    void ApplyCountToAll()
    {
        people.EndEdit();
        foreach (DataGridViewRow row in people.Rows)
            if (!row.IsNewRow) row.Cells["HedefE"].Value = (int)allCount.Value;
        InvalidatePlan("Tüm aktif personele hedef adet yazıldı; ÖNİZLE çalıştırın.");
    }

    void PreviewPlan()
    {
        try
        {
            people.EndEdit();
            var db = main.Database ?? throw new InvalidOperationException("DB bağlı değil.");
            var a = start.Value.Date;
            var b = end.Value.Date;
            if (a > b || a.Year != b.Year) throw new InvalidOperationException("Tarih aralığı aynı yıl içinde olmalıdır.");
            var active = PeriodPersonnelService.ReadActive(db, a, b).ToDictionary(p => p.Card, StringComparer.OrdinalIgnoreCase);
            var candidates = ReadCandidates(db, a, b, includeWeekends.Checked);
            var result = new List<EPlanItem>();
            foreach (DataGridViewRow row in people.Rows)
            {
                if (row.IsNewRow) continue;
                var card = Convert.ToString(row.Cells["Kart"].Value) ?? "";
                var target = Convert.ToInt32(row.Cells["HedefE"].Value ?? 0);
                var current = Convert.ToInt32(row.Cells["MevcutE"].Value ?? 0);
                var need = Math.Max(0, target-current);
                row.Cells["Olusacak"].Value = need;
                row.Cells["Sabah"].Value = 0;
                row.Cells["Aksam"].Value = 0;
                if (target < current) { row.Cells["Durum"].Value = $"Mevcut {current}; geri E kaldırılmaz"; continue; }
                if (need == 0) { row.Cells["Durum"].Value = "Hedef tamam"; continue; }
                if (!active.TryGetValue(card, out var person)) { row.Cells["Durum"].Value = "Aktif değil"; continue; }
                var pool = candidates.Where(x => x.Card == card && PeriodPersonnelService.ActiveOn(person, x.Day)).ToList();
                var chosen = ChooseSpread(pool, need);
                if (chosen.Count < need)
                {
                    row.Cells["Durum"].Value = $"{chosen.Count} uygun / {need} gerekli — uygulanamaz";
                    continue;
                }
                result.AddRange(chosen);
                var morning = chosen.Count(x => x.Side == "Giriş");
                row.Cells["Sabah"].Value = morning;
                row.Cells["Aksam"].Value = chosen.Count-morning;
                row.Cells["Durum"].Value = $"{chosen.Count} hazır";
            }
            var bad = people.Rows.Cast<DataGridViewRow>().Any(row => !row.IsNewRow && (Convert.ToString(row.Cells["Durum"].Value) ?? "").Contains("uygulanamaz"));
            plan = bad ? [] : result;
            preview.DataSource = PreviewTable(result);
            status.Text = bad
                ? "Yetersiz gerçek kart hareketi olan personel var. Hedef adedi düşürün veya tarih aralığını genişletin; hiçbir işlem uygulanmadı."
                : result.Count == 0 ? "Yeni E yapılacak kayıt yok." : $"{result.Count} E hareketi önizlendi. Sabah {result.Count(x=>x.Side=="Giriş")} / Akşam {result.Count(x=>x.Side=="Çıkış")}. UYGULA aynı planı değiştirmeden işleyecek.";
        }
        catch (Exception ex) { plan = []; MessageBox.Show(main, ex.Message, "E Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    static List<EPlanItem> ReadCandidates(FirebirdDatabase db, DateTime start, DateTime end, bool includeWeekends)
    {
        var table = db.Query(@"select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR
            from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO
            where ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))
              and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by g.PKNO,g.SIRA",
            new FbParameter("@A", start), new FbParameter("@B", end.AddDays(1)));
        var result = new List<EPlanItem>();
        foreach (DataRow row in table.Rows)
        {
            var card = Convert.ToString(row["PKNO"])?.Trim() ?? "";
            var name = ((Convert.ToString(row["AD"]) ?? "") + " " + (Convert.ToString(row["SOYAD"]) ?? "")).Trim();
            void Add(string dateField, string timeField, string typeField, string side)
            {
                if (row[dateField] == DBNull.Value || row[timeField] == DBNull.Value) return;
                var day = Convert.ToDateTime(row[dateField]).Date;
                if (!includeWeekends && day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) return;
                var time = Convert.ToString(row[timeField])?.Trim() ?? "";
                var type = Convert.ToString(row[typeField])?.Trim() ?? "";
                if (time.Length == 0 || type.Equals("E", StringComparison.OrdinalIgnoreCase)) return;
                result.Add(new(Convert.ToInt32(row["SIRA"]), card, name, day, side, time));
            }
            Add("GTARIH","GSAAT","GTUR","Giriş");
            Add("CTARIH","CSAAT","CTUR","Çıkış");
        }
        return result;
    }

    static List<EPlanItem> ChooseSpread(List<EPlanItem> pool, int count)
    {
        if (count <= 0 || pool.Count == 0) return [];
        static void Shuffle<T>(IList<T> list)
        {
            for (var i = list.Count-1; i > 0; i--)
            {
                var j = RandomNumberGenerator.GetInt32(i+1);
                (list[i],list[j]) = (list[j],list[i]);
            }
        }
        var byDay = pool.GroupBy(x => x.Day).Select(group => group.ToList()).ToList();
        Shuffle(byDay);
        foreach (var group in byDay) Shuffle(group);
        var chosen = new List<EPlanItem>();
        foreach (var group in byDay)
        {
            if (chosen.Count >= count) break;
            chosen.Add(group[0]);
        }
        if (chosen.Count < count)
        {
            var used = chosen.Select(x => (x.Sira,x.Side)).ToHashSet();
            var remaining = pool.Where(x => !used.Contains((x.Sira,x.Side))).ToList();
            Shuffle(remaining);
            chosen.AddRange(remaining.Take(count-chosen.Count));
        }
        return chosen;
    }

    static DataTable PreviewTable(IEnumerable<EPlanItem> items)
    {
        var t = new DataTable();
        foreach (var name in new[] { "Kart","AdSoyad","Tarih","Taraf","Saat","Islem" }) t.Columns.Add(name);
        foreach (var item in items.OrderBy(x=>x.Card).ThenBy(x=>x.Day).ThenBy(x=>x.Side))
            t.Rows.Add(item.Card,item.Name,item.Day.ToString("dd.MM.yyyy"),item.Side,item.Time,"E yapılacak");
        return t;
    }

    void ApplyPlan()
    {
        if (plan.Count == 0) { MessageBox.Show(main, "Önce geçerli bir E ÖNİZLEME oluşturun."); return; }
        var db = main.Database;
        if (db is null) return;
        if (MessageBox.Show(main, $"{plan.Count} gerçek kart hareketi E yapılacak. Önizlemedeki gün/sabah-akşam dağılımı değişmeden uygulanır. DB ve TNF yedeklenir. Devam?", "E Uygula", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var yearValue = start.Value.Year;
        var tnf = main.ResolveTnfPath(yearValue);
        string dbBackup;
        try { dbBackup = MonthlyDbWriter.BackupAsync(db, CancellationToken.None).GetAwaiter().GetResult(); }
        catch (Exception ex) { MessageBox.Show(main, ex.Message, "DB yedeği alınamadı", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

        using var connection = db.OpenConnection();
        using var tx = connection.BeginTransaction();
        StagedDbRecordTnf? staged = null;
        try
        {
            var scopes = new HashSet<(string Card,DateTime Day)>();
            foreach (var item in plan)
            {
                var fieldType = item.Side == "Giriş" ? "GTUR" : "CTUR";
                var fieldDate = item.Side == "Giriş" ? "GTARIH" : "CTARIH";
                var fieldTime = item.Side == "Giriş" ? "GSAAT" : "CSAAT";
                using var command = FirebirdDatabase.CreateCommand(connection, tx,
                    $"update GIRCIK set {fieldType}='E' where SIRA=@S and PKNO=@P and {fieldDate}=@D and {fieldTime}=@T and coalesce({fieldType},'')<>'E'",
                    new FbParameter("@S", item.Sira), new FbParameter("@P", item.Card), new FbParameter("@D", item.Day), new FbParameter("@T", item.Time));
                if (command.ExecuteNonQuery() != 1) throw new InvalidOperationException($"{item.Card} {item.Day:dd.MM.yyyy} {item.Side}: kayıt önizlemeden sonra değişti. Hiçbir E işlemi kaydedilmedi.");
                scopes.Add((item.Card,item.Day));
            }
            staged = DbRecordTnfCoordinator.Stage(connection, tx, tnf, scopes, CancellationToken.None);
            staged.Publish();
            try { tx.Commit(); } catch { staged.Restore(); throw; }
            var tnfBackup = staged.BackupPath;
            plan = [];
            preview.DataSource = null;
            MessageBox.Show(main, $"E işlemleri tamamlandı.\nDB yedeği: {dbBackup}\nTNF yedeği: {tnfBackup}", "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Information);
            _ = LoadActiveAsync();
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { }
            staged?.Restore();
            MessageBox.Show(main, ex.Message, "E işlemi geri alındı", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { staged?.Dispose(); }
    }

    void LoadHistory()
    {
        var db = main.Database;
        if (db is null) return;
        try
        {
            var a = start.Value.Date;
            var b = end.Value.Date.AddDays(1);
            var result = new DataTable();
            foreach (var name in new[] { "Kart","Ad Soyad","Tarih","Taraf","Saat","SIRA" }) result.Columns.Add(name);
            var table = db.Query(@"select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR
                from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO
                where (g.GTARIH>=@A and g.GTARIH<@B and upper(coalesce(g.GTUR,''))='E')
                   or (g.CTARIH>=@A and g.CTARIH<@B and upper(coalesce(g.CTUR,''))='E')
                order by g.PKNO,coalesce(g.GTARIH,g.CTARIH),g.SIRA",
                new FbParameter("@A", a), new FbParameter("@B", b));
            foreach (DataRow row in table.Rows)
            {
                var card = Convert.ToString(row["PKNO"]) ?? "";
                var name = ((Convert.ToString(row["AD"]) ?? "")+" "+(Convert.ToString(row["SOYAD"]) ?? "")).Trim();
                if (row["GTARIH"] != DBNull.Value && (Convert.ToString(row["GTUR"]) ?? "").Equals("E",StringComparison.OrdinalIgnoreCase))
                    result.Rows.Add(card,name,Convert.ToDateTime(row["GTARIH"]).ToString("dd.MM.yyyy"),"Giriş",row["GSAAT"],row["SIRA"]);
                if (row["CTARIH"] != DBNull.Value && (Convert.ToString(row["CTUR"]) ?? "").Equals("E",StringComparison.OrdinalIgnoreCase))
                    result.Rows.Add(card,name,Convert.ToDateTime(row["CTARIH"]).ToString("dd.MM.yyyy"),"Çıkış",row["CSAAT"],row["SIRA"]);
            }
            history.DataSource = result;
            historyStatus.Text = $"{result.Rows.Count} E hareketi listelendi.";
        }
        catch (Exception ex) { MessageBox.Show(main, ex.Message, "E Geçmişi", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    void ExportHistory()
    {
        if (history.DataSource is not DataTable table || table.Rows.Count == 0) { MessageBox.Show(main, "Önce E geçmişini listeleyin."); return; }
        using var dialog = new SaveFileDialog { Filter = "CSV (*.csv)|*.csv", FileName = $"E_IMZA_{year.Value:0}_{month.SelectedIndex+1:00}.csv" };
        if (dialog.ShowDialog(main) != DialogResult.OK) return;
        using var writer = new StreamWriter(dialog.FileName, false, new UTF8Encoding(true));
        writer.WriteLine("Kart No;Ad Soyad;Tarih;Taraf;Saat;İmza");
        foreach (DataRow row in table.Rows)
            writer.WriteLine($"{row["Kart"]};{row["Ad Soyad"]};{row["Tarih"]};{row["Taraf"]};{row["Saat"]};");
        historyStatus.Text = "CSV kaydedildi: " + dialog.FileName;
    }
}
