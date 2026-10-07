using System.Drawing;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace QuickDataTool;

internal sealed class PasswordGateForm : Form
{
    readonly TextBox password = new() { UseSystemPasswordChar = true, Width = 250 };
    readonly Label info = new() { AutoSize = true, ForeColor = Color.DimGray };
    readonly Button login = new() { Text = "GİRİŞ", Width = 110, Height = 34 };
    readonly Button recover = new() { Text = "ŞİFREMİ UNUTTUM", Width = 145, Height = 34 };
    readonly System.Windows.Forms.Timer cooldownTimer = new() { Interval = 1000 };
    int attempts;
    int cooldown;

    private static readonly GateVerifier Verifier = LoadVerifier();
    private static readonly byte[] Salt = Convert.FromBase64String(Verifier.Salt);
    private static readonly byte[] Expected = Convert.FromBase64String(Verifier.Expected);
    private sealed record GateVerifier(string Salt, string Expected);

    static GateVerifier LoadVerifier()
    {
        using var stream = typeof(PasswordGateForm).Assembly.GetManifestResourceStream("QuickDataTool.PasswordGate.json")
            ?? throw new InvalidOperationException("Açılış şifresi doğrulayıcısı pakette bulunamadı.");
        return System.Text.Json.JsonSerializer.Deserialize<GateVerifier>(stream)
            ?? throw new InvalidOperationException("Açılış şifresi doğrulayıcısı geçersiz.");
    }

    internal PasswordGateForm()
    {
        Text = "HKN PDKS - Giriş";
        Width = 460;
        Height = 240;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Font = new Font("Segoe UI", 10f);

        try { PasswordRecoveryService.EnsureRecoveryCode(); } catch { }

        var title = new Label { Text = "HKN PDKS", AutoSize = true, Font = new Font("Segoe UI", 15f, FontStyle.Bold) };
        var passwordLabel = new Label { Text = "Şifre", AutoSize = true, Padding = new Padding(0, 7, 6, 0) };
        var close = new Button { Text = "KAPAT", Width = 90, Height = 34, DialogResult = DialogResult.Cancel };
        login.Click += (_, _) => CheckPassword();
        recover.Click += (_, _) => RecoverPassword();

        var root = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(28, 20, 20, 15)
        };
        root.Controls.Add(title);
        var row = new FlowLayoutPanel { Width = 380, Height = 38, WrapContents = false };
        row.Controls.Add(passwordLabel);
        row.Controls.Add(password);
        root.Controls.Add(row);
        info.Text = "Yetkili kullanıcı girişi";
        root.Controls.Add(info);
        var actions = new FlowLayoutPanel { Width = 380, Height = 42, FlowDirection = FlowDirection.RightToLeft };
        actions.Controls.Add(close);
        actions.Controls.Add(login);
        actions.Controls.Add(recover);
        root.Controls.Add(actions);
        Controls.Add(root);
        AcceptButton = login;
        CancelButton = close;

        cooldownTimer.Tick += (_, _) =>
        {
            cooldown--;
            if (cooldown <= 0)
            {
                cooldownTimer.Stop();
                attempts = 0;
                password.Enabled = login.Enabled = true;
                info.Text = "Tekrar deneyebilirsiniz. Şifrenizi unuttuysanız kurtarma kodunu kullanın.";
                info.ForeColor = Color.DimGray;
                password.Focus();
            }
            else
            {
                info.Text = $"Çok sayıda hatalı deneme. {cooldown} sn sonra tekrar deneyin veya ŞİFREMİ UNUTTUM.";
            }
        };

        AppTheme.Apply(this);
        Shown += (_, _) => password.Focus();
    }

    void CheckPassword()
    {
        var embedded = new PasswordRecoveryService.Verifier(Verifier.Salt, Verifier.Expected);
        var current = PasswordRecoveryService.CurrentPassword(embedded);
        if (PasswordRecoveryService.Verify(password.Text, current))
        {
            try { PasswordRecoveryService.EnsureRecoveryCode(true); } catch { }
            DialogResult = DialogResult.OK;
            Close();
            return;
        }

        attempts++;
        password.Clear();
        if (attempts >= 5)
        {
            cooldown = 30;
            password.Enabled = login.Enabled = false;
            info.Text = "5 hatalı deneme. 30 sn bekleyin veya ŞİFREMİ UNUTTUM.";
            info.ForeColor = Color.DarkRed;
            cooldownTimer.Start();
            return;
        }
        info.Text = $"Şifre hatalı. Kalan deneme: {5-attempts}";
        info.ForeColor = Color.DarkRed;
        password.Focus();
    }

    void RecoverPassword()
    {
        using var dialog = new Form
        {
            Text = "HKN PDKS - Şifre Kurtarma",
            Width = 610,
            Height = 330,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            Font = new Font("Segoe UI", 10f)
        };

        var code = new TextBox { Dock = DockStyle.Fill };
        var newPassword = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
        var repeat = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 2, RowCount = 5 };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        table.Controls.Add(new Label { Text = "Kurtarma Kodu", AutoSize = true, Padding = new Padding(0,7,0,0) },0,0);
        table.Controls.Add(code,1,0);
        table.Controls.Add(new Label { Text = "Yeni Şifre", AutoSize = true, Padding = new Padding(0,7,0,0) },0,1);
        table.Controls.Add(newPassword,1,1);
        table.Controls.Add(new Label { Text = "Yeni Şifre Tekrar", AutoSize = true, Padding = new Padding(0,7,0,0) },0,2);
        table.Controls.Add(repeat,1,2);
        var recoveryInfo = new Label
        {
            Text = "Kurtarma kodu dosyası:\n" + PasswordRecoveryService.RecoveryTextPath,
            AutoSize = true, MaximumSize = new Size(540,0), ForeColor = Color.DimGray, Padding = new Padding(0,8,0,0)
        };
        table.Controls.Add(recoveryInfo,0,3);
        table.SetColumnSpan(recoveryInfo,2);

        var reset = new Button { Text = "ŞİFREYİ SIFIRLA", Width = 150, Height = 34 };
        var cancel = new Button { Text = "VAZGEÇ", Width = 100, Height = 34, DialogResult = DialogResult.Cancel };
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        actions.Controls.Add(cancel);
        actions.Controls.Add(reset);
        table.Controls.Add(actions,0,4);
        table.SetColumnSpan(actions,2);
        dialog.Controls.Add(table);
        dialog.CancelButton = cancel;
        reset.Click += (_, _) =>
        {
            if (!PasswordRecoveryService.VerifyRecovery(code.Text))
            {
                MessageBox.Show(dialog, "Kurtarma kodu hatalı.", "Şifre Kurtarma", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (newPassword.Text != repeat.Text)
            {
                MessageBox.Show(dialog, "Yeni şifreler aynı değil.", "Şifre Kurtarma", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                PasswordRecoveryService.SetPassword(newPassword.Text);
                PasswordRecoveryService.RegenerateRecoveryCode();
                MessageBox.Show(dialog,
                    "Şifre değiştirildi. Eski kurtarma kodu iptal edildi ve yeni kurtarma kodu oluşturuldu.\n\n" +
                    PasswordRecoveryService.RecoveryTextPath,
                    "Şifre Kurtarma", MessageBoxButtons.OK, MessageBoxIcon.Information);
                dialog.DialogResult = DialogResult.OK;
                dialog.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(dialog, ex.Message, "Şifre Kurtarma", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };
        AppTheme.Apply(dialog);
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            attempts = 0;
            cooldown = 0;
            cooldownTimer.Stop();
            password.Enabled = login.Enabled = true;
            info.Text = "Yeni şifre kaydedildi. Giriş yapabilirsiniz.";
            info.ForeColor = Color.DarkGreen;
            password.Focus();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) cooldownTimer.Dispose();
        base.Dispose(disposing);
    }
}
