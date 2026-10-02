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
        Text="Kazanç / Kesinti / Avans";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1120,700);
        MinimumSize=new Size(980,620);FormBorderStyle=FormBorderStyle.Sizable;MaximizeBox=true;MinimizeBox=true;ShowInTaskbar=false;
        Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(244,247,251);Build();tabs.SelectedIndex=1;Shown+=(_,_)=>LoadAll();
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
        var page=new TabPage("Toplu Giriş"){Padding=new Padding(16),BackColor=Color.FromArgb(244,247,251)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,BackColor=page.BackColor};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));

        var leftCard=ModernCard();
        var leftLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(16),BackColor=Color.White};
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,92));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        leftLayout.Controls.Add(new Label{Text="Personel Seçimi",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Color.FromArgb(15,23,42)},0,0);

        var filters=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=2,BackColor=Color.White};
        for(int i=0;i<4;i++)filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
        string[] names={"Grup","Bölüm","Servis","Durum","Görev","Firma"};string[] keys={"GRUP","BOLUM","SERVIS","DURUM","GOREV","SIRKET"};string[] tables={"GRUP","BOLUM","SERVIS","DURUM","GOREV","FIRMA"};
        for(int i=0;i<names.Length;i++)
        {
            var holder=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Margin=new Padding(0,0,8,4)};
            holder.RowStyles.Add(new RowStyle(SizeType.Absolute,18));holder.RowStyles.Add(new RowStyle(SizeType.Percent,100));
            holder.Controls.Add(new Label{Text=names[i],Dock=DockStyle.Fill,Font=new Font("Segoe UI",8f,FontStyle.Bold),ForeColor=Color.FromArgb(100,116,139)},0,0);
            var box=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(TypeItem.Name),ValueMember=nameof(TypeItem.Code),Tag=tables[i]};
            bulkFilters[keys[i]]=box;holder.Controls.Add(box,0,1);box.SelectedIndexChanged+=(_,_)=>ApplyBulkFilter();
            filters.Controls.Add(holder,i%4,i/4);
        }
        leftLayout.Controls.Add(filters,0,1);

        bulkPeople.Dock=DockStyle.Fill;bulkPeople.Margin=new Padding(0,8,0,8);leftLayout.Controls.Add(bulkPeople,0,2);
        var selectBar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,WrapContents=false,Padding=new Padding(0,5,0,0)};
        var addOne=ModernAvansButton("Seçiliyi Ekle",110,false);var addAll=ModernAvansButton("Tümünü Ekle",110,false);var clear=ModernAvansButton("Seçimi Temizle",115,false);
        addOne.Click+=(_,_)=>MoveSelected();addAll.Click+=(_,_)=>MoveAll();clear.Click+=(_,_)=>ClearSelected();selectBar.Controls.AddRange([addOne,addAll,clear]);
        leftLayout.Controls.Add(selectBar,0,3);leftCard.Controls.Add(leftLayout);root.Controls.Add(leftCard,0,0);

        var rightCard=ModernCard();
        var form=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=11,Padding=new Padding(20),BackColor=Color.White};
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        form.Controls.Add(new Label{Text="Toplu İşlem",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Color.FromArgb(15,23,42)},0,0);form.SetColumnSpan(form.GetControlFromPosition(0,0)!,2);
        hiredAfter.Dock=DockStyle.Fill;bulkDate.Dock=DockStyle.Fill;bulkIssueDate.Dock=DockStyle.Fill;bulkType.Dock=DockStyle.Fill;ratio.Dock=DockStyle.Fill;amount.Dock=DockStyle.Fill;bulkDescription.Dock=DockStyle.Fill;
        AddModernAvansRow(form,1,"İşe Giriş Alt Sınırı",hiredAfter);
        AddModernAvansRow(form,2,"İşlem Tarihi",bulkDate);
        AddModernAvansRow(form,3,"Veriliş Tarihi",bulkIssueDate);
        AddModernAvansRow(form,4,"Tür",bulkType);
        AddModernAvansRow(form,5,"Oran (%)",ratio);
        form.Controls.Add(ratioCheck,1,6);
        AddModernAvansRow(form,7,"Miktar",amount);
        AddModernAvansRow(form,8,"Açıklama",bulkDescription);
        var chosen=new Label{Text="Seçilen personel: 0",Dock=DockStyle.Fill,ForeColor=Color.FromArgb(100,116,139),Font=new Font("Segoe UI",8.5f,FontStyle.Bold)};form.Controls.Add(chosen,1,9);
        selectedCodes.Visible=false;selectedNames.Visible=false;
        void updateChosen(){chosen.Text=$"Seçilen personel: {selectedCodes.Items.Count}";}
        var add=ModernAvansButton("Kayıtları Oluştur",145,true);add.Dock=DockStyle.Right;add.Click+=(_,_)=>{InsertBulk();updateChosen();};
        form.Controls.Add(add,1,10);
        ratioCheck.CheckedChanged+=(_,_)=>{ratio.Enabled=ratioCheck.Checked;amount.Enabled=!ratioCheck.Checked;};
        hiredAfter.ValueChanged+=(_,_)=>LoadBulkPeople();
        selectedCodes.SelectedIndexChanged+=(_,_)=>updateChosen();
        rightCard.Controls.Add(form);root.Controls.Add(rightCard,1,0);

        page.Controls.Add(root);
        return page;
    }

    TabPage BuildSingleTab()
    {
        var page=new TabPage("Seçili Kişi Girişi"){Padding=new Padding(16),BackColor=Color.FromArgb(244,247,251)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,BackColor=page.BackColor};
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,60));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40));

        var left=ModernCard();
        var leftLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(16),BackColor=Color.White};
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,42));leftLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        leftLayout.Controls.Add(new Label{Text="Personel Seç",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Color.FromArgb(15,23,42)},0,0);
        singlePeople.Dock=DockStyle.Fill;singlePeople.Margin=new Padding(0,6,0,8);singlePeople.MultiSelect=false;leftLayout.Controls.Add(singlePeople,0,1);
        var filterBar=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,8,0,0)};
        filterBar.Controls.Add(new Label{Text="Durum",AutoSize=true,Padding=new Padding(0,6,6,0),ForeColor=Color.FromArgb(100,116,139)});
        allPeople.AutoSize=true;activePeople.AutoSize=true;leftPeople.AutoSize=true;sortCard.Visible=false;sortName.Visible=false;sortSurname.Visible=false;
        filterBar.Controls.Add(allPeople);filterBar.Controls.Add(activePeople);filterBar.Controls.Add(leftPeople);leftLayout.Controls.Add(filterBar,0,2);
        left.Controls.Add(leftLayout);root.Controls.Add(left,0,0);

        var right=ModernCard();
        var form=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=8,Padding=new Padding(22),BackColor=Color.White};
        form.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,115));form.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        form.Controls.Add(new Label{Text="İşlem Bilgileri",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Color.FromArgb(15,23,42)},0,0);form.SetColumnSpan(form.GetControlFromPosition(0,0)!,2);
        singleDate.Dock=DockStyle.Fill;singleIssueDate.Dock=DockStyle.Fill;singleType.Dock=DockStyle.Fill;singleDescription.Dock=DockStyle.Fill;singleAmount.Dock=DockStyle.Fill;
        AddModernAvansRow(form,1,"İşlem Tarihi",singleDate);
        AddModernAvansRow(form,2,"Veriliş Tarihi",singleIssueDate);
        AddModernAvansRow(form,3,"Tür",singleType);
        AddModernAvansRow(form,4,"Açıklama",singleDescription);
        AddModernAvansRow(form,5,"Miktar",singleAmount);
        var add=ModernAvansButton("Kaydı Ekle",120,true);var clear=ModernAvansButton("Temizle",95,false);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,WrapContents=false,Padding=new Padding(0,10,0,0)};
        add.Click+=(_,_)=>InsertSingle();clear.Click+=(_,_)=>{singleDescription.Clear();singleAmount.Value=0;};actions.Controls.Add(add);actions.Controls.Add(clear);form.Controls.Add(actions,1,7);
        right.Controls.Add(form);root.Controls.Add(right,1,0);

        allPeople.CheckedChanged+=(_,_)=>LoadSinglePeople();activePeople.CheckedChanged+=(_,_)=>LoadSinglePeople();leftPeople.CheckedChanged+=(_,_)=>LoadSinglePeople();
        sortCard.CheckedChanged+=(_,_)=>LoadSinglePeople();sortName.CheckedChanged+=(_,_)=>LoadSinglePeople();sortSurname.CheckedChanged+=(_,_)=>LoadSinglePeople();
        page.Controls.Add(root);
        return page;
    }

    static Panel ModernCard()
    {
        var p=new Panel{Dock=DockStyle.Fill,BackColor=Color.White,Margin=new Padding(0,0,12,0)};
        p.Paint+=(_,e)=>{using var pen=new Pen(Color.FromArgb(226,232,240));e.Graphics.DrawRectangle(pen,0,0,Math.Max(0,p.Width-1),Math.Max(0,p.Height-1));};
        return p;
    }

    static void AddModernAvansRow(TableLayoutPanel table,int row,string label,Control control)
    {
        table.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        table.Controls.Add(new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(100,116,139),Font=new Font("Segoe UI",8.5f,FontStyle.Bold)},0,row);
        control.Margin=new Padding(0,6,0,6);
        table.Controls.Add(control,1,row);
    }

    static Button ModernAvansButton(string text,int width,bool primary)
        => PdksUiKit.Button(text,width,primary?PdksActionRole.Primary:PdksActionRole.Secondary);

    void LoadAll()
    {
        try
        {
            LoadTypes(bulkType);LoadTypes(singleType);foreach(var pair in bulkFilters)LoadLookup(pair.Value,Convert.ToString(pair.Value.Tag)??pair.Key);LoadBulkPeople();LoadSinglePeople();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Error,"EarningsDeductions");}
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
            bulkSource=db.Query("select PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,SERVIS,DURUM,GOREV,SIRKET,MAAS from KIMLIK where ICTARIH is null and IGTARIH>=@D order by PKNO",new FbParameter("@D",hiredAfter.Value.Date));bulkPeople.DataSource=bulkSource.DefaultView;ConfigurePeople(bulkPeople);ApplyBulkFilter();
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"EarningsDeductions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"EarningsDeductions");}
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
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"EarningsDeductions");}
    }
    void InsertSingle()
    {
        try
        {
            if(singlePeople.CurrentRow is null)throw new InvalidOperationException("Personel seçin.");var pk=Convert.ToString(singlePeople.CurrentRow.Cells["PKNO"].Value)??"";if(pk.Length==0)throw new InvalidOperationException("Personel seçin.");var type=SelectedType(singleType);InsertAvans(null,null,pk,singleDate.Value.Date,singleIssueDate.Value.Date,type.Code,singleAmount.Value,singleDescription.Text.Trim());MessageBox.Show("Kayıt eklendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"EarningsDeductions");}
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
