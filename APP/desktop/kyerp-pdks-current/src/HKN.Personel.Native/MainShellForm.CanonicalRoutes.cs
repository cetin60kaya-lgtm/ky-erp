namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    void OpenPuantaj(int tabIndex)
    {
        if (!Ready(PdksModule.Puantaj)) return;
        ShowCachedModule("puantaj:" + tabIndex, () => new LegacyPuantajForm(tabIndex), PdksModule.Puantaj, "Puantaj");
    }

    void OpenBordro(int typeIndex)
    {
        if (!Ready(PdksModule.Bordro)) return;
        ShowCachedModule("bordro:" + typeIndex, () => new LegacyBordroForm(typeIndex), PdksModule.Bordro, "Bordro");
    }

    void OpenReportCenter(string? category)
    {
        if (!Ready(PdksModule.Raporlar)) return;
        ShowCachedModule("reports:" + (category ?? "all"), () => new ReportCenterForm(category), PdksModule.Raporlar, "Raporlar");
    }
}
