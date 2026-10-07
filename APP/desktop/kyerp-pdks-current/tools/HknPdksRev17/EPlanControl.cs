using System.Data;
using System.Globalization;
using System.Reflection;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class EPlanControl : UserControl
{
    readonly Form main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Value = DateTime.Today.Year, Width = 72 };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 104 };
    readonly DateTimePicker start = new() { Format = DateTimePickerFormat.Short, Width = 106 };
    readonly DateTimePicker end = new() { Format = DateTimePickerFormat.Short, Width = 106 };
    readonly NumericUpDown allTarget = new() { Minimum = 0, Maximum = 62, Value = 4, Width = 64 };
    readonly CheckBox weekends = new() { Text = "Hafta sonu dahil", AutoSize = true, Padding = new Padding(5, 7, 5, 0) };
    readonly DataGridView people = Grid();
    readonly DataGridView preview = Grid();
    readonly DataGridView history = Grid();
    readonly Label status = new() { Dock = DockStyle.Fill, Padding = new Padding(8), TextAlign = ContentAlignment.MiddleLeft };
    readonly Button apply = new() { Text = "E UYGULA", Width = 108, Height = 34, Enabled = false };
    readonly List<Control> lockControls = [];
    List<EPerson> loadedPeople = [];
    EPreview? frozen;
    bool changingPeriod;

    FirebirdDatabase? Database => main.GetType().GetField("db", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as FirebirdDatabase;
    TextBox? TnfBox => main.GetType().GetField("tnfPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as TextBox;

    sealed record EPerson(string Card, string Name, DateTime? Hire, DateTime? Exit, int CurrentE);
    sealed record ECandidate(int Sira, string Card, string Name, DateTime Day, bool Entry, string Time);
    sealed record EPlanItem(int Sira, string Card, string Name, DateTime Day, bool Entry, string Time)
    {
        internal string Side => Entry ? "Sabah / Giriş" : "Akşam / Çıkış";
    }
    sealed record EPreview(DateTime From, DateTime To, IReadOnlyList<EPlanItem> Items, IReadOnlyList<string> Warnings, bool CanApply);

    internal EPlanControl(Form owner)
    {
        main = owner;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9f);
        month.Items.AddRange(CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        month.SelectedIndex = DateTime.Today.Month - 1;
        Build();
        SetMonth();
    }

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoGenerateColumns = false,
        BackgroundColor = Color.White,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = false,
        RowTemplate = { Height = 27 },
        ColumnHeadersHeight = 34
    };

    void Build()
    {
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(new TabPage("E Toplu Dağıt") { BackColor = Color.White, Padding = new Padding(6), Controls = { BuildDistribution() } });
        tabs.TabPages.Add(new TabPage("E Geçmişi / İmza") { BackColor = Color.White, Padding = new Padding(6), Controls = { BuildHistory() } });
        tabs.SelectedIndexChanged += (_, _) => { if (tabs.SelectedIndex == 1) LoadHistory(); };
        Controls.Add(tabs);
    }

    Control BuildDistribution()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, ColumnCount = 1, Padding = new Padding(4) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(4, 6, 0, 0) };
        AddField(top, "Yıl", year);
        AddField(top, "Ay", month);
        AddField(top, "Başlangıç", start);
        AddField(top, "Bitiş", end);
        AddField(top, "Tümüne Adet", allTarget);
        top.Controls.Add(weekends);
        top.Controls.Add(Button("AKTİF PERSONELİ YÜKLE", LoadPeople, 170));
        top.Controls.Add(Button("ADETİ TÜMÜNE UYGULA", ApplyTargetToAll, 178));
        root.Controls.Add(top, 0, 0);

        ConfigurePeopleGrid();
        root.Controls.Add(PanelWithTitle("PERSONEL • Hedef E adedi toplam E sayısıdır; mevcut E otomatik düşülür.", people), 0, 1);

        ConfigurePreviewGrid();
        root.Controls.Add(PanelWithTitle("ÖNİZLEME • Seçilen gerçek kayıt aynen uygulanır; Uygula tekrar dağıtım yapmaz.", preview), 0, 2);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(4, 6, 4, 0) };
        apply.FlatStyle = FlatStyle.Flat;
        apply.Click += async (_, _) => await ApplyAsync();
        var previewButton = Button("ÖNİZLE", BuildPreview, 108);
        bottom.Controls.Add(apply);
        bottom.Controls.Add(previewButton);
        bottom.Controls.Add(status);
        root.Controls.Add(bottom, 0, 3);

        year.ValueChanged += (_, _) => SetMonth();
        month.SelectedIndexChanged += (_, _) => SetMonth();
        start.ValueChanged += (_, _) => { if (!changingPeriod) { InvalidatePreview("Tarih aralığı değişti; yeniden ÖNİZLE."); LoadPeople(); } };
        end.ValueChanged += (_, _) => { if (!changingPeriod) { InvalidatePreview("Tarih aralığı değişti; yeniden ÖNİZLE."); LoadPeople(); } };
        weekends.CheckedChanged += (_, _) => InvalidatePreview("Hafta sonu seçimi değişti; yeniden ÖNİZLE.");
        people.CellValueChanged += (_, e) => { if (e.RowIndex >= 0 && people.Columns[e.ColumnIndex].Name == "HEDEF") InvalidatePreview("Hedef E değişti; yeniden ÖNİZLE."); };
        people.CurrentCellDirtyStateChanged += (_, _) => { if (people.IsCurrentCellDirty) people.CommitEdit(DataGridViewDataErrorContexts.Commit); };
        VisibleChanged += (_, _) => { if (Visible) LoadPeople(); };
        return root;
    }

    Control BuildHistory()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(4) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(4, 6, 0, 0) };
        top.Controls.Add(new Label { Text = "Seçili tarih aralığındaki E kayıtları", AutoSize = true, Padding = new Padding(0, 7, 8, 0), Font = new Font(Font, FontStyle.Bold) });
        top.Controls.Add(Button("YENİLE", LoadHistory, 92));
        top.Controls.Add(Button("İMZA CSV", ExportHistoryCsv, 100));
        root.Controls.Add(top, 0, 0);

        history.ReadOnly = true;
        AddText(history, "KART", "Kart", 68);
        AddText(history, "AD", "Ad Soyad", 180);
        AddText(history, "TARIH", "Tarih", 92);
        AddText(history, "GUN", "Gün", 90);
        AddText(history, "TARAF", "Taraf", 105);
        AddText(history, "SAAT", "Saat", 70);
        AddText(history, "IMZA", "İmza", 220, true);
        root.Controls.Add(history, 0, 1);
        root.Controls.Add(new Label { Text = "E kaydı yalnız DB'dedir. TNF tarafının boş olması doğru ve uyumlu durumdur.", Dock = DockStyle.Fill, Padding = new Padding(8), ForeColor = Color.DimGray }, 0, 2);
        return root;
    }

    void ConfigurePeopleGrid()
    {
        people.ReadOnly = false;
        AddText(people, "KART", "Kart", 65, false, true);
        AddText(people, "AD", "Ad Soyad", 170, false, true);
        AddText(people, "MEVCUT", "Mevcut E", 75, false, true);
        AddText(people, "HEDEF", "Hedef E Adedi", 92);
        AddText(people, "OLUSACAK", "Oluşturulacak", 92, false, true);
        AddText(people, "SABAH", "Sabah", 62, false, true);
        AddText(people, "AKSAM", "Akşam", 62, false, true);
        AddText(people, "DURUM", "Durum", 170, true, true);
    }

    void ConfigurePreviewGrid()
    {
        preview.ReadOnly = true;
        AddText(preview, "KART", "Kart", 65);
        AddText(preview, "AD", "Ad Soyad", 170);
        AddText(preview, "TARIH", "Tarih", 90);
        AddText(preview, "TARAF", "Taraf", 100);
        AddText(preview, "SAAT", "Saat", 68);
        AddText(preview, "ISLEM", "İşlem", 180, true);
    }

    static void AddText(DataGridView grid, string name, string header, int width, bool fill = false, bool readOnly = false)
        => grid.Columns.Add(new DataGridViewTextBoxColumn
        {
            Name = name, HeaderText = header, Width = width, ReadOnly = readOnly,
            AutoSizeMode = fill ? DataGridViewAutoSizeColumnMode.Fill : DataGridViewAutoSizeColumnMode.None,
            SortMode = DataGridViewColumnSortMode.NotSortable
        });

    static Control PanelWithTitle(string title, Control child)
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        panel.Controls.Add(child);
        panel.Controls.Add(new Label { Text = title, Dock = DockStyle.Top, Height = 30, Padding = new Padding(6, 7, 0, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold), BackColor = Color.FromArgb(232, 239, 247) });
        return panel;
    }

    static Button Button(string text, Action action, int width)
    {
        var button = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat };
        button.Click += (_, _) => action();
        return button;
    }

    void AddField(FlowLayoutPanel panel, string title, Control control)
    {
        panel.Controls.Add(new Label { Text = title, AutoSize = true, Padding = new Padding(7, 7, 3, 0) });
        panel.Controls.Add(control);
        lockControls.Add(control);
    }

    void SetMonth()
    {
        if (month.SelectedIndex < 0) return;
        changingPeriod = true;
        try
        {
            start.Value = new DateTime((int)year.Value, month.SelectedIndex + 1, 1);
            end.Value = start.Value.AddMonths(1).AddDays(-1);
        }
        finally { changingPeriod = false; }
        InvalidatePreview("Dönem değişti; personeli yükleyip ÖNİZLE yapın.");
        if (IsHandleCreated) LoadPeople();
    }

    void LoadPeople()
    {
        var database = Database;
        if (database is null) { status.Text = "Önce DB'ye bağlanın."; return; }
        var from = start.Value.Date;
        var to = end.Value.Date;
        if (to < from) (from, to) = (to, from);
        try
        {
            var all = DbRecordService.ReadPeople(database, CancellationToken.None)
                .Where(p => (!p.Hire.HasValue || p.Hire.Value.Date <= to) && (!p.Exit.HasValue || p.Exit.Value.Date >= from))
                .OrderBy(p => p.Card).ToArray();
            var eCounts = ReadCurrentE(database, from, to);
            var oldTargets = people.Rows.Cast<DataGridViewRow>()
                .Where(r => !r.IsNewRow)
                .ToDictionary(r => Convert.ToString(r.Cells["KART"].Value) ?? "",
                    r => int.TryParse(Convert.ToString(r.Cells["HEDEF"].Value), out var n) ? n : 0,
                    StringComparer.OrdinalIgnoreCase);

            loadedPeople = all.Select(p => new EPerson(p.Card, p.Name, p.Hire, p.Exit, eCounts.GetValueOrDefault(p.Card))).ToList();
            people.Rows.Clear();
            foreach (var p in loadedPeople)
            {
                var target = oldTargets.TryGetValue(p.Card, out var old) ? Math.Max(old, p.CurrentE) : p.CurrentE;
                people.Rows.Add(p.Card, p.Name, p.CurrentE, target, Math.Max(0, target - p.CurrentE), 0, 0, "Hazır");
            }
            status.Text = $"{loadedPeople.Count} dönem personeli yüklendi. Hedef E adetlerini yazıp ÖNİZLE yapın.";
        }
        catch (Exception ex) { status.Text = "Personel yüklenemedi: " + ex.Message; }
    }

    Dictionary<string, int> ReadCurrentE(FirebirdDatabase database, DateTime from, DateTime to)
    {
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var table = database.Query(@"select PKNO,GTARIH,GTUR,CTARIH,CTUR from GIRCIK
            where (GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)",
            new FbParameter("@A", from), new FbParameter("@B", to.AddDays(1)));
        foreach (DataRow row in table.Rows)
        {
            var card = Convert.ToString(row["PKNO"])?.Trim() ?? "";
            var count = 0;
            if (row["GTARIH"] != DBNull.Value && string.Equals(Convert.ToString(row["GTUR"])?.Trim(), "E", StringComparison.OrdinalIgnoreCase)) count++;
            if (row["CTARIH"] != DBNull.Value && string.Equals(Convert.ToString(row["CTUR"])?.Trim(), "E", StringComparison.OrdinalIgnoreCase)) count++;
            if (count > 0) result[card] = result.GetValueOrDefault(card) + count;
        }
        return result;
    }

    void ApplyTargetToAll()
    {
        foreach (DataGridViewRow row in people.Rows)
        {
            if (row.IsNewRow) continue;
            var current = Convert.ToInt32(row.Cells["MEVCUT"].Value ?? 0);
            row.Cells["HEDEF"].Value = Math.Max(current, (int)allTarget.Value);
        }
        InvalidatePreview("Hedef E adetleri değişti; ÖNİZLE yapın.");
    }

    void BuildPreview()
    {
        var database = Database;
        if (database is null) { status.Text = "Önce DB'ye bağlanın."; return; }
        var from = start.Value.Date;
        var to = end.Value.Date;
        if (to < from) (from, to) = (to, from);
        try
        {
            var targets = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (DataGridViewRow row in people.Rows)
            {
                if (row.IsNewRow) continue;
                var card = Convert.ToString(row.Cells["KART"].Value)?.Trim() ?? "";
                var current = Convert.ToInt32(row.Cells["MEVCUT"].Value ?? 0);
                if (!int.TryParse(Convert.ToString(row.Cells["HEDEF"].Value), out var target)) target = current;
                if (target < current) throw new InvalidOperationException($"{card}: Hedef E mevcut E ({current}) değerinden küçük olamaz.");
                targets[card] = target;
            }

            var candidates = ReadCandidates(database, from, to);
            var plan = new List<EPlanItem>();
            var warnings = new List<string>();
            var canApply = true;

            foreach (DataGridViewRow row in people.Rows)
            {
                if (row.IsNewRow) continue;
                var card = Convert.ToString(row.Cells["KART"].Value)?.Trim() ?? "";
                var person = loadedPeople.FirstOrDefault(p => p.Card == card);
                if (person is null) continue;
                var current = person.CurrentE;
                var target = targets.GetValueOrDefault(card, current);
                var needed = Math.Max(0, target - current);
                var pool = candidates.Where(x => x.Card == card).ToList();
                var selected = SelectDistributed(pool, needed);
                var morning = selected.Count(x => x.Entry);
                var evening = selected.Count - morning;
                row.Cells["OLUSACAK"].Value = needed;
                row.Cells["SABAH"].Value = morning;
                row.Cells["AKSAM"].Value = evening;

                if (selected.Count < needed)
                {
                    var missing = needed - selected.Count;
                    row.Cells["DURUM"].Value = $"{selected.Count} uygun / {missing} eksik";
                    row.DefaultCellStyle.BackColor = Color.MistyRose;
                    warnings.Add($"{card} {person.Name}: {selected.Count} uygun / {missing} eksik.");
                    canApply = false;
                }
                else
                {
                    row.Cells["DURUM"].Value = needed == 0 ? "Mevcut hedefte" : "Önizleme hazır";
                    row.DefaultCellStyle.BackColor = Color.Honeydew;
                }
                plan.AddRange(selected);
            }

            frozen = new EPreview(from, to, plan, warnings, canApply);
            BindPreview(plan);
            apply.Enabled = canApply && plan.Count > 0;
            status.Text = warnings.Count == 0
                ? $"Önizleme hazır: {plan.Count} gerçek hareket E yapılacak. UYGULA aynı planı kullanacak."
                : "Uygulama kapalı • " + string.Join(" | ", warnings);
        }
        catch (Exception ex)
        {
            frozen = null; preview.Rows.Clear(); apply.Enabled = false; status.Text = "Önizleme hatası: " + ex.Message;
        }
    }

    List<ECandidate> ReadCandidates(FirebirdDatabase database, DateTime from, DateTime to)
    {
        var peopleMap = loadedPeople.ToDictionary(x => x.Card, StringComparer.OrdinalIgnoreCase);
        var table = database.Query(@"select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR
            from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO
            where (g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B)
            order by g.PKNO,g.SIRA",
            new FbParameter("@A", from), new FbParameter("@B", to.AddDays(1)));
        var result = new List<ECandidate>();
        foreach (DataRow row in table.Rows)
        {
            var card = Convert.ToString(row["PKNO"])?.Trim() ?? "";
            if (!peopleMap.TryGetValue(card, out var person)) continue;
            AddCandidate(result, row, person, true, from, to);
            AddCandidate(result, row, person, false, from, to);
        }
        return result;
    }

    void AddCandidate(List<ECandidate> target, DataRow row, EPerson person, bool entry, DateTime from, DateTime to)
    {
        var dp = entry ? "GTARIH" : "CTARIH";
        var sp = entry ? "GSAAT" : "CSAAT";
        var tp = entry ? "GTUR" : "CTUR";
        if (row[dp] == DBNull.Value || row[sp] == DBNull.Value) return;
        var day = Convert.ToDateTime(row[dp]).Date;
        if (day < from || day > to) return;
        if (!person.Hire.HasValue || person.Hire.Value.Date <= day)
        {
            if (person.Exit.HasValue && person.Exit.Value.Date < day) return;
        }
        else return;
        if (!weekends.Checked && day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) return;
        if (string.Equals(Convert.ToString(row[tp])?.Trim(), "E", StringComparison.OrdinalIgnoreCase)) return;
        var time = Convert.ToString(row[sp])?.Trim() ?? "";
        if (!TimeSpan.TryParse(time, out _)) return;
        target.Add(new(Convert.ToInt32(row["SIRA"]), person.Card, person.Name, day, entry, time));
    }

    static List<EPlanItem> SelectDistributed(List<ECandidate> candidates, int needed)
    {
        if (needed <= 0) return [];
        var groups = candidates.GroupBy(x => x.Day).Select(g => g.ToList()).ToList();
        Shuffle(groups);
        foreach (var group in groups) Shuffle(group);
        var selected = new List<ECandidate>();
        var morning = 0;
        var evening = 0;

        ECandidate? Pick(List<ECandidate> group)
        {
            var preferEntry = morning <= evening;
            var preferred = group.FirstOrDefault(x => x.Entry == preferEntry);
            return preferred ?? group.FirstOrDefault();
        }

        // Önce farklı günlere yay.
        foreach (var group in groups)
        {
            if (selected.Count >= needed) break;
            var candidate = Pick(group);
            if (candidate is null) continue;
            selected.Add(candidate);
            if (candidate.Entry) morning++; else evening++;
            group.Remove(candidate);
        }
        // Gerekirse aynı günün diğer tarafını kullan.
        var remaining = groups.SelectMany(x => x).ToList();
        while (selected.Count < needed && remaining.Count > 0)
        {
            var preferEntry = morning <= evening;
            var index = remaining.FindIndex(x => x.Entry == preferEntry);
            if (index < 0) index = 0;
            var candidate = remaining[index];
            remaining.RemoveAt(index);
            selected.Add(candidate);
            if (candidate.Entry) morning++; else evening++;
        }

        return selected
            .OrderBy(x => x.Day)
            .ThenBy(x => x.Entry ? 0 : 1)
            .ThenBy(x => x.Time)
            .Select(x => new EPlanItem(x.Sira, x.Card, x.Name, x.Day, x.Entry, x.Time))
            .ToList();
    }

    static void Shuffle<T>(IList<T> list)
    {
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = System.Security.Cryptography.RandomNumberGenerator.GetInt32(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }

    void BindPreview(IEnumerable<EPlanItem> plan)
    {
        preview.Rows.Clear();
        foreach (var item in plan.OrderBy(x => x.Day).ThenBy(x => x.Entry ? 0 : 1).ThenBy(x => x.Card))
            preview.Rows.Add(item.Card, item.Name, item.Day.ToString("dd.MM.yyyy"), item.Side, item.Time, "DB'de E • TNF'den çıkar");
    }

    async Task ApplyAsync()
    {
        var database = Database;
        var plan = frozen;
        if (database is null || plan is null || !plan.CanApply || plan.Items.Count == 0) return;
        var tnf = TnfBox?.Text?.Trim() ?? "";
        if (!File.Exists(tnf)) { MessageBox.Show(main, "Ana TNF dosyasını seçin.", "E İşlemleri"); return; }
        if (MessageBox.Show(main,
            $"{plan.Items.Count} gerçek kart tarafı E yapılacak.\nSaatler değişmeyecek. DB'de E kalacak; aynı taraf TNF'den çıkacak.\nÖnizleme yeniden dağıtılmayacak. Devam?",
            "E İşlemleri • Uygula", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        SetBusy(true);
        try
        {
            var backup = await MonthlyDbWriter.BackupAsync(database, CancellationToken.None);
            using var connection = database.OpenConnection();
            using var transaction = connection.BeginTransaction(new FbTransactionOptions
            {
                TransactionBehavior = FbTransactionBehavior.Write | FbTransactionBehavior.Consistency | FbTransactionBehavior.NoWait
            });
            StagedDbRecordTnf? staged = null;
            try
            {
                foreach (var item in plan.Items)
                {
                    var prefix = item.Entry ? "G" : "C";
                    using var cmd = FirebirdDatabase.CreateCommand(connection, transaction,
                        $"update GIRCIK set {prefix}TUR='E' where SIRA=@S and PKNO=@P and {prefix}TARIH=@D and {prefix}SAAT=@T and coalesce(upper(trim({prefix}TUR)),'')<>'E'",
                        new FbParameter("@S", item.Sira), new FbParameter("@P", item.Card),
                        new FbParameter("@D", item.Day), new FbParameter("@T", item.Time));
                    if (cmd.ExecuteNonQuery() != 1)
                        throw new InvalidOperationException($"{item.Card} {item.Day:dd.MM.yyyy} {item.Side}: kaynak kayıt değişti; tüm işlem geri alındı.");
                }

                var scope = plan.Items.Select(x => (x.Card, x.Day)).Distinct().ToArray();
                staged = DbRecordTnfCoordinator.Stage(connection, transaction, tnf, scope, CancellationToken.None);
                staged.Publish();
                try { transaction.Commit(); }
                catch { staged.Restore(); throw; }

                WriteAudit(plan.Items);
                MessageBox.Show(main,
                    $"{plan.Items.Count} E kaydı uygulandı.\nDB yedeği: {backup}\nTNF yalnız normal kayıtları içeriyor.",
                    "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch
            {
                try { transaction.Rollback(); } catch { }
                staged?.Restore();
                throw;
            }
            finally { staged?.Dispose(); }

            frozen = null; apply.Enabled = false; preview.Rows.Clear();
            LoadPeople(); LoadHistory();
        }
        catch (Exception ex)
        {
            MessageBox.Show(main, ex.Message, "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { SetBusy(false); }
    }

    void SetBusy(bool busy)
    {
        UseWaitCursor = busy;
        people.Enabled = preview.Enabled = !busy;
        foreach (var control in lockControls) control.Enabled = !busy;
        apply.Enabled = !busy && frozen is { CanApply: true } && frozen.Items.Count > 0;
    }

    void InvalidatePreview(string text)
    {
        frozen = null; apply.Enabled = false; preview.Rows.Clear(); status.Text = text;
        foreach (DataGridViewRow row in people.Rows)
            if (!row.IsNewRow) row.DefaultCellStyle.BackColor = Color.White;
    }

    void LoadHistory()
    {
        var database = Database;
        if (database is null) return;
        var from = start.Value.Date;
        var to = end.Value.Date;
        if (to < from) (from, to) = (to, from);
        try
        {
            var table = database.Query(@"select g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR
                from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO
                where (g.GTUR='E' or g.CTUR='E') and
                ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))
                order by coalesce(g.GTARIH,g.CTARIH),g.PKNO",
                new FbParameter("@A", from), new FbParameter("@B", to.AddDays(1)));
            history.Rows.Clear();
            foreach (DataRow row in table.Rows)
            {
                var card = Convert.ToString(row["PKNO"])?.Trim() ?? "";
                var name = $"{Convert.ToString(row["AD"])?.Trim()} {Convert.ToString(row["SOYAD"])?.Trim()}".Trim();
                if (row["GTARIH"] != DBNull.Value && string.Equals(Convert.ToString(row["GTUR"])?.Trim(), "E", StringComparison.OrdinalIgnoreCase))
                {
                    var day = Convert.ToDateTime(row["GTARIH"]).Date;
                    history.Rows.Add(card, name, day.ToString("dd.MM.yyyy"), day.ToString("dddd", CultureInfo.GetCultureInfo("tr-TR")), "Sabah / Giriş", Convert.ToString(row["GSAAT"])?.Trim(), "");
                }
                if (row["CTARIH"] != DBNull.Value && string.Equals(Convert.ToString(row["CTUR"])?.Trim(), "E", StringComparison.OrdinalIgnoreCase))
                {
                    var day = Convert.ToDateTime(row["CTARIH"]).Date;
                    history.Rows.Add(card, name, day.ToString("dd.MM.yyyy"), day.ToString("dddd", CultureInfo.GetCultureInfo("tr-TR")), "Akşam / Çıkış", Convert.ToString(row["CSAAT"])?.Trim(), "");
                }
            }
        }
        catch (Exception ex) { status.Text = "E geçmişi yüklenemedi: " + ex.Message; }
    }

    void ExportHistoryCsv()
    {
        LoadHistory();
        if (history.Rows.Count == 0) { MessageBox.Show(main, "İmza listesi için E kaydı yok."); return; }
        using var save = new SaveFileDialog
        {
            Filter = "CSV (*.csv)|*.csv",
            DefaultExt = "csv",
            FileName = $"E_IMZA_{year.Value:0000}_{month.SelectedIndex + 1:00}.csv"
        };
        if (save.ShowDialog(main) != DialogResult.OK) return;
        var lines = new List<string> { "Kart;Ad Soyad;Tarih;Gün;Taraf;Saat;İmza" };
        foreach (DataGridViewRow row in history.Rows)
        {
            if (row.IsNewRow) continue;
            lines.Add(string.Join(";", Enumerable.Range(0, 7).Select(i => (Convert.ToString(row.Cells[i].Value) ?? "").Replace(";", ","))));
        }
        File.WriteAllLines(save.FileName, lines, System.Text.Encoding.UTF8);
        MessageBox.Show(main, "E imza listesi kaydedildi:\n" + save.FileName);
    }

    void WriteAudit(IEnumerable<EPlanItem> plan)
    {
        try
        {
            var path = TnfBox?.Text?.Trim();
            var dir = !string.IsNullOrWhiteSpace(path) ? Path.Combine(Path.GetDirectoryName(path)!, "_YEDEK") : AppContext.BaseDirectory;
            Directory.CreateDirectory(dir);
            var log = Path.Combine(dir, "E_ISLEM_LOG.csv");
            if (!File.Exists(log)) File.WriteAllText(log, "Zaman;Kart;Ad Soyad;Tarih;Taraf;Saat;Kullanıcı" + Environment.NewLine);
            foreach (var item in plan)
                File.AppendAllText(log, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss};{item.Card};{item.Name};{item.Day:dd.MM.yyyy};{item.Side};{item.Time};{Environment.UserName}{Environment.NewLine}");
        }
        catch { }
    }
}
