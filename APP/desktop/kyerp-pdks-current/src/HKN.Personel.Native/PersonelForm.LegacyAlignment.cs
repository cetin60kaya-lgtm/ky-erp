namespace HKN.Personel.Native;

public partial class PersonelForm
{
    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (TopLevel)
        {
            Size = new Size(940, 731);
            MinimumSize = new Size(800, 600);
        }
        Text = "Personel Bilgileri";

        if (tabs.TabPages.Count >= 6)
        {
            tabs.TabPages[0].Text = "Personel Bilgileri";
            tabs.TabPages[1].Text = "Giriş ve Çıkışları";
            tabs.TabPages[2].Text = "İzinler";
            tabs.TabPages[3].Text = "Ek Kazanç Ve Kesintiler";
            tabs.TabPages[4].Text = "Bilgi";
            tabs.TabPages[5].Text = "Ödemeler";
        }
        if (tabs.TabPages.Count > 0 && tabs.TabPages[0].Controls.OfType<TabControl>().FirstOrDefault() is { } inner && inner.TabPages.Count >= 2)
        {
            inner.TabPages[0].Text = "Kimlik Bilgileri";
            inner.TabPages[1].Text = "Kişisel Bilgileri";
        }
    }
}
