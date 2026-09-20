using System.Data;
using System.Drawing.Printing;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class LegacyBordroForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly TextBox title=new(){Text="Genel Maaş Bordrosu",Location=new Point(80,16),Size=new Size(465,21)};
    readonly TextBox cardStart=new(){Location=new Point(104,0),Size=new Size(39,21),Text="00000"};
    readonly TextBox cardEnd=new(){Location=new Point(104,24),Size=new Size(39,21),Text="99999"};
    readonly DateTimePicker start=D(104,56,169),end=D(104,80,169);
    readonly ComboBox group=C(104,112,185),department=C(104,135,185),service=C(104,158,185),duty=C(368,112,201),status=C(368,135,201),company=C(368,158,201);
    readonly RadioButton byCard=R("Kart No",344,16),byName=R("Ad - Soyad",344,40),bySurname=R("Soyad - Ad",472,40),byHire=R("İşe Giriş Tarihi",472,16),byRegistry=R("Sicil No",344,64);
    readonly CheckBox cost=new(){Text="Bölümler Arası Maliyet Raporu Göster",Location=new Point(8,208),AutoSize=true};
    readonly ComboBox reportType=new(){Location=new Point(72,0),Size=new Size(273,21),DropDownStyle=ComboBoxStyle.DropDownList};
    readonly CheckedListBox fixedFields=new(){Location=new Point(232,36),Size=new Size(153,86)}, extras=new(){Location=new Point(232,142),Size=new Size(153,152)}, payments=new(){Location=new Point(392,37),Size=new Size(161,140)};
    readonly CheckBox rowLines=new(){Text="Satır Çizgileri",Location=new Point(8,24),AutoSize=true},columnLines=new(){Text="Kolon Çizgileri",Location=new Point(8,56),AutoSize=true};
    readonly TextBox printFontSize=new(){Location=new Point(280,16),Size=new Size(19,21),Text="8"},rowHeight=new(){Location=new Point(280,48),Size=new Size(19,21),Text="18"},leftMargin=new(){Location=new Point(428,16),Size=new Size(24,21),Text="10"},rightMargin=new(){Location=new Point(428,48),Size=new Size(25,21),Text="10"};
    readonly RadioButton portrait=R("Kağıdı Dikey Çavir",48,32),landscape=R("Kağıdı Yatay Çevir",48,64);
    readonly ComboBox paperType=new(){Location=new Point(264,20),Size=new Size(161,21),DropDownStyle=ComboBoxStyle.DropDownList};
    readonly List<TextBox> fieldWidths=[];
    DataTable? lastPreview;

    public LegacyBordroForm()
    {
        Text="Genel Maaş Bordrosu Ayarları";StartPosition=FormStartPosition.CenterScreen;Size=new Size(616,496);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();Shown+=(_,_)=>Init();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),AutoSize=true};
    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static ComboBox C(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static RadioButton R(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),AutoSize=true};
    static Button B(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),Size=new Size(115,33),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold)};

    void Build()
    {
        var head=new GroupBox{Text="Rapor Başlığı",Location=new Point(16,0),Size=new Size(569,97)};head.Controls.AddRange([L("Rapor Başlığı",8,24),L("Yazı Tipi",80,72),L("Zemin Rengi",240,72),title]);Controls.Add(head);
        var tabs=new TabControl{Location=new Point(8,99),Size=new Size(577,322)};
        var f=new TabPage("Filitreler");f.Controls.AddRange([L("Kart No Başlangıç",8,8),L("Kart No Bitiş",8,32),L("Başlangıç Tarihi",8,64),L("Bitiş Tarihi",8,88),L("Grubu",8,120),L("Bölümü",8,143),L("Servisi",8,166),L("Görevi",312,120),L("Durumu",312,143),L("Firma",312,166),cardStart,cardEnd,start,end,group,department,service,duty,status,company,cost]);
        var sortBox=new GroupBox{Text="Sıralama Şekli",Location=new Point(336,0),Size=new Size(233,89)};sortBox.Controls.AddRange([byCard,byName,bySurname,byHire,byRegistry]);f.Controls.Add(sortBox);
        var opt=new TabPage("Rapor Seçenekleri");opt.Controls.AddRange([L("Rapor Tipi",8,8),L("Sabit Alanlar",232,24),L("Ekstra Ücretler",232,126),L("Ödemeler",392,24),reportType,fixedFields,extras,payments]);var fieldGrid=new DataGridView{Location=new Point(0,32),Size=new Size(225,257),ReadOnly=true,AllowUserToAddRows=false,RowHeadersVisible=false,ColumnHeadersVisible=false};fieldGrid.Columns.Add("F","Alan");foreach(var x in new[]{"Kart No","Sicil No","Ad Soyad","Çalışılan Gün","Maaş","Kazanç","Kesinti","Net Ödeme"})fieldGrid.Rows.Add(x);opt.Controls.Add(fieldGrid);
        var paper=new TabPage("Kağıt Ayarları");var page=new GroupBox{Text="Sayfa Ayarları",Location=new Point(8,0),Size=new Size(553,81)};page.Controls.AddRange([rowLines,columnLines,L("Yazı Fontu",192,24),printFontSize,L("Satır Yüksekliği",192,56),rowHeight,L("Sol Kenar Boşluğu",328,24),leftMargin,L("Sağ Kenar Boşluğu",328,56),rightMargin]);
        var paperOptions=new GroupBox{Text="Kağıt Ayarları",Location=new Point(0,96),Size=new Size(561,89)};portrait.Checked=true;paperType.Items.AddRange(["A4","A3","Letter"]);paperType.SelectedIndex=0;paperOptions.Controls.AddRange([portrait,landscape,L("Kağıtt Tipi",208,28),paperType]);
        var sizes=new GroupBox{Text="Alan Genişlikleri",Location=new Point(0,200),Size=new Size(561,89)};var labels=new[]{("Kart No",8,24,104,16),("Sicil Numarası",8,48,104,40),("Ad Soyad",8,72,104,64),("Gün",152,24,216,16),("Saat",152,48,216,40),("Ücret",152,72,216,64),("İmza",264,24,368,16),("SSK No",264,48,368,40),("Banka Hesp No",264,72,368,64),("Tarih",416,24,448,16)};foreach(var z in labels){sizes.Controls.Add(L(z.Item1,z.Item2,z.Item3));var width=new TextBox{Location=new Point(z.Item4,z.Item5),Size=new Size(30,21),Text="10",Tag="FieldWidth"};fieldWidths.Add(width);sizes.Controls.Add(width);}paper.Controls.AddRange([page,paperOptions,sizes]);tabs.TabPages.AddRange([f,opt,paper]);Controls.Add(tabs);
        var save=B("&Ayarları Kaydet",0,424);var preview=B("Ö&nizleme",121,424);var print=B("&Yazdır",242,424);var export=B("A&ktar",364,424);var close=B("Kapa&t",485,424);save.Click+=(_,_)=>SaveSettings();preview.Click+=(_,_)=>Preview();print.Click+=(_,_)=>Print();export.Click+=(_,_)=>Export();close.Click+=(_,_)=>Close();Controls.AddRange([save,preview,print,export,close]);
    }

    void Init()
    {
        start.Value=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);end.Value=DateTime.Today;byCard.Checked=true;
        LoadLookup(group,"GRUP");LoadLookup(department,"BOLUM");LoadLookup(service,"SERVIS");LoadLookup(duty,"GOREV");LoadLookup(status,"DURUM");LoadLookup(company,"FIRMA");
        reportType.Items.AddRange(["GenelBordro.fr3","MaasBordro.fr3","MesaiBordro.fr3"]);reportType.SelectedIndex=0;
        foreach(var x in new[]{"Kart No","Sicil No","Ad Soyad","Çalışılan Gün","Maaş"})fixedFields.Items.Add(x,true);foreach(var x in new[]{"Ek Kazanç","Mesai","Önceki Bakiye"})extras.Items.Add(x,true);foreach(var x in new[]{"Kesinti","Avans","Net Ödeme"})payments.Items.Add(x,true);
    }

    void LoadLookup(ComboBox c,string table){var dt=db.Query($"select KOD,AD from {table} order by KOD");var r=dt.NewRow();r["KOD"]=-1;r["AD"]="Tümü";dt.Rows.InsertAt(r,0);dt.Columns.Add("TEXT",typeof(string),"AD");c.DataSource=dt;c.SelectedValue=-1;}
    static void AddFilter(List<string>w,List<FbParameter>p,string field,ComboBox c,string key){if(c.SelectedValue is int v&&v>=0){w.Add($"{field}=@{key}");p.Add(new FbParameter("@"+key,v));}}

    DataTable CalculatePreview()
    {
        if(end.Value.Date<start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
        var w=new List<string>{"(k.ICTARIH is null or k.ICTARIH>=@A)","(k.IGTARIH is null or k.IGTARIH<=@B)"};var p=new List<FbParameter>{new("@A",start.Value.Date),new("@B",end.Value.Date)};
        if(cardStart.Text.Trim()!="00000"&&cardStart.Text.Trim().Length>0){w.Add("k.PKNO>=@KS");p.Add(new("@KS",cardStart.Text.Trim().PadLeft(5,'0')));}if(cardEnd.Text.Trim()!="99999"&&cardEnd.Text.Trim().Length>0){w.Add("k.PKNO<=@KB");p.Add(new("@KB",cardEnd.Text.Trim().PadLeft(5,'0')));}
        AddFilter(w,p,"k.GRUP",group,"G");AddFilter(w,p,"k.BOLUM",department,"D");AddFilter(w,p,"k.SERVIS",service,"S");AddFilter(w,p,"k.GOREV",duty,"R");AddFilter(w,p,"k.DURUM",status,"U");AddFilter(w,p,"k.SIRKET",company,"F");
        var order=byHire.Checked?"k.IGTARIH,k.PKNO":byName.Checked?"k.AD,k.SOYAD":bySurname.Checked?"k.SOYAD,k.AD":byRegistry.Checked?"k.SICILNO,k.PKNO":"k.PKNO";
        var emp=db.Query($"select k.PKNO,k.SICILNO,k.AD,k.SOYAD,k.IGTARIH,k.MAAS,k.BOLUM from KIMLIK k where {string.Join(" and ",w)} order by {order}",p.ToArray());
        var result=new DataTable();foreach(var c in new[]{"Kart No","Sicil No","Ad Soyad","Gün","Maaş","Kazanç","Kesinti","Net Ödeme"})result.Columns.Add(c,c is "Gün" or "Maaş" or "Kazanç" or "Kesinti" or "Net Ödeme"?typeof(decimal):typeof(string));
        foreach(DataRow e in emp.Rows)
        {
            var pk=Convert.ToString(e["PKNO"])??"";var attendance=db.Query("select coalesce(sum(GUN1),0) GUN,coalesce(sum(DAKIKA2),0) M50,coalesce(sum(DAKIKA3),0) M100 from PUANTAJ where PKNO=@P and TARIH>=@A and TARIH<@B",new FbParameter("@P",pk),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date.AddDays(1)));var days=Convert.ToDecimal(attendance.Rows[0]["GUN"]);var overtime50=Convert.ToInt32(attendance.Rows[0]["M50"]);var overtime100=Convert.ToInt32(attendance.Rows[0]["M100"]);var vals=db.Query("select coalesce(sum(case when v.ISARET='+' then a.MIKTAR else 0 end),0) KAZ,coalesce(sum(case when v.ISARET='+' then 0 else a.MIKTAR end),0) KES from AVANS a left join AVTUR v on v.KOD=a.TURKOD where a.PKNO=@P and a.TARIH>=@A and a.TARIH<@B",new FbParameter("@P",pk),new FbParameter("@A",start.Value.Date),new FbParameter("@B",end.Value.Date.AddDays(1)));var earn=vals.Rows.Count==0?0m:Convert.ToDecimal(vals.Rows[0]["KAZ"]);var ded=vals.Rows.Count==0?0m:Convert.ToDecimal(vals.Rows[0]["KES"]);var salary=e["MAAS"]==DBNull.Value?0m:Convert.ToDecimal(e["MAAS"]);var calc=PayrollCalculator.Calculate(new PayrollInput(salary,days,overtime50,overtime100,earn,ded,0));result.Rows.Add(pk,Convert.ToString(e["SICILNO"])??"",$"{e["AD"]} {e["SOYAD"]}".Trim(),days,salary,earn,ded,calc.NetPay);
        }
        return result;
    }

    void Preview(){try{lastPreview=CalculatePreview();using var f=new Form{Text=string.IsNullOrWhiteSpace(title.Text)?"Genel Maaş Bordrosu":title.Text,StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(900,540)};var g=new DataGridView{Dock=DockStyle.Fill,DataSource=lastPreview,ReadOnly=true,AllowUserToAddRows=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill};f.Controls.Add(g);f.ShowDialog(this);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
    void Print(){try{lastPreview=CalculatePreview();var report=ToReport(lastPreview);var rowIndex=0;var fontSize=Positive(printFontSize,"Yazı Fontu");var lineHeight=Positive(rowHeight,"Satır Yüksekliği");var widths=fieldWidths.Select((box,index)=>Positive(box,$"Alan Genişliği {index+1}")).ToArray();using var document=new PrintDocument{DocumentName=report.Title};document.DefaultPageSettings.Landscape=landscape.Checked;document.DefaultPageSettings.Margins=new Margins(Positive(leftMargin,"Sol Kenar Boşluğu"),Positive(rightMargin,"Sağ Kenar Boşluğu"),10,10);document.PrintPage+=(_,args)=>{var graphics=args.Graphics;if(graphics is null){args.HasMorePages=false;return;}using var heading=new Font(Font.FontFamily,12,FontStyle.Bold);using var body=new Font(Font.FontFamily,fontSize);var y=args.MarginBounds.Top;graphics.DrawString(report.Title,heading,Brushes.Black,args.MarginBounds.Left,y);y+=heading.Height+10;Draw(report.Columns);while(rowIndex<report.Rows.Count&&y+lineHeight<=args.MarginBounds.Bottom){Draw(report.Rows[rowIndex]);rowIndex++;}args.HasMorePages=rowIndex<report.Rows.Count;void Draw(IReadOnlyList<string> values){var text=string.Join(columnLines.Checked?" | ":" ",values.Select((value,index)=>Fit(value,widths[Math.Min(index,widths.Length-1)])));graphics.DrawString(text,body,Brushes.Black,args.MarginBounds.Left,y);y+=lineHeight;if(rowLines.Checked)graphics.DrawLine(Pens.Black,args.MarginBounds.Left,y-2,args.MarginBounds.Right,y-2);}};using var dialog=new PrintDialog{Document=document,UseEXDialog=true};if(dialog.ShowDialog(this)!=DialogResult.OK)return;var selectedPaper=document.PrinterSettings.PaperSizes.Cast<PaperSize>().FirstOrDefault(x=>x.PaperName.Equals(paperType.Text,StringComparison.OrdinalIgnoreCase));if(selectedPaper is not null)document.DefaultPageSettings.PaperSize=selectedPaper;document.Print();}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
    void Export(){try{lastPreview=CalculatePreview();using var dialog=new SaveFileDialog{Title="Bordroyu Aktar",Filter="Excel Çalışma Kitabı (*.xlsx)|*.xlsx|PDF Belgesi (*.pdf)|*.pdf",FileName="Genel-Maas-Bordrosu.xlsx",DefaultExt="xlsx",AddExtension=true};if(dialog.ShowDialog(this)!=DialogResult.OK)return;var report=ToReport(lastPreview);if(Path.GetExtension(dialog.FileName).Equals(".pdf",StringComparison.OrdinalIgnoreCase))ReportExporter.ExportPdf(dialog.FileName,report);else ReportExporter.ExportExcel(dialog.FileName,report);MessageBox.Show($"Bordro aktarıldı.\n{dialog.FileName}",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
    ReportTable ToReport(DataTable table)=>new(string.IsNullOrWhiteSpace(title.Text)?"Genel Maaş Bordrosu":title.Text,table.Columns.Cast<DataColumn>().Select(x=>x.ColumnName).ToArray(),table.Rows.Cast<DataRow>().Select(row=>(IReadOnlyList<string>)table.Columns.Cast<DataColumn>().Select(column=>Convert.ToString(row[column])??"").ToArray()).ToArray());
    static int Positive(TextBox box,string field)=>int.TryParse(box.Text,out var value)&&value>0?value:throw new InvalidOperationException($"{field} pozitif bir sayı olmalıdır.");
    static string Fit(string value,int width)=>value.Length>width?value[..width]:value.PadRight(width);
    void SaveSettings(){try{var dir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"KYERP","PDKS");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"bordro-report.ini"),$"TITLE={title.Text}\nREPORT={reportType.Text}\nCOST={cost.Checked}\nROW_LINES={rowLines.Checked}\nCOLUMN_LINES={columnLines.Checked}\nFONT_SIZE={Positive(printFontSize,"Yazı Fontu")}\nROW_HEIGHT={Positive(rowHeight,"Satır Yüksekliği")}\nMARGINS={Positive(leftMargin,"Sol Kenar Boşluğu")},{Positive(rightMargin,"Sağ Kenar Boşluğu")}\nORIENTATION={(landscape.Checked?"LANDSCAPE":"PORTRAIT")}\nPAPER={paperType.Text}\nWIDTHS={string.Join(',',fieldWidths.Select((box,index)=>Positive(box,$"Alan Genişliği {index+1}")))}\n");MessageBox.Show("Bordro rapor ayarları kaydedildi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}}
}
