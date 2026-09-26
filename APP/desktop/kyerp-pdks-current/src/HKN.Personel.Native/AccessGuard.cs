namespace HKN.Personel.Native;

internal static class AccessGuard
{
    static readonly string[] EditWords = ["yeni","ekle","değiştir","sil","kaydet","hesapla","aktar","oluştur","düzelt","temizle","tümünü sil"];
    static readonly string[] SafeWords = ["göster","yenile","önizle","rapor","pdf","excel","kapat","ana sayfa","geri","ara","listele"];

    public static void Apply(Control root, PdksModule module, LocalUser user)
    {
        if (user.CanEdit(module)) return;
        root.Tag = "READONLY";
        Walk(root);
    }

    static void Walk(Control root)
    {
        foreach (Control c in root.Controls)
        {
            if (c is Button b && IsEditAction(b.Text)) { b.Enabled = false; b.Tag = "READONLY"; }
            if (c is ToolStrip strip) DisableMenu(strip.Items);
            if (c.ContextMenuStrip is { } menu) DisableMenu(menu.Items);
            Walk(c);
        }
    }

    static void DisableMenu(ToolStripItemCollection items)
    {
        foreach (ToolStripItem item in items)
        {
            if (IsEditAction(item.Text)) item.Enabled = false;
            if (item is ToolStripMenuItem menu) DisableMenu(menu.DropDownItems);
        }
    }

    static bool IsEditAction(string? text)
    {
        var value = (text ?? string.Empty).Replace("&", "").Trim().ToLower(new System.Globalization.CultureInfo("tr-TR"));
        if (SafeWords.Any(value.Contains)) return false;
        return EditWords.Any(value.Contains);
    }
}
