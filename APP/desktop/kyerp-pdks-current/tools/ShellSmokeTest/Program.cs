using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
var user = new LocalUser
{
    UserName = "SMOKE",
    IsActive = true,
    IsAdmin = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};
using var form = new MainShellForm(user);
var timer = new System.Windows.Forms.Timer { Interval = 1200 };
timer.Tick += (_, _) => { timer.Stop(); form.Close(); };
form.Shown += (_, _) => timer.Start();
Application.Run(form);
Console.WriteLine("KYERP PDKS SHELL SMOKE OK");
