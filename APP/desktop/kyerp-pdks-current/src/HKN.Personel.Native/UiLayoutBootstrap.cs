using System.Runtime.CompilerServices;

namespace HKN.Personel.Native;

internal static class UiLayoutBootstrap
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
                form.Shown += (_, _) => GridLayoutExtensions.AttachPersistentLayouts(form);
                GridLayoutExtensions.AttachPersistentLayouts(form);
            }
        };
    }
}
