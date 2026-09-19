using System.Text;

namespace HKN.Personel.Native;

static class Program
{
    [STAThread]
    static void Main()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        ApplicationConfiguration.Initialize();
        if (!StartupConfiguration.EnsureReady()) return;
        Application.Run(new PersonelForm());
    }
}
