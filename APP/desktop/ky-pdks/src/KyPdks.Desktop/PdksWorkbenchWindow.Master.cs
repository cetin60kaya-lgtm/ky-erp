using System.Windows;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow
{
    private void OpenPdksMasterButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_token))
        {
            StatusText.Text = "PDKS Merkezi için önce KY ERP hesabıyla giriş yapın.";
            return;
        }

        var audit = _serverAudit
            || string.Equals(_userName, "denetim", StringComparison.OrdinalIgnoreCase)
            || string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);

        var window = new PdksUnifiedWindow(_token, _people, _paths, CanWrite && !audit)
        {
            Owner = this,
        };
        window.ShowDialog();
    }
}
