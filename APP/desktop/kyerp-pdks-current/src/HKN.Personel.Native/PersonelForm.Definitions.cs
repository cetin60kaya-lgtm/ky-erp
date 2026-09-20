using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core.Definitions;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    static readonly DefinitionType[] OrganizationTypes =
    [
        new("Grup","GRUP",OrganizationDefinitionKind.Group),new("Bölüm","BOLUM",OrganizationDefinitionKind.Department),new("Durum","DURUM",OrganizationDefinitionKind.Status),
        new("Servis","SERVIS",OrganizationDefinitionKind.Service),new("Görev","GOREV",OrganizationDefinitionKind.Duty),new("Firma","FIRMA",OrganizationDefinitionKind.Company)
    ];

    void ShowOrganizationDefinitions(string? presetLabel=null)
    {
        using var dialog=Dialog("Organizasyon Tanımları",680,520);var root=Root(3);root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        var type=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Width=220,DisplayMember=nameof(DefinitionType.Label),DataSource=OrganizationTypes};
        if(!string.IsNullOrWhiteSpace(presetLabel))
        {
            var index=Array.FindIndex(OrganizationTypes,x=>x.Label.Equals(presetLabel,StringComparison.OrdinalIgnoreCase));
            if(index>=0) type.SelectedIndex=index;
        }
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill};top.Controls.Add(new Label{Text="Tanım türü",AutoSize=true,Padding=new Padding(0,7,8,0)});top.Controls.Add(type);root.Controls.Add(top,0,0);
        var grid=Grid();root.Controls.Add(grid,0,1);var bar=Bar(out var close,out var edit,out var add,out var delete);root.Controls.Add(bar,0,2);dialog.Controls.Add(root);dialog.AcceptButton=close;
        DefinitionType Selected()=>type.SelectedItem as DefinitionType??throw new InvalidOperationException("Tanım türü seçin.");
        void RefreshGrid(){var value=Selected();grid.DataSource=Q($"select KOD,AD from {value.Table} order by AD");dialog.Text=value.Label+" Tanımları";}
        void Run(Action action){try{action();RefreshGrid();}catch(Exception ex){MessageBox.Show(ex.Message,"Organizasyon Tanımları",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
        type.SelectedValueChanged+=(_,_)=>RefreshGrid();
        add.Click+=(_,_)=>Run(()=>{var value=Selected();if(!NameDialog("Yeni "+value.Label,"",out var name))return;Exec($"insert into {value.Table} (KOD,AD) values (@K,@A)",new FbParameter("@K",Next(value.Table,"KOD")),new FbParameter("@A",RequiredName(name)));});
        edit.Click+=(_,_)=>Run(()=>{var value=Selected();var row=SelectedRow(grid);if(!NameDialog(value.Label+" Düzenle",Convert.ToString(row.Cells["AD"].Value)??"",out var name))return;Exec($"update {value.Table} set AD=@A where KOD=@K",new FbParameter("@A",RequiredName(name)),new FbParameter("@K",row.Cells["KOD"].Value));});
        delete.Click+=(_,_)=>Run(()=>{var value=Selected();var row=SelectedRow(grid);var code=row.Cells["KOD"].Value;var usage=DefinitionUsageGuard.FindUsage(db,value.Kind,code);if(usage.Count>0)throw new InvalidOperationException(DefinitionUsageGuard.BlockMessage(usage));if(MessageBox.Show("Seçili tanım silinsin mi?","Organizasyon Tanımları",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)==DialogResult.Yes)Exec($"delete from {value.Table} where KOD=@K",new FbParameter("@K",code));});
        RefreshGrid();dialog.ShowDialog(this);Reload();
    }

    void ShowPeriodDefinitions()
    {
        using var dialog=Dialog("Dönem Tanımları",760,520);var root=Root(2);root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));var grid=Grid();root.Controls.Add(grid,0,0);var bar=Bar(out var close,out var edit,out var add,out var delete);delete.Visible=false;root.Controls.Add(bar,0,1);dialog.Controls.Add(root);dialog.AcceptButton=close;
        void RefreshGrid()=>grid.DataSource=Q("select D.KOD,D.AD,D.BASTAR,D.BITTAR,D.GRUP,G.AD GRUP_AD from DONEM D left join GRUP G on G.KOD=D.GRUP order by D.BASTAR desc,D.GRUP");
        void Run(Action action){try{action();RefreshGrid();LoadPeriods();}catch(Exception ex){MessageBox.Show(ex.Message,"Dönem Tanımları",MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
        add.Click+=(_,_)=>Run(()=>{var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);var value=new PeriodValue("",first,first.AddMonths(1).AddDays(-1),0);if(!PeriodDialog(ref value))return;if(PeriodDefinitionGuard.IsDuplicate(db,value.Group,value.Start,value.End))throw new InvalidOperationException("Aynı grup ve tarih aralığına sahip dönem zaten var.");Exec("insert into DONEM (KOD,AD,BASTAR,BITTAR,GRUP) values (@K,@AD,@A,@B,@G)",new FbParameter("@K",Next("DONEM","KOD")),new FbParameter("@AD",value.Name),new FbParameter("@A",value.Start),new FbParameter("@B",value.End),new FbParameter("@G",value.Group));});
        edit.Click+=(_,_)=>Run(()=>{var row=SelectedRow(grid);var code=Convert.ToInt32(row.Cells["KOD"].Value);var value=new PeriodValue(Convert.ToString(row.Cells["AD"].Value)??"",Convert.ToDateTime(row.Cells["BASTAR"].Value),Convert.ToDateTime(row.Cells["BITTAR"].Value),Convert.ToInt32(row.Cells["GRUP"].Value));if(!PeriodDialog(ref value))return;if(PeriodDefinitionGuard.IsDuplicate(db,value.Group,value.Start,value.End,code))throw new InvalidOperationException("Aynı grup ve tarih aralığına sahip dönem zaten var.");Exec("update DONEM set AD=@AD,BASTAR=@A,BITTAR=@B,GRUP=@G where KOD=@K",new FbParameter("@AD",value.Name),new FbParameter("@A",value.Start),new FbParameter("@B",value.End),new FbParameter("@G",value.Group),new FbParameter("@K",code));});
        RefreshGrid();dialog.ShowDialog(this);LoadPeriods();
    }

    bool PeriodDialog(ref PeriodValue value)
    {
        using var dialog=Dialog("Dönem",470,270);dialog.FormBorderStyle=FormBorderStyle.FixedDialog;var panel=Root(5);panel.ColumnCount=2;panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));var name=new TextBox{Text=value.Name,Dock=DockStyle.Fill};var start=new DateTimePicker{Value=value.Start,Format=DateTimePickerFormat.Short,Dock=DockStyle.Fill};var end=new DateTimePicker{Value=value.End,Format=DateTimePickerFormat.Short,Dock=DockStyle.Fill};var groups=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Fill,DisplayMember="AD",ValueMember="KOD",DataSource=Q("select KOD,AD from GRUP order by AD")};if(value.Group!=0)groups.SelectedValue=value.Group;Control[] fields=[name,start,end,groups];string[] labels=["Dönem adı","Başlangıç","Bitiş","Grup"];for(var i=0;i<4;i++){panel.Controls.Add(new Label{Text=labels[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,i);panel.Controls.Add(fields[i],1,i);}var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK,Width=90};panel.Controls.Add(ok,1,4);dialog.Controls.Add(panel);dialog.AcceptButton=ok;if(dialog.ShowDialog(this)!=DialogResult.OK)return false;var group=groups.SelectedValue is null?0:Convert.ToInt32(groups.SelectedValue);PeriodDefinitionGuard.Validate(start.Value,end.Value,group);value=new PeriodValue(RequiredName(name.Text),start.Value.Date,end.Value.Date,group);return true;
    }

    bool NameDialog(string title,string current,out string value){using var dialog=Dialog(title,430,155);dialog.FormBorderStyle=FormBorderStyle.FixedDialog;var panel=Root(2);panel.ColumnCount=2;panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));panel.Controls.Add(new Label{Text="Tanım adı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);var input=new TextBox{Text=current,Dock=DockStyle.Fill};panel.Controls.Add(input,1,0);var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK};panel.Controls.Add(ok,1,1);dialog.Controls.Add(panel);dialog.AcceptButton=ok;var accepted=dialog.ShowDialog(this)==DialogResult.OK;value=input.Text;return accepted;}
    Form Dialog(string title,int width,int height)=>new(){Text=title,StartPosition=FormStartPosition.CenterParent,Size=new Size(width,height),MinimumSize=new Size(width-100,height-100),Font=Font};
    static TableLayoutPanel Root(int rows)=>new(){Dock=DockStyle.Fill,RowCount=rows,Padding=new Padding(8)};
    static DataGridView Grid()=>new(){Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BackgroundColor=Color.White};
    static FlowLayoutPanel Bar(out Button close,out Button edit,out Button add,out Button delete){var bar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(3,7,3,3)};close=new Button{Text="Kapat",Width=90,DialogResult=DialogResult.OK};delete=new Button{Text="Sil",Width=90};edit=new Button{Text="Düzenle",Width=90};add=new Button{Text="Yeni",Width=90};bar.Controls.Add(close);bar.Controls.Add(delete);bar.Controls.Add(edit);bar.Controls.Add(add);return bar;}
    static DataGridViewRow SelectedRow(DataGridView grid)=>grid.CurrentRow??throw new InvalidOperationException("Bir satır seçin.");
    static string RequiredName(string value)=>string.IsNullOrWhiteSpace(value)?throw new ArgumentException("Ad alanı zorunludur."):value.Trim();
    sealed record DefinitionType(string Label,string Table,OrganizationDefinitionKind Kind);
    sealed record PeriodValue(string Name,DateTime Start,DateTime End,int Group);
}
