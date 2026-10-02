namespace HKN.Personel.Native;

public sealed class LiveAttendanceHubForm : Form
{
    readonly LiveAttendanceForm live;
    readonly AttendanceHistoryForm history;

    public LiveAttendanceHubForm(Action<string, DateTime>? openEntryExit = null, Action<string>? openPerson = null, bool allowArchiveCleanup = false)
    {
        Text = "Canlı Personel & Kart Kontrol Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1320, 790);
        MinimumSize = new Size(1120, 690);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;

        live = new LiveAttendanceForm(openEntryExit, openPerson);
        history = new AttendanceHistoryForm(allowArchiveCleanup);

        var tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(18, 8),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        tabs.TabPages.Add(Host("Bugün • Canlı", live));
        tabs.TabPages.Add(Host("7 Gün / Ay / Tarih Aralığı", history));
        Controls.Add(tabs);
    }

    static TabPage Host(string title, Form child)
    {
        var page = new TabPage(title) { Padding = Padding.Empty, BackColor = PdksAppearance.Current.Surface };
        child.TopLevel = false;
        child.FormBorderStyle = FormBorderStyle.None;
        child.Dock = DockStyle.Fill;
        child.MinimumSize = Size.Empty;
        child.ShowInTaskbar = false;
        page.Controls.Add(child);
        child.Show();
        return page;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            try { live.Dispose(); } catch { }
            try { history.Dispose(); } catch { }
        }
        base.Dispose(disposing);
    }
}
