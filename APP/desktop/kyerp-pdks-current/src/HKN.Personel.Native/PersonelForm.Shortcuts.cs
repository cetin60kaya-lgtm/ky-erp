namespace HKN.Personel.Native;

public partial class PersonelForm
{
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == Keys.F2 && !string.IsNullOrWhiteSpace(currentPk))
        {
            PrintReportFinal("Ayrıntılı Kişisel Bordro");
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    public void ShowPersonalPayrollPreview()
    {
        if (string.IsNullOrWhiteSpace(currentPk)) return;
        PrintReportFinal("Ayrıntılı Kişisel Bordro");
    }
}
