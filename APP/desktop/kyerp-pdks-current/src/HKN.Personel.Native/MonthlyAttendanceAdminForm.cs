using System.Data;
using System.Diagnostics;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class MonthlyAttendanceAdminForm : Form
{
    readonly LocalUser user;
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker period = new()
    {
        Format = DateTimePickerFormat.Custom,
        CustomFormat = "MMMM yyyy",
        ShowUpDown = true,
        Width = 130
    };
    readonly ComboBox filter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 150 };
    readonly TextBox search = new() { Width = 180, PlaceholderText = "Kart / personel ara" };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(10, 8, 0, 0) };
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        RowHeadersVisible = false,
        AutoGenerateColumns = true,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = true,
        BackgroundColor = PdksAppearance.Current.Surface,
        BorderStyle = BorderStyle.None,
        RowTemplate = { Height = 30 },
        ColumnHeadersHeight = 36
    };

    List<MonthRow> allRows = [];

    public MonthlyAttendanceAdminForm(LocalUser currentUser)
    {
        user = currentUser;
        Text = "Aylık Kart Düzeltme • ADMIN";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1460, 830);
        MinimumSize = new Size(1180, 700);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;

        if (!user.IsAdmin)
            throw new UnauthorizedAccessException("Aylık kart düzeltme ekranı yalnız ADMIN içindir.");

        period.Value = DateTime.Today;
        filter.Items.AddRange(["Sorunlular", "Tümü", "Kart Basmadı", "Giriş Eksik", "Çıkış Eksik", "Erken Giriş", "Geç Giriş", "Erken Çıkış", "Geç Çıkış", "E Kayıtları", "Tamam"]);
        filter.SelectedIndex = 0;

        Build();
        Shown += (_, _) => ReloadMonth();
        filter.SelectedIndexChanged += (_, _) => BindGrid();
        search.TextChanged += (_, _) => BindGrid();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 5,
            Padding = new Padding(14),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 96));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var header = PdksUiKit.Card(14);
        var headerLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, BackColor = p.Surface };
        headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65));
        headerLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
        var title = new Label
        {
            Text = "Aylık Kart Düzeltme Merkezi",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft
        };
        var info = new Label
        {
            Text = $"ADMIN • Kabul: Giriş {AttendanceTolerancePolicy.EntryWindowText} • Çıkış {AttendanceTolerancePolicy.ExitWindowText} • Normal = DATA+TNF • E yalnız DATA",
            Dock = DockStyle.Fill,
            ForeColor = p.Muted,
            TextAlign = ContentAlignment.MiddleRight
        };
        headerLayout.Controls.Add(title, 0, 0);
        headerLayout.Controls.Add(info, 1, 0);
        header.Controls.Add(headerLayout);
        root.Controls.Add(header, 0, 0);

        var filters = PdksUiKit.Card(8);
        var filterFlow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(8, 5, 4, 0), BackColor = p.Surface };
        filterFlow.Controls.Add(L("Ay"));
        filterFlow.Controls.Add(period);
        filterFlow.Controls.Add(L("Görünüm"));
        filterFlow.Controls.Add(filter);
        filterFlow.Controls.Add(search);
        filterFlow.Controls.Add(B("Yenile", 82, PdksActionRole.Primary, (_, _) => ReloadMonth()));
        filterFlow.Controls.Add(B("Sorunluları Seç", 120, PdksActionRole.Secondary, (_, _) => SelectProblems()));
        filterFlow.Controls.Add(B("Seçimi Temizle", 112, PdksActionRole.Quiet, (_, _) => ClearSelection()));
        summary.ForeColor = p.Muted;
        filterFlow.Controls.Add(summary);
        filters.Controls.Add(filterFlow);
        root.Controls.Add(filters, 0, 1);

        var gridCard = PdksUiKit.Card(0);
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = p.GridHeader;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        grid.DefaultCellStyle.SelectionBackColor = p.Selection;
        grid.DefaultCellStyle.SelectionForeColor = p.Text;
        grid.CellFormatting += GridCellFormatting;
        grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (grid.IsCurrentCellDirty) grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };
        gridCard.Controls.Add(grid);
        root.Controls.Add(gridCard, 0, 2);

        var actions = PdksUiKit.Card(8);
        var actionRoot = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = p.Surface };
        actionRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        actionRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        var row1 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(6, 4, 0, 0), BackColor = p.Surface };
        row1.Controls.Add(B("Normal Giriş Ekle", 145, PdksActionRole.Primary, async (_, _) => await AddMissingAsync(true, false)));
        row1.Controls.Add(B("Normal Çıkış Ekle", 145, PdksActionRole.Primary, async (_, _) => await AddMissingAsync(false, false)));
        row1.Controls.Add(B("Giriş Saatini Düzenle", 160, PdksActionRole.Secondary, async (_, _) => await NormalizeAsync(true)));
        row1.Controls.Add(B("Çıkış Saatini Düzenle", 160, PdksActionRole.Secondary, async (_, _) => await NormalizeAsync(false)));
        row1.Controls.Add(B("E Giriş Ekle", 115, PdksActionRole.Secondary, async (_, _) => await AddMissingAsync(true, true)));
        row1.Controls.Add(B("E Çıkış Ekle", 115, PdksActionRole.Secondary, async (_, _) => await AddMissingAsync(false, true)));

        var row2 = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(6, 4, 0, 0), BackColor = p.Surface };
        row2.Controls.Add(B("Seçileni Eşitle", 130, PdksActionRole.Secondary, (_, _) => AlignSelected()));
        row2.Controls.Add(B("Ayı DATA ↔ TNF Eşitle", 170, PdksActionRole.Primary, (_, _) => AlignMonth()));
        row2.Controls.Add(B("E İmza PDF", 115, PdksActionRole.Secondary, (_, _) => ExportESignaturePdf()));
        row2.Controls.Add(B("Eşleşmeyeni Cihazdan Sil", 190, PdksActionRole.Danger, async (_, _) => await DeleteUnmatchedAsync()));

        actionRoot.Controls.Add(row1, 0, 0);
        actionRoot.Controls.Add(row2, 0, 1);
        actions.Controls.Add(actionRoot);
        root.Controls.Add(actions, 0, 3);

        status.ForeColor = p.Muted;
        root.Controls.Add(status, 0, 4);
        Controls.Add(root);
    }

    static Label L(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Padding = new Padding(8, 8, 4, 0),
        ForeColor = PdksAppearance.Current.Muted
    };

    static Button B(string text, int width, PdksActionRole role, EventHandler click)
    {
        var b = PdksUiKit.Button(text, width, role);
        b.Height = 32;
        b.MinimumSize = new Size(width, 32);
        b.MaximumSize = new Size(width, 32);
        b.Click += click;
        return b;
    }

    bool EnsureAdmin()
    {
        if (user.IsAdmin) return true;
        MessageBox.Show("Bu işlem yalnız ADMIN tarafından yapılabilir.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }

    void ReloadMonth()
    {
        if (!EnsureAdmin()) return;
        try
        {
            status.Text = "Aylık kart verileri hazırlanıyor…";
            UseWaitCursor = true;
            var a = new DateTime(period.Value.Year, period.Value.Month, 1);
            var b = a.AddMonths(1).AddDays(-1);
            allRows = LoadRows(a, b);
            BindGrid();
            status.Text = $"{a:MMMM yyyy} • {allRows.Count:N0} kişi-gün • Normal kayıtlar yıllık TR{a.Year}.Tnf ile dakika bazında kontrol edildi.";
        }
        catch (Exception ex)
        {
            status.Text = "Aylık kontrol hatası • " + PdksErrorPresenter.Report(ex, "Attendance.AdminMonth");
            MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { UseWaitCursor = false; }
    }

    List<MonthRow> LoadRows(DateTime a, DateTime b)
    {
        var employeesTable = db.Query(@"select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK
            where (IGTARIH is null or IGTARIH<=@B) and (ICTARIH is null or ICTARIH>=@A) order by PKNO",
            new FbParameter("@A", a), new FbParameter("@B", b.AddDays(1)));
        var employees = employeesTable.AsEnumerable()
            .Select(r => new Employee(
                S(r,"PKNO"),
                $"{S(r,"AD")} {S(r,"SOYAD")}".Trim(),
                D(r,"IGTARIH") ?? a,
                D(r,"ICTARIH")))
            .Where(x => x.Code.Length > 0)
            .ToArray();

        var movementTable = db.Query(@"select PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR from GIRCIK
            where (GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B) order by PKNO,SIRA",
            new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)));
        var moves = BuildMovementMap(movementTable, a, b);

        var leaveDays = new HashSet<(string,DateTime)>();
        try
        {
            var t=db.Query("select PKNO,TARIH from OZELIZIN where TARIH>=@A and TARIH<@B",
                new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)));
            foreach(DataRow r in t.Rows)
            {
                var d=D(r,"TARIH");var c=S(r,"PKNO");
                if(d.HasValue&&c.Length>0)leaveDays.Add((c,d.Value.Date));
            }
        }
        catch { }

        var holidayDays = new HashSet<(string,DateTime)>();
        try
        {
            var t=db.Query("select PKNO,TARIH from PERPLANTAT where TARIH>=@A and TARIH<@B",
                new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)));
            foreach(DataRow r in t.Rows)
            {
                var d=D(r,"TARIH");var c=S(r,"PKNO");
                if(d.HasValue&&c.Length>0)holidayDays.Add((c,d.Value.Date));
            }
        }
        catch { }

        var physical = TerminalLiveArchiveService.ReadPhysicalPunches(a,b).ToList();
        for(var d=a;d<=b;d=d.AddDays(1))
            physical.AddRange(DeviceEvidenceArchiveService.ReadDailyPunches(d));
        var physicalMap = physical
            .GroupBy(x => (x.EmployeeCode, x.OccurredAt.Date))
            .ToDictionary(g => g.Key, g => Physical(g));

        var tnf = LoadTnfLines(a.Year, a, b);
        var rows = new List<MonthRow>();

        foreach(var employee in employees)
        {
            var start = employee.Hire.Date > a ? employee.Hire.Date : a;
            var end = employee.Exit.HasValue && employee.Exit.Value.Date < b ? employee.Exit.Value.Date : b;
            for(var day=start;day<=end;day=day.AddDays(1))
            {
                moves.TryGetValue((employee.Code,day),out var move);
                physicalMap.TryGetValue((employee.Code,day),out var phy);
                var leave=leaveDays.Contains((employee.Code,day));
                var holiday=holidayDays.Contains((employee.Code,day));
                var weekend=day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;
                var workday=!weekend&&!leave&&!holiday;

                var entry = move?.Entry;
                var exit = move?.Exit;
                var entryType = move?.EntryType ?? "";
                var exitType = move?.ExitType ?? "";
                var statusParts = new List<string>();

                if(weekend) statusParts.Add("Hafta Sonu");
                else if(holiday) statusParts.Add("Tatil");
                else if(leave) statusParts.Add("İzinli");
                else
                {
                    if(!entry.HasValue&&!exit.HasValue) statusParts.Add("Kart Basmadı");
                    else
                    {
                        if(!entry.HasValue) statusParts.Add("Giriş Eksik");
                        if(!exit.HasValue) statusParts.Add("Çıkış Eksik");
                        if(entry.HasValue && !IsE(entryType))
                        {
                            var entryException=AttendanceTolerancePolicy.EntryException(entry.Value);
                            if(entryException.Length>0)statusParts.Add(entryException);
                        }
                        if(exit.HasValue && !IsE(exitType))
                        {
                            var exitException=AttendanceTolerancePolicy.ExitException(exit.Value);
                            if(exitException.Length>0)statusParts.Add(exitException);
                        }
                        if(IsE(entryType)) statusParts.Add("E Giriş");
                        if(IsE(exitType)) statusParts.Add("E Çıkış");
                        if(statusParts.Count==0) statusParts.Add("Tamam");
                    }
                }

                var tnfStatus = TnfStatus(employee.Code,day,entry,entryType,exit,exitType,tnf);
                rows.Add(new MonthRow(
                    $"{employee.Code}|{day:yyyyMMdd}",
                    day,employee.Code,employee.Name,
                    entry,entryType,exit,exitType,
                    phy.Entry,phy.Exit,
                    string.Join(" + ",statusParts),
                    tnfStatus,workday));
            }
        }
        return rows;
    }

    void BindGrid()
    {
        var source = allRows.AsEnumerable();
        var f = Convert.ToString(filter.SelectedItem) ?? "Sorunlular";
        source = f switch
        {
            "Sorunlular" => source.Where(x => x.Workday && x.Status != "Tamam"),
            "Kart Basmadı" => source.Where(x => x.Status.Contains("Kart Basmadı",StringComparison.OrdinalIgnoreCase)),
            "Giriş Eksik" => source.Where(x => x.Status.Contains("Giriş Eksik",StringComparison.OrdinalIgnoreCase)),
            "Çıkış Eksik" => source.Where(x => x.Status.Contains("Çıkış Eksik",StringComparison.OrdinalIgnoreCase)),
            "Erken Giriş" => source.Where(x => x.Status.Contains("Erken Giriş",StringComparison.OrdinalIgnoreCase)),
            "Geç Giriş" => source.Where(x => x.Status.Contains("Geç Giriş",StringComparison.OrdinalIgnoreCase)),
            "Erken Çıkış" => source.Where(x => x.Status.Contains("Erken Çıkış",StringComparison.OrdinalIgnoreCase)),
            "Geç Çıkış" => source.Where(x => x.Status.Contains("Geç Çıkış",StringComparison.OrdinalIgnoreCase)),
            "E Kayıtları" => source.Where(x => IsE(x.EntryType)||IsE(x.ExitType)),
            "Tamam" => source.Where(x => x.Status=="Tamam"),
            _ => source
        };

        var token = search.Text.Trim();
        if(token.Length>0)
            source=source.Where(x=>x.Card.Contains(token,StringComparison.OrdinalIgnoreCase)||x.Name.Contains(token,StringComparison.OrdinalIgnoreCase));

        var table = new DataTable();
        table.Columns.Add("Seç", typeof(bool));
        table.Columns.Add("Key");
        foreach(var c in new[]{"Tarih","Gün","Kart No","Ad Soyad","Giriş","G.Tip","Çıkış","Ç.Tip","Fiziksel Giriş","Fiziksel Çıkış","Durum","TNF"})table.Columns.Add(c);

        foreach(var r in source.OrderBy(x=>x.Day).ThenBy(x=>x.Card))
            table.Rows.Add(false,r.Key,r.Day.ToString("dd.MM.yyyy"),r.Day.ToString("dddd",CultureInfo.GetCultureInfo("tr-TR")),
                r.Card,r.Name,Clock(r.Entry),r.Entry.HasValue?TypeLabel(r.EntryType):"",Clock(r.Exit),r.Exit.HasValue?TypeLabel(r.ExitType):"",
                Clock(r.PhysicalEntry),Clock(r.PhysicalExit),r.Status,r.TnfStatus);

        grid.DataSource=table;
        if(grid.Columns.Contains("Key"))grid.Columns["Key"].Visible=false;
        if(grid.Columns.Contains("Seç"))grid.Columns["Seç"].Width=42;
        foreach(var n in new[]{"Tarih","Gün","Kart No","Giriş","G.Tip","Çıkış","Ç.Tip"})
            if(grid.Columns.Contains(n))grid.Columns[n].AutoSizeMode=DataGridViewAutoSizeColumnMode.AllCells;
        summary.Text=$"Gösterilen {table.Rows.Count:N0} / Toplam {allRows.Count:N0}";
    }

    void GridCellFormatting(object? sender, DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0||!grid.Columns.Contains("Durum"))return;
        var state=Convert.ToString(grid.Rows[e.RowIndex].Cells["Durum"].Value)??"";
        if(state.Contains("E ",StringComparison.OrdinalIgnoreCase))
            grid.Rows[e.RowIndex].DefaultCellStyle.BackColor=PdksAppearance.Current.IsDark?Color.FromArgb(69,52,21):Color.FromArgb(255,248,220);
        else if(state is not "Tamam" and not "Hafta Sonu" and not "Tatil" and not "İzinli")
            grid.Rows[e.RowIndex].DefaultCellStyle.BackColor=PdksAppearance.Current.DangerSoft;
    }

    void SelectProblems()
    {
        foreach(DataGridViewRow row in grid.Rows)
        {
            var state=Convert.ToString(row.Cells["Durum"].Value)??"";
            row.Cells["Seç"].Value=state is not "Tamam" and not "Hafta Sonu" and not "Tatil" and not "İzinli";
        }
    }

    void ClearSelection()
    {
        foreach(DataGridViewRow row in grid.Rows) row.Cells["Seç"].Value=false;
    }

    List<MonthRow> Selected()
    {
        var keys=grid.Rows.Cast<DataGridViewRow>()
            .Where(r=>Convert.ToBoolean(r.Cells["Seç"].Value??false))
            .Select(r=>Convert.ToString(r.Cells["Key"].Value)??"")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        return allRows.Where(x=>keys.Contains(x.Key)).ToList();
    }

    async Task AddMissingAsync(bool entry,bool manualE)
    {
        if(!EnsureAdmin())return;
        var selected=Selected().Where(x=>x.Workday && (entry?!x.Entry.HasValue:!x.Exit.HasValue)).ToList();
        if(selected.Count==0){MessageBox.Show("Seçimde uygun eksik kayıt yok.",Text);return;}

        var defaults=entry?(AttendanceTolerancePolicy.EntryEarliest,AttendanceTolerancePolicy.EntryLatest):(AttendanceTolerancePolicy.ExitEarliest,AttendanceTolerancePolicy.ExitLatest);
        var range=AskTimeRange(manualE?(entry?"E Giriş Ekle":"E Çıkış Ekle"):(entry?"Normal Giriş Ekle":"Normal Çıkış Ekle"),defaults.Item1,defaults.Item2);
        if(range is null)return;

        var explain=manualE
            ?"Bu işlem E olarak DATA/FDB'ye yazılır ve yıllık TNF'ye YAZILMAZ. E seçimini siz yapıyorsunuz."
            :"Bu işlem normal kayıttır; DATA/FDB ve yıllık TNF aynı dakika ile yazılır. E oluşturulmaz.";
        if(MessageBox.Show($"{selected.Count} kişi-gün işlenecek.\n\n{explain}\n\nDevam edilsin mi?",Text,MessageBoxButtons.YesNo,manualE?MessageBoxIcon.Warning:MessageBoxIcon.Question)!=DialogResult.Yes)return;

        SetBusy(true);
        try
        {
            var changed=0;var skipped=0;
            foreach(var g in selected.GroupBy(x=>x.Day))
            {
                var cards=g.Select(x=>x.Card).Distinct().ToArray();
                var result=manualE
                    ? (entry?AttendanceBulkCorrectionService.AddManualEntries(db,cards,g.Key,range.Value.Start,range.Value.End)
                            :AttendanceBulkCorrectionService.AddManualExits(db,cards,g.Key,range.Value.Start,range.Value.End))
                    : (entry?AttendanceBulkCorrectionService.AddNormalEntries(db,cards,g.Key,range.Value.Start,range.Value.End)
                            :AttendanceBulkCorrectionService.AddNormalExits(db,cards,g.Key,range.Value.Start,range.Value.End));
                changed+=result.Changed;skipped+=result.Skipped;
            }
            status.Text=$"İşlem tamamlandı • Değişen {changed:N0} • Atlanan {skipped:N0}";
            ReloadMonth();
        }
        finally{SetBusy(false);}
        await Task.CompletedTask;
    }

    async Task NormalizeAsync(bool entry)
    {
        if(!EnsureAdmin())return;
        var selected=Selected().Where(x=>x.Workday && (entry?x.Entry.HasValue&&!IsE(x.EntryType):x.Exit.HasValue&&!IsE(x.ExitType))).ToList();
        if(selected.Count==0){MessageBox.Show("Seçimde düzenlenecek normal kayıt yok.",Text);return;}
        var defaults=entry?(AttendanceTolerancePolicy.EntryEarliest,AttendanceTolerancePolicy.EntryLatest):(AttendanceTolerancePolicy.ExitEarliest,AttendanceTolerancePolicy.ExitLatest);
        var range=AskTimeRange(entry?"Giriş Saatini Düzenle":"Çıkış Saatini Düzenle",defaults.Item1,defaults.Item2);
        if(range is null)return;
        if(MessageBox.Show($"{selected.Count} kişi-gün {range.Value.Start:hh\\:mm}-{range.Value.End:hh\\:mm} aralığına dağıtılacak.\n\nDATA ve yıllık TNF birlikte değişir; cihaz ham arşivi değişmez; E oluşturulmaz.",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;

        SetBusy(true);
        try
        {
            foreach(var g in selected.GroupBy(x=>x.Day))
            {
                var cards=g.Select(x=>x.Card).Distinct().ToArray();
                if(entry)AttendanceBulkCorrectionService.NormalizeEntries(db,cards,g.Key,range.Value.Start,range.Value.End);
                else AttendanceBulkCorrectionService.NormalizeExits(db,cards,g.Key,range.Value.Start,range.Value.End);
            }
            ReloadMonth();
        }
        finally{SetBusy(false);}
        await Task.CompletedTask;
    }

    void AlignSelected()
    {
        if(!EnsureAdmin())return;
        var selected=Selected();
        if(selected.Count==0){MessageBox.Show("Önce satır seçin.",Text);return;}
        OperationalTnfSyncService.AlignPersonDays(db,selected.Select(x=>(x.Card,x.Day)));
        ReloadMonth();
        status.Text="Seçili kişi-gün kayıtları DATA ↔ yıllık TNF olarak yeniden eşitlendi. E kayıtları TNF dışında bırakıldı.";
    }

    void AlignMonth()
    {
        if(!EnsureAdmin())return;
        var a=new DateTime(period.Value.Year,period.Value.Month,1);
        if(MessageBox.Show($"{a:MMMM yyyy} DATA/FDB ↔ TR{a.Year}.Tnf dakika bazında tamamen eşitlensin mi?\n\nE kayıtları TNF'ye yazılmaz.",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        var result=OperationalTnfSyncService.AlignMonth(db,a.Year,a.Month);
        ReloadMonth();
        MessageBox.Show(result.Message,Text,MessageBoxButtons.OK,result.ExactMatch?MessageBoxIcon.Information:MessageBoxIcon.Warning);
    }

    void ExportESignaturePdf()
    {
        if(!EnsureAdmin())return;
        var rows=new List<IReadOnlyList<string>>();
        foreach(var r in allRows.Where(x=>IsE(x.EntryType)||IsE(x.ExitType)).OrderBy(x=>x.Name).ThenBy(x=>x.Day))
        {
            if(IsE(r.EntryType))
                rows.Add([r.Card,r.Name,r.Day.ToString("dd.MM.yyyy"),"Giriş",Clock(r.Entry),"Elle düzenlenen E giriş kaydı","________________"]);
            if(IsE(r.ExitType))
                rows.Add([r.Card,r.Name,r.Day.ToString("dd.MM.yyyy"),"Çıkış",Clock(r.Exit),"Elle düzenlenen E çıkış kaydı","________________"]);
        }
        if(rows.Count==0){MessageBox.Show("Seçili ayda E kaydı yok.",Text);return;}

        var month=new DateTime(period.Value.Year,period.Value.Month,1);
        var dir=Path.Combine(CompanyDataPaths.Reports,"E_IMZA_FORMLARI",month.ToString("yyyy"),month.ToString("MM"));
        Directory.CreateDirectory(dir);
        var path=Path.Combine(dir,$"E_IMZA_{month:yyyy-MM}_{DateTime.Now:yyyyMMdd_HHmmss}.pdf");
        var report=new ReportTable(
            $"{month:MMMM yyyy} • E Kart Kayıtları • Personel İmza Formu",
            ["Kart No","Personel","Tarih","İşlem","Saat","Açıklama","İmza"],
            rows,
            [9,22,12,10,8,28,20]);
        ReportExporter.ExportPdf(path,report);
        status.Text="E imza PDF hazır: "+path;
        try{Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}catch{}
    }

    async Task DeleteUnmatchedAsync()
    {
        if(!EnsureAdmin())return;
        if(MessageBox.Show("Sistemde aktif personel karşılığı olmayan cihaz kullanıcıları cihazdan silinsin mi?\n\nCihaz logları/okuma kanıtları korunur; personel DATA/FDB silinmez.",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        SetBusy(true);
        try
        {
            var result=await TerminalMaintenanceService.DeleteUnmatchedUsersAsync(CancellationToken.None);
            MessageBox.Show(result.Message,Text,MessageBoxButtons.OK,result.Success?MessageBoxIcon.Information:MessageBoxIcon.Warning);
        }
        finally{SetBusy(false);}
    }

    void SetBusy(bool busy)
    {
        UseWaitCursor=busy;
        grid.Enabled=!busy;
    }

    (TimeSpan Start,TimeSpan End)? AskTimeRange(string title,TimeSpan start,TimeSpan end)
    {
        using var form=new Form
        {
            Text=title,StartPosition=FormStartPosition.CenterParent,Size=new Size(420,220),
            MinimumSize=new Size(420,220),MaximumSize=new Size(420,220),
            FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,
            Font=Font,BackColor=PdksAppearance.Current.Canvas
        };
        var a=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="HH:mm",ShowUpDown=true,Width=100,Value=DateTime.Today.Add(start)};
        var b=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="HH:mm",ShowUpDown=true,Width=100,Value=DateTime.Today.Add(end)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(22)};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,140));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.Controls.Add(L("Başlangıç"),0,0);root.Controls.Add(a,1,0);root.Controls.Add(L("Bitiş"),0,1);root.Controls.Add(b,1,1);
        var buttons=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft};
        var ok=B("Uygula",95,PdksActionRole.Primary,(_,_)=>form.DialogResult=DialogResult.OK);
        var cancel=B("İptal",85,PdksActionRole.Quiet,(_,_)=>form.DialogResult=DialogResult.Cancel);
        buttons.Controls.Add(ok);buttons.Controls.Add(cancel);root.Controls.Add(buttons,0,2);root.SetColumnSpan(buttons,2);
        form.Controls.Add(root);
        if(form.ShowDialog(this)!=DialogResult.OK)return null;
        if(b.Value.TimeOfDay<a.Value.TimeOfDay){MessageBox.Show("Bitiş başlangıçtan önce olamaz.",title);return null;}
        return(a.Value.TimeOfDay,b.Value.TimeOfDay);
    }

    static Dictionary<(string Card,DateTime Day),Movement> BuildMovementMap(DataTable table,DateTime a,DateTime b)
    {
        var map=new Dictionary<(string,DateTime),Movement>();
        foreach(DataRow r in table.Rows)
        {
            var card=S(r,"PKNO");
            var gd=D(r,"GTARIH");
            if(gd.HasValue&&gd.Value.Date>=a&&gd.Value.Date<=b)
            {
                var key=(card,gd.Value.Date);if(!map.TryGetValue(key,out var m))m=new Movement();
                var at=At(r,"GTARIH","GSAAT","GDAKIKA");
                if(at.HasValue&&(!m.Entry.HasValue||at.Value<m.Entry.Value)){m.Entry=at;m.EntryType=S(r,"GTUR");}
                map[key]=m;
            }
            var cd=D(r,"CTARIH");
            if(cd.HasValue&&cd.Value.Date>=a&&cd.Value.Date<=b)
            {
                var key=(card,cd.Value.Date);if(!map.TryGetValue(key,out var m))m=new Movement();
                var at=At(r,"CTARIH","CSAAT","CDAKIKA");
                if(at.HasValue&&(!m.Exit.HasValue||at.Value>m.Exit.Value)){m.Exit=at;m.ExitType=S(r,"CTUR");}
                map[key]=m;
            }
        }
        return map;
    }

    static (DateTime? Entry,DateTime? Exit) Physical(IEnumerable<TerminalDevicePunch> rows)
    {
        var ordered=rows.OrderBy(x=>x.OccurredAt).ToArray();
        var morning=ordered.Where(x=>x.OccurredAt.TimeOfDay<TimeSpan.FromHours(12)).Select(x=>x.OccurredAt).ToArray();
        var later=ordered.Where(x=>x.OccurredAt.TimeOfDay>=TimeSpan.FromHours(12)).Select(x=>x.OccurredAt).ToArray();
        return(morning.Length==0?null:morning.Min(),later.Length==0?null:later.Max());
    }

    static HashSet<string> LoadTnfLines(int year,DateTime a,DateTime b)
    {
        var path=Path.Combine(CompanyDataPaths.Tnf,$"TR{year}.Tnf");
        if(!File.Exists(path))return [];
        var set=new HashSet<string>(StringComparer.Ordinal);
        foreach(var line in File.ReadLines(path))
        {
            var p=line.Split(',');
            if(p.Length!=5)continue;
            if(!DateTime.TryParseExact(p[2],"ddMMyy",CultureInfo.InvariantCulture,DateTimeStyles.None,out var d))continue;
            if(d.Date>=a&&d.Date<=b)set.Add(line.Trim());
        }
        return set;
    }

    static string TnfStatus(string card,DateTime day,DateTime? entry,string entryType,DateTime? exit,string exitType,HashSet<string> tnf)
    {
        var expected=0;var matched=0;var e=0;
        if(entry.HasValue)
        {
            if(IsE(entryType))e++;
            else {expected++;if(tnf.Contains($"{card},{entry:HH:mm},{day:ddMMyy},1,001"))matched++;}
        }
        if(exit.HasValue)
        {
            if(IsE(exitType))e++;
            else {expected++;if(tnf.Contains($"{card},{exit:HH:mm},{day:ddMMyy},1,001"))matched++;}
        }
        if(expected==0)return e>0?"E • TNF dışı":"-";
        return matched==expected?(e>0?"Uyumlu + E":"Uyumlu"):$"Fark {matched}/{expected}";
    }

    static DateTime? At(DataRow r,string dateCol,string timeCol,string minuteCol)
    {
        var day=D(r,dateCol);if(!day.HasValue)return null;
        if(r[minuteCol]!=DBNull.Value)
        {
            var minute=Convert.ToInt32(r[minuteCol]);
            if(minute>=0&&minute<1440)return day.Value.Date.AddMinutes(minute);
        }
        if(TimeSpan.TryParse(S(r,timeCol),out var t))return day.Value.Date.Add(t);
        return null;
    }

    static bool IsE(string? value)=>string.Equals(value?.Trim(),"E",StringComparison.OrdinalIgnoreCase);
    static string TypeLabel(string? value)=>IsE(value)?"E":string.IsNullOrWhiteSpace(value)?"Normal":value!.Trim();
    static string Clock(DateTime? value)=>value?.ToString("HH:mm")??"";
    static string S(DataRow r,string c)=>r[c]==DBNull.Value?"":Convert.ToString(r[c])?.Trim()??"";
    static DateTime? D(DataRow r,string c)=>r[c]==DBNull.Value?null:Convert.ToDateTime(r[c]).Date;

    sealed record Employee(string Code,string Name,DateTime Hire,DateTime? Exit);
    sealed class Movement
    {
        public DateTime? Entry { get; set; }
        public DateTime? Exit { get; set; }
        public string EntryType { get; set; }="";
        public string ExitType { get; set; }="";
    }
    sealed record MonthRow(
        string Key,DateTime Day,string Card,string Name,
        DateTime? Entry,string EntryType,DateTime? Exit,string ExitType,
        DateTime? PhysicalEntry,DateTime? PhysicalExit,
        string Status,string TnfStatus,bool Workday);
}
