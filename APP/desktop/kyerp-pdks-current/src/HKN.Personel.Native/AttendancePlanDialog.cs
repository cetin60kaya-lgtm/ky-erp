using System.Data;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed class AttendancePlanDialog : Form
{
    readonly FirebirdDatabase db;
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 112 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy", Width = 112 };
    readonly ComboBox mode = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 220 };
    readonly DataGridView people = new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoGenerateColumns = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        BackgroundColor = PdksAppearance.Current.Surface,
        BorderStyle = BorderStyle.None
    };
    readonly DataGridView preview = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoGenerateColumns = true,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        BackgroundColor = PdksAppearance.Current.Surface,
        BorderStyle = BorderStyle.None
    };
    readonly Label info = new() { Dock = DockStyle.Fill, AutoEllipsis = true, TextAlign = ContentAlignment.MiddleLeft };
    readonly Button apply;
    readonly System.Windows.Forms.Timer personRefreshDebounce = new() { Interval = 220 };
    readonly HashSet<string> initialCards;
    AttendancePlanPreview? frozenPlan;

    public AttendancePlanDialog(
        FirebirdDatabase database,
        AttendancePlanMode initialMode,
        DateTime initialFrom,
        DateTime initialTo,
        IEnumerable<string>? selectedCards = null)
    {
        db = database;
        initialCards = (selectedCards ?? []).Select(x => x.Trim().PadLeft(5, '0')).ToHashSet(StringComparer.OrdinalIgnoreCase);

        Text = "Kayıt Düzeltme • Önizle → Uygula";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1380, 820);
        MinimumSize = new Size(1120, 700);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;

        from.Value = initialFrom.Date;
        to.Value = initialTo.Date;
        mode.Items.AddRange(["TAM DÜZELT / NORMAL KAYIT", "E İŞLEMLERİ"]);
        mode.SelectedIndex = initialMode == AttendancePlanMode.ConvertToE ? 1 : 0;

        apply = PdksUiKit.Button("UYGULA", 118, PdksActionRole.Primary);
        apply.Enabled = false;

        Build();
        Wire();
        Shown += (_, _) => LoadPeople();
        FormClosed += (_, _) => personRefreshDebounce.Dispose();
    }

    AttendancePlanMode CurrentMode =>
        mode.SelectedIndex == 1 ? AttendancePlanMode.ConvertToE : AttendancePlanMode.FullRepair;

    void Build()
    {
        var p = PdksAppearance.Current;
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 4,
            Padding = new Padding(14),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 86));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 38));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        var header = PdksUiKit.Card(12);
        var head = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, BackColor = p.Surface };
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 62));
        head.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        head.Controls.Add(new Label
        {
            Text = "Planlı Kart İşlemi",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);
        head.Controls.Add(new Label
        {
            Text = "Önizlemede görülen plan Uygula sırasında değişmez.",
            Dock = DockStyle.Fill,
            ForeColor = p.Muted,
            TextAlign = ContentAlignment.MiddleRight
        }, 1, 0);
        header.Controls.Add(head);
        root.Controls.Add(header, 0, 0);

        var selectionCard = PdksUiKit.Card(10);
        var selectionRoot = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = p.Surface };
        selectionRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        selectionRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var filters = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(6, 7, 0, 0), BackColor = p.Surface };
        filters.Controls.Add(Caption("İşlem"));
        filters.Controls.Add(mode);
        filters.Controls.Add(Caption("Başlangıç"));
        filters.Controls.Add(from);
        filters.Controls.Add(Caption("Bitiş"));
        filters.Controls.Add(to);
        var selectAll = PdksUiKit.Button("Tümünü Seç", 100, PdksActionRole.Quiet);
        selectAll.Click += (_, _) => SetAll(true);
        var clear = PdksUiKit.Button("Temizle", 86, PdksActionRole.Quiet);
        clear.Click += (_, _) => SetAll(false);
        filters.Controls.Add(selectAll);
        filters.Controls.Add(clear);
        selectionRoot.Controls.Add(filters, 0, 0);

        people.EnableHeadersVisualStyles = false;
        people.ColumnHeadersDefaultCellStyle.BackColor = p.GridHeader;
        people.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        people.RowTemplate.Height = 28;
        people.ColumnHeadersHeight = 34;
        people.Columns.Add(new DataGridViewCheckBoxColumn { Name = "SEC", HeaderText = "Seç", Width = 44 });
        people.Columns.Add(new DataGridViewTextBoxColumn { Name = "KART", HeaderText = "Kart", Width = 72, ReadOnly = true });
        people.Columns.Add(new DataGridViewTextBoxColumn { Name = "AD", HeaderText = "Ad Soyad", Width = 190, ReadOnly = true });
        people.Columns.Add(new DataGridViewTextBoxColumn { Name = "MEVCUT_E", HeaderText = "Mevcut E", Width = 82, ReadOnly = true });
        people.Columns.Add(new DataGridViewTextBoxColumn { Name = "HEDEF_E", HeaderText = "Hedef E", Width = 82 });
        selectionRoot.Controls.Add(people, 0, 1);
        selectionCard.Controls.Add(selectionRoot);
        root.Controls.Add(selectionCard, 0, 1);

        var previewCard = PdksUiKit.Card(6);
        var previewRoot = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = p.Surface };
        previewRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        previewRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        info.Text = "Önce personel ve tarih aralığını seçip ÖNİZLE'ye basın.";
        info.ForeColor = p.Muted;
        previewRoot.Controls.Add(info, 0, 0);

        preview.EnableHeadersVisualStyles = false;
        preview.ColumnHeadersDefaultCellStyle.BackColor = p.GridHeader;
        preview.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        preview.RowTemplate.Height = 28;
        preview.ColumnHeadersHeight = 34;
        previewRoot.Controls.Add(preview, 0, 1);
        previewCard.Controls.Add(previewRoot);
        root.Controls.Add(previewCard, 0, 2);

        var actions = PdksUiKit.ActionBar(true, p.Canvas);
        var previewButton = PdksUiKit.Button("ÖNİZLE", 118, PdksActionRole.Secondary);
        previewButton.Click += (_, _) => BuildPreview();
        apply.Click += (_, _) => ApplyFrozenPlan();
        actions.Controls.Add(apply);
        actions.Controls.Add(previewButton);
        root.Controls.Add(actions, 0, 3);

        Controls.Add(root);
        RefreshModeUi();
    }

    void Wire()
    {
        personRefreshDebounce.Tick += (_, _) =>
        {
            personRefreshDebounce.Stop();
            if (!IsDisposed && IsHandleCreated) LoadPeople();
        };
        mode.SelectedIndexChanged += (_, _) =>
        {
            InvalidatePreview();
            RefreshModeUi();
            QueuePeopleRefresh();
        };
        from.ValueChanged += (_, _) => { InvalidatePreview(); QueuePeopleRefresh(); };
        to.ValueChanged += (_, _) => { InvalidatePreview(); QueuePeopleRefresh(); };
        people.CellValueChanged += (_, _) => InvalidatePreview();
        people.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (people.IsCurrentCellDirty)
                people.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };
    }

    void RefreshModeUi()
    {
        if (people.Columns.Contains("HEDEF_E"))
            people.Columns["HEDEF_E"].Visible = CurrentMode == AttendancePlanMode.ConvertToE;
        if (people.Columns.Contains("MEVCUT_E"))
            people.Columns["MEVCUT_E"].Visible = CurrentMode == AttendancePlanMode.ConvertToE;

        info.Text = CurrentMode == AttendancePlanMode.FullRepair
            ? "TAM DÜZELT: E kayıtlarına dokunmaz; eksik normal giriş/çıkışı oluşturur, aralık dışı normal saati doğal aralığa çeker, mükerreri temizler. Normal kayıt = DATA + TNF."
            : "E İŞLEMLERİ: yeni saat üretmez. Mevcut gerçek normal hareketlerden seçer; DB'de E yapar ve yıllık TNF'den çıkarır.";
    }

    void QueuePeopleRefresh()
    {
        if (!IsHandleCreated || IsDisposed) return;
        // Date-time picker spin and mode changes used to issue multiple blocking
        // Firebird queries per click. Refresh once after the user stops changing it.
        personRefreshDebounce.Stop();
        personRefreshDebounce.Start();
    }

    void LoadPeople()
    {
        if (!IsHandleCreated) return;
        try
        {
            var a = from.Value.Date;
            var b = to.Value.Date;
            if (b < a) (a, b) = (b, a);
            var current = people.Rows.Cast<DataGridViewRow>()
                .Where(r => !r.IsNewRow)
                .ToDictionary(
                    r => Convert.ToString(r.Cells["KART"].Value) ?? "",
                    r => (
                        Selected: Convert.ToBoolean(r.Cells["SEC"].Value ?? false),
                        Target: int.TryParse(Convert.ToString(r.Cells["HEDEF_E"].Value), out var t) ? t : 0),
                    StringComparer.OrdinalIgnoreCase);

            var rows = AttendancePlanService.LoadEligibleEmployees(db, a, b);
            people.Rows.Clear();
            foreach (var row in rows)
            {
                var known = current.TryGetValue(row.Card, out var old);
                var selected = known ? old.Selected : initialCards.Count == 0 || initialCards.Contains(row.Card);
                var target = known ? Math.Max(old.Target, row.CurrentE) : row.CurrentE;
                people.Rows.Add(selected, row.Card, row.Name, row.CurrentE, target);
            }
        }
        catch (Exception ex)
        {
            info.Text = "Personel listesi yüklenemedi: " + ex.Message;
        }
    }

    void SetAll(bool value)
    {
        foreach (DataGridViewRow row in people.Rows)
            if (!row.IsNewRow) row.Cells["SEC"].Value = value;
        InvalidatePreview();
    }

    void BuildPreview()
    {
        try
        {
            var a = from.Value.Date;
            var b = to.Value.Date;
            if (b < a) (a, b) = (b, a);
            var selected = people.Rows.Cast<DataGridViewRow>()
                .Where(r => !r.IsNewRow && Convert.ToBoolean(r.Cells["SEC"].Value ?? false))
                .ToArray();

            if (CurrentMode == AttendancePlanMode.FullRepair)
            {
                var cards = selected.Select(r => Convert.ToString(r.Cells["KART"].Value) ?? "").ToArray();
                frozenPlan = AttendancePlanService.BuildFullRepair(db, cards, a, b);
            }
            else
            {
                var targets = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                foreach (var row in selected)
                {
                    var card = Convert.ToString(row.Cells["KART"].Value) ?? "";
                    var currentE = Convert.ToInt32(row.Cells["MEVCUT_E"].Value ?? 0);
                    var targetText = Convert.ToString(row.Cells["HEDEF_E"].Value) ?? "";
                    var target = int.TryParse(targetText, out var parsed) ? parsed : currentE;
                    if (target < currentE)
                        throw new InvalidOperationException($"{card}: Hedef E adedi mevcut E ({currentE}) değerinden küçük olamaz.");
                    targets[card] = target;
                }
                frozenPlan = AttendancePlanService.BuildEPlan(db, targets, a, b);
            }

            if (frozenPlan is not null && frozenPlan.CanApply && frozenPlan.Items.Count > 0)
                AttendancePlanService.ValidateDatabasePlan(db, frozenPlan);

            BindPreview();
        }
        catch (Exception ex)
        {
            frozenPlan = null;
            preview.DataSource = null;
            apply.Enabled = false;
            info.Text = "Önizleme hatası: " + ex.Message;
        }
    }

    void BindPreview()
    {
        if (frozenPlan is null) return;
        var table = new DataTable();
        foreach (var name in new[] { "Tarih", "Sıra", "Kart", "Ad Soyad", "Mevcut", "Yeni", "İşlem", "TNF" })
            table.Columns.Add(name);

        foreach (var item in frozenPlan.Items)
            table.Rows.Add(
                item.Day.ToString("dd.MM.yyyy"),
                item.Side == AttendancePlanSide.Entry ? "1 • Sabah" : "2 • Akşam",
                item.Card,
                item.Name,
                item.CurrentText,
                item.PlannedText,
                item.Action + (item.PlannedType == "E" ? " • E" : ""),
                item.TnfText);

        preview.DataSource = table;
        if (preview.Columns.Contains("Tarih")) preview.Columns["Tarih"].Width = 92;
        if (preview.Columns.Contains("Sıra")) preview.Columns["Sıra"].Width = 92;
        if (preview.Columns.Contains("Kart")) preview.Columns["Kart"].Width = 68;
        if (preview.Columns.Contains("Ad Soyad")) preview.Columns["Ad Soyad"].Width = 180;
        if (preview.Columns.Contains("Mevcut")) preview.Columns["Mevcut"].Width = 70;
        if (preview.Columns.Contains("Yeni")) preview.Columns["Yeni"].Width = 70;
        if (preview.Columns.Contains("İşlem")) preview.Columns["İşlem"].Width = 170;
        if (preview.Columns.Contains("TNF")) preview.Columns["TNF"].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;

        var warning = frozenPlan.Warnings.Count == 0 ? "" : " • " + string.Join(" | ", frozenPlan.Warnings);
        info.Text = $"Önizleme: {frozenPlan.Items.Count} değişiklik • {frozenPlan.From:dd.MM.yyyy}-{frozenPlan.To:dd.MM.yyyy}{warning}";
        info.ForeColor = frozenPlan.CanApply ? PdksAppearance.Current.Success : PdksAppearance.Current.Warning;
        apply.Enabled = frozenPlan.CanApply && frozenPlan.Items.Count > 0;
    }

    void ApplyFrozenPlan()
    {
        personRefreshDebounce.Stop();
        if (frozenPlan is null || !frozenPlan.CanApply || frozenPlan.Items.Count == 0) return;
        var detail = frozenPlan.Mode == AttendancePlanMode.ConvertToE
            ? "Seçilen gerçek normal hareketler E yapılacak ve TNF'den çıkarılacak. Saatler değişmeyecek."
            : "Önizlemedeki normal kayıt planı aynen DATA/FDB'ye uygulanacak ve TNF aynı kayıtlarla eşitlenecek.";
        if (MessageBox.Show(
                $"{frozenPlan.Items.Count} değişiklik uygulanacak.\n\n{detail}\n\nÖnizleme Uygula sırasında yeniden hesaplanmayacak. Devam edilsin mi?",
                Text,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning) != DialogResult.Yes)
            return;

        try
        {
            UseWaitCursor = true;
            Enabled = false;
            var result = AttendancePlanService.Apply(db, frozenPlan);
            MessageBox.Show(result.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            frozenPlan = null;
            preview.DataSource = null;
            apply.Enabled = false;
            LoadPeople();
            info.Text = result.Message;
            info.ForeColor = PdksAppearance.Current.Success;
        }
        catch (Exception ex)
        {
            MessageBox.Show("İşlem geri alındı.\n\n" + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            info.Text = "Uygulama başarısız • geri alma çalıştırıldı: " + ex.Message;
            info.ForeColor = PdksAppearance.Current.Danger;
        }
        finally
        {
            Enabled = true;
            UseWaitCursor = false;
        }
    }

    void InvalidatePreview()
    {
        if (frozenPlan is null) return;
        frozenPlan = null;
        preview.DataSource = null;
        apply.Enabled = false;
        info.Text = "Seçim değişti. Uygulamadan önce yeniden ÖNİZLE yapın.";
        info.ForeColor = PdksAppearance.Current.Warning;
    }

    static Label Caption(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Padding = new Padding(8, 8, 3, 0),
        ForeColor = PdksAppearance.Current.Muted,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
    };
}
