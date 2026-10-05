using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class AnnualWorkPlanForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly ComboBox month=new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=118};
    readonly NumericUpDown year=new(){Minimum=2000,Maximum=2100,Width=82};
    readonly DataGridView grid=new()
    {
        Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        MultiSelect=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,RowHeadersVisible=false,
        AutoGenerateColumns=true,BackgroundColor=PdksAppearance.Current.Surface,BorderStyle=BorderStyle.None
    };
    readonly ComboBox plan=new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=230};
    readonly Label selected=new(){AutoSize=true};
    readonly Label info=new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};
    DateTime? selectedDate;
    int? selectedGroup;

    public AnnualWorkPlanForm()
    {
        Text="Yıllık Çalışma Takvimi";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(1280,760);
        MinimumSize=new Size(1040,640);
        Font=new Font("Segoe UI",9f);
        BackColor=PdksAppearance.Current.Canvas;
        var tr=new CultureInfo("tr-TR");
        month.Items.AddRange(DateTimeFormatInfo.GetInstance(tr).MonthNames.Take(12).Select(x=>x.ToUpper(tr)).Cast<object>().ToArray());
        month.SelectedIndex=DateTime.Today.Month-1;year.Value=DateTime.Today.Year;
        Build();
        Shown+=(_,_)=>{LoadPlans();Reload();};
        month.SelectedIndexChanged+=(_,_)=>Reload();
        year.ValueChanged+=(_,_)=>Reload();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=5,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,68));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,62));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));

        var hero=new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas};
        hero.Controls.Add(new Label{Text="Yıllık Çalışma Takvimi",Location=new Point(0,0),AutoSize=true,Font=new Font("Segoe UI",17f,FontStyle.Bold),ForeColor=p.Text});
        hero.Controls.Add(new Label{Text="Hangi tarihte hangi çalışma grubunun hangi günlük planı kullanacağını okunur şekilde yönetir. Geç/erken/mesai hesabı bu plana dayanır.",Location=new Point(2,36),AutoSize=true,ForeColor=p.Muted});
        root.Controls.Add(hero,0,0);

        var filters=PdksUiKit.Card(10);
        var flow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(10,7,0,0),BackColor=p.Surface};
        flow.Controls.Add(Field("Ay",month));flow.Controls.Add(Field("Yıl",year));
        var refresh=PdksUiKit.Button("Yenile",86,PdksActionRole.Primary,Reload);refresh.Margin=new Padding(8,8,0,0);flow.Controls.Add(refresh);
        var raw=PdksUiKit.Button("Teknik Kayıtlar",118,PdksActionRole.Quiet,OpenRaw);raw.Margin=new Padding(8,8,0,0);flow.Controls.Add(raw);
        filters.Controls.Add(flow);root.Controls.Add(filters,0,1);

        grid.RowTemplate.Height=31;grid.ColumnHeadersHeight=36;
        grid.SelectionChanged+=(_,_)=>LoadSelection();
        root.Controls.Add(grid,0,2);

        var edit=PdksUiKit.Card(10);
        var editFlow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(10,10,0,0),BackColor=p.Surface};
        selected.ForeColor=p.Text;selected.Font=new Font("Segoe UI",9f,FontStyle.Bold);selected.Width=320;selected.Padding=new Padding(0,8,0,0);
        editFlow.Controls.Add(selected);
        editFlow.Controls.Add(Field("Günlük Plan",plan));
        var save=PdksUiKit.Button("Seçili Güne Plan Ata",160,PdksActionRole.Primary,SavePlan);save.Margin=new Padding(10,8,0,0);editFlow.Controls.Add(save);
        edit.Controls.Add(editFlow);root.Controls.Add(edit,0,3);

        info.ForeColor=p.Muted;
        info.Text="Not: MESAİLİ / İDARİ grup ayrımı çalışma politikasını belirler. İDARİ grup kart takibinden muafsa takvim kaydı bordro/plan altyapısı için kalabilir.";
        root.Controls.Add(info,0,4);
        Controls.Add(root);
    }

    Control Field(string text,Control c)
    {
        var p=PdksAppearance.Current;
        var panel=new TableLayoutPanel{Width=c.Width+24,Height=44,RowCount=2,BackColor=p.Surface,Margin=new Padding(0,0,10,0)};
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute,16));panel.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        panel.Controls.Add(new Label{Text=text,Dock=DockStyle.Fill,ForeColor=p.Muted,Font=new Font("Segoe UI",8f)},0,0);
        c.Dock=DockStyle.Fill;panel.Controls.Add(c,0,1);return panel;
    }

    void LoadPlans()
    {
        try
        {
            var dt=db.Query("select KOD,AD,IGIRISS,GGTOL,DCIKISS,ECTOL,DEVAMSIZLIK from PUANBILGI order by KOD");
            var display=new DataTable();display.Columns.Add("KOD",typeof(int));display.Columns.Add("TEXT");
            foreach(DataRow r in dt.Rows)
            {
                var code=Convert.ToInt32(r["KOD"]);var name=Convert.ToString(r["AD"])?.Trim()??$"Plan {code}";
                display.Rows.Add(code,$"{name}  •  {Clock(r["IGIRISS"])} → {Clock(r["DCIKISS"])}");
            }
            plan.DataSource=display;plan.DisplayMember="TEXT";plan.ValueMember="KOD";
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"WorkPlan.LoadPlans");}
    }

    void Reload()
    {
        if(month.SelectedIndex<0)return;
        try
        {
            var a=new DateTime((int)year.Value,month.SelectedIndex+1,1);var b=a.AddMonths(1);
            var dt=db.Query(@"select p.TARIH,p.GKOD,coalesce(g.AD,'Tanımsız Grup') GRUP_AD,p.MTKOD,
                coalesce(w.AD,'Tanımsız Plan') PLAN_AD,w.IGIRISS,w.GGTOL,w.DCIKISS,w.ECTOL,w.DEVAMSIZLIK,p.AGKOD
                from PLANA p left join GRUP g on g.KOD=p.GKOD left join PUANBILGI w on w.KOD=p.MTKOD
                where p.TARIH>=@A and p.TARIH<@B order by p.TARIH,p.GKOD",
                new FbParameter("@A",a),new FbParameter("@B",b));
            var outTable=new DataTable();
            foreach(var c in new[]{"Tarih","Gün","Çalışma Grubu","Günlük Plan","Planlanan Giriş","Giriş Tolerans","Planlanan Çıkış","Çıkış Tolerans","Çalışma Süresi","GKOD","MTKOD","AGKOD"})outTable.Columns.Add(c);
            foreach(DataRow r in dt.Rows)
            {
                var d=Convert.ToDateTime(r["TARIH"]).Date;
                outTable.Rows.Add(d.ToString("dd.MM.yyyy"),d.ToString("dddd",new CultureInfo("tr-TR")),
                    Convert.ToString(r["GRUP_AD"])??"",Convert.ToString(r["PLAN_AD"])??"",
                    Clock(r["IGIRISS"]),Clock(r["GGTOL"]),Clock(r["DCIKISS"]),Clock(r["ECTOL"]),Clock(r["DEVAMSIZLIK"]),
                    Convert.ToString(r["GKOD"])??"",Convert.ToString(r["MTKOD"])??"",Convert.ToString(r["AGKOD"])??"");
            }
            grid.DataSource=outTable;
            foreach(var n in new[]{"GKOD","MTKOD","AGKOD"})if(grid.Columns.Contains(n))grid.Columns[n].Visible=false;
            if(grid.Columns.Contains("Çalışma Grubu"))grid.Columns["Çalışma Grubu"].Width=150;
            if(grid.Columns.Contains("Günlük Plan"))grid.Columns["Günlük Plan"].AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill;
            info.Text=$"{a:MMMM yyyy} • {dt.Rows.Count:N0} plan kaydı • Teknik kodlar arka planda korunur; 'Teknik Kayıtlar' ile ayrıca görülebilir.";
            LoadSelection();
        }
        catch(Exception ex){grid.DataSource=null;PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"WorkPlan.Reload");}
    }

    void LoadSelection()
    {
        selectedDate=null;selectedGroup=null;selected.Text="Bir gün seçin";
        if(grid.CurrentRow is null)return;
        if(!DateTime.TryParse(Convert.ToString(grid.CurrentRow.Cells["Tarih"].Value),out var d))return;
        selectedDate=d.Date;
        selectedGroup=int.TryParse(Convert.ToString(grid.CurrentRow.Cells["GKOD"].Value),out var g)?g:null;
        if(int.TryParse(Convert.ToString(grid.CurrentRow.Cells["MTKOD"].Value),out var m))plan.SelectedValue=m;
        selected.Text=$"{d:dd.MM.yyyy} • {Convert.ToString(grid.CurrentRow.Cells["Çalışma Grubu"].Value)}";
    }

    void SavePlan()
    {
        if(!selectedDate.HasValue||!selectedGroup.HasValue||plan.SelectedValue is null){MessageBox.Show("Önce takvimden bir gün seçin.",Text);return;}
        try
        {
            var code=Convert.ToInt32(plan.SelectedValue);
            db.Execute("update PLANA set MTKOD=@M where TARIH=@T and GKOD=@G",
                new FbParameter("@M",code),new FbParameter("@T",selectedDate.Value),new FbParameter("@G",selectedGroup.Value));
            Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"WorkPlan.Save");}
    }

    void OpenRaw()
    {
        using var form=new LegacyTableBrowserForm("Yıllık Çalışma Planı • Teknik Kayıtlar","PLANA",true,new Size(1180,720));
        form.ShowDialog(this);Reload();
    }

    static string Clock(object value)
    {
        if(value is null||value==DBNull.Value)return "";
        if(int.TryParse(Convert.ToString(value),out var minute))
        {
            minute=Math.Max(0,minute);return $"{minute/60:00}:{minute%60:00}";
        }
        return Convert.ToString(value)??"";
    }
}
