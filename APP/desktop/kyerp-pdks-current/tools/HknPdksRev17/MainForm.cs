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

	private readonly DataGridView bulkGrid = Grid();

	private readonly DataGridView auditGrid = Grid();

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

	private readonly CheckedListBox peopleList = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly CheckedListBox dayList = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly DateTimePicker ioMonth = MonthPicker();

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

	private readonly NumericUpDown auditYear = new NumericUpDown
	{
		Minimum = 2010m,
		Maximum = 2100m,
		Width = 75
	};

	private readonly ComboBox auditMonthNo = MonthCombo();

	private readonly ComboBox auditPerson = new ComboBox
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

	private readonly DateTimePicker payrollMonth = MonthPicker();

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

	private readonly DateTimePicker paymentMonth = MonthPicker();

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

	private readonly DateTimePicker advanceMonth = MonthPicker();

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

	private readonly DateTimePicker rangeStart = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly DateTimePicker rangeEnd = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short
	};

	private readonly MaskedTextBox inMin = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Entry));

	private readonly MaskedTextBox inMax = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Entry));

	private readonly MaskedTextBox outMin = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Exit));

	private readonly MaskedTextBox outMax = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Exit));

	private FirebirdDatabase? db;
	internal WorkTimePolicy WorkHours { get; private set; } = WorkTimePolicy.Default;
	internal event EventHandler? WorkHoursChanged;
	internal void SetWorkHours(WorkTimePolicy policy)
	{
		if (WorkHours == policy) return;
		WorkHours = policy;
		inMin.Text = inMax.Text = WorkTimePolicy.Format(policy.Entry);
		outMin.Text = outMax.Text = WorkTimePolicy.Format(policy.Exit);
		WorkHoursChanged?.Invoke(this, EventArgs.Empty);
	}

	private PdksOptions? options;
	private DataTable? peopleCache;

	public MainForm()
	{
		Text = "HKN PDKS REV27 — Hızlı Veri";
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
			ApplyPeopleFilter();
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
		ioYear.Value = (auditYear.Value = (eYear.Value = (eHistoryYear.Value = (payrollYear.Value = (paymentYear.Value = (advanceYear.Value = DateTime.Today.Year))))));
		rangeStart.ValueChanged += delegate
		{
			RebuildDays();
		};
		rangeEnd.ValueChanged += delegate
		{
			RebuildDays();
		};
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

	private static DateTimePicker MonthPicker()
	{
		return new DateTimePicker
		{
			Format = DateTimePickerFormat.Custom,
			CustomFormat = "MMMM yyyy",
			ShowUpDown = true
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

	private static MaskedTextBox TimeBox(string value)
	{
		return new MaskedTextBox("00:00")
		{
			Text = value,
			Width = 60
		};
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
		tabs.TabPages.Add(Page("Personel", BuildPeople()));
		tabs.TabPages.Add(Page("Giriş-Çıkış", BuildIo()));
		tabs.TabPages.Add(Page("Kayıt Düzeltme", new DbRecordControl(this)));
		tabs.TabPages.Add(Page("E İşlemleri", new EPlanControl(this)));
		tabs.TabPages.Add(Page("Bordro", BuildPayroll()));
		tabs.TabPages.Add(Page("Ödeme / Avans", BuildPayments()));
		tabs.TabPages.Add(Page("DB - TNF Eşitle", new DbTnfSyncControl(this)));
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

	private Control BuildBulk()
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
				new ColumnStyle(SizeType.Absolute, 260f),
				new ColumnStyle(SizeType.Percent, 100f)
			},
			RowStyles =
			{
				new RowStyle(SizeType.Absolute, 82f),
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
			Text = "Başlangıç",
			AutoSize = true,
			Padding = new Padding(0, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(rangeStart);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Bitiş",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(rangeEnd);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Giriş",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(inMin);
		flowLayoutPanel.Controls.Add(inMax);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Çıkış",
			AutoSize = true,
			Padding = new Padding(8, 8, 2, 0)
		});
		flowLayoutPanel.Controls.Add(outMin);
		flowLayoutPanel.Controls.Add(outMax);
		obj.Controls.Add(flowLayoutPanel, 0, 0);
		obj.SetColumnSpan(flowLayoutPanel, 3);
		obj.Controls.Add(peopleList, 0, 1);
		obj.Controls.Add(dayList, 1, 1);
		obj.Controls.Add(bulkGrid, 2, 1);
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			FlowDirection = FlowDirection.LeftToRight,
			WrapContents = false,
			Padding = new Padding(4, 6, 4, 2)
		};
		flowLayoutPanel2.Controls.Add(WideBtn("Tüm Personeli Seç", CheckAllPeople, 145));
		flowLayoutPanel2.Controls.Add(WideBtn("Tüm Günleri Seç", CheckAllDays, 135));
		flowLayoutPanel2.Controls.Add(WideBtn("Hafta Sonu Hariç", CheckWeekdays, 145));
		flowLayoutPanel2.Controls.Add(WideBtn("Önizleme", PreviewBulk, 115));
		flowLayoutPanel2.Controls.Add(WideBtn("Uygula", ApplyBulk, 100));
		obj.Controls.Add(flowLayoutPanel2, 0, 2);
		obj.SetColumnSpan(flowLayoutPanel2, 3);
		return obj;
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
		flowLayoutPanel.Controls.Add(payrollYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(payrollMonthNo);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(payrollPerson);
		flowLayoutPanel.Controls.Add(WideBtn("Bordroyu Listele", LoadPayroll, 135));
		flowLayoutPanel.Controls.Add(WideBtn("Düzenle", EditPayrollSelectedRev26, 95));
		flowLayoutPanel.Controls.Add(WideBtn("Ayı Kilitle", () => Rev26SetMonthLock(true), 110));
		flowLayoutPanel.Controls.Add(WideBtn("Seçilenleri Kilitle", () => Rev26SetSelectedLocks(true), 145));
		flowLayoutPanel.Controls.Add(WideBtn("Kilidi Aç", Rev26Unlock, 105));
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

	private Control BuildAudit()
	{
		Panel obj = new Panel
		{
			Dock = DockStyle.Fill
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			Height = 82,
			WrapContents = true
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Yıl",
			AutoSize = true,
			Padding = new Padding(0, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(auditYear);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ay",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(auditMonthNo);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Aktif Personel",
			AutoSize = true,
			Padding = new Padding(7, 8, 3, 0)
		});
		flowLayoutPanel.Controls.Add(auditPerson);
		flowLayoutPanel.Controls.Add(WideBtn("Kontrol Et", LoadAudit, 100));
		flowLayoutPanel.Controls.Add(WideBtn("Seçili Eksikleri Ekle", delegate
		{
			ApplyMissingTnf(selectedOnly: true);
		}, 155));
		flowLayoutPanel.Controls.Add(WideBtn("Tüm Eksikleri Ekle", delegate
		{
			ApplyMissingTnf(selectedOnly: false);
		}, 145));
		flowLayoutPanel.Controls.Add(WideBtn("Fazla TNF Temizle", CleanExtraTnf, 145));
		flowLayoutPanel.Controls.Add(WideBtn("Saat Farkını Düzelt", FixTimeMismatchTnf, 155));
		flowLayoutPanel.Controls.Add(WideBtn("TNF Listele", LoadTnfAudit, 105));
		obj.Controls.Add(auditGrid);
		obj.Controls.Add(flowLayoutPanel);
		return obj;
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
		if (db == null) return;
		try
		{
			var table = db.Query(@"select k.*,coalesce(g.AD,'') GRUPAD
				from KIMLIK k left join GRUP g on g.KOD=k.GRUP
				order by k.PKNO");
			if (!table.Columns.Contains("ADSOYAD")) table.Columns.Add("ADSOYAD", typeof(string));
			if (!table.Columns.Contains("AKTIFMI")) table.Columns.Add("AKTIFMI", typeof(bool));

			foreach (DataRow row in table.Rows)
			{
				row["ADSOYAD"] = $"{Convert.ToString(row["AD"])?.Trim()} {Convert.ToString(row["SOYAD"])?.Trim()}".Trim();
				var exit = row["ICTARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(row["ICTARIH"]).Date;
				row["AKTIFMI"] = !exit.HasValue || exit.Value >= DateTime.Today;
			}

			peopleCache = table;
			peopleGrid.DataSource = table.DefaultView;
			ConfigurePeopleGrid();

			var active = table.AsEnumerable().Where(r => r.Field<bool>("AKTIFMI")).OrderBy(r => Convert.ToString(r["PKNO"])).ToArray();
			peopleList.Items.Clear();
			foreach (var row in active)
			{
				var card = Convert.ToString(row["PKNO"])?.Trim() ?? "";
				if (card == "00001") continue;
				peopleList.Items.Add($"{card}  {row["ADSOYAD"]}", false);
			}

			foreach (var combo in new[] { ioPerson, auditPerson, eHistoryPerson, payrollPerson, paymentPerson, advancePerson })
			{
				var selected = combo.SelectedItem?.ToString();
				combo.Items.Clear();
				combo.Items.Add("Tümü");
				foreach (var row in active)
					combo.Items.Add($"{Convert.ToString(row["PKNO"])?.Trim()}  {row["ADSOYAD"]}");
				combo.SelectedItem = selected is not null && combo.Items.Contains(selected) ? selected : "Tümü";
			}

			ApplyPeopleFilter();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Personel");
		}
	}

	private void ApplyPeopleFilter()
	{
		if (peopleCache is null || peopleGrid.DataSource is not DataView view) return;
		var selectedCard = peopleGrid.CurrentRow?.DataBoundItem is DataRowView current
			? Convert.ToString(current.Row["PKNO"])?.Trim()
			: null;

		peopleGrid.SuspendLayout();
		try
		{
			peopleGrid.CurrentCell = null;
			view.RowFilter = personFilter.SelectedItem?.ToString() switch
			{
				"Aktif" => "AKTIFMI = true",
				"Pasif" => "AKTIFMI = false",
				_ => ""
			};
			ConfigurePeopleGrid();
			peopleGrid.ClearSelection();

			DataGridViewRow? target = null;
			if (!string.IsNullOrWhiteSpace(selectedCard))
				target = peopleGrid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r =>
					r.DataBoundItem is DataRowView drv &&
					string.Equals(Convert.ToString(drv.Row["PKNO"])?.Trim(), selectedCard, StringComparison.OrdinalIgnoreCase));
			target ??= peopleGrid.Rows.Cast<DataGridViewRow>().FirstOrDefault(r => !r.IsNewRow && r.Visible);

			var firstVisible = peopleGrid.Columns.Cast<DataGridViewColumn>()
				.Where(x => x.Visible).OrderBy(x => x.DisplayIndex).FirstOrDefault();
			if (target is not null && firstVisible is not null)
			{
				target.Selected = true;
				peopleGrid.CurrentCell = target.Cells[firstVisible.Index];
			}
		}
		finally { peopleGrid.ResumeLayout(); }

		var active = peopleCache.AsEnumerable().Count(r => r.Field<bool>("AKTIFMI"));
		var passive = peopleCache.Rows.Count - active;
		personSummary.Text = $"Aktif: {active}   Pasif: {passive}   Toplam: {peopleCache.Rows.Count}";
		ColorPeopleRows();
	}

	private void ConfigurePeopleGrid()
	{
		foreach (DataGridViewColumn column in peopleGrid.Columns)
		{
			column.Visible = false;
			column.SortMode = DataGridViewColumnSortMode.NotSortable;
		}

		var columns = new[] { ("PKNO", "Kart No", 72), ("ADSOYAD", "Personel Ad Soyad", 190), ("GRUPAD", "Grup", 118) };
		for (var i = 0; i < columns.Length; i++)
		{
			if (!peopleGrid.Columns.Contains(columns[i].Item1)) continue;
			var column = peopleGrid.Columns[columns[i].Item1];
			column.Visible = true;
			column.HeaderText = columns[i].Item2;
			column.Width = columns[i].Item3;
			column.DisplayIndex = i;
		}
	}

	private void ColorPeopleRows()
	{
		foreach (DataGridViewRow row in peopleGrid.Rows)
		{
			if (row.IsNewRow || row.DataBoundItem is not DataRowView drv) continue;
			var active = drv.Row.Table.Columns.Contains("AKTIFMI") && drv.Row.Field<bool>("AKTIFMI");
			row.DefaultCellStyle.BackColor = active ? Color.Honeydew : Color.MistyRose;
			row.DefaultCellStyle.SelectionBackColor = active ? Color.PaleGreen : Color.LightSalmon;
			row.DefaultCellStyle.ForeColor = Color.Black;
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
		using PersonnelEditForm personnelEditForm = new PersonnelEditForm(dataGridViewRow);
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
		if (db == null)
		{
			return;
		}
		try
		{
			DateTime dateTime = new DateTime((int)payrollYear.Value, (payrollMonthNo.SelectedIndex == 0) ? 1 : payrollMonthNo.SelectedIndex, 1);
			DateTime dateTime2 = ((payrollMonthNo.SelectedIndex == 0) ? dateTime.AddYears(1) : dateTime.AddMonths(1));
			string text = SelectedCard(payrollPerson);
			string sql = "select u.*,k.AD,k.SOYAD,k.MAAS as KART_MAAS from UCRETLER u inner join KIMLIK k on k.PKNO=u.PKNO where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and u.BASTAR>=@A and u.BASTAR<@B" + ((text == null) ? "" : " and u.PKNO=@P") + " order by u.PKNO";
			payrollGrid.DataSource = ((text == null) ? db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2)) : db.Query(sql, new FbParameter("@A", dateTime), new FbParameter("@B", dateTime2), new FbParameter("@P", text)));
			ApplyRev26LockColors();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Bordro");
		}
	}

	private void RebuildDays()
	{
		dayList.Items.Clear();
		if (!(rangeEnd.Value.Date < rangeStart.Value.Date))
		{
			DateTime dateTime = rangeStart.Value.Date;
			while (dateTime <= rangeEnd.Value.Date)
			{
				dayList.Items.Add(new DayChoice(dateTime), isChecked: true);
				dateTime = dateTime.AddDays(1.0);
			}
		}
	}

	private void CheckAllPeople()
	{
		for (int i = 0; i < peopleList.Items.Count; i++)
		{
			peopleList.SetItemChecked(i, value: true);
		}
	}

	private void CheckAllDays()
	{
		for (int i = 0; i < dayList.Items.Count; i++)
		{
			dayList.SetItemChecked(i, value: true);
		}
	}

	private void CheckWeekdays()
	{
		for (int i = 0; i < dayList.Items.Count; i++)
		{
			DayOfWeek dayOfWeek = ((DayChoice)dayList.Items[i]).Date.DayOfWeek;
			dayList.SetItemChecked(i, dayOfWeek != DayOfWeek.Saturday && dayOfWeek != DayOfWeek.Sunday);
		}
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
		string text = Convert.ToString(r[entry ? "GTUR" : "CTUR"]) ?? "";
		string[] array = lines.Where((string x) => SameTnfSide(x, card, day, entry)).ToArray();
		string[] array2 = array.Where((string x) => x.Split(',').Length > 1 && x.Split(',')[1] == time).ToArray();
		string[] array3 = ((array2.Length != 0) ? array2 : array);
		string text2 = ((array2.Length == 1) ? "Hazır - tam eşleşme" : ((array3.Length == 0) ? "Hazır - TNF yok" : ((array3.Length == 1) ? "Hazır - tek taraf adayı" : "ÇAKIŞMA")));
		t.Rows.Add(r["SIRA"], card, name, day.ToString("dd.MM.yyyy"), entry ? "Giriş" : "Çıkış", time, text, string.Join(" | ", array3), text2);
	}

	private void ApplyBulkE()
	{
		if (db == null)
		{
			return;
		}
		DataTable dataTable;
		try
		{
			dataTable = BuildBulkEPreview();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "E İşlemleri");
			return;
		}
		if (dataTable.Rows.Count == 0)
		{
			MessageBox.Show("E'ye çevrilecek normal kayıt bulunamadı.");
		}
		else if (dataTable.AsEnumerable().Any((DataRow r) => Convert.ToString(r["Durum"]) == "ÇAKIŞMA"))
		{
			MessageBox.Show("Çakışmalı TNF satırı var. Uygulama durduruldu.", "E İşlemleri", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
		}
		else if (!File.Exists(tnfPath.Text))
		{
			MessageBox.Show("TNF dosyasını seçin.");
		}
		else
		{
			if (MessageBox.Show($"{dataTable.Rows.Count} taraf E yapılacak ve TNF karşılıkları temizlenecek. Devam?", "Toplu E", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
			{
				return;
			}
			string text = tnfPath.Text + ".bak_Ebulk_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
			File.Copy(tnfPath.Text, text, overwrite: true);
			List<string> list = (from x in File.ReadAllLines(tnfPath.Text)
				where !string.IsNullOrWhiteSpace(x)
				select x).ToList();
			using FbConnection fbConnection = db.OpenConnection();
			using FbTransaction fbTransaction = fbConnection.BeginTransaction();
			try
			{
				foreach (DataRow row in dataTable.Rows)
				{
					int num = Convert.ToInt32(row["SIRA"]);
					string card = Convert.ToString(row["Kart No"]);
					DateTime day = DateTime.ParseExact(Convert.ToString(row["Tarih"]), "dd.MM.yyyy", null);
					bool entry = Convert.ToString(row["Taraf"]) == "Giriş";
					string time = Convert.ToString(row["Saat"]);
					Exec(fbConnection, fbTransaction, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", num));
					List<(string, int)> list2 = (from z in list.Select((string x, int i) => (x: x, i: i))
						where SameTnfSide(z.x, card, day, entry)
						select z).ToList();
					List<(string, int)> list3 = list2.Where<(string, int)>(((string x, int i) z) => z.x.Split(',').Length > 1 && z.x.Split(',')[1] == time).ToList();
					List<(string, int)> list4 = ((list3.Count == 1) ? list3 : ((list2.Count == 1) ? list2 : new List<(string, int)>()));
					if (list4.Count == 1)
					{
						list.Remove(list4[0].Item1);
					}
				}
				File.WriteAllLines(tnfPath.Text, list);
				fbTransaction.Commit();
				eGrid.DataSource = BuildBulkEPreview();
				LoadIo();
				LoadAudit();
				MessageBox.Show("Toplu E tamamlandı. TNF yedeği: " + text, "HKN PDKS");
			}
			catch (Exception ex2)
			{
				try
				{
					fbTransaction.Rollback();
				}
				catch
				{
				}
				File.Copy(text, tnfPath.Text, overwrite: true);
				MessageBox.Show(ex2.Message, "Toplu E", MessageBoxButtons.OK, MessageBoxIcon.Hand);
			}
		}
	}

	private void PreviewBulk()
	{
		try
		{
			bulkGrid.DataSource = BuildBulkPreview();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Toplu Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
		}
	}

	private DataTable BuildBulkPreview()
	{
		List<string> list = (from string x in peopleList.CheckedItems
			select x.Substring(0, 5) into x
			orderby x
			select x).ToList();
		List<DateTime> list2 = (from DayChoice x in dayList.CheckedItems
			select x.Date into x
			orderby x
			select x).ToList();
		if (list.Count == 0 || list2.Count == 0)
		{
			throw new InvalidOperationException("Personel ve gün seçin.");
		}
		int num = ToMinute(inMin.Text);
		int num2 = ToMinute(inMax.Text);
		int num3 = ToMinute(outMin.Text);
		int num4 = ToMinute(outMax.Text);
		if (num2 < num || num4 < num3 || num < WorkHours.EntryEarly || num2 > WorkHours.EntryLate || num3 < WorkHours.ExitEarly || num4 > WorkHours.ExitLate)
		{
			throw new InvalidOperationException("Saat aralığı ortak Hedef çalışma ayarı dışında. " + WorkHours.Information);
		}
		DataTable dataTable = new DataTable();
		dataTable.Columns.Add("Kart No");
		dataTable.Columns.Add("Tarih", typeof(DateTime));
		dataTable.Columns.Add("Giriş");
		dataTable.Columns.Add("Çıkış");
		foreach (DateTime item in list2)
		{
			List<int> list3 = DistributedMinutes(num, num2, list.Count, item, 17);
			List<int> list4 = DistributedMinutes(num3, num4, list.Count, item, 71);
			for (int num5 = 0; num5 < list.Count; num5++)
			{
				dataTable.Rows.Add(list[num5], item, FromMinute(list3[num5]), FromMinute(list4[num5]));
			}
		}
		return dataTable;
	}

	private static int ToMinute(string text)
	{
		if (!TimeSpan.TryParse(text, out var result))
		{
			throw new InvalidOperationException("Saat biçimi HH:mm olmalı.");
		}
		return (int)result.TotalMinutes;
	}

	private static string FromMinute(int minute)
	{
		return $"{minute / 60:00}:{minute % 60:00}";
	}

	private static List<int> DistributedMinutes(int min, int max, int count, DateTime day, int salt)
	{
		if (max < min)
		{
			throw new InvalidOperationException("Saat aralığı hatalı.");
		}
		int span = max - min + 1;
		List<int> list = (from i in Enumerable.Range(0, count)
			select min + i % span).ToList();
		Random random = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt, count));
		for (int num = list.Count - 1; num > 0; num--)
		{
			int num2 = random.Next(num + 1);
			List<int> list2 = list;
			int index = num;
			List<int> list3 = list;
			int index2 = num2;
			int value = list[num2];
			int value2 = list[num];
			list2[index] = value;
			list3[index2] = value2;
		}
		return list;
	}

	private static object? Scalar(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
	{
		using FbCommand fbCommand = FirebirdDatabase.CreateCommand(c, tx, sql, p);
		return fbCommand.ExecuteScalar();
	}

	private static int Exec(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
	{
		using FbCommand fbCommand = FirebirdDatabase.CreateCommand(c, tx, sql, p);
		return fbCommand.ExecuteNonQuery();
	}

	private void ApplyBulk()
	{
		if (db == null)
		{
			return;
		}
		DataTable dataTable;
		try
		{
			dataTable = BuildBulkPreview();
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Toplu İşlem");
			return;
		}
		if (!File.Exists(tnfPath.Text))
		{
			MessageBox.Show("TNF dosyasını seçin.", "Toplu İşlem");
		}
		else
		{
			if (MessageBox.Show($"{dataTable.Rows.Count} kişi/gün kaydı uygulanacak. Mevcut dolu giriş-çıkışlar korunur. Devam?", "Toplu İşlem", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
			{
				return;
			}
			string text = tnfPath.Text + ".bak_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
			string text2 = tnfPath.Text + ".tmp_quick";
			File.Copy(tnfPath.Text, text, overwrite: true);
			List<string> list = (from x in File.ReadAllLines(tnfPath.Text)
				where !string.IsNullOrWhiteSpace(x)
				select x).ToList();
			HashSet<string> hashSet = new HashSet<string>(list, StringComparer.OrdinalIgnoreCase);
			using FbConnection fbConnection = db.OpenConnection();
			using FbTransaction fbTransaction = fbConnection.BeginTransaction();
			try
			{
				int num = Convert.ToInt32(Scalar(fbConnection, fbTransaction, "select coalesce(max(SIRA),0)+1 from GIRCIK") ?? ((object)1));
				foreach (DataRow row in dataTable.Rows)
				{
					string value = Convert.ToString(row["Kart No"]);
					DateTime date = Convert.ToDateTime(row["Tarih"]).Date;
					string text3 = Convert.ToString(row["Giriş"]);
					string text4 = Convert.ToString(row["Çıkış"]);
					using FbCommand fbCommand = FirebirdDatabase.CreateCommand(fbConnection, fbTransaction, "select first 1 SIRA,GSAAT,CSAAT from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N order by SIRA", new FbParameter("@P", value), new FbParameter("@D", date), new FbParameter("@N", date.AddDays(1.0)));
					using FbDataReader fbDataReader = fbCommand.ExecuteReader();
					int? num2 = null;
					string value2 = "";
					string value3 = "";
					if (fbDataReader.Read())
					{
						num2 = Convert.ToInt32(fbDataReader[0]);
						value2 = Convert.ToString(fbDataReader[1]) ?? "";
						value3 = Convert.ToString(fbDataReader[2]) ?? "";
					}
					fbDataReader.Close();
					bool flag = string.IsNullOrWhiteSpace(value2);
					bool flag2 = string.IsNullOrWhiteSpace(value3);
					if (!num2.HasValue)
					{
						Exec(fbConnection, fbTransaction, "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA) values (@S,@P,@D,@G,@GD,@D,@C,@CD)", new FbParameter("@S", num), new FbParameter("@P", value), new FbParameter("@D", date), new FbParameter("@G", text3), new FbParameter("@GD", ToMinute(text3)), new FbParameter("@C", text4), new FbParameter("@CD", ToMinute(text4)));
						num++;
						flag = (flag2 = true);
					}
					else
					{
						if (flag)
						{
							Exec(fbConnection, fbTransaction, "update GIRCIK set GTARIH=@D,GSAAT=@G,GDAKIKA=@M,GTUR=null where SIRA=@S", new FbParameter("@D", date), new FbParameter("@G", text3), new FbParameter("@M", ToMinute(text3)), new FbParameter("@S", num2.Value));
						}
						if (flag2)
						{
							Exec(fbConnection, fbTransaction, "update GIRCIK set CTARIH=@D,CSAAT=@C,CDAKIKA=@M,CTUR=null where SIRA=@S", new FbParameter("@D", date), new FbParameter("@C", text4), new FbParameter("@M", ToMinute(text4)), new FbParameter("@S", num2.Value));
						}
					}
					if (flag)
					{
						string item = $"{value},{text3},{date:ddMMyy},1,001";
						if (hashSet.Add(item))
						{
							list.Add(item);
						}
					}
					if (flag2)
					{
						string item2 = $"{value},{text4},{date:ddMMyy},1,001";
						if (hashSet.Add(item2))
						{
							list.Add(item2);
						}
					}
				}
				File.WriteAllLines(text2, SortTnf(list));
				File.Move(text2, tnfPath.Text, overwrite: true);
				try
				{
					fbTransaction.Commit();
				}
				catch
				{
					File.Copy(text, tnfPath.Text, overwrite: true);
					throw;
				}
				bulkGrid.DataSource = dataTable;
				LoadIo();
				LoadAudit();
				MessageBox.Show("Toplu işlem tamamlandı. TNF yedeği: " + text, "HKN PDKS");
			}
			catch (Exception ex2)
			{
				try
				{
					fbTransaction.Rollback();
				}
				catch
				{
				}
				if (File.Exists(text2))
				{
					File.Delete(text2);
				}
				MessageBox.Show(ex2.Message, "Toplu İşlem", MessageBoxButtons.OK, MessageBoxIcon.Hand);
			}
		}
	}

	private static IEnumerable<string> SortTnf(IEnumerable<string> lines)
	{
		return from x in lines
			orderby TnfKey(x).date, TnfKey(x).time, TnfKey(x).card
			select x;
	}

	private static (DateTime date, TimeSpan time, string card) TnfKey(string line)
	{
		try
		{
			string[] array = line.Split(',');
			if (array.Length < 3)
			{
				return (date: DateTime.MaxValue, time: TimeSpan.MaxValue, card: line);
			}
			return (date: DateTime.ParseExact(array[2], "ddMMyy", CultureInfo.InvariantCulture), time: TimeSpan.Parse(array[1]), card: array[0]);
		}
		catch
		{
			return (date: DateTime.MaxValue, time: TimeSpan.MaxValue, card: line);
		}
	}

	private static bool IsEntryTime(string time)
	{
		if (TimeSpan.TryParse(time, out var result))
		{
			return result < TimeSpan.FromHours(12.0);
		}
		return false;
	}

	private static bool SameTnfSide(string line, string card, DateTime day, bool entry)
	{
		string[] array = line.Split(',');
		if (array.Length < 3 || array[0] != card || array[2] != day.ToString("ddMMyy"))
		{
			return false;
		}
		return IsEntryTime(array[1]) == entry;
	}

	private void MarkSelectedE(bool entry)
	{
		if (db == null || ioGrid.SelectedRows.Count == 0)
		{
			return;
		}
		if (!File.Exists(tnfPath.Text))
		{
			MessageBox.Show("TNF dosyasını seçin.", "E Düzeltme");
			return;
		}
		List<DataGridViewRow> list = (from DataGridViewRow r in ioGrid.SelectedRows
			where !r.IsNewRow
			select r).ToList();
		List<string> source = (from x in File.ReadAllLines(tnfPath.Text)
			where !string.IsNullOrWhiteSpace(x)
			select x).ToList();
		HashSet<int> remove = new HashSet<int>();
		try
		{
			foreach (DataGridViewRow item in list)
			{
				string card = Convert.ToString(item.Cells["PKNO"].Value) ?? "";
				object obj = (entry ? item.Cells["GTARIH"].Value : item.Cells["CTARIH"].Value);
				string time = Convert.ToString(entry ? item.Cells["GSAAT"].Value : item.Cells["CSAAT"].Value) ?? "";
				if (obj == null || obj == DBNull.Value || string.IsNullOrWhiteSpace(time))
				{
					throw new InvalidOperationException(card + ": seçilen tarafta tarih/saat yok.");
				}
				DateTime day = Convert.ToDateTime(obj).Date;
				List<(string, int)> list2 = (from z in source.Select((string x, int i) => (x: x, i: i))
					where SameTnfSide(z.x, card, day, entry)
					select z).ToList();
				List<(string, int)> list3 = list2.Where<(string, int)>(((string x, int i) z) => z.x.Split(',')[1] == time).ToList();
				List<(string, int)> list4 = ((list3.Count > 0) ? list3 : list2);
				if (list4.Count > 1)
				{
					throw new InvalidOperationException($"{card} {day:dd.MM.yyyy}: aynı tarafta birden fazla TNF adayı var.");
				}
				if (list4.Count == 1)
				{
					remove.Add(list4[0].Item2);
				}
			}
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
			return;
		}
		if (MessageBox.Show($"{list.Count} kayıt için {(entry ? "giriş" : "çıkış")} tarafı E yapılacak. TNF'deki karşılık temizlenecek. Devam?", "E Düzeltme", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
		{
			return;
		}
		string text = tnfPath.Text + ".bak_E_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
		File.Copy(tnfPath.Text, text, overwrite: true);
		using FbConnection fbConnection = db.OpenConnection();
		using FbTransaction fbTransaction = fbConnection.BeginTransaction();
		try
		{
			foreach (DataGridViewRow item2 in list)
			{
				int num = Convert.ToInt32(item2.Cells["SIRA"].Value);
				Exec(fbConnection, fbTransaction, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", num));
			}
			string[] contents = source.Where((string _, int i) => !remove.Contains(i)).ToArray();
			File.WriteAllLines(tnfPath.Text, contents);
			try
			{
				fbTransaction.Commit();
			}
			catch
			{
				File.Copy(text, tnfPath.Text, overwrite: true);
				throw;
			}
			LoadIo();
			LoadAudit();
			MessageBox.Show($"E işlemi tamamlandı. TNF'den {remove.Count} satır temizlendi. Yedek: {text}", "HKN PDKS");
		}
		catch (Exception ex2)
		{
			try
			{
				fbTransaction.Rollback();
			}
			catch
			{
			}
			File.Copy(text, tnfPath.Text, overwrite: true);
			MessageBox.Show(ex2.Message, "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
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

	private void LoadTnfAudit()
	{
		try
		{
			int num = (int)auditYear.Value;
			int selectedIndex = auditMonthNo.SelectedIndex;
			string text = SelectedCard(auditPerson);
			string text2 = Path.Combine(Path.GetDirectoryName(tnfPath.Text) ?? "", $"TR{num}.Tnf");
			string text3 = (File.Exists(text2) ? text2 : tnfPath.Text);
			DataTable dataTable = new DataTable();
			string[] array = new string[7] { "Kart No", "Ad Soyad", "Tarih", "Gün", "Saat", "Taraf", "Ham TNF" };
			foreach (string columnName in array)
			{
				dataTable.Columns.Add(columnName);
			}
			if (!File.Exists(text3))
			{
				dataTable.Rows.Add("", "", "", "", "", "", "TNF dosyası yok: " + text3);
				auditGrid.DataSource = dataTable;
				return;
			}
			Dictionary<string, string> dictionary = new Dictionary<string, string>();
			if (db != null)
			{
				foreach (DataRow row in db.Query("select PKNO,AD,SOYAD from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY", new FbParameter("@TODAY", DateTime.Today)).Rows)
				{
					dictionary[Convert.ToString(row["PKNO"]) ?? ""] = $"{row["AD"]} {row["SOYAD"]}".Trim();
				}
			}
			foreach (string item in File.ReadLines(text3))
			{
				if (string.IsNullOrWhiteSpace(item))
				{
					continue;
				}
				string[] array2 = item.Split(',');
				if (array2.Length >= 3)
				{
					string text4 = array2[0].Trim();
					if (dictionary.ContainsKey(text4) && (text == null || !(text4 != text)) && DateTime.TryParseExact(array2[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var result) && result.Year == num && (selectedIndex == 0 || result.Month == selectedIndex))
					{
						string text5 = array2[1].Trim();
						TimeOnly result2;
						string text6 = ((TimeOnly.TryParse(text5, out result2) && result2.Hour < 12) ? "Giriş / Sabah" : "Çıkış / Akşam");
						dataTable.Rows.Add(text4, dictionary.TryGetValue(text4, out var value) ? value : "", result.ToString("dd.MM.yyyy"), result.ToString("dddd", new CultureInfo("tr-TR")), text5, text6, item);
					}
				}
			}
			auditGrid.DataSource = dataTable;
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "TNF Listeleme");
		}
	}

	private async void LoadAudit()
	{
		IEnumerable<Control> Descendants(Control parent)
		{
			foreach (Control child in parent.Controls)
			{
				yield return child;
				foreach (var descendant in Descendants(child)) yield return descendant;
			}
		}
		if (Descendants(this).OfType<DbTnfSyncControl>().FirstOrDefault() is { } control)
			await control.RunAuditAsync(false);
	}

	private void AuditSystemSide(DataTable t, HashSet<string> systemKeys, List<string> lines, string card, string name, object dateObj, object timeObj, string tur, bool entry)
	{
		if (dateObj == null || dateObj == DBNull.Value)
		{
			return;
		}
		string time = Convert.ToString(timeObj)?.Trim() ?? "";
		if (string.IsNullOrWhiteSpace(time))
		{
			return;
		}
		DateTime d = Convert.ToDateTime(dateObj).Date;
		string item = $"{card}|{d:yyyyMMdd}|{(entry ? "G" : "C")}";
		systemKeys.Add(item);
		List<string> list = lines.Where((string x) => SameTnfSide(x, card, d, entry)).ToList();
		List<string> list2 = list.Where((string x) => x.Split(',').Length > 1 && x.Split(',')[1].Trim() == time).ToList();
		string text = (entry ? "Giriş / Sabah" : "Çıkış / Akşam");
		string text2 = d.ToString("dddd", new CultureInfo("tr-TR"));
		if (string.Equals(tur, "E", StringComparison.OrdinalIgnoreCase))
		{
			if (list.Count == 0)
			{
				t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "E", "", "UYUMLU - E / TNF YOK", "YOK");
			}
			else
			{
				t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "E", string.Join(" | ", list), "UYUMSUZ - E AMA TNF VAR", "TNF SİL E");
			}
			return;
		}
		if (list2.Count > 0)
		{
			string text3 = list2[0];
			t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "Normal", text3, "UYUMLU", "YOK");
			List<string> list3 = list.ToList();
			list3.Remove(text3);
			{
				foreach (string item2 in list3)
				{
					t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, item2.Split(',')[1].Trim(), "TNF", item2, "UYUMSUZ - FAZLA TNF", "TNF SİL FAZLA");
				}
				return;
			}
		}
		if (list.Count == 0)
		{
			t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "Normal", "", "UYUMSUZ - TNF EKSİK", "TNF EKLE");
		}
		else if (list.Count == 1)
		{
			t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "Normal", list[0], "UYUMSUZ - SAAT FARKLI", "TNF DÜZELT");
		}
		else
		{
			t.Rows.Add(card, name, d.ToString("dd.MM.yyyy"), text2, text, time, "Normal", string.Join(" | ", list), "UYUMSUZ - ÇOKLU TNF / İNCELE", "İNCELE");
		}
	}

	private void ColorAuditRows()
	{
		foreach (DataGridViewRow item in (IEnumerable)auditGrid.Rows)
		{
			if (!item.IsNewRow)
			{
				string text = Convert.ToString(item.Cells["Durum"].Value) ?? "";
				item.DefaultCellStyle.BackColor = (text.StartsWith("UYUMLU") ? Color.Honeydew : (text.Contains("EKSİK") ? Color.LemonChiffon : Color.MistyRose));
				item.DefaultCellStyle.SelectionBackColor = (text.StartsWith("UYUMLU") ? Color.PaleGreen : (text.Contains("EKSİK") ? Color.Khaki : Color.LightSalmon));
			}
		}
	}

	private void ApplyMissingTnf(bool selectedOnly)
	{
		LoadAudit();
		if (auditGrid.DataSource is DataTable)
		{
			List<DataGridViewRow> list = (selectedOnly ? (from DataGridViewRow r in auditGrid.SelectedRows
				where !r.IsNewRow
				select r) : (from DataGridViewRow r in auditGrid.Rows
				where !r.IsNewRow
				select r)).Where((DataGridViewRow r) => Convert.ToString(r.Cells["İşlem"].Value) == "TNF EKLE").ToList();
			if (list.Count == 0)
			{
				MessageBox.Show("Eklenecek eksik TNF kaydı yok.");
				return;
			}
			ApplyAuditRows(list, $"{list.Count} eksik TNF kaydı eklenecek.");
		}
	}

	private void CleanExtraTnf()
	{
		LoadAudit();
		if (auditGrid.DataSource is DataTable)
		{
			List<DataGridViewRow> list = (from DataGridViewRow r in auditGrid.Rows
				where !r.IsNewRow && (Convert.ToString(r.Cells["İşlem"].Value) == "TNF SİL FAZLA" || Convert.ToString(r.Cells["İşlem"].Value) == "TNF SİL E")
				select r).ToList();
			if (list.Count == 0)
			{
				MessageBox.Show("Temizlenecek fazla TNF kaydı yok.");
				return;
			}
			ApplyAuditRows(list, $"{list.Count} fazla/E TNF kaydı temizlenecek.");
		}
	}

	private void FixTimeMismatchTnf()
	{
		LoadAudit();
		if (auditGrid.DataSource is DataTable)
		{
			List<DataGridViewRow> list = (from DataGridViewRow r in auditGrid.Rows
				where !r.IsNewRow && Convert.ToString(r.Cells["İşlem"].Value) == "TNF DÜZELT"
				select r).ToList();
			if (list.Count == 0)
			{
				MessageBox.Show("Düzeltilecek tekil saat farkı yok.");
				return;
			}
			ApplyAuditRows(list, $"{list.Count} saat farkı sistemdeki saate göre düzeltilecek.");
		}
	}

	private void ApplyAuditRows(List<DataGridViewRow> rows, string message)
	{
		int value = (int)auditYear.Value;
		string text = Path.Combine(Path.GetDirectoryName(tnfPath.Text) ?? "", $"TR{value}.Tnf");
		if (!File.Exists(text))
		{
			text = tnfPath.Text;
		}
		if (!File.Exists(text))
		{
			MessageBox.Show("TNF dosyası bulunamadı.");
		}
		else
		{
			if (MessageBox.Show(message + " Yedek alınacak. Devam?", "Data Kontrol", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
			{
				return;
			}
			string text2 = text + ".bak_AUDIT_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
			File.Copy(text, text2, overwrite: true);
			List<string> list = (from x in File.ReadAllLines(text)
				where !string.IsNullOrWhiteSpace(x)
				select x).ToList();
			foreach (DataGridViewRow row in rows)
			{
				string card = Convert.ToString(row.Cells["Kart No"].Value) ?? "";
				DateTime d = DateTime.ParseExact(Convert.ToString(row.Cells["Tarih"].Value) ?? "", "dd.MM.yyyy", CultureInfo.InvariantCulture);
				bool entry = (Convert.ToString(row.Cells["Taraf"].Value) ?? "").StartsWith("Giriş", StringComparison.OrdinalIgnoreCase);
				string value2 = Convert.ToString(row.Cells["Saat"].Value) ?? "";
				switch (Convert.ToString(row.Cells["İşlem"].Value) ?? "")
				{
				case "TNF EKLE":
					list.Add($"{card},{value2},{d:ddMMyy},1,001");
					break;
				case "TNF SİL E":
					list = list.Where((string x) => !SameTnfSide(x, card, d, entry)).ToList();
					break;
				case "TNF SİL FAZLA":
				{
					string raw = Convert.ToString(row.Cells["TNF Karşılığı"].Value) ?? "";
					int num = list.FindIndex((string x) => string.Equals(x, raw, StringComparison.OrdinalIgnoreCase));
					if (num >= 0)
					{
						list.RemoveAt(num);
					}
					break;
				}
				case "TNF DÜZELT":
					list = list.Where((string x) => !SameTnfSide(x, card, d, entry)).ToList();
					list.Add($"{card},{value2},{d:ddMMyy},1,001");
					break;
				}
			}
			File.WriteAllLines(text, SortTnf(list));
			LoadAudit();
			MessageBox.Show("İşlem tamamlandı. Yedek: " + text2);
		}
	}

	private void EditPayrollSelected()
	{
		if (db == null || payrollGrid.SelectedRows.Count != 1)
		{
			MessageBox.Show("Tek bordro satırı seçin.");
			return;
		}
		DataGridViewRow dataGridViewRow = payrollGrid.SelectedRows[0];
		string text = Convert.ToString(dataGridViewRow.Cells["PKNO"].Value) ?? "";
		DateTime dateTime = Convert.ToDateTime(dataGridViewRow.Cells["BASTAR"].Value);
		using PayrollEditForm payrollEditForm = new PayrollEditForm(text, dataGridViewRow);
		if (payrollEditForm.ShowDialog(this) == DialogResult.OK && MessageBox.Show(text + " bordro kaydı güncellenecek. Devam?", "Bordro", MessageBoxButtons.YesNo) == DialogResult.Yes)
		{
			List<string> list = new List<string>();
			List<FbParameter> list2 = new List<FbParameter>();
			int num = 0;
			string[] fields = PayrollEditForm.Fields;
			foreach (string text2 in fields)
			{
				string text3 = "@V" + num++;
				list.Add(text2 + "=" + text3);
				list2.Add(new FbParameter(text3, PayrollValue(text2, payrollEditForm.Get(text2))));
			}
			list2.Add(new FbParameter("@P", text));
			list2.Add(new FbParameter("@B", dateTime));
			db.Execute("update UCRETLER set " + string.Join(",", list) + " where PKNO=@P and BASTAR=@B", list2.ToArray());
			LoadPayroll();
		}
	}

	private static object PayrollValue(string field, string text)
	{
		string[] source = new string[13]
		{
			"DEVS", "DEVCEZAS", "ERS", "ERCEZAS", "GECS", "GECCEZAS", "EKS", "EKCEZAS", "AYS", "NCSAAT",
			"FMSAAT", "TOPEKS", "MESAIKESINTIS"
		};
		if (field.StartsWith("SAAT", StringComparison.OrdinalIgnoreCase) || source.Contains(field))
		{
			return text;
		}
		if ((field == "SSKG" || field == "BOLUM") ? true : false)
		{
			return IntNum(text);
		}
		return Num(text);
	}
}
