using System;
using System.Drawing;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace QuickDataTool;

internal sealed class PasswordGateForm : Form
{
	private readonly TextBox password = new TextBox
	{
		UseSystemPasswordChar = true,
		Width = 250
	};

	private readonly Label info = new Label
	{
		AutoSize = true,
		ForeColor = Color.DimGray
	};

	private int attempts;

	private static readonly GateVerifier Verifier = LoadVerifier();
	private static readonly byte[] Salt = Convert.FromBase64String(Verifier.Salt);
	private static readonly byte[] Expected = Convert.FromBase64String(Verifier.Expected);

	private sealed record GateVerifier(string Salt, string Expected);

	private static GateVerifier LoadVerifier()
	{
		using var stream = typeof(PasswordGateForm).Assembly.GetManifestResourceStream("QuickDataTool.PasswordGate.json")
			?? throw new InvalidOperationException("Açılış şifresi doğrulayıcısı pakette bulunamadı.");
		return System.Text.Json.JsonSerializer.Deserialize<GateVerifier>(stream)
			?? throw new InvalidOperationException("Açılış şifresi doğrulayıcısı geçersiz.");
	}

	internal PasswordGateForm()
	{
		Text = "HKN PDKS - Giriş";
		base.Width = 390;
		base.Height = 205;
		base.StartPosition = FormStartPosition.CenterScreen;
		base.FormBorderStyle = FormBorderStyle.FixedDialog;
		base.MaximizeBox = false;
		base.MinimizeBox = false;
		Font = new Font("Segoe UI", 10f);
		Label value = new Label
		{
			Text = "HKN PDKS",
			AutoSize = true,
			Font = new Font("Segoe UI", 15f, FontStyle.Bold)
		};
		Label value2 = new Label
		{
			Text = "Şifre",
			AutoSize = true,
			Padding = new Padding(0, 7, 6, 0)
		};
		Button button = new Button
		{
			Text = "GİRİŞ",
			Width = 110,
			Height = 34
		};
		Button button2 = new Button
		{
			Text = "KAPAT",
			Width = 90,
			Height = 34,
			DialogResult = DialogResult.Cancel
		};
		button.Click += delegate
		{
			CheckPassword();
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			FlowDirection = FlowDirection.TopDown,
			WrapContents = false,
			Padding = new Padding(28, 20, 20, 15)
		};
		flowLayoutPanel.Controls.Add(value);
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Width = 325,
			Height = 38,
			WrapContents = false
		};
		flowLayoutPanel2.Controls.Add(value2);
		flowLayoutPanel2.Controls.Add(password);
		flowLayoutPanel.Controls.Add(flowLayoutPanel2);
		info.Text = "Yetkili kullanıcı girişi";
		flowLayoutPanel.Controls.Add(info);
		FlowLayoutPanel flowLayoutPanel3 = new FlowLayoutPanel
		{
			Width = 325,
			Height = 42,
			FlowDirection = FlowDirection.RightToLeft
		};
		flowLayoutPanel3.Controls.Add(button2);
		flowLayoutPanel3.Controls.Add(button);
		flowLayoutPanel.Controls.Add(flowLayoutPanel3);
		base.Controls.Add(flowLayoutPanel);
		base.AcceptButton = button;
		base.CancelButton = button2;
		base.Shown += delegate
		{
			password.Focus();
		};
	}

	private void CheckPassword()
	{
		if (CryptographicOperations.FixedTimeEquals(Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password.Text), Salt, 210000, HashAlgorithmName.SHA256, 32), Expected))
		{
			base.DialogResult = DialogResult.OK;
			Close();
			return;
		}
		attempts++;
		password.Clear();
		if (attempts >= 5)
		{
			MessageBox.Show("Çok fazla hatalı deneme. Uygulama kapatılacak.", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
			base.DialogResult = DialogResult.Cancel;
			Close();
		}
		else
		{
			info.Text = $"Şifre hatalı. Kalan deneme: {5 - attempts}";
			info.ForeColor = Color.DarkRed;
			password.Focus();
		}
	}
}
