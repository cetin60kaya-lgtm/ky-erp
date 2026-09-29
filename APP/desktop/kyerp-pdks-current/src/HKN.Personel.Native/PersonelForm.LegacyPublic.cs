namespace HKN.Personel.Native;

public partial class PersonelForm
{
    public void ShowLegacyGirisCikisEntry() => ShowGirisCikisEklemeClassic();
    public void ShowLegacyIzinEntry() => ShowIzinEditorClassic(false);
    public void ShowLegacyKazancKesintiEntry()
    {
        using var f = new LegacyAvansEntryForm();
        f.ShowDialog(DialogOwner());
        RefreshFullTabs();
    }

    public void ShowLegacyModule(PdksModule module)
    {
        switch (module)
        {
            case PdksModule.GirisCikis:
                ShowGirisCikisEklemeClassic();
                break;
            case PdksModule.Izinler:
                ShowIzinEditorClassic(false);
                break;
            case PdksModule.EkKazancKesinti:
                ShowLegacyKazancKesintiEntry();
                break;
            default:
                OpenStandaloneDialog(module);
                break;
        }
    }
}
