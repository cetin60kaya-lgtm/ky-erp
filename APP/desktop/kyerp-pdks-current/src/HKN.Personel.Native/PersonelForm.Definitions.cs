using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core.Definitions;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    static readonly DefinitionType[] OrganizationTypes =
    [
        new("Grup","GRUP",OrganizationDefinitionKind.Group),
        new("Bölüm","BOLUM",OrganizationDefinitionKind.Department),
        new("Durum","DURUM",OrganizationDefinitionKind.Status),
        new("Servis","SERVIS",OrganizationDefinitionKind.Service),
        new("Görev","GOREV",OrganizationDefinitionKind.Duty),
        new("Firma","FIRMA",OrganizationDefinitionKind.Company)
    ];

    public DateTime SelectedWorkingDate { get; private set; } = DateTime.Today;

    void ShowOrganizationDefinitions(string? presetLabel=null)
    {
        var selected = ResolveDefinition(presetLabel);
        using var dialog = Dialog(selected.Label + " Tanımları", 500, 430);
        dialog.FormBorderStyle = FormBorderStyle.FixedDialog;
        dialog.MaximizeBox = false;
        dialog.MinimizeBox = false;

        var root = Root(2);
        root.Padding = new Padding(6);
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));

        var grid = Grid();
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        root.Controls.Add(grid,0,0);

        var bar = new FlowLayoutPanel
        {
            Dock=DockStyle.Fill, FlowDirection=FlowDirection.RightToLeft,
            Padding=new Padding(2,7,2,1), WrapContents=false
        };
        var close = ClassicDialogButton("Kapat",88);
        var delete = ClassicDialogButton("Sil",82);
        var edit = ClassicDialogButton("Değiştir",92);
        var add = ClassicDialogButton("Yeni Ekle",96);
        close.DialogResult = DialogResult.Cancel;
        bar.Controls.Add(close); bar.Controls.Add(delete); bar.Controls.Add(edit); bar.Controls.Add(add);
        root.Controls.Add(bar,0,1);
        dialog.Controls.Add(root);
        dialog.CancelButton = close;

        void RefreshGrid()
        {
            grid.DataSource = Q($"select KOD,AD from {selected.Table} order by KOD");
            if(grid.Columns.Contains("KOD")) { grid.Columns["KOD"].HeaderText="Kod"; grid.Columns["KOD"].Width=70; }
            if(grid.Columns.Contains("AD")) grid.Columns["AD"].HeaderText=selected.Label+" Adı";
        }
        void Run(Action action)
        {
            try { action(); RefreshGrid(); Reload(); }
            catch(Exception ex) { MessageBox.Show(ex.Message,dialog.Text,MessageBoxButtons.OK,MessageBoxIcon.Warning); }
        }

        add.Click += (_,_) => Run(() =>
        {
            if(!NameDialog("Yeni "+selected.Label,"",out var name)) return;
            Exec($"insert into {selected.Table} (KOD,AD) values (@K,@A)",
                new FbParameter("@K",Next(selected.Table,"KOD")),
                new FbParameter("@A",RequiredName(name)));
        });
        edit.Click += (_,_) => Run(() =>
        {
            var row=SelectedRow(grid);
            if(!NameDialog(selected.Label+" Düzenle",Convert.ToString(row.Cells["AD"].Value)??"",out var name)) return;
            Exec($"update {selected.Table} set AD=@A where KOD=@K",
                new FbParameter("@A",RequiredName(name)),new FbParameter("@K",row.Cells["KOD"].Value));
        });
        delete.Click += (_,_) => Run(() =>
        {
            var row=SelectedRow(grid); var code=row.Cells["KOD"].Value;
            var usage=DefinitionUsageGuard.FindUsage(db,selected.Kind,code);
            if(usage.Count>0) throw new InvalidOperationException(DefinitionUsageGuard.BlockMessage(usage));
            if(MessageBox.Show("Seçili tanım silinsin mi?",dialog.Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)==DialogResult.Yes)
                Exec($"delete from {selected.Table} where KOD=@K",new FbParameter("@K",code));
        });

        try { RefreshGrid(); }
        catch(Exception ex) { MessageBox.Show("Tanımlar okunamadı: "+ex.Message,dialog.Text,MessageBoxButtons.OK,MessageBoxIcon.Error); return; }
        dialog.ShowDialog(DialogOwner());
    }

    DefinitionType ResolveDefinition(string? labelOrTable)
    {
        if(!string.IsNullOrWhiteSpace(labelOrTable))
        {
            var match=OrganizationTypes.FirstOrDefault(x=>
                x.Label.Equals(labelOrTable,StringComparison.OrdinalIgnoreCase) ||
                x.Table.Equals(labelOrTable,StringComparison.OrdinalIgnoreCase));
            if(match is not null) return match;
        }
        return OrganizationTypes[0];
    }

    void ShowPeriodDefinitions()
    {
        using var dialog = Dialog("Dönem Tanımlamaları", 760, 405);
        dialog.FormBorderStyle=FormBorderStyle.FixedDialog;
        dialog.MaximizeBox=false; dialog.MinimizeBox=false;

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Padding=new Padding(6)};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,220));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));

        var list=new DataGridView
        {
            Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
            MultiSelect=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,
            RowHeadersVisible=false,BackgroundColor=Color.White,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,
            ColumnHeadersHeight=20,RowTemplate={Height=20}
        };
        root.Controls.Add(list,0,0);

        var detail=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=11,Padding=new Padding(10,2,4,0)};
        detail.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,112));
        detail.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,55));
        detail.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,120));
        detail.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,45));

        var name=new TextBox{Dock=DockStyle.Fill};
        var group=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="AD",ValueMember="KOD"};
        var start=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd"};
        var end=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd"};
        var total=new TextBox{ReadOnly=true,Width=48,TextAlign=HorizontalAlignment.Center};
        var minusDay=new TextBox{ReadOnly=true,Width=42,Text="00",TextAlign=HorizontalAlignment.Center};
        var minusTime=new TextBox{ReadOnly=true,Width=62,Text="07:30",TextAlign=HorizontalAlignment.Center};
        var plusDay=new TextBox{ReadOnly=true,Width=42,Text="01",TextAlign=HorizontalAlignment.Center};
        var startFilter=new DateTimePicker{Width=145,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=DateTime.Today.AddYears(-7)};
        var endFilter=new DateTimePicker{Width=145,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=DateTime.Today};

        AddPeriodRow(detail,0,"Dönem Adı",name);
        AddPeriodRow(detail,1,"Grubu",group);
        AddPeriodRow(detail,2,"Başlangıç",start);
        AddPeriodRow(detail,3,"Bitiş Tarihi",end);
        detail.Controls.Add(new Label{Text="Toplam Gün Sayısı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},2,2);
        detail.Controls.Add(total,3,2);
        detail.Controls.Add(new Label{Text="Dönemlik Çalışma Eksiği",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,4);
        detail.Controls.Add(WrapValue(minusDay,"Gün"),1,4);
        detail.Controls.Add(new Label{Text="Çalışma Eksiği Süre",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,5);
        detail.Controls.Add(WrapValue(minusTime,""),1,5);
        detail.Controls.Add(new Label{Text="Dönemlik Çalışma Fazlası",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,6);
        detail.Controls.Add(WrapValue(plusDay,"Gün"),1,6);

        var filterBox=new GroupBox{Text="Filtreleme Bilgileri",Dock=DockStyle.Fill};
        var filterFlow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(5,7,0,0)};
        filterFlow.Controls.Add(startFilter); filterFlow.Controls.Add(new Label{Text="ile",AutoSize=true,Padding=new Padding(4,5,4,0)}); filterFlow.Controls.Add(endFilter);
        filterBox.Controls.Add(filterFlow); detail.Controls.Add(filterBox,0,8); detail.SetColumnSpan(filterBox,4);
        var filterButtons=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=false};
        var allPeriods=ClassicDialogButton("Tüm Dönemleri Listele",155);
        var between=ClassicDialogButton("Arasındaki Dönemler",150);
        filterButtons.Controls.Add(allPeriods); filterButtons.Controls.Add(between);
        detail.Controls.Add(filterButtons,0,9); detail.SetColumnSpan(filterButtons,4);
        root.Controls.Add(detail,1,0);

        var bar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(2,7,2,1),WrapContents=false};
        var close=ClassicDialogButton("Kapat",80); close.DialogResult=DialogResult.Cancel;
        var deleteAll=ClassicDialogButton("Tümünü Sil",95);
        var delete=ClassicDialogButton("Sil",72);
        var edit=ClassicDialogButton("Değiştir",88);
        var add=ClassicDialogButton("Yeni Ekle",94);
        var save=ClassicDialogButton("Kaydet",82); save.Enabled=false;
        bar.Controls.Add(close);bar.Controls.Add(deleteAll);bar.Controls.Add(delete);bar.Controls.Add(edit);bar.Controls.Add(add);bar.Controls.Add(save);
        root.Controls.Add(bar,0,1);root.SetColumnSpan(bar,2);
        dialog.Controls.Add(root); dialog.CancelButton=close;

        int? editingCode=null;
        bool isNew=false;
        void BindGroups()
        {
            group.DataSource=Q("select KOD,AD from GRUP order by KOD");
        }
        void UpdateTotal()
        {
            total.Text=Math.Max(0,(end.Value.Date-start.Value.Date).Days+1).ToString();
        }
        void SetEditMode(bool enabled)
        {
            name.ReadOnly=!enabled; group.Enabled=enabled; start.Enabled=enabled; end.Enabled=enabled; save.Enabled=enabled;
        }
        void LoadSelected()
        {
            if(list.CurrentRow is null) return;
            editingCode=Convert.ToInt32(list.CurrentRow.Cells["KOD"].Value); isNew=false;
            name.Text=Convert.ToString(list.CurrentRow.Cells["AD"].Value)??"";
            if(list.CurrentRow.Cells["GRUP"].Value!=DBNull.Value) group.SelectedValue=Convert.ToInt32(list.CurrentRow.Cells["GRUP"].Value);
            if(list.CurrentRow.Cells["BASTAR"].Value!=DBNull.Value) start.Value=Convert.ToDateTime(list.CurrentRow.Cells["BASTAR"].Value);
            if(list.CurrentRow.Cells["BITTAR"].Value!=DBNull.Value) end.Value=Convert.ToDateTime(list.CurrentRow.Cells["BITTAR"].Value);
            UpdateTotal(); SetEditMode(false);
        }
        void ConfigureColumns()
        {
            if(list.Columns.Contains("AD")) list.Columns["AD"].HeaderText="Dönem Adı";
            foreach(var c in new[]{"KOD","BASTAR","BITTAR","GRUP","GRUP_AD"}) if(list.Columns.Contains(c)) list.Columns[c].Visible=false;
        }
        void RefreshGrid(bool filtered=false)
        {
            var sql="select D.KOD,D.AD,D.BASTAR,D.BITTAR,D.GRUP,G.AD GRUP_AD from DONEM D left join GRUP G on G.KOD=D.GRUP";
            DataTable rows;
            if(filtered)
                rows=Q(sql+" where D.BASTAR<=@B and D.BITTAR>=@A order by D.BASTAR,D.GRUP",new FbParameter("@A",startFilter.Value.Date),new FbParameter("@B",endFilter.Value.Date));
            else rows=Q(sql+" order by D.BASTAR,D.GRUP");
            list.DataSource=rows; ConfigureColumns();
            if(list.Rows.Count>0){list.Rows[0].Selected=true;list.CurrentCell=list.Rows[0].Cells.Cast<DataGridViewCell>().First(c=>c.Visible);LoadSelected();}
            else {editingCode=null;name.Clear();SetEditMode(false);}
        }
        void SaveCurrent()
        {
            var groupCode=group.SelectedValue is null?0:Convert.ToInt32(group.SelectedValue);
            PeriodDefinitionGuard.Validate(start.Value,end.Value,groupCode);
            var periodName=RequiredName(name.Text);
            if(isNew)
            {
                if(PeriodDefinitionGuard.IsDuplicate(db,groupCode,start.Value,end.Value)) throw new InvalidOperationException("Aynı grup ve tarih aralığına sahip dönem zaten var.");
                Exec("insert into DONEM (KOD,AD,BASTAR,BITTAR,GRUP) values (@K,@AD,@A,@B,@G)",
                    new FbParameter("@K",Next("DONEM","KOD")),new FbParameter("@AD",periodName),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date),new FbParameter("@G",groupCode));
            }
            else
            {
                if(editingCode is null) throw new InvalidOperationException("Bir dönem seçin.");
                if(PeriodDefinitionGuard.IsDuplicate(db,groupCode,start.Value,end.Value,editingCode.Value)) throw new InvalidOperationException("Aynı grup ve tarih aralığına sahip dönem zaten var.");
                Exec("update DONEM set AD=@AD,BASTAR=@A,BITTAR=@B,GRUP=@G where KOD=@K",
                    new FbParameter("@AD",periodName),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date),new FbParameter("@G",groupCode),new FbParameter("@K",editingCode.Value));
            }
            LoadPeriods(); RefreshGrid();
        }
        void Safe(Action action)
        {
            try{action();}
            catch(Exception ex){MessageBox.Show(ex.Message,"Dönem Tanımlamaları",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
        }

        list.SelectionChanged+=(_,_)=>{if(!save.Enabled)LoadSelected();};
        start.ValueChanged+=(_,_)=>UpdateTotal(); end.ValueChanged+=(_,_)=>UpdateTotal();
        between.Click+=(_,_)=>Safe(()=>RefreshGrid(true)); allPeriods.Click+=(_,_)=>Safe(()=>RefreshGrid(false));
        add.Click+=(_,_)=>Safe(()=>{editingCode=null;isNew=true;name.Clear();start.Value=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);end.Value=start.Value.AddMonths(1).AddDays(-1);SetEditMode(true);name.Focus();UpdateTotal();});
        edit.Click+=(_,_)=>Safe(()=>{if(editingCode is null)throw new InvalidOperationException("Bir dönem seçin.");isNew=false;SetEditMode(true);name.Focus();});
        save.Click+=(_,_)=>Safe(SaveCurrent);
        delete.Click+=(_,_)=>Safe(()=>{if(editingCode is null)throw new InvalidOperationException("Bir dönem seçin.");if(MessageBox.Show("Seçili dönem silinsin mi?","Dönem Tanımlamaları",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;Exec("delete from DONEM where KOD=@K",new FbParameter("@K",editingCode.Value));LoadPeriods();RefreshGrid();});
        deleteAll.Click+=(_,_)=>Safe(()=>{if(MessageBox.Show("Bütün dönem kayıtları silinecek. Devam edilsin mi?","Dönem Tanımlamaları",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;Exec("delete from DONEM");LoadPeriods();RefreshGrid();});

        try{BindGroups();SetEditMode(false);RefreshGrid();}
        catch(Exception ex){MessageBox.Show("Dönemler okunamadı: "+ex.Message,"Dönem Tanımlamaları",MessageBoxButtons.OK,MessageBoxIcon.Error);return;}
        dialog.ShowDialog(DialogOwner()); LoadPeriods();
    }

    static Control WrapValue(Control value,string suffix)
    {
        var flow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty};
        flow.Controls.Add(value); if(!string.IsNullOrWhiteSpace(suffix)) flow.Controls.Add(new Label{Text=suffix,AutoSize=true,Padding=new Padding(3,4,0,0)});
        return flow;
    }

    static void AddPeriodRow(TableLayoutPanel table,int row,string label,Control control)
    {
        table.Controls.Add(new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,row);
        table.Controls.Add(control,1,row); table.SetColumnSpan(control,3);
    }

    public void ShowWorkingDateDialog()
    {
        using var dialog=new Form
        {
            Text="Çalışma Tarihi",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(205,83),
            FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,ShowInTaskbar=false,Font=Font
        };
        var date=new DateTimePicker{Format=DateTimePickerFormat.Short,Value=SelectedWorkingDate,Width=105,Location=new Point(82,12)};
        var label=new Label{Text="Çalışma Tarihi",AutoSize=true,Location=new Point(8,16)};
        var select=new Button{Text="✓  Seç",Width=98,Height=29,Location=new Point(55,46),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),DialogResult=DialogResult.OK};
        dialog.Controls.Add(label);dialog.Controls.Add(date);dialog.Controls.Add(select);dialog.AcceptButton=select;
        if(dialog.ShowDialog(DialogOwner())==DialogResult.OK) SelectedWorkingDate=date.Value.Date;
    }

    bool NameDialog(string title,string current,out string value)
    {
        using var dialog=Dialog(title,430,155);dialog.FormBorderStyle=FormBorderStyle.FixedDialog;
        var panel=Root(2);panel.ColumnCount=2;panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        panel.Controls.Add(new Label{Text="Tanım adı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);
        var input=new TextBox{Text=current,Dock=DockStyle.Fill};panel.Controls.Add(input,1,0);
        var ok=ClassicDialogButton("Kaydet",90);ok.DialogResult=DialogResult.OK;panel.Controls.Add(ok,1,1);
        dialog.Controls.Add(panel);dialog.AcceptButton=ok;var accepted=dialog.ShowDialog(DialogOwner())==DialogResult.OK;value=input.Text;return accepted;
    }

    Button ClassicDialogButton(string text,int width)=>new(){Text=text,Width=width,Height=30,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),UseVisualStyleBackColor=true};
    Form Dialog(string title,int width,int height)=>new(){Text=title,StartPosition=FormStartPosition.CenterParent,Size=new Size(width,height),MinimumSize=new Size(Math.Max(220,width-100),Math.Max(150,height-100)),Font=Font,ShowInTaskbar=false};
    static TableLayoutPanel Root(int rows)=>new(){Dock=DockStyle.Fill,RowCount=rows,Padding=new Padding(8)};
    static DataGridView Grid()=>new(){Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BackgroundColor=Color.White};
    static DataGridViewRow SelectedRow(DataGridView grid)=>grid.CurrentRow??throw new InvalidOperationException("Bir satır seçin.");
    static string RequiredName(string value)=>string.IsNullOrWhiteSpace(value)?throw new ArgumentException("Ad alanı zorunludur."):value.Trim();
    sealed record DefinitionType(string Label,string Table,OrganizationDefinitionKind Kind);
}
