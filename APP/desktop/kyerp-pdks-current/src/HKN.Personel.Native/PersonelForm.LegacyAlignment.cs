namespace HKN.Personel.Native;

public partial class PersonelForm
{
    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (TopLevel)
        {
            Size = new Size(1220, 760);
            MinimumSize = new Size(1220, 760);
        }
        Text = "Personel Bilgileri";

        if (tabs.TabPages.Count >= 6)
        {
            tabs.TabPages[0].Text = "Personel Bilgileri";
            tabs.TabPages[1].Text = "Giriş / Çıkış";
            tabs.TabPages[2].Text = "İzinler";
            tabs.TabPages[3].Text = "Kazanç / Kesinti";
            tabs.TabPages[4].Text = "Puantaj Bilgisi";
            tabs.TabPages[5].Text = "Ödemeler";
        }
        ApplyModernTabLayoutAndPerformance();
    }
}
