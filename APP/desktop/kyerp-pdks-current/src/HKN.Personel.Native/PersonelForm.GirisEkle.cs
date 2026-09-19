using FirebirdSql.Data.FirebirdClient;
using System.Data;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void ShowGirisCikisEkleme()
    {
        using var d=new Form{Text="Giriş Çıkış Ekleme",StartPosition=FormStartPosition.CenterParent,Size=new Size(900,525),MinimumSize=new Size(900,525),Font=Font};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(7)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,86));
        var filters=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,RowCount=2};
        for(int i=0;i<6;i++)filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16.66f));
        var fg=NewFilterBox();var fb=NewFilterBox();var fs=NewFilterBox();var fd=NewFilterBox();var fo=NewFilterBox();var ff=NewFilterBox();
        ComboBox[] boxes={fg,fb,fs,fd,fo,ff};string[] labels={"Grup","Bölüm","Servis","Durum","Görev","Firma"};
        for(int i=0;i<boxes.Length;i++){filters.Controls.Add(new Label{Text=labels[i],AutoSize=true,Margin=new Padding(3,3,3,0)},i,0);filters.Controls.Add(boxes[i],i,1);}root.Controls.Add(filters,0,0);
        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,47));body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,62));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,53));
        var left=PeopleGrid();var right=PeopleGrid();
        var mid=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,Padding=new Padding(7,55,7,0)};
        var one=new Button{Text=">",Width=42};var all=new Button{Text=">>",Width=42};var back=new Button{Text="<",Width=42};var clear=new Button{Text="<<",Width=42};
        mid.Controls.Add(one);mid.Controls.Add(all);mid.Controls.Add(back);mid.Controls.Add(clear);
        body.Controls.Add(left,0,0);body.Controls.Add(mid,1,0);body.Controls.Add(right,2,0);root.Controls.Add(body,0,1);
        var allPeople=LoadGirisPeople();var chosen=allPeople.Clone();left.DataSource=allPeople;right.DataSource=chosen;SetupPeopleGrid(left);SetupPeopleGrid(right);FillFilterBoxes(boxes,allPeople);
        if(!string.IsNullOrEmpty(currentPk)){var rows=allPeople.Select("PKNO='"+currentPk.Replace("'","''")+"'");if(rows.Length>0)chosen.ImportRow(rows[0]);}
        void ApplyFilter(object? s=null,EventArgs? e=null)=>FilterPeople(allPeople,boxes,left);
        foreach(var b in boxes)b.SelectedIndexChanged+=ApplyFilter;
        one.Click+=(_,_)=>MoveSelected(left,chosen);all.Click+=(_,_)=>MoveAll(left,chosen);back.Click+=(_,_)=>RemoveSelected(right,chosen);clear.Click+=(_,_)=>chosen.Clear();
        var bottom=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,Padding=new Padding(2,8,2,0)};
        bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,88));bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,165));bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,88));bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,165));bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,176));
        var gir=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="dd.MM.yyyy HH:mm",Value=DateTime.Today.AddHours(8).AddMinutes(30),Width=158};
        var cik=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="dd.MM.yyyy HH:mm",Value=DateTime.Today.AddHours(19),Width=158};
        var tol=new NumericUpDown{Minimum=0,Maximum=180,Value=0,Width=60};
        bottom.Controls.Add(new Label{Text="Giriş Tarih/Saat",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);bottom.Controls.Add(gir,1,0);
        bottom.Controls.Add(new Label{Text="Çıkış Tarih/Saat",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},2,0);bottom.Controls.Add(cik,3,0);
        var tp=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};tp.Controls.Add(new Label{Text="Tolerans (dk)",AutoSize=true,Padding=new Padding(0,6,4,0)});tp.Controls.Add(tol);bottom.Controls.Add(tp,4,0);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=false};var close=new Button{Text="Kapat",Width=76,Height=30,DialogResult=DialogResult.Cancel};var add=new Button{Text="Ekle",Width=86,Height=30,Font=new Font(Font,FontStyle.Bold)};actions.Controls.Add(close);actions.Controls.Add(add);bottom.Controls.Add(actions,5,0);
        add.Click+=(_,_)=>{try{if(chosen.Rows.Count==0)throw new ArgumentException("En az bir personel seçin.");PdksValidation.AttendanceRange(gir.Value,cik.Value);int n=InsertGirisCikis(chosen,gir.Value,cik.Value,(int)tol.Value);MessageBox.Show($"{n} personel için giriş/çıkış kaydı eklendi.","Giriş Çıkış Ekleme");RefreshFullTabs();d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){MessageBox.Show(ex.Message,"Giriş Çıkış Ekleme");}};
        root.Controls.Add(bottom,0,2);d.Controls.Add(root);d.CancelButton=close;d.ShowDialog(this);
    }

    ComboBox NewFilterBox()=>new(){Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};
    DataGridView PeopleGrid()=>new(){Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,RowHeadersVisible=false,BackgroundColor=Color.White};

    DataTable LoadGirisPeople()
    {
        var sql="select K.PKNO,K.AD,K.SOYAD,"+
            "coalesce((select AD from GRUP G where G.KOD=K.GRUP),'') GRUPAD,"+
            "coalesce((select AD from BOLUM B where B.KOD=K.BOLUM),'') BOLUMAD,"+
            "coalesce((select AD from SERVIS S where S.KOD=K.SERVIS),'') SERVISAD,"+
            "coalesce((select AD from DURUM D where D.KOD=K.DURUM),'') DURUMAD,"+
            "coalesce((select AD from GOREV R where R.KOD=K.GOREV),'') GOREVAD,"+
            "coalesce((select AD from FIRMA F where F.KOD=K.SIRKET),'') FIRMAAD "+
            "from KIMLIK K where K.ICTARIH is null order by K.PKNO";
        return Q(sql);
    }

    void SetupPeopleGrid(DataGridView g)
    {
        foreach(DataGridViewColumn c in g.Columns){var n=string.IsNullOrWhiteSpace(c.DataPropertyName)?c.Name:c.DataPropertyName;c.Visible=n=="PKNO"||n=="AD"||n=="SOYAD";if(n=="PKNO")c.Width=58;else if(n=="AD")c.Width=78;else if(n=="SOYAD")c.Width=88;}g.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None;
        if(g.Columns.Contains("PKNO"))g.Columns["PKNO"].HeaderText="Kart No";
        if(g.Columns.Contains("AD"))g.Columns["AD"].HeaderText="Adı";
        if(g.Columns.Contains("SOYAD"))g.Columns["SOYAD"].HeaderText="Soyadı";
    }

    void FillFilterBoxes(ComboBox[] boxes,DataTable t)
    {
        string[] cols={"GRUPAD","BOLUMAD","SERVISAD","DURUMAD","GOREVAD","FIRMAAD"};
        for(int i=0;i<boxes.Length;i++)
        {
            var vals=t.AsEnumerable().Select(r=>Convert.ToString(r[cols[i]])??"").Where(x=>x.Length>0).Distinct().OrderBy(x=>x).ToArray();
            boxes[i].Items.Clear();boxes[i].Items.Add("Tümü");boxes[i].Items.AddRange(vals);boxes[i].SelectedIndex=0;
        }
    }
    void FilterPeople(DataTable t,ComboBox[] boxes,DataGridView left)
    {
        string[] cols={"GRUPAD","BOLUMAD","SERVISAD","DURUMAD","GOREVAD","FIRMAAD"};var parts=new List<string>();
        for(int i=0;i<boxes.Length;i++)if(boxes[i].SelectedIndex>0)parts.Add(cols[i]+"='"+boxes[i].Text.Replace("'","''")+"'");
        t.DefaultView.RowFilter=string.Join(" AND ",parts);left.DataSource=t;
    }

    void MoveSelected(DataGridView source,DataTable chosen)
    {
        foreach(DataGridViewRow r in source.SelectedRows)AddChosen(chosen,Convert.ToString(r.Cells["PKNO"].Value)??"");
    }
    void MoveAll(DataGridView source,DataTable chosen){foreach(DataGridViewRow r in source.Rows)if(!r.IsNewRow)AddChosen(chosen,Convert.ToString(r.Cells["PKNO"].Value)??"");}
    void AddChosen(DataTable chosen,string pk){if(pk.Length==0||chosen.Select("PKNO='"+pk.Replace("'","''")+"'").Length>0)return;var src=LoadGirisPeople().Select("PKNO='"+pk.Replace("'","''")+"'");if(src.Length>0)chosen.ImportRow(src[0]);}
    void RemoveSelected(DataGridView right,DataTable chosen){foreach(DataGridViewRow r in right.SelectedRows){string pk=Convert.ToString(r.Cells["PKNO"].Value)??"";var rows=chosen.Select("PKNO='"+pk.Replace("'","''")+"'");foreach(var x in rows)x.Delete();}chosen.AcceptChanges();}

    int InsertGirisCikis(DataTable chosen,DateTime gir,DateTime cik,int tolerance)
    {
        int added=0;
        foreach(DataRow r in chosen.Rows)
        {
            string pk=Convert.ToString(r["PKNO"])??"";if(pk.Length==0)continue;
            var chk=Q("select count(*) N from GIRCIK where PKNO=@PK and GTARIH=@D",new FbParameter("@PK",pk),new FbParameter("@D",gir.Date));
            if(Convert.ToInt32(chk.Rows[0][0])>0)continue;
            string gs=gir.ToString("HH:mm"),cs=cik.ToString("HH:mm");
            Exec("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA,MKOD) values (@S,@PK,@GD,@GS,@GM,@CD,@CS,@CM,'000')",
                new FbParameter("@S",Next("GIRCIK","SIRA")),new FbParameter("@PK",pk),new FbParameter("@GD",gir.Date),new FbParameter("@GS",gs),new FbParameter("@GM",gir.Hour*60+gir.Minute),new FbParameter("@CD",cik.Date),new FbParameter("@CS",cs),new FbParameter("@CM",cik.Hour*60+cik.Minute));
            added++;
        }
        return added;
    }
}
