using System.Globalization;

namespace HKN.Personel.Native;

public sealed partial class LiveAttendanceForm
{
    readonly Button normalizeLateEntry = PdksUiKit.Button("Geç Girişi Düzenle",150,PdksActionRole.Secondary);
    readonly Button normalizeEarlyExit = PdksUiKit.Button("Erken Çıkışı Düzenle",155,PdksActionRole.Secondary);
    readonly Button manualEntryE = PdksUiKit.Button("Toplu E Giriş",120,PdksActionRole.Secondary);
    readonly Button manualExitE = PdksUiKit.Button("Toplu E Çıkış",120,PdksActionRole.Secondary);
    readonly Button reconcileDay = PdksUiKit.Button("Günü Eşitle",110,PdksActionRole.Primary);
    readonly Button reconcileMonth = PdksUiKit.Button("Ayı Eşitle",110,PdksActionRole.Primary);
    readonly Button deleteUnmatchedDevice = PdksUiKit.Button("Eşleşmeyeni Cihazdan Sil",190,PdksActionRole.Danger);

    Control BuildAttendanceActions()
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(8);
        card.Margin=new Padding(0,4,0,4);
        var flow=new FlowLayoutPanel
        {
            Dock=DockStyle.Fill,
            WrapContents=true,
            AutoScroll=false,
            Padding=new Padding(8,8,6,0),
            BackColor=p.Surface
        };

        foreach(var button in new[]{normalizeLateEntry,normalizeEarlyExit,manualEntryE,manualExitE,reconcileDay,reconcileMonth,deleteUnmatchedDevice})
        {
            button.Height=34;
            button.Margin=new Padding(0,0,8,6);
            flow.Controls.Add(button);
        }

        normalizeLateEntry.Click+=async(_,_)=>await NormalizeAsync(true);
        normalizeEarlyExit.Click+=async(_,_)=>await NormalizeAsync(false);
        manualEntryE.Click+=async(_,_)=>await AddManualEAsync(true);
        manualExitE.Click+=async(_,_)=>await AddManualEAsync(false);
        reconcileDay.Click+=async(_,_)=>await ReconcileDayAsync();
        reconcileMonth.Click+=async(_,_)=>await ReconcileMonthAsync();
        deleteUnmatchedDevice.Click+=async(_,_)=>await DeleteUnmatchedFromDeviceAsync();

        card.Controls.Add(flow);
        return card;
    }

    async Task NormalizeAsync(bool entry)
    {
        var tab=entry?"Geç Giriş":"Erken Çıkış";
        var cards=CardsFromGrid(tab);
        if(cards.Length==0)
        {
            MessageBox.Show($"{tab} listesinde işlem yapılacak personel yok.","Canlı Denetim",MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }

        var defaults=entry
            ? (Start:new TimeSpan(8,20,0),End:new TimeSpan(8,35,0))
            : (Start:new TimeSpan(18,50,0),End:new TimeSpan(19,5,0));
        var range=AskTimeRange(entry?"Geç Giriş Saatlerini Düzenle":"Erken Çıkış Saatlerini Düzenle",defaults.Start,defaults.End);
        if(range is null)return;

        var verb=entry?"giriş":"çıkış";
        if(MessageBox.Show(
            $"{cards.Length} personelin {verb} saati {range.Value.Start:hh\\:mm}-{range.Value.End:hh\\:mm} aralığına doğal dağıtılsın mı?\n\nDATA ve yıllık TNF aynı dakikaya çekilir. Cihazın fiziksel ham kaydı değişmez. E oluşturulmaz.",
            "Toplu Saat Düzeltme",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;

        SetActionBusy(true);
        try
        {
            var result=entry
                ? AttendanceBulkCorrectionService.NormalizeEntries(db,cards,date.Value.Date,range.Value.Start,range.Value.End)
                : AttendanceBulkCorrectionService.NormalizeExits(db,cards,date.Value.Date,range.Value.Start,range.Value.End);
            MessageBox.Show(result.Message,"Toplu Saat Düzeltme",MessageBoxButtons.OK,MessageBoxIcon.Information);
            lastUiFingerprint="";
            await SyncAndLoadAsync(false,true);
        }
        finally{SetActionBusy(false);}
    }

    async Task AddManualEAsync(bool entry)
    {
        var tab=entry?"Giriş Eksik":"İçeride / Çıkış Bekleyen";
        var cards=entry?CardsFromGrid(tab):CardsFromGrid(tab,"Çıkış Kartı Yok");
        if(cards.Length==0)
        {
            MessageBox.Show($"{tab} listesinde E yapılacak personel yok.","Canlı Denetim",MessageBoxButtons.OK,MessageBoxIcon.Information);
            return;
        }

        var defaults=entry
            ? (Start:new TimeSpan(8,20,0),End:new TimeSpan(8,35,0))
            : (Start:new TimeSpan(18,50,0),End:new TimeSpan(19,5,0));
        var range=AskTimeRange(entry?"Toplu E Giriş":"Toplu E Çıkış",defaults.Start,defaults.End);
        if(range is null)return;

        if(MessageBox.Show(
            $"{cards.Length} personel için {(entry?"giriş":"çıkış")} E kaydı oluşturulsun mu?\n\nE yalnız DATA/FDB'de görünür; yıllık TNF'ye yazılmaz. Denetim kaydı tutulur.",
            entry?"Toplu E Giriş":"Toplu E Çıkış",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;

        SetActionBusy(true);
        try
        {
            var result=entry
                ? AttendanceBulkCorrectionService.AddManualEntries(db,cards,date.Value.Date,range.Value.Start,range.Value.End)
                : AttendanceBulkCorrectionService.AddManualExits(db,cards,date.Value.Date,range.Value.Start,range.Value.End);
            MessageBox.Show(result.Message,entry?"Toplu E Giriş":"Toplu E Çıkış",MessageBoxButtons.OK,MessageBoxIcon.Information);
            lastUiFingerprint="";
            await SyncAndLoadAsync(false,true);
        }
        finally{SetActionBusy(false);}
    }

    async Task ReconcileDayAsync()
    {
        SetActionBusy(true);
        try
        {
            var result=await Task.Run(()=>OperationalTnfSyncService.AlignDay(db,date.Value.Date));
            MessageBox.Show(result.Message+"\n\nE kayıtları TNF dışında bırakıldı.","DATA ↔ TNF Gün Eşitleme",
                MessageBoxButtons.OK,result.ExactMatch?MessageBoxIcon.Information:MessageBoxIcon.Warning);
            lastUiFingerprint="";
            await SyncAndLoadAsync(false,true);
        }
        finally{SetActionBusy(false);}
    }

    async Task ReconcileMonthAsync()
    {
        var day=date.Value.Date;
        if(MessageBox.Show(
            $"{day:MMMM yyyy} ayının DATA/FDB ↔ TR{day.Year}.Tnf kayıtları dakika bazında yeniden eşitlensin mi?\n\nE kayıtları TNF'ye yazılmaz.",
            "Aylık DATA ↔ TNF Eşitleme",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;

        SetActionBusy(true);
        try
        {
            var result=await Task.Run(()=>OperationalTnfSyncService.AlignMonth(db,day.Year,day.Month));
            MessageBox.Show(result.Message,"Aylık DATA ↔ TNF Eşitleme",
                MessageBoxButtons.OK,result.ExactMatch?MessageBoxIcon.Information:MessageBoxIcon.Warning);
            lastUiFingerprint="";
            await SyncAndLoadAsync(false,true);
        }
        finally{SetActionBusy(false);}
    }

    async Task DeleteUnmatchedFromDeviceAsync()
    {
        if(MessageBox.Show(
            "Sistemde aktif personel karşılığı olmayan cihaz kullanıcıları cihazdan silinsin mi?\n\nPersonel DATA/FDB kayıtları silinmez. Cihaz okuma arşivi korunur.",
            "Eşleşmeyenleri Cihazdan Sil",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;

        SetActionBusy(true);
        try
        {
            var result=await TerminalMaintenanceService.DeleteUnmatchedUsersAsync(closing.Token);
            MessageBox.Show(result.Message,"Eşleşmeyenleri Cihazdan Sil",MessageBoxButtons.OK,
                result.Success?MessageBoxIcon.Information:MessageBoxIcon.Warning);
            unmatched.Clear();
            lastUiFingerprint="";
            await SyncAndLoadAsync(true,true);
        }
        finally{SetActionBusy(false);}
    }

    string[] CardsFromGrid(string tab,string? requiredStatus=null)
    {
        if(!grids.TryGetValue(tab,out var grid)||!grid.Columns.Contains("Kart No"))return [];
        return grid.Rows.Cast<DataGridViewRow>()
            .Where(r=>!r.IsNewRow)
            .Where(r=>string.IsNullOrWhiteSpace(requiredStatus) ||
                (grid.Columns.Contains("Durum") && string.Equals(Convert.ToString(r.Cells["Durum"].Value),requiredStatus,StringComparison.OrdinalIgnoreCase)))
            .Select(r=>Convert.ToString(r.Cells["Kart No"].Value)?.Trim()??"")
            .Where(x=>x.Length>0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    void SetActionBusy(bool value)
    {
        foreach(var b in new[]{normalizeLateEntry,normalizeEarlyExit,manualEntryE,manualExitE,reconcileDay,reconcileMonth,deleteUnmatchedDevice})
            b.Enabled=!value;
    }

    (TimeSpan Start,TimeSpan End)? AskTimeRange(string title,TimeSpan start,TimeSpan end)
    {
        using var form=new Form
        {
            Text=title,StartPosition=FormStartPosition.CenterParent,Size=new Size(430,220),
            MinimumSize=new Size(430,220),MaximumSize=new Size(430,220),Font=Font,
            BackColor=PdksAppearance.Current.Canvas,FormBorderStyle=FormBorderStyle.FixedDialog,
            MaximizeBox=false,MinimizeBox=false,ShowInTaskbar=false
        };
        var startPicker=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="HH:mm",ShowUpDown=true,Width=100,Value=DateTime.Today.Add(start)};
        var endPicker=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="HH:mm",ShowUpDown=true,Width=100,Value=DateTime.Today.Add(end)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Padding=new Padding(22)};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.Controls.Add(new Label{Text="Başlangıç",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);root.Controls.Add(startPicker,1,0);
        root.Controls.Add(new Label{Text="Bitiş",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,1);root.Controls.Add(endPicker,1,1);
        var buttons=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft};
        var ok=PdksUiKit.Button("Uygula",100,PdksActionRole.Primary);var cancel=PdksUiKit.Button("İptal",90,PdksActionRole.Quiet);
        ok.Click+=(_,_)=>form.DialogResult=DialogResult.OK;cancel.Click+=(_,_)=>form.DialogResult=DialogResult.Cancel;
        buttons.Controls.Add(ok);buttons.Controls.Add(cancel);root.Controls.Add(buttons,0,2);root.SetColumnSpan(buttons,2);form.Controls.Add(root);
        if(form.ShowDialog(this)!=DialogResult.OK)return null;
        var a=startPicker.Value.TimeOfDay;var b=endPicker.Value.TimeOfDay;
        if(b<a){MessageBox.Show("Bitiş saati başlangıç saatinden önce olamaz.",title,MessageBoxButtons.OK,MessageBoxIcon.Warning);return null;}
        return(a,b);
    }
}
