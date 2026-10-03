using System.Text.Json;

namespace HKN.Personel.Native;

public enum PdksThemeMode
{
    Light,
    Dark
}

public enum PdksSidebarMode
{
    FollowTheme,
    Light,
    Dark
}

public enum PdksAccent
{
    Blue,
    Emerald,
    Indigo,
    Violet,
    Orange,
    Slate,
    Custom
}

public sealed record PdksPalette(
    string Name,
    bool IsDark,
    Color Canvas,
    Color Surface,
    Color SurfaceAlt,
    Color Sidebar,
    Color SidebarHover,
    Color Text,
    Color Muted,
    Color Border,
    Color Primary,
    Color PrimarySoft,
    Color SidebarText,
    Color SidebarMuted,
    Color Success,
    Color Warning,
    Color Danger,
    Color DangerSoft,
    Color Selection,
    Color GridHeader,
    Color Input);

public static class PdksAppearance
{
    sealed class StoredSettings
    {
        public string Mode { get; set; } = nameof(PdksThemeMode.Light);
        public string Accent { get; set; } = nameof(PdksAccent.Blue);
        public string Sidebar { get; set; } = nameof(PdksSidebarMode.Light);
        public string CustomAccent { get; set; } = "#2563EB";
    }

    static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KYERP","PDKS","appearance.json");

    static PdksThemeMode mode;
    static PdksAccent accent;
    static PdksSidebarMode sidebarMode;
    static Color customAccent = Color.FromArgb(37,99,235);

    static PdksAppearance()
    {
        Load();
    }

    public static event EventHandler? Changed;

    public static PdksThemeMode Mode => mode;
    public static PdksAccent Accent => accent;
    public static PdksSidebarMode SidebarMode => sidebarMode;
    public static PdksPalette Current => Build(mode, accent, sidebarMode);

    public static string ModeLabel => mode == PdksThemeMode.Dark ? "Koyu" : "Açık";
    public static string SidebarModeLabel => sidebarMode switch
    {
        PdksSidebarMode.Light => "Açık",
        PdksSidebarMode.Dark => "Koyu",
        _ => "Temayı Takip Et"
    };
    public static string AccentLabel => AccentName(accent);
    public static Color CustomAccentColor => customAccent;

    public static void Set(PdksThemeMode newMode, PdksAccent newAccent, PdksSidebarMode? newSidebar = null)
    {
        var resolvedSidebar=newSidebar??sidebarMode;
        if (mode == newMode && accent == newAccent && sidebarMode == resolvedSidebar) return;
        mode = newMode;
        accent = newAccent;
        sidebarMode = resolvedSidebar;
        Save();
        Changed?.Invoke(null, EventArgs.Empty);
    }

    public static void SetCustomAccent(PdksThemeMode newMode, Color color, PdksSidebarMode? newSidebar = null)
    {
        var resolvedSidebar=newSidebar??sidebarMode;
        var normalized=Color.FromArgb(color.R,color.G,color.B);
        if(mode==newMode && accent==PdksAccent.Custom && sidebarMode==resolvedSidebar && customAccent.ToArgb()==normalized.ToArgb())return;
        mode = newMode;
        accent = PdksAccent.Custom;
        sidebarMode = resolvedSidebar;
        customAccent = normalized;
        Save();
        Changed?.Invoke(null, EventArgs.Empty);
    }

    public static string AccentName(PdksAccent value) => value switch
    {
        PdksAccent.Blue => "Mavi",
        PdksAccent.Emerald => "Zümrüt",
        PdksAccent.Indigo => "İndigo",
        PdksAccent.Violet => "Mor",
        PdksAccent.Orange => "Turuncu",
        PdksAccent.Slate => "Füme",
        PdksAccent.Custom => "Özel",
        _ => value.ToString()
    };

    public static Color AccentColor(PdksAccent value) => value switch
    {
        PdksAccent.Blue => Color.FromArgb(37,99,235),
        PdksAccent.Emerald => Color.FromArgb(5,150,105),
        PdksAccent.Indigo => Color.FromArgb(79,70,229),
        PdksAccent.Violet => Color.FromArgb(124,58,237),
        PdksAccent.Orange => Color.FromArgb(234,88,12),
        PdksAccent.Slate => Color.FromArgb(71,85,105),
        PdksAccent.Custom => customAccent,
        _ => Color.FromArgb(37,99,235)
    };

    static void Load()
    {
        mode = PdksThemeMode.Light;
        accent = PdksAccent.Blue;
        sidebarMode = PdksSidebarMode.Light;
        try
        {
            if (!File.Exists(SettingsPath)) return;
            var stored = JsonSerializer.Deserialize<StoredSettings>(File.ReadAllText(SettingsPath));
            if (stored is null) return;
            if (Enum.TryParse(stored.Mode, true, out PdksThemeMode m)) mode = m;
            if (Enum.TryParse(stored.Accent, true, out PdksAccent a)) accent = a;
            if (Enum.TryParse(stored.Sidebar, true, out PdksSidebarMode s)) sidebarMode = s;
            try { customAccent = ColorTranslator.FromHtml(stored.CustomAccent); } catch { customAccent = Color.FromArgb(37,99,235); }
        }
        catch { }
    }

    static void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
            var json = JsonSerializer.Serialize(new StoredSettings { Mode = mode.ToString(), Accent = accent.ToString(), Sidebar = sidebarMode.ToString(), CustomAccent = ColorTranslator.ToHtml(customAccent) }, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsPath, json);
        }
        catch { }
    }

    static PdksPalette Build(PdksThemeMode selectedMode, PdksAccent selectedAccent, PdksSidebarMode selectedSidebar)
    {
        var primary = AccentColor(selectedAccent);
        var darkSidebar = selectedSidebar == PdksSidebarMode.Dark ||
                          (selectedSidebar == PdksSidebarMode.FollowTheme && selectedMode == PdksThemeMode.Dark);
        var sidebar = darkSidebar ? Color.FromArgb(15,23,42) : Color.White;
        var sidebarHover = darkSidebar ? Color.FromArgb(30,41,59) : Blend(primary,Color.White,.91);
        var sidebarText = darkSidebar ? Color.FromArgb(241,245,249) : Color.FromArgb(15,23,42);
        var sidebarMuted = darkSidebar ? Color.FromArgb(148,163,184) : Color.FromArgb(71,85,105);

        if (selectedMode == PdksThemeMode.Dark)
        {
            return new PdksPalette(
                "Koyu",
                true,
                Color.FromArgb(11,18,32),
                Color.FromArgb(17,24,39),
                Color.FromArgb(24,33,49),
                sidebar,
                sidebarHover,
                Color.FromArgb(241,245,249),
                Color.FromArgb(148,163,184),
                Color.FromArgb(51,65,85),
                primary,
                Blend(primary, Color.FromArgb(17,24,39), .78),
                sidebarText,
                sidebarMuted,
                Color.FromArgb(34,197,94),
                Color.FromArgb(245,158,11),
                Color.FromArgb(248,113,113),
                Color.FromArgb(69,27,31),
                Blend(primary, Color.FromArgb(17,24,39), .70),
                Color.FromArgb(30,41,59),
                Color.FromArgb(15,23,42));
        }

        return new PdksPalette(
            "Açık",
            false,
            Color.FromArgb(244,247,251),
            Color.White,
            Color.FromArgb(248,250,252),
            sidebar,
            sidebarHover,
            Color.FromArgb(15,23,42),
            Color.FromArgb(100,116,139),
            Color.FromArgb(226,232,240),
            primary,
            Blend(primary, Color.White, .90),
            sidebarText,
            sidebarMuted,
            Color.FromArgb(22,163,74),
            Color.FromArgb(202,118,35),
            Color.FromArgb(185,28,28),
            Color.FromArgb(255,241,240),
            Blend(primary, Color.White, .84),
            Color.FromArgb(241,245,249),
            Color.White);
    }

    static Color Blend(Color a, Color b, double amountOfB)
    {
        amountOfB = Math.Clamp(amountOfB, 0, 1);
        var amountOfA = 1d - amountOfB;
        return Color.FromArgb(
            (int)Math.Round(a.R * amountOfA + b.R * amountOfB),
            (int)Math.Round(a.G * amountOfA + b.G * amountOfB),
            (int)Math.Round(a.B * amountOfA + b.B * amountOfB));
    }
}
