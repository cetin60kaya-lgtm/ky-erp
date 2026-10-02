namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    void OpenPuantaj(int tabIndex)
    {
        if (!Ready(PdksModule.Puantaj)) return;
        ShowModule(new LegacyPuantajForm(tabIndex), PdksModule.Puantaj);
    }

    void OpenBordro(int typeIndex)
    {
        if (!Ready(PdksModule.Bordro)) return;
        ShowModule(new LegacyBordroForm(typeIndex), PdksModule.Bordro);
    }

    void OpenReportCenter(string? category)
    {
        if (!Ready(PdksModule.Raporlar)) return;
        ShowModule(new ReportCenterForm(category), PdksModule.Raporlar);
    }
}
