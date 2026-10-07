using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class DbConnectionHelper
{
	private static readonly Dictionary<string, (string User, string Password)> SessionCredentials = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase);

	internal static bool TryOpen(IWin32Window owner, string databasePath, out FirebirdDatabase? database, out PdksOptions? options, out string user, out string error)
	{
		database = null;
		options = null;
		user = "SYSDBA";
		error = "";
		(string, string) value;
		(string, string) tuple = (SessionCredentials.TryGetValue(databasePath, out value) ? value : ("SYSDBA", "masterkey"));
		if (TryCredentials(databasePath, tuple.Item1, tuple.Item2, out database, out options, out error))
		{
			(user, _) = tuple;
			SessionCredentials[databasePath] = tuple;
			return true;
		}
		if (!Prompt(owner, tuple.Item1, out string user2, out string password))
		{
			error = "Bağlantı iptal edildi.";
			return false;
		}
		if (!TryCredentials(databasePath, user2, password, out database, out options, out error))
		{
			MessageBox.Show("Veritabanına bağlanılamadı.\n\n" + error, "Firebird Bağlantısı", MessageBoxButtons.OK, MessageBoxIcon.Hand);
			return false;
		}
		user = user2;
		SessionCredentials[databasePath] = (user2, password);
		return true;
	}

	private static bool TryCredentials(string path, string user, string password, out FirebirdDatabase? database, out PdksOptions? options, out string error)
	{
		database = null;
		options = null;
		error = "";
		try
		{
			PdksOptions pdksOptions = PdksOptions.FromEnvironment()with
			{
				DatabasePath = path,
				DatabaseUser = (string.IsNullOrWhiteSpace(user) ? "SYSDBA" : user.Trim()),
				DatabasePassword = (password ?? string.Empty)
			};
			FirebirdDatabase firebirdDatabase = new FirebirdDatabase(pdksOptions);
			using (firebirdDatabase.OpenConnection())
			{
				database = firebirdDatabase;
				options = pdksOptions;
				return true;
			}
		}
		catch (Exception ex)
		{
			error = ex.Message;
			return false;
		}
	}

	private static bool Prompt(IWin32Window owner, string defaultUser, out string user, out string password)
	{
		using Form form = new Form
		{
			Text = "Firebird Veritabanı Girişi",
			Width = 440,
			Height = 245,
			StartPosition = FormStartPosition.CenterParent,
			FormBorderStyle = FormBorderStyle.FixedDialog,
			MaximizeBox = false,
			MinimizeBox = false,
			Font = new Font("Segoe UI", 9.5f)
		};
		TextBox textBox = new TextBox
		{
			Width = 260,
			Text = (string.IsNullOrWhiteSpace(defaultUser) ? "SYSDBA" : defaultUser)
		};
		TextBox passBox = new TextBox
		{
			Width = 260,
			UseSystemPasswordChar = true
		};
		Label control = new Label
		{
			Text = "Varsayılan SYSDBA / masterkey kabul edilmedi. Bu veritabanının kullanıcı ve şifresini girin.",
			AutoSize = true,
			MaximumSize = new Size(370, 0),
			ForeColor = Color.DimGray
		};
		Button button = new Button
		{
			Text = "BAĞLAN",
			Width = 105,
			Height = 32,
			DialogResult = DialogResult.OK
		};
		Button button2 = new Button
		{
			Text = "VAZGEÇ",
			Width = 95,
			Height = 32,
			DialogResult = DialogResult.Cancel
		};
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			ColumnCount = 2,
			RowCount = 4,
			Padding = new Padding(18)
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		tableLayoutPanel.Controls.Add(new Label
		{
			Text = "Kullanıcı",
			AutoSize = true,
			Padding = new Padding(0, 6, 0, 0)
		}, 0, 0);
		tableLayoutPanel.Controls.Add(textBox, 1, 0);
		tableLayoutPanel.Controls.Add(new Label
		{
			Text = "Şifre",
			AutoSize = true,
			Padding = new Padding(0, 6, 0, 0)
		}, 0, 1);
		tableLayoutPanel.Controls.Add(passBox, 1, 1);
		tableLayoutPanel.Controls.Add(control, 0, 2);
		tableLayoutPanel.SetColumnSpan(control, 2);
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			FlowDirection = FlowDirection.RightToLeft
		};
		flowLayoutPanel.Controls.Add(button2);
		flowLayoutPanel.Controls.Add(button);
		tableLayoutPanel.Controls.Add(flowLayoutPanel, 0, 3);
		tableLayoutPanel.SetColumnSpan(flowLayoutPanel, 2);
		form.Controls.Add(tableLayoutPanel);
		form.AcceptButton = button;
		form.CancelButton = button2;
		AppTheme.Apply(form);
		form.Shown += delegate
		{
			passBox.Focus();
		};
		if (form.ShowDialog(owner) != DialogResult.OK)
		{
			user = "";
			password = "";
			return false;
		}
		user = (string.IsNullOrWhiteSpace(textBox.Text) ? "SYSDBA" : textBox.Text.Trim());
		password = passBox.Text;
		return true;
	}
}
