namespace HKN.Personel.Native;

public partial class PersonelForm
{
    public void ShowLegacyGirisCikisEntry() => ShowGirisCikisEklemeClassic();
    public void ShowLegacyIzinEntry() => ShowIzinEditorClassic(false);
    public void ShowLegacyKazancKesintiEntry() => ShowEkkEditorClassic(false);

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
                ShowEkkEditorClassic(false);
                break;
            default:
                OpenStandaloneDialog(module);
                break;
        }
    }
}
