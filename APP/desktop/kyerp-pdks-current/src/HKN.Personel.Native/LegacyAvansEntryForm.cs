using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyAvansEntryForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly TabControl tabs = new(){Dock=DockStyle.Fill};
    readonly DataGridView bulkPeople = PeopleGrid();
    readonly ListBox selectedCodes = new(){Location=new Point(521,3),Size=new Size(51,393)};
    readonly ListBox selectedNames = new(){Location=new Point(572,3),Size=new Size(165,393)};
    readonly Dictionary<string,ComboBox> bulkFilters = new(StringComparer.OrdinalIgnoreCase);
    readonly DateTimePicker hiredAfter = new(){Location=new Point(4,2),Size=new Size(92,21),Format=DateTimePickerFormat.Short,Value=new DateTime(DateTime.Today.Year,1,1)};
    readonly DateTimePicker bulkDate = Picker(344,208);
    readonly DateTimePicker bulkIssueDate = Picker(344,232);
    readonly ComboBox bulkType = TypeBox(344,256,169);
    readonly CheckBox ratioCheck = new(){Text="Oran Olarak Ver",Location=new Point(416,283),Size=new Size(97,17)};
    readonly NumericUpDown ratio = new(){Location=new Point(344,280),Size=new Size(49,21),DecimalPlaces=2,Maximum=1000,Enabled=false};
    readonly NumericUpDown amount = new(){Location=new Point(344,304),Size=new Size(169,21),DecimalPlaces=2,Maximum=100000000};
    readonly TextBox bulkDescription = new(){Location=new Point(344,328),Size=new Size(169,21),MaxLength=250};

    readonly DataGridView singlePeople = PeopleGrid();
    readonly DateTimePicker singleDate = Picker(568,24);
    readonly DateTimePicker singleIssueDate = Picker(568,56);
    readonly ComboBox singleType = TypeBox(568,88,169);
    readonly TextBox singleDescription = new(){Location=new Point(568,120),Size=new Size(169,21),MaxLength=250};
    readonly NumericUpDown singleAmount = new(){Location=new Point(568,147),Size=new Size(169,21),DecimalPlaces=2,Maximum=100000000};
    readonly RadioButton allPeople = new(){Text="Tümü",Location=new Point(8,24),Size=new Size(49,17)};
    readonly RadioButton activePeople = new(){Text="Aktif Çalışanlar",Location=new Point(64,24),Size=new Size(89,17),Checked=true};
    readonly RadioButton leftPeople = new(){Text="İşten Ayrılanlar",Location=new Point(160,24),Size=new Size(89,17)};
    readonly RadioButton sortCard = new(){Text="Kart No",Location=new Point(8,24),Size=new Size(57,17),Checked=true};
    readonly RadioButton sortName = new(){Text="Ad",Location=new Point(88,24),Size=new Size(41,17)};
    readonly RadioButton sortSurname = new(){Text="Soyad",Location=new Point(152,24),Size=new Size(57,17)};
    DataTable? bulkSource;

    public LegacyAvansEntryForm()
    {
        Text="Ek Kesinti  ve Kazanç Girişleri";StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(764,508);
        FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;
        Font=new Font("Microsoft Sans Serif",8.25f);Build();Shown+=(_,_)=>LoadAll();
    }

    static DateTimePicker Picker(int x,int y)=>new(){Location=new Point(x,y),Size=new Size(169,21),Format=DateTimePickerFormat.Short,Value=DateTime.Today};
    static ComboBox TypeBox(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(TypeItem.Name),ValueMember=nameof(TypeItem.Code)};
    static Label L(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),AutoSize=true};
    static Button B(string text,int x,int y,int w=105)=>new(){Text=text,Location=new Point(x,y),Size=new Size(w,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};
    static DataGridView PeopleGrid()=>new(){BackgroundColor=Color.White,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,MultiSelect=true,SelectionMode=DataGridViewSelectionMode.FullRowSelect,RowHeadersWidth=18,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None};

    void Build()
    {
        tabs.TabPages.Add(BuildBulkTab());tabs.TabPages.Add(BuildSingleTab());Controls.Add(tabs);
    }

    TabPage BuildBulkTab()
    {
        var page=new TabPage("Toplu Giriş");
        page.Controls.Add(L("Tarihinden Sonra İşe Girenleri Gösterme",97,10));page.Controls.Add(hiredAfter);
        page.Controls.Add(L("Seçenekler",348,11));
        string[] names={"Grup","Bölüm","Servis","Durum","Görev","Firma"};string[] keys={"GRUP","BOLUM","SERVIS","DURUM","GOREV","SIRKET"};string[] tables={"GRUP","BOLUM","SERVIS","DURUM","GOREV","FIRMA"};
        for(int i=0;i<names.Length;i++)
        {
            var y=35+i*24;page.Controls.Add(L(names[i],260,y+8));var box=new ComboBox{Location=new Point(308,y),Size=new Size(200,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(TypeItem.Name),ValueMember=nameof(TypeItem.Code),Tag=tables[i]};bulkFilters[keys[i]]=box;page.Controls.Add(box);box.SelectedIndexChanged+=(_,_)=>ApplyBulkFilter();
        }
        bulkPeople.Location=new Point(4,24);bulkPeople.Size=new Size(247,372);page.Controls.Add(bulkPeople);
        page.Controls.AddRange(new Control[]{L("İşlem Tarihi",260,216),bulkDate,L("Veriliş Tarihi",264,240),bulkIssueDate,L("Türü",260,264),bulkType,L("Verilecek Oran",260,288),ratio,ratioCheck,L("Verilecek Miktar",260,312),amount,L("Açıklama",260,336),bulkDescription});
        ratioCheck.CheckedChanged+=(_,_)=>{ratio.Enabled=ratioCheck.Checked;amount.Enabled=!ratioCheck.Checked;};
        var add=B("Ekle",260,371);var close=B("Kapat",404,371);close.Click+=(_,_)=>Close();add.Click+=(_,_)=>InsertBulk();page.Controls.Add(add);page.Controls.Add(close);
        page.Controls.Add(selectedCodes);page.Controls.Add(selectedNames);
        var one=B(">",76,403,33);var all=B(">>",124,403,33);var backAll=B("<<",620,403,33);var back=B("<",668,403,33);
        one.Click+=(_,_)=>MoveSelected();all.Click+=(_,_)=>MoveAll();back.Click+=(_,_)=>RemoveSelected();backAll.Click+=(_,_)=>ClearSelected();page.Controls.AddRange([one,all,backAll,back]);
        hiredAfter.ValueChanged+=(_,_)=>LoadBulkPeople();return page;
    }

    TabPage BuildSingleTab()
    {
        var page=new TabPage("Seçili Kişi Girişi");singlePeople.Location=new Point(8,8);singlePeople.Size=new Size(489,377);singlePeople.MultiSelect=false;page.Controls.Add(singlePeople);
        page.Controls.AddRange(new Control[]{L("İşlem Tarihi",504,32),singleDate,L("Veriliş Tarihi",504,64),singleIssueDate,L("Türü",504,96),singleType,L("Açıklama",508,128),singleDescription,L("Miktar",508,155),singleAmount});
        var add=B("Ekle",564,190,141);var clear=B("Temizle",564,235,141);var close=B("Kapat",556,363,141);add.Click+=(_,_)=>InsertSingle();clear.Click+=(_,_)=>{singleDescription.Clear();singleAmount.Value=0;};close.Click+=(_,_)=>Close();page.Controls.AddRange([add,clear,close]);
        var work=new GroupBox{Text="Çalışma Durumu",Location=new Point(8,392),Size=new Size(257,49)};work.Controls.AddRange([allPeople,activePeople,leftPeople]);page.Controls.Add(work);
        var sort=new GroupBox{Text="Sıralama Şekli",Location=new Point(272,392),Size=new Size(225,49)};sort.Controls.AddRange([sortCard,sortName,sortSurname]);page.Controls.Add(sort);
        allPeople.CheckedChanged+=(_,_)=>LoadSinglePeople();activePeople.CheckedChanged+=(_,_)=>LoadSinglePeople();leftPeople.CheckedChanged+=(_,_)=>LoadSinglePeople();sortCard.CheckedChanged+=(_,_)=>LoadSinglePeople();sortName.CheckedChanged+=(_,_)=>LoadSinglePeople();sortSurname.CheckedChanged+=(_,_)=>LoadSinglePeople();return page;
    }

    void LoadAll()
    {
        try
        {
            LoadTypes(bulkType);LoadTypes(singleType);foreach(var pair in bulkFilters)LoadLookup(pair.Value,Convert.ToString(pair.Value.Tag)??pair.Key);LoadBulkPeople();LoadSinglePeople();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }

    void LoadTypes(ComboBox box)
    {
        var dt=db.Query("select KOD,TUR from AVTUR order by KOD");var items=new List<TypeItem>();foreach(DataRow r in dt.Rows)items.Add(new(Convert.ToInt32(r["KOD"]),Convert.ToString(r["TUR"])??""));box.DataSource=items;
    }
    void LoadLookup(ComboBox box,string table)
    {
        var dt=db.Query($"select KOD,AD from {table} order by KOD");var items=new List<TypeItem>{new(0,"Tümü")};foreach(DataRow r in dt.Rows)items.Add(new(Convert.ToInt32(r["KOD"]),Convert.ToString(r["AD"])??""));box.DataSource=items;
    }

    void LoadBulkPeople()
    {
        try
        {
            bulkSource=db.Query("select PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,SERVIS,DURUM,GOREV,SIRKET,MAAS from KIMLIK where ICTARIH is null and IGTARIH<=@D order by PKNO",new FbParameter("@D",hiredAfter.Value.Date));bulkPeople.DataSource=bulkSource.DefaultView;ConfigurePeople(bulkPeople);ApplyBulkFilter();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    void ApplyBulkFilter()
    {
        if(bulkSource is null)return;var parts=new List<string>();foreach(var pair in bulkFilters)if(pair.Value.SelectedItem is TypeItem item&&item.Code>0)parts.Add($"{pair.Key}={item.Code}");bulkSource.DefaultView.RowFilter=string.Join(" AND ",parts);
    }
    void LoadSinglePeople()
    {
        try
        {
            var where=activePeople.Checked?"where ICTARIH is null":leftPeople.Checked?"where ICTARIH is not null":"";var order=sortName.Checked?"AD,SOYAD,PKNO":sortSurname.Checked?"SOYAD,AD,PKNO":"PKNO";singlePeople.DataSource=db.Query($"select PKNO,AD,SOYAD,IGTARIH,ICTARIH,MAAS from KIMLIK {where} order by {order}");ConfigurePeople(singlePeople);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    static void ConfigurePeople(DataGridView g)
    {
        foreach(DataGridViewColumn c in g.Columns)c.Visible=false;Show(g,"PKNO","Kart No",55);Show(g,"AD","Adı",80);Show(g,"SOYAD","Soyadı",92);if(g.Columns.Contains("IGTARIH")){g.Columns["IGTARIH"].Visible=true;g.Columns["IGTARIH"].HeaderText="İşe Giriş";g.Columns["IGTARIH"].Width=90;}
    }
    static void Show(DataGridView g,string c,string h,int w){if(!g.Columns.Contains(c))return;g.Columns[c].Visible=true;g.Columns[c].HeaderText=h;g.Columns[c].Width=w;}

    void MoveSelected(){foreach(DataGridViewRow r in bulkPeople.SelectedRows)AddSelected(Convert.ToString(r.Cells["PKNO"].Value)??"",$"{r.Cells["AD"].Value} {r.Cells["SOYAD"].Value}".Trim());}
    void MoveAll(){foreach(DataGridViewRow r in bulkPeople.Rows)if(!r.IsNewRow)AddSelected(Convert.ToString(r.Cells["PKNO"].Value)??"",$"{r.Cells["AD"].Value} {r.Cells["SOYAD"].Value}".Trim());}
    void AddSelected(string code,string name){if(code.Length==0||selectedCodes.Items.Cast<string>().Contains(code,StringComparer.OrdinalIgnoreCase))return;selectedCodes.Items.Add(code);selectedNames.Items.Add(name);}
    void RemoveSelected(){var i=selectedCodes.SelectedIndex>=0?selectedCodes.SelectedIndex:selectedNames.SelectedIndex;if(i<0)return;selectedCodes.Items.RemoveAt(i);selectedNames.Items.RemoveAt(i);}
    void ClearSelected(){selectedCodes.Items.Clear();selectedNames.Items.Clear();}

    void InsertBulk()
    {
        try
        {
            if(selectedCodes.Items.Count==0)throw new InvalidOperationException("En az bir personel seçin.");var type=SelectedType(bulkType);var desc=bulkDescription.Text.Trim();var rows=new List<(string Pk,decimal Value)>();
            foreach(string pk in selectedCodes.Items){decimal value;if(ratioCheck.Checked){var salary=Convert.ToDecimal(db.Scalar("select coalesce(MAAS,0) from KIMLIK where PKNO=@P",new FbParameter("@P",pk))??0);value=decimal.Round(salary*ratio.Value/100m,2,MidpointRounding.AwayFromZero);}else value=amount.Value;if(value<0)throw new InvalidOperationException("Miktar negatif olamaz.");rows.Add((pk,value));}
            db.InTransaction((c,t)=>{foreach(var row in rows)InsertAvans(c,t,row.Pk,bulkDate.Value.Date,bulkIssueDate.Value.Date,type.Code,row.Value,desc);return rows.Count;});MessageBox.Show($"{rows.Count} personel için kayıt eklendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    void InsertSingle()
    {
        try
        {
            if(singlePeople.CurrentRow is null)throw new InvalidOperationException("Personel seçin.");var pk=Convert.ToString(singlePeople.CurrentRow.Cells["PKNO"].Value)??"";if(pk.Length==0)throw new InvalidOperationException("Personel seçin.");var type=SelectedType(singleType);InsertAvans(null,null,pk,singleDate.Value.Date,singleIssueDate.Value.Date,type.Code,singleAmount.Value,singleDescription.Text.Trim());MessageBox.Show("Kayıt eklendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
    static TypeItem SelectedType(ComboBox box)=>box.SelectedItem as TypeItem??throw new InvalidOperationException("Kazanç/kesinti türünü seçin.");

    void InsertAvans(FbConnection? c,FbTransaction? t,string pk,DateTime operationDate,DateTime issueDate,int type,decimal value,string desc)
    {
        const string sql="insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@P,@T,@M,@V,@K,@TOP,1,1,@A)";
        var pars=new FbParameter[]{new("@P",pk),new("@T",operationDate),new("@M",value),new("@V",issueDate),new("@K",type),new("@TOP",value),new("@A",string.IsNullOrWhiteSpace(desc)?DBNull.Value:desc)};
        if(c is null||t is null)db.Execute(sql,pars);else{using var cmd=FirebirdDatabase.CreateCommand(c,t,sql,pars);cmd.ExecuteNonQuery();}
    }

    sealed record TypeItem(int Code,string Name);
}
