namespace HKN.Personel.Native;

public partial class PersonelForm
{
    // Kept as the compatibility entry point used by the constructor. The real period wiring
    // lives in PersonelForm.Final and is idempotent; no OnShown mutation is performed anymore.
    void WireLegacyPeriodSelectors() => WirePeriodSynchronization();
}
