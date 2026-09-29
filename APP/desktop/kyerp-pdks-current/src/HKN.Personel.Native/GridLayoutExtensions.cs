namespace HKN.Personel.Native;

internal static class GridLayoutExtensions
{
    public static void AttachPersistentLayouts(Control root)
    {
        var form = root.FindForm();
        var formKey = form?.GetType().Name ?? root.GetType().Name;
        var index = 0;
        foreach (var grid in Enumerate(root).OfType<DataGridView>())
        {
            // Bu ekranlar rapor türüne göre kendi layout anahtarını yönetir; global anahtar çakışmasın.
            if (string.Equals(grid.Name, "BordroGrid", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(grid.Name, "ReportCenterGrid", StringComparison.OrdinalIgnoreCase))
                continue;
            var key = $"{formKey}-{grid.Name}-{index++}";
            if (string.IsNullOrWhiteSpace(grid.Name)) key = $"{formKey}-grid-{index}";
            GridLayoutPersistence.Attach(grid, key);
        }
    }

    static IEnumerable<Control> Enumerate(Control root)
    {
        foreach (Control child in root.Controls)
        {
            yield return child;
            foreach (var nested in Enumerate(child)) yield return nested;
        }
    }
}
