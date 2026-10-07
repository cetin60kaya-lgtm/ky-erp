using System;
using System.Collections.Generic;
using System.Windows.Forms;
using KYERP.PDKS.Core;

namespace QuickDataTool;

public sealed class PersonnelEditForm : Form
{
	private readonly Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();

	private readonly DateTimePicker hire = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly DateTimePicker exit = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly CheckBox hasExit = new CheckBox
	{
		Text = "İşten çıkış tarihi var",
		AutoSize = true
	};

	public static readonly string[] EditableFields = new string[54]
	{
		"AD", "SOYAD", "SICILNO", "GRUP", "SERVIS", "SIRKET", "BOLUM", "DURUM", "GOREV", "MAAS",
		"NSUCRET", "MSUCRET", "EMAAS", "GYUCRET", "GYEMUCRET", "UKNO", "CINSIYET", "IL", "ILCE", "KGB",
		"CILTNO", "KSIRANO", "SAYFANO", "DYER", "DTARIH", "KAYITNO", "BABAAD", "ANAAD", "VYER", "MEDHAL",
		"NCVTAR", "NCVNED", "UYRUK", "VKNO", "SSKNO", "SGKGIRTAR", "ASDURUM", "ELBNO", "EGTDURUM", "AYNO",
		"YDIL", "KULIZIN", "UALAN", "CCKSAY", "ESINIF", "EVTEL", "EVILILCE", "GSM", "EBELGENO", "EVTAR",
		"EKC", "ICIKSEBEB", "ADRES", "BHNO"
	};

	public bool HasExit => hasExit.Checked;

	public DateTime HireDate => hire.Value.Date;

	public DateTime? ExitDate
	{
		get
		{
			if (!hasExit.Checked)
			{
				return null;
			}
			return exit.Value.Date;
		}
	}

	public string Get(string key)
	{
		if (!boxes.TryGetValue(key, out var value) || value is null)
		{
			return "";
		}
		return value.Text.Trim();
	}

	public PersonnelEditForm(FirebirdDatabase database, DataGridViewRow row)
	{
		string text = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
		Text = "Personel Kartı Düzenle - " + text;
		base.Width = 820;
		base.Height = 760;
		base.StartPosition = FormStartPosition.CenterParent;
		TabControl tabControl = new TabControl
		{
			Dock = DockStyle.Fill
		};
		tabControl.TabPages.Add(Page("İş / Ücret", row, new string[15]
		{
			"AD", "SOYAD", "SICILNO", "GRUP", "SERVIS", "SIRKET", "BOLUM", "DURUM", "GOREV", "MAAS",
			"NSUCRET", "MSUCRET", "EMAAS", "GYUCRET", "GYEMUCRET"
		}));
		tabControl.TabPages.Add(Page("Nüfus / Kimlik", row, new string[18]
		{
			"UKNO", "CINSIYET", "IL", "ILCE", "KGB", "CILTNO", "KSIRANO", "SAYFANO", "DYER", "DTARIH",
			"KAYITNO", "BABAAD", "ANAAD", "VYER", "MEDHAL", "NCVTAR", "NCVNED", "UYRUK"
		}));
		tabControl.TabPages.Add(Page("Kişisel / İletişim", row, new string[21]
		{
			"VKNO", "SSKNO", "SGKGIRTAR", "ASDURUM", "ELBNO", "EGTDURUM", "AYNO", "YDIL", "KULIZIN", "UALAN",
			"CCKSAY", "ESINIF", "EVTEL", "EVILILCE", "GSM", "EBELGENO", "EVTAR", "EKC", "ICIKSEBEB", "ADRES",
			"BHNO"
		}));
		TabPage payrollPage = new TabPage("Bordro");
		payrollPage.Controls.Add(new PayrollPersonControl(database, text));
		tabControl.TabPages.Add(payrollPage);
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 80,
			Padding = new Padding(12)
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "İşe giriş",
			AutoSize = true,
			Padding = new Padding(0, 8, 4, 0)
		});
		flowLayoutPanel.Controls.Add(hire);
		flowLayoutPanel.Controls.Add(hasExit);
		flowLayoutPanel.Controls.Add(exit);
		if (row.Cells["IGTARIH"].Value is DateTime value)
		{
			hire.Value = value;
		}
		if (row.Cells["ICTARIH"].Value != DBNull.Value && row.Cells["ICTARIH"].Value is DateTime value2)
		{
			hasExit.Checked = true;
			exit.Value = value2;
		}
		hasExit.CheckedChanged += delegate
		{
			exit.Enabled = hasExit.Checked;
		};
		exit.Enabled = hasExit.Checked;
		Button button = new Button
		{
			Text = "Kaydet",
			DialogResult = DialogResult.OK,
			Width = 120
		};
		Button button2 = new Button
		{
			Text = "Vazgeç",
			DialogResult = DialogResult.Cancel,
			Width = 120
		};
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Dock = DockStyle.Bottom,
			Height = 48,
			FlowDirection = FlowDirection.RightToLeft,
			Padding = new Padding(8)
		};
		flowLayoutPanel2.Controls.Add(button);
		flowLayoutPanel2.Controls.Add(button2);
		base.Controls.Add(tabControl);
		base.Controls.Add(flowLayoutPanel);
		base.Controls.Add(flowLayoutPanel2);
		base.AcceptButton = button;
		base.CancelButton = button2;
		AppTheme.Apply(this);
	}

	private TabPage Page(string title, DataGridViewRow row, string[] fields)
	{
		TabPage tabPage = new TabPage(title);
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			AutoScroll = true,
			Padding = new Padding(14),
			ColumnCount = 2
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 200f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		foreach (string text in fields)
		{
			DataGridView? dataGridView = row.DataGridView;
			string text2 = ((dataGridView != null && dataGridView.Columns.Contains(text)) ? (Convert.ToString(row.Cells[text].Value) ?? "") : "");
			TextBox textBox = new TextBox
			{
				Dock = DockStyle.Top,
				Text = text2
			};
			boxes[text] = textBox;
			tableLayoutPanel.Controls.Add(new Label
			{
				Text = LabelFor(text),
				Dock = DockStyle.Top,
				Height = 28
			}, 0, tableLayoutPanel.RowCount);
			tableLayoutPanel.Controls.Add(textBox, 1, tableLayoutPanel.RowCount);
			tableLayoutPanel.RowCount++;
		}
		tabPage.Controls.Add(tableLayoutPanel);
		return tabPage;
	}

	private static string LabelFor(string key)
	{
		return key switch
		{
			"AD" => "Ad",
			"SOYAD" => "Soyad",
			"SICILNO" => "Sicil No",
			"GRUP" => "Grup",
			"SERVIS" => "Servis",
			"SIRKET" => "Şirket",
			"BOLUM" => "Bölüm",
			"DURUM" => "Durum",
			"GOREV" => "Görev",
			"MAAS" => "Maaş",
			"NSUCRET" => "Saat Ücreti",
			"MSUCRET" => "Fazla Mesai Ücreti",
			"EMAAS" => "Eski Maaşı",
			"GYUCRET" => "Günlük Yol Ücreti",
			"GYEMUCRET" => "Günlük Yemek Ücreti",
			"UKNO" => "Ulusal Kimlik No",
			"CINSIYET" => "Cinsiyet",
			"IL" => "İl",
			"ILCE" => "İlçe",
			"KGB" => "Kan Grubu",
			"DYER" => "Doğum Yeri",
			"BABAAD" => "Baba Adı",
			"ANAAD" => "Ana Adı",
			"MEDHAL" => "Medeni Hali",
			"UYRUK" => "Uyruğu",
			"VKNO" => "Vergi Kimlik No",
			"SSKNO" => "SSK No",
			"EVTEL" => "Ev Telefonu",
			"GSM" => "Cep Telefonu",
			"ICIKSEBEB" => "İşten Çıkış Sebebi",
			"ADRES" => "Adres",
			"BHNO" => "Banka Hesap No",
			_ => key,
		};
	}
}