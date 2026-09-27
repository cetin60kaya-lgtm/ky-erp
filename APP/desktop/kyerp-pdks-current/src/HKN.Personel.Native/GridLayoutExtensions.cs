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
            // Bordro kendi rapor türüne göre ayrı layout anahtarı kullanır; global anahtar onunla çakışmasın.
            if (string.Equals(grid.Name, "BordroGrid", StringComparison.OrdinalIgnoreCase)) continue;
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
