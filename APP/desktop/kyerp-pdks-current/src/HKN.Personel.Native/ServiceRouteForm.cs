using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class ServiceRouteForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly DataGridView grid=new()
    {
        Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
        MultiSelect=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,RowHeadersVisible=false,
        AutoGenerateColumns=true,BackgroundColor=PdksAppearance.Current.Surface,BorderStyle=BorderStyle.None
    };
    readonly TextBox name=new();
    readonly CheckBox active=new(){Text="Aktif servis hattı",AutoSize=true};
    readonly TextBox morning=new(){PlaceholderText="07:00"};
    readonly TextBox evening=new(){PlaceholderText="19:15"};
    readonly TextBox plate=new();
    readonly TextBox driver=new();
    readonly TextBox phone=new();
    readonly TextBox stops=new(){Multiline=true,ScrollBars=ScrollBars.Vertical};
    readonly TextBox notes=new(){Multiline=true,ScrollBars=ScrollBars.Vertical};
    readonly Label assigned=new(){AutoSize=true};
    readonly Label info=new(){AutoSize=true};
    readonly Button save;
    int? selectedCode;
    bool editing;

    public ServiceRouteForm()
    {
        Text="Servis Hatları";
        StartPosition=FormStartPosition.CenterParent;
        Size=new Size(1280,760);
        MinimumSize=new Size(1080,660);
        Font=new Font("Segoe UI",9f);
        BackColor=PdksAppearance.Current.Canvas;
        save=PdksUiKit.Button("Kaydet",100,PdksActionRole.Primary,Save);
        Build();
        Shown+=(_,_)=>Reload();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=3,Padding=new Padding(16),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var hero=new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas};
        hero.Controls.Add(new Label{Text="Personel Servis Hatları",Location=new Point(0,2),AutoSize=true,Font=new Font("Segoe UI",17f,FontStyle.Bold),ForeColor=p.Text});
        hero.Controls.Add(new Label{Text="Personelin ulaşım hattını, saatlerini, araç/şoför bilgisini ve duraklarını yönet. Personel kartındaki Servis alanı bu hatlara bağlanır.",Location=new Point(2,38),AutoSize=true,ForeColor=p.Muted});
        root.Controls.Add(hero,0,0);

        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,BackColor=p.Canvas};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,45));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,12));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,55));

        var listCard=PdksUiKit.Card(12);
        grid.RowTemplate.Height=31;grid.ColumnHeadersHeight=36;
        grid.SelectionChanged+=(_,_)=>{if(!editing)LoadSelection();};
        listCard.Controls.Add(grid);body.Controls.Add(listCard,0,0);
        body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas},1,0);

        var editCard=PdksUiKit.Card(16);
        var editor=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=10,Padding=new Padding(14),BackColor=p.Surface};
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));
        editor.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        editor.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        for(var i=1;i<=7;i++)editor.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        editor.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        editor.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        editor.Controls.Add(PdksUiKit.SectionTitle("Hat Bilgileri"),0,0);editor.SetColumnSpan(editor.GetControlFromPosition(0,0)!,2);
        Row(editor,1,"Servis Hattı",name);
        Row(editor,2,"Durum",active);
        Row(editor,3,"Sabah Çıkış",morning);
        Row(editor,4,"Akşam Dönüş",evening);
        Row(editor,5,"Araç / Plaka",plate);
        Row(editor,6,"Şoför",driver);
        Row(editor,7,"Şoför Telefon",phone);
        Row(editor,8,"Duraklar / Güzergâh",stops);
        Row(editor,9,"Not",notes);
        assigned.ForeColor=p.Primary;assigned.Font=new Font("Segoe UI",9f,FontStyle.Bold);
        info.ForeColor=p.Muted;
        var stats=new FlowLayoutPanel{Dock=DockStyle.Bottom,Height=34,BackColor=p.Surface,Padding=new Padding(0,7,0,0)};
        stats.Controls.Add(assigned);stats.Controls.Add(new Label{Text="   •   ",AutoSize=true,ForeColor=p.Muted});stats.Controls.Add(info);
        editCard.Controls.Add(editor);editCard.Controls.Add(stats);body.Controls.Add(editCard,2,0);
        root.Controls.Add(body,0,1);

        var bar=PdksUiKit.ActionBar(true,p.Canvas);
        var add=PdksUiKit.Button("Yeni Hat",100,PdksActionRole.Secondary,BeginNew);
        var edit=PdksUiKit.Button("Düzenle",96,PdksActionRole.Secondary,BeginEdit);
        var del=PdksUiKit.Button("Sil",82,PdksActionRole.Danger,Delete);
        var refresh=PdksUiKit.Button("Yenile",86,PdksActionRole.Quiet,Reload);
        save.Enabled=false;
        bar.Controls.Add(save);bar.Controls.Add(del);bar.Controls.Add(edit);bar.Controls.Add(add);bar.Controls.Add(refresh);
        root.Controls.Add(bar,0,2);
        Controls.Add(root);
        SetEdit(false);
    }

    static void Row(TableLayoutPanel t,int row,string label,Control c)
    {
        t.Controls.Add(PdksUiKit.FieldLabel(label),0,row);
        c.Dock=DockStyle.Fill;c.Margin=new Padding(0,6,0,6);t.Controls.Add(c,1,row);
    }

    void Reload()
    {
        try
        {
            var services=db.Query(@"select s.KOD,s.AD,
                (select count(*) from KIMLIK k where k.SERVIS=s.KOD and k.ICTARIH is null) PERSONEL
                from SERVIS s order by s.KOD");
            var profiles=ServiceRouteStore.Load();
            var table=new DataTable();
            table.Columns.Add("Kod",typeof(int));table.Columns.Add("Servis Hattı");table.Columns.Add("Aktif");
            table.Columns.Add("Sabah");table.Columns.Add("Akşam");table.Columns.Add("Araç / Plaka");table.Columns.Add("Personel",typeof(int));
            foreach(DataRow r in services.Rows)
            {
                var code=Convert.ToInt32(r["KOD"]);profiles.TryGetValue(code,out var profile);
                table.Rows.Add(code,Convert.ToString(r["AD"])??"",
                    profile is null||profile.Active?"Evet":"Hayır",
                    profile?.MorningDeparture??"",profile?.EveningReturn??"",profile?.VehiclePlate??"",
                    Convert.ToInt32(r["PERSONEL"]));
            }
            grid.DataSource=table;
            if(grid.Columns.Contains("Kod"))grid.Columns["Kod"].Width=55;
            if(grid.Columns.Contains("Servis Hattı"))grid.Columns["Servis Hattı"].AutoSizeMode=DataGridViewAutoSizeColumnMode.Fill;
            if(grid.Rows.Count>0)
            {
                if(selectedCode.HasValue)
                {
                    var row=grid.Rows.Cast<DataGridViewRow>().FirstOrDefault(x=>Convert.ToInt32(x.Cells["Kod"].Value)==selectedCode.Value);
                    if(row is not null)grid.CurrentCell=row.Cells["Servis Hattı"];
                }
                LoadSelection();
            }
            else Clear();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"Definitions.ServiceRoutes");}
    }

    void LoadSelection()
    {
        if(grid.CurrentRow is null)return;
        selectedCode=Convert.ToInt32(grid.CurrentRow.Cells["Kod"].Value);
        var service=db.Query("select KOD,AD from SERVIS where KOD=@K",new FbParameter("@K",selectedCode.Value));
        if(service.Rows.Count==0)return;
        name.Text=Convert.ToString(service.Rows[0]["AD"])??"";
        var profiles=ServiceRouteStore.Load();
        profiles.TryGetValue(selectedCode.Value,out var p);
        active.Checked=p?.Active??true;
        morning.Text=p?.MorningDeparture??"";
        evening.Text=p?.EveningReturn??"";
        plate.Text=p?.VehiclePlate??"";
        driver.Text=p?.DriverName??"";
        phone.Text=p?.DriverPhone??"";
        stops.Text=p?.Stops??"";
        notes.Text=p?.Notes??"";
        var count=Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SERVIS=@K and ICTARIH is null",new FbParameter("@K",selectedCode.Value))??0);
        assigned.Text=$"Aktif personel: {count:N0}";
        info.Text="Personel kartındaki Servis alanı bu hatta bağlıdır.";
    }

    void BeginNew()
    {
        selectedCode=null;Clear();active.Checked=true;SetEdit(true);name.Focus();
    }
    void BeginEdit()
    {
        if(selectedCode is null){MessageBox.Show("Bir servis hattı seçin.",Text);return;}
        SetEdit(true);name.Focus();
    }
    void SetEdit(bool value)
    {
        editing=value;
        foreach(var x in new Control[]{name,morning,evening,plate,driver,phone,stops,notes})x.Enabled=value;
        active.Enabled=value;save.Enabled=value;
    }
    void Clear()
    {
        foreach(var x in new[]{name,morning,evening,plate,driver,phone,stops,notes})x.Clear();
        active.Checked=true;assigned.Text="Aktif personel: 0";info.Text="";
    }

    void Save()
    {
        try
        {
            var routeName=name.Text.Trim();
            if(routeName.Length==0)throw new InvalidOperationException("Servis hattı adı boş bırakılamaz.");
            if(selectedCode is null)
            {
                selectedCode=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from SERVIS")??1);
                db.Execute("insert into SERVIS (KOD,AD) values (@K,@A)",new FbParameter("@K",selectedCode.Value),new FbParameter("@A",routeName));
            }
            else
            {
                db.Execute("update SERVIS set AD=@A where KOD=@K",new FbParameter("@A",routeName),new FbParameter("@K",selectedCode.Value));
            }
            ServiceRouteStore.Save(new ServiceRouteProfile(selectedCode.Value,routeName,active.Checked,
                morning.Text.Trim(),evening.Text.Trim(),plate.Text.Trim(),driver.Text.Trim(),phone.Text.Trim(),stops.Text.Trim(),notes.Text.Trim()));
            SetEdit(false);Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions.ServiceRoutes.Save");}
    }

    void Delete()
    {
        if(selectedCode is null)return;
        try
        {
            var used=Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where SERVIS=@K",new FbParameter("@K",selectedCode.Value))??0);
            if(used>0)throw new InvalidOperationException($"Bu servis hattına {used:N0} personel bağlı. Önce personellerin servis hattını değiştirin.");
            if(MessageBox.Show("Seçili servis hattı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
            db.Execute("delete from SERVIS where KOD=@K",new FbParameter("@K",selectedCode.Value));
            ServiceRouteStore.Remove(selectedCode.Value);selectedCode=null;SetEdit(false);Reload();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Definitions.ServiceRoutes.Delete");}
    }
}
