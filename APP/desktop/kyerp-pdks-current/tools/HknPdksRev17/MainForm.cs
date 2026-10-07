using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

public sealed partial class MainForm : Form
{
	private sealed class DayChoice
	{
		public DateTime Date { get; }

		public DayChoice(DateTime date)
		{
			Date = date.Date;
		}

		public override string ToString()
		{
			return Date.ToString("dd.MM.yyyy dddd", new CultureInfo("tr-TR"));
		}
	}

	private readonly TextBox dbPath = new TextBox
	{
		Dock = DockStyle.Fill
	};

	private readonly TextBox tnfPath = new TextBox
	{
		Dock = DockStyle.Fill
	};

	private readonly Label sourceStatus = new Label
	{
		AutoSize = true
	};

	private readonly TabControl tabs = new TabControl
	{
		Dock = DockStyle.Fill
	};

	private readonly DataGridView peopleGrid = Grid();

	private readonly DataGridView ioGrid = Grid();

	private readonly DataGridView payrollGrid = Grid();

	private readonly DataGridView eGrid = Grid();

	private readonly DataGridView paymentGrid = Grid();

	private readonly DataGridView advanceGrid = Grid();

	private readonly ComboBox personFilter = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 110
	};

	private readonly Label personSummary = new Label
	{
		AutoSize = true,
		Padding = new Padding(10, 8, 0, 0)
	};

	private readonly CheckedListBox ePeopleList = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly CheckedListBox eDayList = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly DateTimePicker eStart = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly DateTimePicker eEnd = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly ComboBox eSide = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 120
	};

	private readonly NumericUpDown ioYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox ioMonthNo = MonthCombo();

	private readonly ComboBox ioPerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private readonly NumericUpDown eYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox eMonthNo = MonthCombo();

	private readonly ComboBox ePerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private readonly DataGridView eHistoryGrid = Grid();

	private readonly NumericUpDown eHistoryYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox eHistoryMonth = MonthCombo();

	private readonly ComboBox eHistoryPerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private readonly NumericUpDown payrollYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox payrollMonthNo = MonthCombo();

	private readonly ComboBox payrollPerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private readonly Label payrollLockStatus = new Label
	{
		AutoSize = false,
		Width = 240,
		Height = 30,
		TextAlign = ContentAlignment.MiddleCenter,
		Font = new Font("Segoe UI", 9f, FontStyle.Bold),
		Margin = new Padding(8, 0, 0, 0)
	};

	private readonly Button payrollPeriodLockButton = new Button { Width = 125, Height = 30 };
	private readonly Button payrollPersonLockButton = new Button { Width = 150, Height = 30 };
	private readonly Button payrollPersonUnlockButton = new Button { Width = 135, Height = 30 };

	private readonly NumericUpDown paymentYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox paymentMonthNo = MonthCombo();

	private readonly ComboBox paymentPerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private readonly NumericUpDown advanceYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox advanceMonthNo = MonthCombo();

	private readonly ComboBox advancePerson = new ComboBox
	{
		DropDownStyle = ComboBoxStyle.DropDownList,
		Width = 220
	};

	private FirebirdDatabase? db;
	internal WorkTimePolicy WorkHours { get; private set; } = WorkTimePolicy.Default;
	internal event EventHandler? WorkHoursChanged;
	internal void SetWorkHours(WorkTimePolicy policy)
	{
		if (WorkHours == policy) return;
		WorkHours = policy;
		WorkHoursChanged?.Invoke(this, EventArgs.Empty);
	}

	private PdksOptions? options;

	public MainForm()
	{
		Text = "HKN PDKS REV25 — Hızlı Veri";
		base.StartPosition = FormStartPosition.CenterScreen;
		base.Width = 1380;
		base.Height = 820;
		MinimumSize = new Size(1100, 700);
		Font = new Font("Segoe UI", 9f);
		personFilter.Items.AddRange(new object[3] { "Aktif", "Pasif", "Tümü" });
		personFilter.SelectedIndex = 0;
		eSide.Items.AddRange(new object[3] { "Giriş E", "Çıkış E", "Giriş + Çıkış E" });
		eSide.SelectedIndex = 0;
		Build();
		personFilter.SelectedIndexChanged += delegate
		{
			LoadPeople();
		};
		eStart.ValueChanged += delegate
		{
			RebuildEDays();
		};
		eEnd.ValueChanged += delegate
		{
			RebuildEDays();
		};
		eYear.ValueChanged += delegate
		{
			ApplyEPeriodFilter();
		};
		eMonthNo.SelectedIndexChanged += delegate
		{
			ApplyEPeriodFilter();
		};
		ePerson.SelectedIndexChanged += delegate
		{
			if (!loadingEPeople) ApplyEPeriodFilter();
		};
		base.Shown += delegate
		{
			DetectSources();
		};
		ioYear.Value = eYear.Value = eHistoryYear.Value = payrollYear.Value = paymentYear.Value = advanceYear.Value = DateTime.Today.Year;
	}

	private static DataGridView Grid()
	{
		return new DataGridView
		{
			Dock = DockStyle.Fill,
			ReadOnly = true,
			AllowUserToAddRows = false,
			AllowUserToDeleteRows = false,
			AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
			SelectionMode = DataGridViewSelectionMode.FullRowSelect,
			MultiSelect = true,
			BackgroundColor = Color.White
		};
	}

	private static ComboBox MonthCombo()
	{
		ComboBox comboBox = new ComboBox
		{
			DropDownStyle = ComboBoxStyle.DropDownList,
			Width = 110
		};
		comboBox.Items.AddRange(new object[13]
		{
			"Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül",
			"Ekim", "Kasım", "Aralık"
		});
		comboBox.SelectedIndex = DateTime.Today.Month;
		return comboBox;
	}

	private void Build()
	{
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			RowCount = 2,
			ColumnCount = 1
		};
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 122f));
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
		tableLayoutPanel.Controls.Add(BuildSources(), 0, 0);

		// REV25: Tek ana menü sahibi vardır. Runtime injector / ikinci sekme ağacı yoktur.
		// Kullanıcı yalnız gerçek iş akışlarını görür; eski Toplu İşlem ve eski Audit ekranları üretim menüsünden çıkarılmıştır.
		tabs.TabPages.Add(Page("Personel", BuildPeople()));
		tabs.TabPages.Add(Page("Giriş-Çıkış", BuildIo()));
		tabs.TabPages.Add(Page("Kayıt Düzeltme", new DbRecordControl(this)));
		tabs.TabPages.Add(Page("E İşlemleri", BuildEWorkspace()));
		tabs.TabPages.Add(Page("Bordro", BuildPayroll()));
		tabs.TabPages.Add(Page("Ödeme / Avans", BuildPayments()));
		tabs.TabPages.Add(Page("DB - TNF Eşitle", new DbTnfSyncControl(this)));
		tabs.TabPages.Add(Page("TNF Hazırla", new TnfPrepareControl(this)));

		tableLayoutPanel.Controls.Add(tabs, 0, 1);
		base.Controls.Add(tableLayoutPanel);
	}

	private static TabPage Page(string title, Control content)
	{
		return new TabPage(title)
		{
			Padding = new Padding(8),
			BackColor = Color.White,
			Controls = { content }
		};
	}

	private Control BuildSources()
	{
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel();
		tableLayoutPanel.Dock = DockStyle.Fill;
		tableLayoutPanel.ColumnCount = 4;
		tableLayoutPanel.RowCount = 3;
		tableLayoutPanel.Padding = new Padding(10);
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 135f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120f));
		tableLayoutPanel.Controls.Add(new Label
		{
			Text = "Firebird Veritabanı",
			Dock = DockStyle.Fill,
			TextAlign = ContentAlignment.MiddleLeft
		}, 0, 0);
		tableLayoutPanel.Controls.Add(dbPath, 1, 0);
		tableLayoutPanel.Controls.Add(Btn("GDB Seç", PickDb), 2, 0);
		tableLayoutPanel.Controls.Add(new Label
		{
			Text = "Terminal TNF",
			Dock = DockStyle.Fill,
			TextAlign = ContentAlignment.MiddleLeft
		}, 0, 1);
		tableLayoutPanel.Controls.Add(tnfPath, 1, 1);
		tableLayoutPanel.Controls.Add(Btn("TNF Seç", PickTnf), 2, 1);
		tableLayoutPanel.Controls.Add(Btn("Otomatik Tanı", DetectSources), 3, 0);
		tableLayoutPanel.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 1);
		tableLayoutPanel.Controls.Add(sourceStatus, 1, 2);
		tableLayoutPanel.SetColumnSpan(sourceStatus, 3);
		return tableLayoutPanel;
	}

	private static Button Btn(string text, Action action)
	{
		Button button = new Button();
		button.Text = text;
		button.Dock = DockStyle.Fill;
		button.Height = 32;
		button.FlatStyle = FlatStyle.Flat;
		button.Click += delegate
		{
			action();
		};
		return button;
	}

	private static Button WideBtn(string text, Action action, int width)
	{
		Button button = new Button();
		button.Text = text;
		button.Width = width;
		button.Height = 32;
		button.FlatStyle = FlatStyle.Flat;
		button.Margin = new Padding(3, 0, 3, 0);
		button.Click += delegate
		{
			action();
		};
		return button;
	}

	private Control BuildPeople()
	{
		Panel obj = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 44,
			Padding = new Padding(2, 3, 2, 2)
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel Durumu",
			AutoSize = true,
			Padding = new Padding(0, 8, 4, 0)
		});
		flowLayoutPanel.Controls.Add(personFilter);
		flowLayoutPanel.Controls.Add(Btn("Yenile", LoadPeople));
		flowLayoutPanel.Controls.Add(WideBtn("Seçili Personeli Düzenle", EditSelectedPerson, 185));
		flowLayoutPanel.Controls.Add(personSummary);
		obj.Controls.Add(peopleGrid);
		obj.Controls.Add(flowLayoutPanel);
		return obj;
	}

	private Control BuildIo()
	{
		Panel obj = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 46
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(ioYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(ioMonthNo);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(ioPerson);
		flowLayoutPanel.Controls.Add(Btn("Listele", LoadIo));
		obj.Controls.Add(ioGrid);
		obj.Controls.Add(flowLayoutPanel);
		return obj;
	}

	private Control BuildEWorkspace()
	{
		TabControl workspace = new TabControl { Dock = DockStyle.Fill };
		workspace.TabPages.Add(Page("E Yap / Düzelt", BuildE()));
		workspace.TabPages.Add(Page("E Geçmişi / İmza", BuildEHistory()));
		return workspace;
	}

	private Control BuildE()
	{
		TableLayoutPanel obj = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			ColumnCount = 3,
			RowCount = 3,
			Padding = new Padding(8),
			ColumnStyles =
			{
				new ColumnStyle(SizeType.Absolute, 300f),
				new ColumnStyle(SizeType.Absolute, 250f),
				new ColumnStyle(SizeType.Percent, 100f)
			},
			RowStyles =
			{
				new RowStyle(SizeType.Absolute, 78f),
				new RowStyle(SizeType.Percent, 100f),
				new RowStyle(SizeType.Absolute, 48f)
			}
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			WrapContents = true
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(eYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(eMonthNo);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(ePerson);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "İşlem",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(eSide);
		obj.Controls.Add(flowLayoutPanel, 0, 0);
		obj.SetColumnSpan(flowLayoutPanel, 3);
		obj.Controls.Add(ePeopleList, 0, 1);
		obj.Controls.Add(eDayList, 1, 1);
		obj.Controls.Add(eGrid, 2, 1);
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			FlowDirection = FlowDirection.LeftToRight,
			WrapContents = false,
			Padding = new Padding(4, 6, 4, 2)
		};
		flowLayoutPanel2.Controls.Add(WideBtn("Tüm Personeli Seç", CheckAllEPeople, 135));
		flowLayoutPanel2.Controls.Add(WideBtn("Tüm Günleri Seç", CheckAllEDays, 130));
		flowLayoutPanel2.Controls.Add(WideBtn("Hafta Sonu Hariç", CheckEWeekdays, 145));
		flowLayoutPanel2.Controls.Add(WideBtn("E Önizleme", PreviewBulkE, 115));
		flowLayoutPanel2.Controls.Add(WideBtn("E Uygula", ApplyBulkE, 110));
		obj.Controls.Add(flowLayoutPanel2, 0, 2);
		obj.SetColumnSpan(flowLayoutPanel2, 3);
		return obj;
	}

	private Control BuildEHistory()
	{
		Panel obj = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 46
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(eHistoryYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(eHistoryMonth);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(eHistoryPerson);
		flowLayoutPanel.Controls.Add(Btn("Listele", LoadEHistory));
		flowLayoutPanel.Controls.Add(Btn("İmza CSV", ExportEHistoryCsv));
		obj.Controls.Add(eHistoryGrid);
		obj.Controls.Add(flowLayoutPanel);
		return obj;
	}

	private Control BuildPayroll()
	{
		Panel obj = new Panel { Dock = DockStyle.Fill };
		payrollGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
		payrollGrid.MultiSelect = true;
		payrollGrid.RowHeadersVisible = false;
		payrollGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells;

		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 82,
			WrapContents = true,
			Padding = new Padding(4, 4, 4, 2)
		};
		flowLayoutPanel.Controls.Add(new Label { Text = "Yıl", AutoSize = true, Padding = new Padding(0, 8, 3, 0) });
		flowLayoutPanel.Controls.Add(payrollYear);
		flowLayoutPanel.Controls.Add(new Label { Text = "Ay", AutoSize = true, Padding = new Padding(7, 8, 3, 0) });
		flowLayoutPanel.Controls.Add(payrollMonthNo);
		flowLayoutPanel.Controls.Add(new Label { Text = "Personel", AutoSize = true, Padding = new Padding(7, 8, 3, 0) });
		flowLayoutPanel.Controls.Add(payrollPerson);
		flowLayoutPanel.Controls.Add(WideBtn("Listele", LoadPayroll, 90));
		flowLayoutPanel.Controls.Add(WideBtn("Düzenle", EditPayrollSelected, 95));
		flowLayoutPanel.Controls.Add(WideBtn("Toplu Düzenle", EditPayrollBulk, 125));
		payrollPeriodLockButton.Click += (_, _) => TogglePayrollPeriodLock();
		payrollPersonLockButton.Click += (_, _) => SetSelectedPayrollLocks(true);
		payrollPersonUnlockButton.Click += (_, _) => SetSelectedPayrollLocks(false);
		flowLayoutPanel.Controls.Add(payrollPeriodLockButton);
		flowLayoutPanel.Controls.Add(payrollPersonLockButton);
		flowLayoutPanel.Controls.Add(payrollPersonUnlockButton);
		flowLayoutPanel.Controls.Add(WideBtn("Çakışanları Temizle", CleanPayrollOverlap, 155));
		flowLayoutPanel.Controls.Add(payrollLockStatus);
		obj.Controls.Add(payrollGrid);
		obj.Controls.Add(flowLayoutPanel);
		return obj;
	}

	private Control BuildPayments()
	{
		TabControl obj = new TabControl
		{
			Dock = DockStyle.Fill
		};
		Panel panel = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 44
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(paymentYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(paymentMonthNo);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(paymentPerson);
		flowLayoutPanel.Controls.Add(WideBtn("Ödemeleri Listele", LoadPayments, 145));
		flowLayoutPanel.Controls.Add(WideBtn("Seçili Ödemeyi Düzenle", EditSelectedPayment, 190));
		panel.Controls.Add(paymentGrid);
		panel.Controls.Add(flowLayoutPanel);
		Panel panel2 = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 44
		};
		flowLayoutPanel2.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 3, 0)
		});
		flowLayoutPanel2.Controls.Add(advanceYear);
		flowLayoutPanel2.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel2.Controls.Add(advanceMonthNo);
		flowLayoutPanel2.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel2.Controls.Add(advancePerson);
		flowLayoutPanel2.Controls.Add(WideBtn("Avansları Listele", LoadAdvances, 145));
		flowLayoutPanel2.Controls.Add(WideBtn("Seçili Avansı Düzenle", EditSelectedAdvance, 185));
		panel2.Controls.Add(advanceGrid);
		panel2.Controls.Add(flowLayoutPanel2);
		obj.TabPages.Add(Page("Ödemeler", panel));
		obj.TabPages.Add(Page("Avanslar", panel2));
		return obj;
	}

	private void LoadPayments()
	{
		if (db != null)
		{
			DateTime dateTime = new DateTime((int)paymentYear.Value, (paymentMonthNo.SelectedIndex == 0) ? 1 : paymentMonthNo.SelectedIndex, 1);
			DateTime dateTime2 = ((paymentMonthNo.SelectedIndex == 0) ? dateTime.AddYears(1) : dateTime.AddMonths(1));
			string text = SelectedCard(paymentPerson);
			string sql = "select o.PKNO,k.AD,k.SOYAD,k.MAAS as KART_MAAS,o.BASTAR,o.BITTAR,o.NODENEN,o.NOTARIH,o.FMODENEN,o.FMOTARIH from ODEME o inner join KIMLIK k on k.PKNO=o.PKNO where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and o.BASTAR>=@A and o.BASTAR<@B" + ((text == null) ? "" : " and o.PKNO=@P") + " order by o.PKNO";
			paymentGrid.DataSource = ((text == null) ? db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2)) : db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2), new FbParameter("@P", text)));
		}
	}

	private void LoadAdvances()
	{
		if (db != null)
		{
			DateTime dateTime = new DateTime((int)advanceYear.Value, (advanceMonthNo.SelectedIndex == 0) ? 1 : advanceMonthNo.SelectedIndex, 1);
			DateTime dateTime2 = ((advanceMonthNo.SelectedIndex == 0) ? dateTime.AddYears(1) : dateTime.AddMonths(1));
			string text = SelectedCard(advancePerson);
			string sql = "select a.KOD,a.PKNO,k.AD,k.SOYAD,a.TARIH,a.MIKTAR,a.VTARIH,a.TURKOD,a.TOPMIKTAR,a.TAKSITSAYISI,a.TAKSITNO,a.ACIKLAMA from AVANS a inner join KIMLIK k on k.PKNO=a.PKNO where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and a.TARIH>=@A and a.TARIH<@B" + ((text == null) ? "" : " and a.PKNO=@P") + " order by a.TARIH desc,a.KOD desc";
			advanceGrid.DataSource = ((text == null) ? db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2)) : db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2), new FbParameter("@P", text)));
		}
	}

	private void EditSelectedPayment()
	{
		if (db == null || paymentGrid.SelectedRows.Count != 1)
		{
			MessageBox.Show("Tek ödeme satırı seçin.");
			return;
		}
		DataGridViewRow dataGridViewRow = paymentGrid.SelectedRows[0];
		using RecordEditForm recordEditForm = new RecordEditForm("Ödeme Düzenle", dataGridViewRow, "NODENEN", "NOTARIH", "FMODENEN", "FMOTARIH");
		if (recordEditForm.ShowDialog(this) == DialogResult.OK)
		{
			string value = Convert.ToString(dataGridViewRow.Cells["PKNO"].Value) ?? "";
			DateTime dateTime = Convert.ToDateTime(dataGridViewRow.Cells["BASTAR"].Value);
			db.Execute("update ODEME set NODENEN=@N,NOTARIH=@NT,FMODENEN=@F,FMOTARIH=@FT where PKNO=@P and BASTAR=@B", new FbParameter("@N", Num(recordEditForm.Get("NODENEN"))), new FbParameter("@NT", DateOrDbNull(recordEditForm.Get("NOTARIH"))), new FbParameter("@F", Num(recordEditForm.Get("FMODENEN"))), new FbParameter("@FT", DateOrDbNull(recordEditForm.Get("FMOTARIH"))), new FbParameter("@P", value), new FbParameter("@B", dateTime));
			LoadPayments();
		}
	}

	private void EditSelectedAdvance()
	{
		if (db == null || advanceGrid.SelectedRows.Count != 1)
		{
			MessageBox.Show("Tek avans satırı seçin.");
			return;
		}
		DataGridViewRow dataGridViewRow = advanceGrid.SelectedRows[0];
		using RecordEditForm recordEditForm = new RecordEditForm("Avans Düzenle", dataGridViewRow, "TARIH", "MIKTAR", "VTARIH", "TURKOD", "TOPMIKTAR", "TAKSITSAYISI", "TAKSITNO", "ACIKLAMA");
		if (recordEditForm.ShowDialog(this) == DialogResult.OK)
		{
			int num = Convert.ToInt32(dataGridViewRow.Cells["KOD"].Value);
			db.Execute("update AVANS set TARIH=@T,MIKTAR=@M,VTARIH=@V,TURKOD=@TK,TOPMIKTAR=@TM,TAKSITSAYISI=@TS,TAKSITNO=@TN,ACIKLAMA=@A where KOD=@K", new FbParameter("@T", DateOrDbNull(recordEditForm.Get("TARIH"))), new FbParameter("@M", Num(recordEditForm.Get("MIKTAR"))), new FbParameter("@V", DateOrDbNull(recordEditForm.Get("VTARIH"))), new FbParameter("@TK", IntNum(recordEditForm.Get("TURKOD"))), new FbParameter("@TM", Num(recordEditForm.Get("TOPMIKTAR"))), new FbParameter("@TS", IntNum(recordEditForm.Get("TAKSITSAYISI"))), new FbParameter("@TN", IntNum(recordEditForm.Get("TAKSITNO"))), new FbParameter("@A", recordEditForm.Get("ACIKLAMA")), new FbParameter("@K", num));
			LoadAdvances();
		}
	}

	private void DetectSources()
	{
		var root = AppContext.BaseDirectory;
		for (var depth = 0; depth < 4; depth++)
		{
			var candidate = Path.Combine(root, "DATABASE.GDB");
			if (File.Exists(candidate))
			{
				dbPath.Text = candidate;
				tnfPath.Text = Path.Combine(root, $"TR{DateTime.Today.Year}.Tnf");
				UpdateSourceStatus();
				return;
			}
			root = Directory.GetParent(root)?.FullName ?? root;
		}
		string environmentVariable = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User);
		string[] source = new string[3]
		{
			"D:\\Hedef500\\Hedef500\\Data\\DATABASE.GDB",
			"C:\\Hedef500\\Data\\DATABASE.GDB",
			environmentVariable ?? ""
		};
		dbPath.Text = source.FirstOrDefault(File.Exists) ?? environmentVariable ?? "";
		string path = Path.Combine(string.IsNullOrWhiteSpace(dbPath.Text) ? "" : (Directory.GetParent(Path.GetDirectoryName(dbPath.Text) ?? "")?.FullName ?? ""), "Temp");
		tnfPath.Text = (Directory.Exists(path) ? ((from x in Directory.GetFiles(path, "TR*.Tnf")
			orderby x descending
			select x).FirstOrDefault() ?? "") : tnfPath.Text);
		UpdateSourceStatus();
	}

	private void PickDb()
	{
		OpenFileDialog openFileDialog = new OpenFileDialog
		{
			Filter = "Firebird veritabanı (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar (*.*)|*.*",
			FileName = dbPath.Text,
			CheckFileExists = true,
			Title = "Firebird veritabanını seçin"
		};
		try
		{
			if (openFileDialog.ShowDialog(this) == DialogResult.OK)
			{
				dbPath.Text = openFileDialog.FileName;
				UpdateSourceStatus();
				Connect();
			}
		}
		finally
		{
			((IDisposable)(object)openFileDialog)?.Dispose();
		}
	}

	private void PickTnf()
	{
		OpenFileDialog openFileDialog = new OpenFileDialog
		{
			Filter = "Terminal (*.tnf;*.txt)|*.tnf;*.txt|Tüm dosyalar|*.*",
			FileName = tnfPath.Text
		};
		try
		{
			if (openFileDialog.ShowDialog(this) == DialogResult.OK)
			{
				tnfPath.Text = openFileDialog.FileName;
				UpdateSourceStatus();
			}
		}
		finally
		{
			((IDisposable)(object)openFileDialog)?.Dispose();
		}
	}

	private void UpdateSourceStatus()
	{
		bool flag = File.Exists(dbPath.Text);
		bool flag2 = File.Exists(tnfPath.Text);
		sourceStatus.Text = "DB: " + (flag ? "SEÇİLDİ" : "SEÇİLMEDİ") + "   |   TNF: " + (flag2 ? "SEÇİLDİ" : "SEÇİLMEDİ");
		sourceStatus.ForeColor = (flag ? Color.DarkGreen : Color.DarkRed);
	}

	private async void Connect()
	{
		SetWorkHours(WorkTimePolicy.Default);
		FirebirdDatabase database;
		PdksOptions pdksOptions;
		string user;
		string error;
		if (string.IsNullOrWhiteSpace(dbPath.Text) || !File.Exists(dbPath.Text))
		{
			db = null;
			sourceStatus.Text = "Önce Veritabanı Seç ile .GDB/.FDB dosyasını seçin.";
			sourceStatus.ForeColor = Color.DarkRed;
		}
		else if (!DbConnectionHelper.TryOpen(this, dbPath.Text.Trim(), out database, out pdksOptions, out user, out error))
		{
			db = null;
			sourceStatus.Text = "Bağlantı yok: " + error;
			sourceStatus.ForeColor = Color.DarkRed;
		}
		else
		{
			db = database;
			options = pdksOptions;
			sourceStatus.Text = "Bağlandı: " + dbPath.Text + "   |   Kullanıcı: " + user;
			sourceStatus.ForeColor = Color.DarkGreen;
			try
			{
				await Task.Run(() => PayrollOverrideService.EnsureSchema(database!));
				var policy = await Task.Run(() => WorkTimePolicy.Read(database!, CancellationToken.None));
				if (!IsDisposed && ReferenceEquals(db, database))
				{
					SetWorkHours(policy);
					sourceStatus.Text += "   |   " + policy.Information;
				}
			}
			catch (Exception)
			{
				if (!IsDisposed && ReferenceEquals(db, database)) sourceStatus.Text += "   |   " + WorkTimePolicy.Default.Information;
			}
		}
	}

	private void LoadPeople()
	{
		if (db == null)
		{
			return;
		}
		try
		{
			string text = personFilter.SelectedItem?.ToString() ?? "Aktif";
			string text2 = ((text == "Aktif") ? " where (ICTARIH is null or ICTARIH>=@TODAY)" : ((text == "Pasif") ? " where ICTARIH is not null and ICTARIH<@TODAY" : ""));
			string text3 = ((text == "Tümü") ? " order by case when (ICTARIH is null or ICTARIH>=@TODAY) then 0 else 1 end, PKNO" : " order by PKNO");
			peopleGrid.DataSource = db.Query("select * from KIMLIK" + text2 + text3, new FbParameter("@TODAY", DateTime.Today));
			int num = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? ((object)0));
			int num2 = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is not null and ICTARIH<@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? ((object)0));
			personSummary.Text = $"Aktif: {num}   Pasif: {num2}   Toplam: {num + num2}";
			DataTable dataTable = db.Query("select PKNO,AD,SOYAD from KIMLIK where (ICTARIH is null or ICTARIH>=@TODAY) order by PKNO", new FbParameter("@TODAY", DateTime.Today));
			if (peopleGrid.Columns.Contains("ICTARIH"))
			{
				peopleGrid.Columns["ICTARIH"].HeaderText = "İşten Çıkış";
			}
			HashSet<string> hashSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
			{
				"PKNO", "SICILNO", "AD", "SOYAD", "IGTARIH", "ICTARIH", "DURUM", "MAAS", "NSUCRET", "MSUCRET",
				"BOLUM", "GOREV", "BHNO", "GSM"
			};
			foreach (DataGridViewColumn column in peopleGrid.Columns)
			{
				column.Visible = hashSet.Contains(column.Name);
			}
			string[] array = new string[14]
			{
				"PKNO", "AD", "SOYAD", "SICILNO", "BOLUM", "GOREV", "DURUM", "IGTARIH", "ICTARIH", "MAAS",
				"NSUCRET", "MSUCRET", "BHNO", "GSM"
			};
			for (int i = 0; i < array.Length; i++)
			{
				if (peopleGrid.Columns.Contains(array[i]))
				{
					peopleGrid.Columns[array[i]].DisplayIndex = i;
				}
			}
			foreach (KeyValuePair<string, string> item2 in new Dictionary<string, string>
			{
				["PKNO"] = "Kart No",
				["AD"] = "Ad",
				["SOYAD"] = "Soyad",
				["SICILNO"] = "Sicil No",
				["BOLUM"] = "Bölüm",
				["GOREV"] = "Görev",
				["DURUM"] = "Durum",
				["IGTARIH"] = "İşe Giriş",
				["ICTARIH"] = "İşten Çıkış",
				["MAAS"] = "Maaş",
				["NSUCRET"] = "Saat Ücreti",
				["MSUCRET"] = "Fazla Mesai",
				["BHNO"] = "Banka Hesap No",
				["GSM"] = "Cep Telefonu"
			})
			{
				if (peopleGrid.Columns.Contains(item2.Key))
				{
					peopleGrid.Columns[item2.Key].HeaderText = item2.Value;
				}
			}
			ComboBox[] array2 = new ComboBox[5] { ioPerson, eHistoryPerson, payrollPerson, paymentPerson, advancePerson };
			foreach (ComboBox comboBox in array2)
			{
				string text5 = comboBox.SelectedItem?.ToString();
				comboBox.Items.Clear();
				comboBox.Items.Add("Tümü");
				foreach (DataRow row2 in dataTable.Rows)
				{
					comboBox.Items.Add($"{row2["PKNO"]}  {row2["AD"]} {row2["SOYAD"]}");
				}
				comboBox.SelectedItem = ((text5 != null && comboBox.Items.Contains(text5)) ? text5 : "Tümü");
			}
			ApplyEPeriodFilter();
			LoadEHistory();
			ColorPeopleRows();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Personel");
		}
	}

	private void ColorPeopleRows()
	{
		foreach (DataGridViewRow item in (IEnumerable)peopleGrid.Rows)
		{
			if (!item.IsNewRow)
			{
				object value = item.Cells["ICTARIH"].Value;
				DateTime result;
				bool flag = value == null || value == DBNull.Value || (DateTime.TryParse(Convert.ToString(value), out result) && result.Date >= DateTime.Today);
				item.DefaultCellStyle.BackColor = (flag ? Color.Honeydew : Color.MistyRose);
				item.DefaultCellStyle.SelectionBackColor = (flag ? Color.PaleGreen : Color.LightSalmon);
				item.DefaultCellStyle.ForeColor = Color.Black;
			}
		}
	}

	private void EditSelectedPerson()
	{
		if (db == null || peopleGrid.SelectedRows.Count != 1)
		{
			MessageBox.Show("Tek personel seçin.");
			return;
		}
		DataGridViewRow dataGridViewRow = peopleGrid.SelectedRows[0];
		string text = Convert.ToString(dataGridViewRow.Cells["PKNO"].Value) ?? "";
		using PersonnelEditForm personnelEditForm = new PersonnelEditForm(db, dataGridViewRow);
		if (personnelEditForm.ShowDialog(this) == DialogResult.OK && MessageBox.Show(text + " personel kartı güncellenecek. Devam?", "Personel", MessageBoxButtons.YesNo) == DialogResult.Yes)
		{
			List<string> list = new List<string>();
			List<FbParameter> list2 = new List<FbParameter>();
			int num = 0;
			string[] editableFields = PersonnelEditForm.EditableFields;
			foreach (string text2 in editableFields)
			{
				string text3 = "@P" + num++;
				list.Add(text2 + "=" + text3);
				list2.Add(new FbParameter(text3, PersonValue(text2, personnelEditForm.Get(text2))));
			}
			list.Add("IGTARIH=@IG");
			list.Add("ICTARIH=@IC");
			list2.Add(new FbParameter("@IG", personnelEditForm.HireDate));
			DateTime? exitDate = personnelEditForm.ExitDate;
			object value;
			if (exitDate.HasValue)
			{
				DateTime valueOrDefault = exitDate.GetValueOrDefault();
				value = valueOrDefault;
			}
			else
			{
				value = DBNull.Value;
			}
			list2.Add(new FbParameter("@IC", value));
			list2.Add(new FbParameter("@CARD", text));
			db.Execute("update KIMLIK set " + string.Join(",", list) + " where PKNO=@CARD", list2.ToArray());
			LoadPeople();
		}
	}

	private static object PersonValue(string field, string text)
	{
		string[] source = new string[8] { "GRUP", "SERVIS", "SIRKET", "BOLUM", "DURUM", "GOREV", "KULIZIN", "CCKSAY" };
		string[] source2 = new string[6] { "MAAS", "NSUCRET", "MSUCRET", "EMAAS", "GYUCRET", "GYEMUCRET" };
		string[] source3 = new string[4] { "DTARIH", "NCVTAR", "EVTAR", "SGKGIRTAR" };
		if (source.Contains(field))
		{
			return IntNum(text);
		}
		if (source2.Contains(field))
		{
			return Num(text);
		}
		if (source3.Contains(field))
		{
			return DateOrDbNull(text);
		}
		return text;
	}

	private static double Num(string s)
	{
		if (!double.TryParse(s, out var result))
		{
			return 0.0;
		}
		return result;
	}

	private static int IntNum(string s)
	{
		if (!int.TryParse(s, out var result))
		{
			return 0;
		}
		return result;
	}

	private static object DateOrDbNull(string s)
	{
		if (!DateTime.TryParse(s, out var result))
		{
			return DBNull.Value;
		}
		return result;
	}

	private static string? SelectedCard(ComboBox cb)
	{
		string text = cb.SelectedItem?.ToString();
		if (!string.IsNullOrWhiteSpace(text) && !(text == "Tümü"))
		{
			return text.Substring(0, 5);
		}
		return null;
	}

	private void ApplyEPeriodFilter()
	{
		int year = (int)eYear.Value;
		int selectedIndex = eMonthNo.SelectedIndex;
		DateTime value = ((selectedIndex == 0) ? new DateTime(year, 1, 1) : new DateTime(year, selectedIndex, 1));
		DateTime value2 = ((selectedIndex == 0) ? value.AddYears(1).AddDays(-1.0) : value.AddMonths(1).AddDays(-1.0));
		eStart.Value = value;
		eEnd.Value = value2;
		RebuildEDays();
		if (!loadingEPeople) _ = LoadEPeopleAsync();
		string text = SelectedCard(ePerson);
		if (text != null)
		{
			for (int i = 0; i < ePeopleList.Items.Count; i++)
			{
				ePeopleList.SetItemChecked(i, ePeopleList.Items[i].ToString().StartsWith(text));
			}
		}
	}

	private void LoadIo()
	{
		if (db == null)
		{
			return;
		}
		try
		{
			int year = (int)ioYear.Value;
			int selectedIndex = ioMonthNo.SelectedIndex;
			DateTime dateTime = ((selectedIndex == 0) ? new DateTime(year, 1, 1) : new DateTime(year, selectedIndex, 1));
			DateTime dateTime2 = ((selectedIndex == 0) ? dateTime.AddYears(1) : dateTime.AddMonths(1));
			string text = SelectedCard(ioPerson);
			string sql = "select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))" + ((text == null) ? "" : " and g.PKNO=@P") + " order by coalesce(g.GTARIH,g.CTARIH),g.PKNO";
			ioGrid.DataSource = ((text == null) ? db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2)) : db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2), new FbParameter("@P", text)));
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Giriş-Çıkış");
		}
	}

	private void LoadPayroll()
	{
		if (db == null) return;
		try
		{
			PayrollOverrideService.EnsureSchema(db);
			int year = (int)payrollYear.Value;
			string? card = SelectedCard(payrollPerson);
			if (payrollMonthNo.SelectedIndex == 0)
			{
				DateTime start = new DateTime(year, 1, 1);
				DateTime end = start.AddYears(1);
				string sql = "select u.*,k.AD,k.SOYAD,k.MAAS as KART_MAAS from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR>=@A and u.BASTAR<@B" + (card == null ? "" : " and u.PKNO=@P") + " order by u.PKNO,u.BASTAR";
				payrollGrid.DataSource = card == null
					? db.Query(sql, new FbParameter("@A", start), new FbParameter("@B", end))
					: db.Query(sql, new FbParameter("@A", start), new FbParameter("@B", end), new FbParameter("@P", card));
			}
			else
			{
				payrollGrid.DataSource = PayrollOverrideService.GetMonthRows(db, year, payrollMonthNo.SelectedIndex, card);
			}
			RefreshPayrollLockUi();
			ConfigurePayrollGrid();
			ColorPayrollRows();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Bordro");
		}
	}

	private void RefreshPayrollLockUi()
	{
		if (db == null)
		{
			payrollLockStatus.Text = "";
			return;
		}
		if (payrollMonthNo.SelectedIndex == 0)
		{
			payrollLockStatus.Text = "AY SEÇİN";
			payrollLockStatus.ForeColor = Color.DimGray;
			payrollLockStatus.BackColor = SystemColors.Control;
			payrollPeriodLockButton.Enabled = false;
			payrollPersonLockButton.Enabled = false;
			payrollPersonUnlockButton.Enabled = false;
			return;
		}
		int year = (int)payrollYear.Value;
		int month = payrollMonthNo.SelectedIndex;
		bool periodLocked = PayrollOverrideService.IsPeriodLocked(db, year, month);
		string monthName = CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.GetMonthName(month);
		payrollLockStatus.Text = periodLocked ? $"{monthName} {year} • AY KİLİTLİ" : $"{monthName} {year} • AÇIK";
		payrollLockStatus.ForeColor = periodLocked ? Color.White : Color.DarkGreen;
		payrollLockStatus.BackColor = periodLocked ? Color.Firebrick : Color.Honeydew;
		payrollPeriodLockButton.Enabled = true;
		payrollPeriodLockButton.Text = periodLocked ? "Ay Kilidini Aç" : "Ayı Kilitle";
		payrollPeriodLockButton.BackColor = periodLocked ? Color.MistyRose : SystemColors.Control;
		payrollPersonLockButton.Text = "Seçilenleri Kilitle";
		payrollPersonUnlockButton.Text = "Kilidi Aç";
		payrollPersonLockButton.Enabled = !periodLocked;
		payrollPersonUnlockButton.Enabled = !periodLocked;
	}

	private void ConfigurePayrollGrid()
	{
		foreach (var technical in new[] { "PKNO", "BASTAR", "BITTAR" })
			if (payrollGrid.Columns.Contains(technical)) payrollGrid.Columns[technical].Visible = false;
		if (payrollGrid.Columns.Contains("Adı Soyadı")) payrollGrid.Columns["Adı Soyadı"].MinimumWidth = 140;
		if (payrollGrid.Columns.Contains("Kilit")) payrollGrid.Columns["Kilit"].MinimumWidth = 125;
		if (payrollGrid.Columns.Contains("Uyarı")) payrollGrid.Columns["Uyarı"].MinimumWidth = 150;
	}

	private void ColorPayrollRows()
	{
		foreach (DataGridViewRow row in payrollGrid.Rows)
		{
			if (row.IsNewRow || !payrollGrid.Columns.Contains("Kilit")) continue;
			string state = Convert.ToString(row.Cells["Kilit"].Value) ?? "";
			if (state.Contains("AY KİLİTLİ")) row.DefaultCellStyle.BackColor = Color.MistyRose;
			else if (state.Contains("PERSONEL KİLİTLİ")) row.DefaultCellStyle.BackColor = Color.Bisque;
			else if (state.Contains("DÜZENLENMİŞ")) row.DefaultCellStyle.BackColor = Color.LightCyan;
			else row.DefaultCellStyle.BackColor = Color.White;
		}
	}

	private bool SpecificPayrollPeriod(out int year, out int month)
	{
		year = (int)payrollYear.Value;
		month = payrollMonthNo.SelectedIndex;
		if (month != 0) return true;
		MessageBox.Show("İşlem için belirli bir ay seçin.", "Bordro");
		return false;
	}

	private void TogglePayrollPeriodLock()
	{
		if (db == null || !SpecificPayrollPeriod(out int year, out int month)) return;
		bool locked = PayrollOverrideService.IsPeriodLocked(db, year, month);
		string name = CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.GetMonthName(month);
		string question = locked ? $"{name} {year} ay kilidi açılsın mı?" : $"{name} {year} TÜM PERSONEL için kilitlensin mi?\n\nKilitliyken PUANTAJ ve UCRETLER hesaplamaları bu ayın değerlerini değiştiremez.";
		if (MessageBox.Show(question, "Ay Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
		PayrollOverrideService.SetPeriodLock(db, year, month, !locked, "Bordro ana ekranı");
		LoadPayroll();
	}

	private List<string> SelectedPayrollCards()
	{
		var cards = payrollGrid.SelectedRows.Cast<DataGridViewRow>()
			.Where(r => !r.IsNewRow && payrollGrid.Columns.Contains("PKNO"))
			.Select(r => Convert.ToString(r.Cells["PKNO"].Value) ?? "")
			.Where(x => !string.IsNullOrWhiteSpace(x))
			.Distinct(StringComparer.OrdinalIgnoreCase)
			.ToList();
		if (cards.Count == 0)
		{
			var card = SelectedCard(payrollPerson);
			if (!string.IsNullOrWhiteSpace(card)) cards.Add(card);
		}
		return cards;
	}

	private void SetSelectedPayrollLocks(bool locked)
	{
		if (db == null || !SpecificPayrollPeriod(out int year, out int month)) return;
		if (PayrollOverrideService.IsPeriodLocked(db, year, month))
		{
			MessageBox.Show("Ay zaten kilitli. Personel kilidi değiştirmek için önce ay kilidini açın.", "Bordro");
			return;
		}
		var cards = SelectedPayrollCards();
		if (cards.Count == 0)
		{
			MessageBox.Show("Önce bir veya birden fazla bordro satırı seçin.", "Personel Kilidi");
			return;
		}
		string action = locked ? "kilitlensin" : "kilidi açılsın";
		if (MessageBox.Show($"{cards.Count} personel {month:00}/{year} için {action} mı?", "Personel Bordro Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
		foreach (var card in cards) PayrollOverrideService.SetPersonLock(db, card, year, month, locked, "Bordro ana ekranı");
		LoadPayroll();
	}

	private void EditPayrollBulk()
	{
		if (db == null || !SpecificPayrollPeriod(out int year, out int month)) return;
		if (PayrollOverrideService.IsPeriodLocked(db, year, month))
		{
			MessageBox.Show("AY KİLİTLİ. Toplu düzenleme için önce ay kilidini açın.", "Bordro");
			return;
		}
		var cards = SelectedPayrollCards();
		if (cards.Count == 0)
		{
			MessageBox.Show("Toplu düzenleme için bordro satırlarını seçin.", "Bordro");
			return;
		}
		using var form = new BulkPayrollEditForm(cards.Count);
		if (form.ShowDialog(this) != DialogResult.OK) return;
		var values = form.SelectedValues();
		if (values.Count == 0)
		{
			MessageBox.Show("Değiştirilecek alan işaretlenmedi.", "Bordro");
			return;
		}
		if (MessageBox.Show($"{cards.Count} personele seçili alanlar uygulanacak. Devam?", "Toplu Bordro Düzenle", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
		int updated = 0;
		foreach (var card in cards)
		{
			PayrollOverrideService.SaveOverrides(db, card, year, month, values, form.AutoHours, "Toplu bordro düzenleme");
			updated++;
		}
		MessageBox.Show($"{updated} personel güncellendi.", "Bordro");
		LoadPayroll();
	}

	private void CleanPayrollOverlap()
	{
		if (db == null || !SpecificPayrollPeriod(out int year, out int month)) return;
		var cards = SelectedPayrollCards();
		if (cards.Count == 0)
		{
			MessageBox.Show("Temizlenecek personel satırlarını seçin.", "Çakışan Kayıt");
			return;
		}
		var withOverlap = cards.Where(card => PayrollOverrideService.Status(db, card, year, month).HasOverlap).ToList();
		if (withOverlap.Count == 0)
		{
			MessageBox.Show("Seçilen personellerde çakışan dönem kaydı yok.", "Bordro");
			return;
		}
		if (MessageBox.Show($"{withOverlap.Count} personelde doğru aylık satır korunacak; yalnız aynı ayın 1'inden başlayıp sonraki aya taşan kayıt silinecek. Devam?", "Çakışan Kayıtları Temizle", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
		int count = 0;
		foreach (var card in withOverlap) count += PayrollOverrideService.CleanSafeOverlap(db, card, year, month);
		MessageBox.Show(count + " taşan kayıt temizlendi.", "Bordro");
		LoadPayroll();
	}


	private void RebuildEDays()
	{
		eDayList.Items.Clear();
		if (!(eEnd.Value.Date < eStart.Value.Date))
		{
			DateTime dateTime = eStart.Value.Date;
			while (dateTime <= eEnd.Value.Date)
			{
				eDayList.Items.Add(new DayChoice(dateTime), isChecked: true);
				dateTime = dateTime.AddDays(1.0);
			}
		}
	}

	private void CheckAllEPeople()
	{
		for (int i = 0; i < ePeopleList.Items.Count; i++)
		{
			ePeopleList.SetItemChecked(i, value: true);
		}
	}

	private void CheckAllEDays()
	{
		for (int i = 0; i < eDayList.Items.Count; i++)
		{
			eDayList.SetItemChecked(i, value: true);
		}
	}

	private void CheckEWeekdays()
	{
		for (int i = 0; i < eDayList.Items.Count; i++)
		{
			DayOfWeek dayOfWeek = ((DayChoice)eDayList.Items[i]).Date.DayOfWeek;
			eDayList.SetItemChecked(i, dayOfWeek != DayOfWeek.Saturday && dayOfWeek != DayOfWeek.Sunday);
		}
	}

	private void PreviewBulkE()
	{
		try
		{
			eGrid.DataSource = BuildBulkEPreview();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "E Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
		}
	}

	private DataTable BuildBulkEPreview()
	{
		if (db == null)
		{
			throw new InvalidOperationException("Veritabanı bağlı değil.");
		}
		HashSet<string> hashSet = (from string x in ePeopleList.CheckedItems
			select x.Split(' ')[0]).ToHashSet();
		HashSet<DateTime> hashSet2 = (from DayChoice x in eDayList.CheckedItems
			select x.Date).ToHashSet();
		if (hashSet.Count == 0 || hashSet2.Count == 0)
		{
			throw new InvalidOperationException("Personel ve gün seçin.");
		}
		DateTime dateTime = hashSet2.Min();
		DateTime dateTime2 = hashSet2.Max().AddDays(1.0);
		DataTable dataTable = db.Query("select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO where (g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B) order by g.SIRA,g.PKNO", new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2));
		string[] lines = (File.Exists(tnfPath.Text) ? (from x in File.ReadAllLines(tnfPath.Text)
			where !string.IsNullOrWhiteSpace(x)
			select x).ToArray() : Array.Empty<string>());
		DataTable dataTable2 = new DataTable();
		string[] array = new string[9] { "SIRA", "Kart No", "Ad Soyad", "Tarih", "Taraf", "Saat", "Mevcut Tür", "TNF Aday", "Durum" };
		foreach (string columnName in array)
		{
			dataTable2.Columns.Add(columnName);
		}
		int selectedIndex = eSide.SelectedIndex;
		foreach (DataRow row in dataTable.Rows)
		{
			string text = Convert.ToString(row["PKNO"]) ?? "";
			if (!hashSet.Contains(text))
			{
				continue;
			}
			foreach (bool entry in new[] { true, false })
			{
				string prefix = entry ? "G" : "C";
				if (row[prefix + "TARIH"] == DBNull.Value) continue;
				DateTime date = Convert.ToDateTime(row[prefix + "TARIH"]).Date;
				if (!hashSet2.Contains(date)) continue;
				string name = $"{row["AD"]} {row["SOYAD"]}".Trim();
				if ((selectedIndex == (entry ? 0 : 1) || selectedIndex == 2) && row[prefix + "SAAT"] != DBNull.Value && !string.IsNullOrWhiteSpace(Convert.ToString(row[prefix + "SAAT"])) && Convert.ToString(row[prefix + "TUR"]) != "E")
				{
					AddEPreviewRow(dataTable2, lines, row, text, name, date, entry);
				}
			}
		}
		return dataTable2;
	}

	private void AddEPreviewRow(DataTable t, string[] lines, DataRow r, string card, string name, DateTime day, bool entry)
	{
		string time = Convert.ToString(r[entry ? "GSAAT" : "CSAAT"]) ?? "";
		string currentType = Convert.ToString(r[entry ? "GTUR" : "CTUR"]) ?? "";
		string exact = $"{card},{time},{day:ddMMyy},1,001";
		int exactCount = lines.Count(x => string.Equals(x.Trim(), exact, StringComparison.OrdinalIgnoreCase));
		string candidate = exactCount == 0 ? "" : exactCount == 1 ? exact : $"{exact} × {exactCount}";
		string state = exactCount == 0 ? "Hazır - TNF karşılığı yok" : "Hazır - E sonrası TNF'den kaldırılacak";
		t.Rows.Add(r["SIRA"], card, name, day.ToString("dd.MM.yyyy"), entry ? "Giriş" : "Çıkış", time, currentType, candidate, state);
	}

	private void ApplyBulkE()
	{
		if (db == null) return;
		DataTable dataTable;
		try { dataTable = BuildBulkEPreview(); }
		catch (Exception ex) { MessageBox.Show(ex.Message, "E İşlemleri"); return; }

		if (dataTable.Rows.Count == 0)
		{
			MessageBox.Show("E'ye çevrilecek normal kayıt bulunamadı.");
			return;
		}
		if (string.IsNullOrWhiteSpace(tnfPath.Text) || !File.Exists(tnfPath.Text))
		{
			MessageBox.Show("Ana TNF dosyasını seçin. E işlemi DB ve TNF'yi birlikte günceller.");
			return;
		}
		if (MessageBox.Show($"{dataTable.Rows.Count} taraf E yapılacak. DB ana kaynak kabul edilip ilgili kişi/gün TNF kayıtları işlem sonunda otomatik yeniden oluşturulacak; E kayıtları TNF'de olmayacak. Devam?", "Toplu E", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
			return;

		string dbBackup;
		try { dbBackup = MonthlyDbWriter.BackupAsync(db, CancellationToken.None).GetAwaiter().GetResult(); }
		catch (Exception ex) { MessageBox.Show(ex.Message, "E İşlemleri - DB yedeği alınamadı", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

		using FbConnection fbConnection = db.OpenConnection();
		using FbTransaction fbTransaction = fbConnection.BeginTransaction();
		StagedDbRecordTnf? stagedTnf = null;
		try
		{
			var scope = new HashSet<(string Card, DateTime Day)>();
			foreach (DataRow row in dataTable.Rows)
			{
				int id = Convert.ToInt32(row["SIRA"]);
				string card = Convert.ToString(row["Kart No"]) ?? "";
				DateTime day = DateTime.ParseExact(Convert.ToString(row["Tarih"]) ?? "", "dd.MM.yyyy", CultureInfo.InvariantCulture);
				bool entry = Convert.ToString(row["Taraf"]) == "Giriş";
				if (Exec(fbConnection, fbTransaction, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", id)) != 1)
					throw new InvalidOperationException("DB kaydı değişti; E işlemi geri alındı.");
				scope.Add((card, day));
			}

			stagedTnf = DbRecordTnfCoordinator.Stage(fbConnection, fbTransaction, tnfPath.Text, scope, CancellationToken.None);
			stagedTnf.Publish();
			try { fbTransaction.Commit(); }
			catch { stagedTnf.Restore(); throw; }

			eGrid.DataSource = BuildBulkEPreview();
			LoadIo();
			MessageBox.Show($"Toplu E tamamlandı. DB ve TNF birlikte güncellendi.\nDB yedeği: {dbBackup}\nTNF yedeği: {stagedTnf.BackupPath}", "HKN PDKS");
		}
		catch (Exception ex)
		{
			try { fbTransaction.Rollback(); } catch { }
			stagedTnf?.Restore();
			MessageBox.Show(ex.Message, "Toplu E", MessageBoxButtons.OK, MessageBoxIcon.Error);
		}
		finally { stagedTnf?.Dispose(); }
	}

	private static int Exec(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
	{
		using FbCommand fbCommand = FirebirdDatabase.CreateCommand(c, tx, sql, p);
		return fbCommand.ExecuteNonQuery();
	}

	private void MarkSelectedE(bool entry)
	{
		if (db == null || ioGrid.SelectedRows.Count == 0) return;
		if (string.IsNullOrWhiteSpace(tnfPath.Text) || !File.Exists(tnfPath.Text))
		{
			MessageBox.Show("Ana TNF dosyasını seçin. E işlemi DB ve TNF'yi birlikte günceller.", "E Düzeltme");
			return;
		}

		var rows = ioGrid.SelectedRows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow).ToList();
		var scope = new HashSet<(string Card, DateTime Day)>();
		foreach (var row in rows)
		{
			string card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
			object dateValue = entry ? row.Cells["GTARIH"].Value : row.Cells["CTARIH"].Value;
			string time = Convert.ToString(entry ? row.Cells["GSAAT"].Value : row.Cells["CSAAT"].Value) ?? "";
			if (dateValue == null || dateValue == DBNull.Value || string.IsNullOrWhiteSpace(time))
			{
				MessageBox.Show(card + ": seçilen tarafta tarih/saat yok.", "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Warning);
				return;
			}
			scope.Add((card, Convert.ToDateTime(dateValue).Date));
		}

		if (MessageBox.Show($"{rows.Count} kayıt için {(entry ? "giriş" : "çıkış")} tarafı E yapılacak. Sonra ilgili kişi/gün TNF kayıtları doğrudan DB'den yeniden kurulacak; E kayıtları TNF'de olmayacak. Devam?", "E Düzeltme", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
			return;

		string dbBackup;
		try { dbBackup = MonthlyDbWriter.BackupAsync(db, CancellationToken.None).GetAwaiter().GetResult(); }
		catch (Exception ex) { MessageBox.Show(ex.Message, "E Düzeltme - DB yedeği alınamadı", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }

		using FbConnection connection = db.OpenConnection();
		using FbTransaction transaction = connection.BeginTransaction();
		StagedDbRecordTnf? stagedTnf = null;
		try
		{
			foreach (var row in rows)
			{
				int id = Convert.ToInt32(row.Cells["SIRA"].Value);
				if (Exec(connection, transaction, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", id)) != 1)
					throw new InvalidOperationException("DB kaydı değişti; E işlemi geri alındı.");
			}
			stagedTnf = DbRecordTnfCoordinator.Stage(connection, transaction, tnfPath.Text, scope, CancellationToken.None);
			stagedTnf.Publish();
			try { transaction.Commit(); }
			catch { stagedTnf.Restore(); throw; }

			LoadIo();
			MessageBox.Show($"E işlemi tamamlandı. DB ve TNF birlikte güncellendi.\nDB yedeği: {dbBackup}\nTNF yedeği: {stagedTnf.BackupPath}", "HKN PDKS");
		}
		catch (Exception ex)
		{
			try { transaction.Rollback(); } catch { }
			stagedTnf?.Restore();
			MessageBox.Show(ex.Message, "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Error);
		}
		finally { stagedTnf?.Dispose(); }
	}

	private void LoadEHistory()
	{
		if (db == null)
		{
			return;
		}
		int year = (int)eHistoryYear.Value;
		int selectedIndex = eHistoryMonth.SelectedIndex;
		DateTime dateTime = ((selectedIndex == 0) ? new DateTime(year, 1, 1) : new DateTime(year, selectedIndex, 1));
		DateTime dateTime2 = ((selectedIndex == 0) ? dateTime.AddYears(1) : dateTime.AddMonths(1));
		string text = SelectedCard(eHistoryPerson);
		string sql = "select g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and (g.GTUR='E' or g.CTUR='E') and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))" + ((text == null) ? "" : " and g.PKNO=@P") + " order by coalesce(g.GTARIH,g.CTARIH),g.PKNO";
		DataTable dataTable = ((text == null) ? db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2)) : db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2), new FbParameter("@P", text)));
		DataTable dataTable2 = new DataTable();
		string[] array = new string[8] { "Kart No", "Ad Soyad", "Tarih", "Gün", "Taraf", "Saat", "Dönem", "İmza" };
		foreach (string columnName in array)
		{
			dataTable2.Columns.Add(columnName);
		}
		foreach (DataRow row in dataTable.Rows)
		{
			if (Convert.ToString(row["GTUR"]) == "E" && row["GTARIH"] != DBNull.Value)
			{
				DateTime dateTime3 = Convert.ToDateTime(row["GTARIH"]);
				dataTable2.Rows.Add(row["PKNO"], $"{row["AD"]} {row["SOYAD"]}", dateTime3.ToString("dd.MM.yyyy"), dateTime3.ToString("dddd", new CultureInfo("tr-TR")), "Giriş", row["GSAAT"], "Sabah", "");
			}
			if (Convert.ToString(row["CTUR"]) == "E" && row["CTARIH"] != DBNull.Value)
			{
				DateTime dateTime4 = Convert.ToDateTime(row["CTARIH"]);
				dataTable2.Rows.Add(row["PKNO"], $"{row["AD"]} {row["SOYAD"]}", dateTime4.ToString("dd.MM.yyyy"), dateTime4.ToString("dddd", new CultureInfo("tr-TR")), "Çıkış", row["CSAAT"], "Akşam", "");
			}
		}
		eHistoryGrid.DataSource = dataTable2;
	}

	private void ExportEHistoryCsv()
	{
		if (!(eHistoryGrid.DataSource is DataTable dataTable) || dataTable.Rows.Count == 0)
		{
			MessageBox.Show("Çıktı için kayıt yok.");
			return;
		}
		string text = Path.Combine(AppContext.BaseDirectory, $"E_IMZA_{(int)eHistoryYear.Value}_{eHistoryMonth.SelectedIndex:00}.csv");
		List<string> list = new List<string> { string.Join(";", from DataColumn c in dataTable.Columns
			select c.ColumnName) };
		foreach (DataRow row in dataTable.Rows)
		{
			list.Add(string.Join(";", row.ItemArray.Select((object x) => Convert.ToString(x)?.Replace(";", ",") ?? "")));
		}
		File.WriteAllLines(text, list, Encoding.UTF8);
		MessageBox.Show("İmza çıktısı hazır:\n" + text);
	}

	private void EditPayrollSelected()
	{
		if (db == null || payrollGrid.SelectedRows.Count != 1)
		{
			MessageBox.Show("Tek bordro satırı seçin.");
			return;
		}
		try
		{
			DataGridViewRow row = payrollGrid.SelectedRows[0];
			string card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
			DateTime start = Convert.ToDateTime(row.Cells["BASTAR"].Value);
			int year = start.Year;
			int month = start.Month;
			var preferred = PayrollOverrideService.PreferredRow(db, card, year, month);
			if (preferred is null)
			{
				MessageBox.Show("Seçili ay için doğru UCRETLER satırı bulunamadı.", "Bordro");
				return;
			}
			var state = PayrollOverrideService.Status(db, card, year, month);
			if (state.HasOverlap)
				MessageBox.Show("Çakışan dönem kaydı bulundu. Düzenleme doğru aylık satıra uygulanacak; taşan satırı ayrıca temizleyebilirsiniz.", "Bordro", MessageBoxButtons.OK, MessageBoxIcon.Warning);
			using PayrollEditForm form = new PayrollEditForm(card, PayrollOverrideService.RowValues(preferred));
			if (form.ShowDialog(this) != DialogResult.OK) return;
			if (MessageBox.Show(card + " bordro değişiklikleri kaydedilecek. Devam?", "Bordro", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
			var changed = PayrollOverrideService.SaveOverrides(db, card, year, month, form.Values(), form.AutoHours, "Bordro ana ekranı");
			MessageBox.Show(changed.Length == 0 ? "Değişiklik yok." : "Kaydedildi: " + string.Join(", ", changed), "Bordro");
			LoadPayroll();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Bordro", MessageBoxButtons.OK, MessageBoxIcon.Error);
		}
	}

}