using System.Runtime.CompilerServices;

namespace HKN.Personel.Native;

internal static class ToolStripLayoutBootstrap
{
    static readonly ConditionalWeakTable<Form, Marker> Attached = new();
    sealed class Marker { }

    [ModuleInitializer]
    internal static void Initialize()
    {
        Application.Idle += (_, _) =>
        {
            foreach (Form form in Application.OpenForms)
            {
                if (Attached.TryGetValue(form, out _)) continue;
                Attached.Add(form, new Marker());
                Attach(form);
                form.Shown += (_, _) => Attach(form);
            }
        };
    }

    static void Attach(Form form)
    {
        var strips = Enumerate(form).OfType<ToolStrip>().ToList();
        for (var i = 0; i < strips.Count; i++)
        {
            var strip = strips[i];
            ToolStripLayoutPersistence.Attach(strip, $"{form.GetType().Name}-{strip.GetType().Name}-{i}");
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
