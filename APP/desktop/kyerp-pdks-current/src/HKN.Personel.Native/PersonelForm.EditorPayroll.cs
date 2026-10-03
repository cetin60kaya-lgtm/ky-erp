using System.Globalization;
using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    sealed class EditorPayrollControls
    {
        public required TabPage Page { get; init; }
        public required NumericUpDown NetEntitlement { get; init; }
        public required ComboBox PekMode { get; init; }
        public required NumericUpDown ManualPek { get; init; }
        public required Label OfficialNet { get; init; }
        public required Label Difference { get; init; }
        public required Label Warning { get; init; }
    }

    EditorPayrollControls BuildEditorPayrollTab()
    {
        var p=PdksAppearance.Current;
        var page=new TabPage("Bordro / PEK"){BackColor=p.Canvas,Padding=new Padding(14)};
        var card=PdksUiKit.Card(18);
        var table=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=8,BackColor=p.Surface};
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,180));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        table.RowStyles.Add(new RowStyle(SizeType.Absolute,42));

        var title=new Label{
            Text="Tek Seferlik Bordro Profili",
            Dock=DockStyle.Fill,
            Font=new Font("Segoe UI",11f,FontStyle.Bold),
            ForeColor=p.Text,
            TextAlign=ContentAlignment.MiddleLeft
        };
        table.Controls.Add(title,0,0);table.SetColumnSpan(title,2);

        var net=new NumericUpDown{DecimalPlaces=2,Maximum=10_000_000m,ThousandsSeparator=true,Dock=DockStyle.Fill,Margin=new Padding(0,6,0,6)};
        var mode=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,Dock=DockStyle.Fill,Margin=new Padding(0,6,0,6)};
        mode.Items.AddRange(["Mevzuata göre otomatik","Sabit PEK (tek tanım)"]);mode.SelectedIndex=0;
        var manual=new NumericUpDown{DecimalPlaces=2,Maximum=10_000_000m,ThousandsSeparator=true,Dock=DockStyle.Fill,Margin=new Padding(0,6,0,6),Enabled=false};
        var official=new Label{Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",9.5f,FontStyle.Bold),ForeColor=p.Text};
        var difference=new Label{Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",9.5f,FontStyle.Bold),ForeColor=p.Primary};
        var warning=new Label{Dock=DockStyle.Fill,AutoSize=false,Height=54,TextAlign=ContentAlignment.MiddleLeft,ForeColor=p.Warning};

        void Row(int row,string label,Control control)
        {
            table.RowStyles.Add(new RowStyle(SizeType.Absolute,row==6?62:42));
            table.Controls.Add(PdksUiKit.FieldLabel(label),0,row);
            table.Controls.Add(control,1,row);
        }

        Row(1,"Net Hakediş Maaşı",net);
        Row(2,"PEK Modu",mode);
        Row(3,"Sabit / Bildirilen PEK Brüt",manual);
        Row(4,"Resmî Bordro Neti",official);
        Row(5,"Aradaki Fark",difference);
        Row(6,"Kontrol",warning);

        var info=new Label{
            Text="Bu tanım personelde bir kez yapılır. Aylık puantaj hakedişi ayrı; resmî bordro/PEK hesabı ayrı yürür. Bankaya ödenecek tutar resmî bordro netinden türetilir.",
            Dock=DockStyle.Fill,
            ForeColor=p.Muted,
            Font=new Font("Segoe UI",8.6f),
            TextAlign=ContentAlignment.MiddleLeft
        };
        table.Controls.Add(info,0,7);table.SetColumnSpan(info,2);

        var controls=new EditorPayrollControls{
            Page=page,NetEntitlement=net,PekMode=mode,ManualPek=manual,
            OfficialNet=official,Difference=difference,Warning=warning
        };

        void refresh()
        {
            manual.Enabled=mode.SelectedIndex==1;
            RefreshEditorPayrollPreview(controls);
        }
        net.ValueChanged+=(_,_)=>refresh();
        manual.ValueChanged+=(_,_)=>refresh();
        mode.SelectedIndexChanged+=(_,_)=>refresh();

        card.Controls.Add(table);page.Controls.Add(card);
        refresh();
        return controls;
    }

    void LoadEditorPayroll(string cardNo, TextBox salaryBox, EditorPayrollControls controls)
    {
        var fallback=ParseEditorMoney(salaryBox.Text);
        var profile=PayrollProfileStore.Load(cardNo,fallback);
        controls.NetEntitlement.Value=Math.Min(controls.NetEntitlement.Maximum,Math.Max(0m,profile.NetMonthlyEntitlement));
        controls.PekMode.SelectedIndex=profile.PekMode==PekMode.Manual?1:0;
        controls.ManualPek.Value=Math.Min(controls.ManualPek.Maximum,Math.Max(0m,profile.ManualPekGross));
        controls.ManualPek.Enabled=controls.PekMode.SelectedIndex==1;
        RefreshEditorPayrollPreview(controls);
    }

    void SaveEditorPayroll(string cardNo, TextBox salaryBox, EditorPayrollControls controls)
    {
        var entitlement=controls.NetEntitlement.Value;
        if(entitlement<=0m)entitlement=ParseEditorMoney(salaryBox.Text);
        var profile=new PayrollProfile(
            cardNo,
            entitlement,
            controls.PekMode.SelectedIndex==1?PekMode.Manual:PekMode.LegalAutomatic,
            controls.ManualPek.Value,
            DateTime.UtcNow,
            Environment.UserName);
        PayrollProfileStore.Save(profile);
    }

    void RefreshEditorPayrollPreview(EditorPayrollControls controls)
    {
        try
        {
            var p=PdksAppearance.Current;
            var year=DateTime.Today.Year;
            var rules=TurkishPayrollRules.ForYear(year);
            var entitlement=controls.NetEntitlement.Value;
            if(entitlement<=0m)
            {
                controls.OfficialNet.Text="Maaş kaydından devralınacak";
                controls.Difference.Text="—";
                controls.Warning.Text="Net hakediş boş bırakılırsa personel kartındaki Maaş alanı ilk değer olarak kullanılır.";
                controls.Warning.ForeColor=p.Muted;
                return;
            }

            var requiredGross=TurkishPayrollCalculator.GrossForTargetNet(entitlement,year);
            var gross=controls.PekMode.SelectedIndex==1?controls.ManualPek.Value:requiredGross;
            if(gross<=0m)gross=rules.MinimumGrossMonthly;
            var official=TurkishPayrollCalculator.Calculate(new OfficialPayrollInput(gross),rules);
            var difference=entitlement-official.NetWage;

            controls.OfficialNet.Text=$"{official.NetWage:N2} ₺";
            controls.Difference.Text=$"{difference:N2} ₺";

            var mismatch=controls.PekMode.SelectedIndex==1 && gross+0.01m<requiredGross && entitlement>official.NetWage+0.01m;
            controls.Warning.Text=mismatch
                ?"Sabit PEK, bu net hakedişi üretecek mevzuat brütünden düşük. Kaydetmeden önce bordro/PEK uyumunu kontrol edin."
                :"Profil hazır. Aylık hakediş ve resmî bordro birbirine karıştırılmadan ayrı hesaplanacak.";
            controls.Warning.ForeColor=mismatch?p.Warning:p.Success;
        }
        catch(NotSupportedException)
        {
            controls.OfficialNet.Text="—";
            controls.Difference.Text="—";
            controls.Warning.Text="Bu yıl için resmî bordro parametreleri henüz tanımlı değil.";
            controls.Warning.ForeColor=PdksAppearance.Current.Warning;
        }
    }

    static decimal ParseEditorMoney(string? raw)
    {
        var text=(raw??string.Empty).Trim();
        if(text.Length==0)return 0m;
        if(decimal.TryParse(text,NumberStyles.Any,new CultureInfo("tr-TR"),out var value))return value;
        return decimal.TryParse(text,NumberStyles.Any,CultureInfo.InvariantCulture,out value)?value:0m;
    }
}
