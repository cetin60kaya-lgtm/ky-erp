using System.Data;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed partial class DbTnfSyncControl
{
    MonthlyDbSnapshot? monthlySnapshot;
    readonly DataGridView monthlyGrid = Grid();
    internal MonthlyDbSnapshot? LastMonthlySnapshot => monthlySnapshot;

    void ConfigureMonthlyGrid()
    {
        monthlyGrid.ReadOnly = true;
        AddColumn(monthlyGrid, "Card", "Kart", 60);
        AddColumn(monthlyGrid, "Day", "Tarih", 95);
        monthlyGrid.Columns[1].DefaultCellStyle.Format = "dd.MM.yyyy";
        AddColumn(monthlyGrid, "Kind", "DB Sonucu", 130);
        AddColumn(monthlyGrid, "Side", "Taraf", 65);
        AddColumn(monthlyGrid, "Time", "Gerçek Saat", 75);
        AddColumn(monthlyGrid, "Safe", "Güvenli", 60);
        AddColumn(monthlyGrid, "Detail", "İşlem / Açıklama", 390);
        monthlyGrid.CellFormatting += (_, args) =>
        {
            if (args.RowIndex < 0 || monthlyGrid.Rows[args.RowIndex].DataBoundItem is not MonthlyIssue issue) return;
            monthlyGrid.Rows[args.RowIndex].DefaultCellStyle.BackColor = issue.Kind switch
            {
                "İNCELE" => Color.Gainsboro,
                "EKSİK GİRİŞ" or "EKSİK ÇIKIŞ" or "HİÇ BASMAMIŞ" => Color.LemonChiffon,
                "E KAYIT" => Color.Thistle,
                "GEÇ GİRİŞ" or "ERKEN ÇIKIŞ" => Color.PeachPuff,
                _ => Color.MistyRose
            };
        };
    }

    static (Dictionary<string, List<PairView>> Groups, List<PersonView> People) PrepareMonthlyView(AuditSnapshot result, MonthlyDbSnapshot? monthly, CancellationToken token)
    {
        var view = PrepareView(monthly is null ? result : result with { People = monthly.People }, token);
        if (monthly is null) return view;
        var issues = monthly.Issues.GroupBy(issue => issue.Card).ToDictionary(group => group.Key, group => group.ToArray());
        for (var index = 0; index < view.People.Count; index++)
        {
            var person = view.People[index];
            var errors = issues.GetValueOrDefault(person.Card) ?? [];
            var count = errors.Count(issue => issue.Kind != "E KAYIT");
            view.People[index] = person with { ErrorCount = person.ErrorCount + count,
                Result = person.Result + (errors.Length == 0 ? " | DB TEMİZ" : " | DB: " + string.Join(", ", errors.GroupBy(issue => issue.Kind).Select(group => $"{group.Key}={group.Count()}"))) };
        }
        return view;
    }

    void ShowMonthlyPerson()
    {
        Bind(monthlyGrid, monthlySnapshot?.Issues.Where(issue => issue.Card == selectedCard).OrderBy(issue => issue.Day).ThenBy(issue => issue.Kind).ToList() ?? []);
    }

    bool RequireMonthlyResult()
    {
        if (IsBusy || snapshot is null || monthlySnapshot is null || !ReferenceEquals(snapshotDatabase, Database) || !MatchesSource(snapshot.Request.Path))
        { MessageBox.Show(main, "Önce BU AYI KONTROL ET çalıştırın."); return false; }
        if (monthlySnapshot.WritesBlocked)
        { MessageBox.Show(main, "DB/GIRCIK trigger bulundu. Otomatik DB yazması güvenlik nedeniyle engellendi; trigger'lar değiştirilmez."); return false; }
        return true;
    }

    async Task RepairDbAsync()
    {
        if (!RequireMonthlyResult()) return;
        using var dialog = new Form { Text = "DB Güvenli Düzeltme — kapsam", Width = 490, Height = 245, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
        var scope = new ComboBox { Left = 20, Top = 50, Width = 440, DropDownStyle = ComboBoxStyle.DropDownList };
        scope.Items.AddRange(["Seçili ay / tüm personeller", $"Seçili ay / yalnız {selectedCard}"]);
        scope.SelectedIndex = 0;
        var apply = new Button { Left = 20, Top = 145, Width = 210, Text = "PLAN ÖZETİNİ GÖSTER", DialogResult = DialogResult.OK };
        dialog.Controls.AddRange([new Label { Left = 20, Top = 20, Width = 440, Text = "Gerçek saatler değişmez. Yalnız güvenli fazla taraf temizlenir." }, scope,
            new Label { Left = 20, Top = 90, Width = 440, Height = 45, Text = "Yazmadan önce gbak + satır dump alınır. Kilitli kartlar ve belirsiz vardiyalar değiştirilmez." }, apply]);
        dialog.AcceptButton = apply;
        if (dialog.ShowDialog(main) != DialogResult.OK) return;
        var operations = monthlySnapshot!.Issues.Where(issue => issue.Safe && (scope.SelectedIndex == 0 || issue.Card == selectedCard)).DistinctBy(issue => (issue.Card, issue.Day, issue.Id, issue.Side)).ToArray();
        await ApplyDbBatchAsync(operations, "DB GÜVENLİLERİ DÜZELT");
    }

    async Task CompleteDbAsync()
    {
        if (!RequireMonthlyResult()) return;
        using var dialog = new Form { Text = "AYLIK TOPLU TAMAMLAMA — yeni saat üretimi", Width = 620, Height = 450, StartPosition = FormStartPosition.CenterParent, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
        var scope = new ComboBox { Left = 20, Top = 25, Width = 555, DropDownStyle = ComboBoxStyle.DropDownList };
        scope.Items.AddRange(["Seçili ay / tüm personeller", $"Seçili ay / yalnız {selectedCard}"]);
        scope.SelectedIndex = 0;
        var single = new CheckBox { Left = 20, Top = 65, Width = 550, Text = "Sadece eksik tek tarafı tamamla", Checked = true };
        var whole = new CheckBox { Left = 20, Top = 95, Width = 550, Text = "Hiç basmamış uygun iş gününe giriş + çıkış ÜRET (açık onay)" };
        var natural = new CheckBox { Left = 20, Top = 130, Width = 550, Text = "Doğal dağılım (kapalıysa sabit referans)" };
        var entry = new DateTimePicker { Left = 145, Top = 170, Width = 100, Format = DateTimePickerFormat.Custom, CustomFormat = "HH:mm", ShowUpDown = true, Value = DateTime.Today.AddHours(8.5) };
        var exit = new DateTimePicker { Left = 430, Top = 170, Width = 100, Format = DateTimePickerFormat.Custom, CustomFormat = "HH:mm", ShowUpDown = true, Value = DateTime.Today.AddHours(19) };
        var calendar = new CheckBox { Left = 20, Top = 215, Width = 555, Height = 40, Text = "DB tatil / yıllık izin / çalışma planlarının bu ay için güncel olduğunu doğruladım" };
        var explanation = new Label { Left = 20, Top = 265, Width = 555, Height = 80, Text = "Giriş: 08:20–08:35; çıkış: 18:55–19:05. Gerçek 08:50 / 18:20 ASLA değişmez. Hafta sonu, tatil, izin, E, kilit, belirsiz dönem/plan ve gelecekteki günlerde saat üretilmez. Resmî dini tatil koruması şu anda 2026 için doğrulanmıştır; diğer yıllarda üretim kapalıdır." };
        var preview = new Button { Left = 20, Top = 355, Width = 230, Text = "ÜRETİLECEK SAATLERİ ONAYLA" };
        preview.Click += (_, _) => { if (!calendar.Checked) { MessageBox.Show(dialog, "Tatil/izin planlarını doğrulamadan saat üretilemez."); return; } dialog.DialogResult = DialogResult.OK; };
        dialog.Controls.AddRange([scope, single, whole, natural, new Label { Left = 20, Top = 175, Text = "Giriş referansı", Width = 120 }, entry,
            new Label { Left = 300, Top = 175, Text = "Çıkış referansı", Width = 120 }, exit, calendar, explanation, preview]);
        if (dialog.ShowDialog(main) != DialogResult.OK) return;
        var settings = new CompletionSettings(scope.SelectedIndex == 1, single.Checked, whole.Checked, natural.Checked,
            entry.Value.Hour * 60 + entry.Value.Minute, exit.Value.Hour * 60 + exit.Value.Minute);
        var current = monthlySnapshot!;
        var card = selectedCard;
        MonthlyIssue[] operations;
        cancellation = new CancellationTokenSource();
        var token = cancellation.Token;
        SetBusy(true);
        try { operations = await Task.Run(() => MonthlyDbAudit.Complete(current, settings, card, token), token); }
        catch (OperationCanceledException) { summary.Text = "Tamamlama planı iptal edildi; DB değişmedi."; return; }
        catch (Exception exception) { MessageBox.Show(main, exception.Message, "Tamamlama planı hazırlanamadı"); return; }
        finally { cancellation.Dispose(); cancellation = null; if (!IsDisposed) SetBusy(false); }
        if (IsDisposed) return;
        await ApplyDbBatchAsync(operations, "DB EKSİKLERİ TAMAMLA — YENİ SAAT");
    }

    async Task ApplyDbBatchAsync(MonthlyIssue[] operations, string title)
    {
        if (!RequireMonthlyResult()) return;
        if (operations.Length == 0) { MessageBox.Show(main, "Bu kapsamda uygun güvenli DB işlemi yok. Eksik plan/tatil/izin/kilit veya belirsizlikler korunur."); return; }
        var overview = string.Join("\n", operations.GroupBy(issue => issue.Kind).Select(group => $"{group.Key}: {group.Count()}"));
        if (MessageBox.Show(main, $"Dönem: {monthlySnapshot!.Request.Start:MM.yyyy}\nPersonel: {operations.Select(issue => issue.Card).Distinct().Count()}\n{overview}\nToplam taraf: {operations.Length}\n\nDATABASE.GDB değişecek. Önce gbak ve satır dump yedeği. Transaction / rollback uygulanır. Mevcut gerçek saatler değiştirilmez. Devam?",
            title, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var previous = snapshot!;
        var plan = monthlySnapshot;
        cancellation = new CancellationTokenSource();
        var token = cancellation.Token;
        SetBusy(true);
        monthlyGrid.Enabled = false;
        var success = false;
        try
        {
            summary.Text = "gbak yedeği alınıyor; sonra DB transaction uygulanacak...";
            var backup = await Task.Run(() => MonthlyDbWriter.ApplyAsync(snapshotDatabase!, previous, plan, operations, token), token);
            success = true;
            SyncEngine.Log($"REV21 monthly_db_action={title} completed backup={Path.GetFileName(backup)}");
        }
        catch (OperationCanceledException) { summary.Text = "İşlem iptal edildi; commit öncesindeki değişiklikler geri alındı."; }
        catch (Exception exception) { MessageBox.Show(main, exception.Message, "DB işlemi durdu / rollback", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally
        {
            SetSnapshot(null);
            monthlySnapshot = null;
            cancellation.Dispose();
            cancellation = null;
            if (!IsDisposed) { SetBusy(false); monthlyGrid.Enabled = true; }
        }
        if (success && !IsDisposed)
        {
            lastOutputs = null;
            await RunAuditAsync(false);
            if (monthlySnapshot is not null)
                summary.Text += monthlySnapshot.Issues.Any(issue => issue.Safe || issue.Kind == "İNCELE") ? " | KALAN DB HATA / İNCELE VAR" : " | DB GÜVENLİ HATA = 0";
        }
    }
}
