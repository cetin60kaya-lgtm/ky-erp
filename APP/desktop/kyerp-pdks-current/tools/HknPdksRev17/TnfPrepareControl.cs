using System;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace QuickDataTool;

internal sealed class TnfPrepareControl : UserControl
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

	private sealed class FormatSettings
	{
		public int CardStart { get; set; } = 1;

		public int CardLen { get; set; } = 5;

		public int YearStart { get; set; } = 17;

		public int YearLen { get; set; } = 2;

		public int MonthStart { get; set; } = 15;

		public int MonthLen { get; set; } = 2;

		public int DayStart { get; set; } = 13;

		public int DayLen { get; set; } = 2;

		public int TypeStart { get; set; } = 20;

		public int TypeLen { get; set; } = 1;

		public int HourStart { get; set; } = 7;

		public int HourLen { get; set; } = 2;

		public int MinuteStart { get; set; } = 10;

		public int MinuteLen { get; set; } = 2;

		public int CodeStart { get; set; } = 22;

		public int CodeLen { get; set; } = 3;

		public string TypeValue { get; set; } = "1";

		public string CodeValue { get; set; } = "001";

		public string Separators { get; set; } = "6=,;9=:;12=,;19=,;21=,";
	}

	private readonly Form main;

	private readonly CheckedListBox people = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly CheckedListBox days = new CheckedListBox
	{
		Dock = DockStyle.Fill,
		CheckOnClick = true
	};

	private readonly DataGridView preview = new DataGridView
	{
		Dock = DockStyle.Fill,
		ReadOnly = true,
		AllowUserToAddRows = false,
		AllowUserToDeleteRows = false,
		AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
		SelectionMode = DataGridViewSelectionMode.FullRowSelect,
		BackgroundColor = Color.White
	};

	private readonly DateTimePicker start = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short,
		Width = 115
	};

	private readonly DateTimePicker end = new DateTimePicker
	{
		Format = DateTimePickerFormat.Short,
		Width = 115
	};

	private readonly MaskedTextBox inMin = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Entry));

	private readonly MaskedTextBox inMax = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Entry));

	private readonly MaskedTextBox outMin = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Exit));

	private readonly MaskedTextBox outMax = TimeBox(WorkTimePolicy.Format(WorkTimePolicy.Default.Exit));
	private readonly Label workTimeInformation = new() { AutoSize = true, ForeColor = Color.DarkSlateBlue, Padding = new Padding(4), Text = WorkTimePolicy.Default.Information };
	private WorkTimePolicy WorkHours => main is MainForm application ? application.WorkHours : WorkTimePolicy.Default;

	private readonly CheckBox weekends = new CheckBox
	{
		Text = "Cumartesi / Pazar hariç",
		Checked = true,
		AutoSize = true,
		Padding = new Padding(6, 7, 0, 0)
	};

	private readonly Label status = new Label
	{
		AutoSize = true,
		ForeColor = Color.DarkGreen,
		Padding = new Padding(8, 8, 0, 0)
	};

	private readonly Dictionary<string, NumericUpDown> pos = new Dictionary<string, NumericUpDown>();

	private readonly Dictionary<string, NumericUpDown> len = new Dictionary<string, NumericUpDown>();

	private readonly TextBox typeValue = new TextBox
	{
		Width = 70
	};

	private readonly TextBox codeValue = new TextBox
	{
		Width = 70
	};

	private readonly TextBox separators = new TextBox
	{
		Width = 240
	};

	private readonly TextBox formatPreview = new TextBox
	{
		ReadOnly = true,
		Width = 380,
		Font = new Font("Consolas", 10f)
	};

	private readonly string settingsPath = SettingsFile();

	private FormatSettings settings = new FormatSettings();

	private static string SettingsFile()
	{
		string text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
		Directory.CreateDirectory(text);
		return Path.Combine(text, "TNF_FORMAT_AYAR.json");
	}

	public TnfPrepareControl(Form mainForm)
	{
		main = mainForm;
		Dock = DockStyle.Fill;
		Font = new Font("Segoe UI", 9f);
		Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
		settings = LoadSettings();
		Build();
		void RefreshWorkHours()
		{
			inMin.Text = inMax.Text = WorkTimePolicy.Format(WorkHours.Entry);
			outMin.Text = outMax.Text = WorkTimePolicy.Format(WorkHours.Exit);
			workTimeInformation.Text = WorkHours.Information;
		}
		RefreshWorkHours();
		if (main is MainForm application)
		{
			EventHandler update = (_, _) => RefreshWorkHours();
			application.WorkHoursChanged += update;
			Disposed += (_, _) => application.WorkHoursChanged -= update;
		}
		start.ValueChanged += delegate
		{
			RebuildDays();
		};
		end.ValueChanged += delegate
		{
			RebuildDays();
		};
		weekends.CheckedChanged += delegate
		{
			RebuildDays();
		};
		base.VisibleChanged += delegate
		{
			if (base.Visible)
			{
				RefreshPeople();
			}
		};
		RebuildDays();
		base.Load += delegate
		{
			RefreshPeople();
		};
	}

	private static MaskedTextBox TimeBox(string value)
	{
		return new MaskedTextBox("00:00")
		{
			Text = value,
			Width = 62
		};
	}

	private void Build()
	{
		TabControl tabControl = new TabControl
		{
			Dock = DockStyle.Fill
		};
		tabControl.TabPages.Add(BuildGeneratePage());
		tabControl.TabPages.Add(BuildFormatPage());
		base.Controls.Add(tabControl);
	}

	private TabPage BuildGeneratePage()
	{
		TabPage obj = new TabPage("TXT Oluştur")
		{
			Padding = new Padding(8),
			BackColor = Color.White
		};
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			ColumnCount = 3,
			RowCount = 4,
			Padding = new Padding(4)
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 310f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 270f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 76f));
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 48f));
		tableLayoutPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			WrapContents = true
		};
		flowLayoutPanel.Controls.Add(L("Başlangıç"));
		flowLayoutPanel.Controls.Add(start);
		flowLayoutPanel.Controls.Add(L("Bitiş"));
		flowLayoutPanel.Controls.Add(end);
		flowLayoutPanel.Controls.Add(L("Giriş"));
		flowLayoutPanel.Controls.Add(inMin);
		flowLayoutPanel.Controls.Add(inMax);
		flowLayoutPanel.Controls.Add(L("Çıkış"));
		flowLayoutPanel.Controls.Add(outMin);
		flowLayoutPanel.Controls.Add(outMax);
		flowLayoutPanel.Controls.Add(weekends);
		flowLayoutPanel.SetFlowBreak(weekends, true);
		flowLayoutPanel.Controls.Add(workTimeInformation);
		tableLayoutPanel.Controls.Add(flowLayoutPanel, 0, 0);
		tableLayoutPanel.SetColumnSpan(flowLayoutPanel, 3);
		tableLayoutPanel.Controls.Add(people, 0, 1);
		tableLayoutPanel.Controls.Add(days, 1, 1);
		tableLayoutPanel.Controls.Add(preview, 2, 1);
		FlowLayoutPanel flowLayoutPanel2 = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			WrapContents = false,
			Padding = new Padding(2, 6, 2, 2)
		};
		flowLayoutPanel2.Controls.Add(Wide("Personeli Yenile", RefreshPeople, 125));
		flowLayoutPanel2.Controls.Add(Wide("Tüm Personeli Seç", CheckAllPeople, 135));
		flowLayoutPanel2.Controls.Add(Wide("Tüm Günleri Seç", CheckAllDays, 125));
		flowLayoutPanel2.Controls.Add(Wide("Önizleme", PreviewRows, 110));
		Button button = Wide("YENİ TXT OLUŞTUR", CreateTxt, 170);
		button.BackColor = Color.LightGreen;
		flowLayoutPanel2.Controls.Add(button);
		tableLayoutPanel.Controls.Add(flowLayoutPanel2, 0, 2);
		tableLayoutPanel.SetColumnSpan(flowLayoutPanel2, 3);
		FlowLayoutPanel flowLayoutPanel3 = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			WrapContents = false
		};
		flowLayoutPanel3.Controls.Add(new Label
		{
			Text = "DATABASE.GDB'ye YAZMAZ. Dosya Masaüstüne tarih adıyla oluşturulur: 29&9&2026.txt",
			AutoSize = true,
			ForeColor = Color.DarkGreen,
			Font = new Font("Segoe UI", 9f, FontStyle.Bold),
			Padding = new Padding(0, 8, 0, 0)
		});
		flowLayoutPanel3.Controls.Add(status);
		tableLayoutPanel.Controls.Add(flowLayoutPanel3, 0, 3);
		tableLayoutPanel.SetColumnSpan(flowLayoutPanel3, 3);
		obj.Controls.Add(tableLayoutPanel);
		return obj;
	}

	private TabPage BuildFormatPage()
	{
		TabPage tabPage = new TabPage("Terminal Format Ayarı")
		{
			Padding = new Padding(10),
			BackColor = Color.White
		};
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			ColumnCount = 2,
			RowCount = 1
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 470f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		TableLayoutPanel tableLayoutPanel2 = new TableLayoutPanel
		{
			Dock = DockStyle.Top,
			ColumnCount = 3,
			AutoSize = true,
			Padding = new Padding(5)
		};
		tableLayoutPanel2.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230f));
		tableLayoutPanel2.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95f));
		tableLayoutPanel2.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95f));
		tableLayoutPanel2.Controls.Add(new Label
		{
			Text = "Alan",
			Font = new Font("Segoe UI", 9f, FontStyle.Bold),
			AutoSize = true
		}, 0, 0);
		tableLayoutPanel2.Controls.Add(new Label
		{
			Text = "Başlangıç",
			Font = new Font("Segoe UI", 9f, FontStyle.Bold),
			AutoSize = true
		}, 1, 0);
		tableLayoutPanel2.Controls.Add(new Label
		{
			Text = "Kaç Tane",
			Font = new Font("Segoe UI", 9f, FontStyle.Bold),
			AutoSize = true
		}, 2, 0);
		(string, string, int, int)[] obj = new(string, string, int, int)[8]
		{
			("Personel Kart Numarası", "Card", settings.CardStart, settings.CardLen),
			("Yıl", "Year", settings.YearStart, settings.YearLen),
			("Ay", "Month", settings.MonthStart, settings.MonthLen),
			("Gün", "Day", settings.DayStart, settings.DayLen),
			("Başlam Tür (Giriş/Çıkış)", "Type", settings.TypeStart, settings.TypeLen),
			("Saat", "Hour", settings.HourStart, settings.HourLen),
			("Dakika", "Minute", settings.MinuteStart, settings.MinuteLen),
			("Saat Kodu", "Code", settings.CodeStart, settings.CodeLen)
		};
		int num = 1;
		(string, string, int, int)[] array = obj;
		for (int i = 0; i < array.Length; i++)
		{
			(string, string, int, int) tuple = array[i];
			tableLayoutPanel2.Controls.Add(new Label
			{
				Text = tuple.Item1,
				AutoSize = true,
				Padding = new Padding(0, 6, 0, 0)
			}, 0, num);
			NumericUpDown numericUpDown = Num(tuple.Item3, 1, 99);
			NumericUpDown numericUpDown2 = Num(tuple.Item4, 1, 20);
			pos[tuple.Item2] = numericUpDown;
			len[tuple.Item2] = numericUpDown2;
			numericUpDown.ValueChanged += delegate
			{
				RefreshFormatPreview();
			};
			numericUpDown2.ValueChanged += delegate
			{
				RefreshFormatPreview();
			};
			tableLayoutPanel2.Controls.Add(numericUpDown, 1, num);
			tableLayoutPanel2.Controls.Add(numericUpDown2, 2, num);
			num++;
		}
		tableLayoutPanel.Controls.Add(tableLayoutPanel2, 0, 0);
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Fill,
			FlowDirection = FlowDirection.TopDown,
			WrapContents = false,
			Padding = new Padding(12)
		};
		typeValue.Text = settings.TypeValue;
		codeValue.Text = settings.CodeValue;
		separators.Text = settings.Separators;
		typeValue.TextChanged += delegate
		{
			RefreshFormatPreview();
		};
		codeValue.TextChanged += delegate
		{
			RefreshFormatPreview();
		};
		separators.TextChanged += delegate
		{
			RefreshFormatPreview();
		};
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Tür değeri",
			AutoSize = true
		});
		flowLayoutPanel.Controls.Add(typeValue);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Saat Kodu",
			AutoSize = true,
			Padding = new Padding(0, 8, 0, 0)
		});
		flowLayoutPanel.Controls.Add(codeValue);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Ayraç pozisyonları",
			AutoSize = true,
			Padding = new Padding(0, 8, 0, 0)
		});
		flowLayoutPanel.Controls.Add(separators);
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Örnek: 6=,;9=:;12=,;19=,;21=,",
			AutoSize = true,
			ForeColor = Color.DimGray
		});
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Canlı format önizleme",
			AutoSize = true,
			Padding = new Padding(0, 12, 0, 0)
		});
		flowLayoutPanel.Controls.Add(formatPreview);
		flowLayoutPanel.Controls.Add(Wide("FORMATI KAYDET", SaveFormat, 160));
		flowLayoutPanel.Controls.Add(new Label
		{
			Text = "Hedef 5.0.29 varsayılanı:\nKart 01/05 | Saat 07/02 | Dakika 10/02 | Gün 13/02\nAy 15/02 | Yıl 17/02 | Tür 20/01 | Kod 22/03",
			AutoSize = true,
			Padding = new Padding(0, 14, 0, 0)
		});
		tableLayoutPanel.Controls.Add(flowLayoutPanel, 1, 0);
		tabPage.Controls.Add(tableLayoutPanel);
		RefreshFormatPreview();
		return tabPage;
	}

	private static Label L(string text)
	{
		return new Label
		{
			Text = text,
			AutoSize = true,
			Padding = new Padding(7, 8, 2, 0)
		};
	}

	private static NumericUpDown Num(int value, int min, int max)
	{
		return new NumericUpDown
		{
			Minimum = min,
			Maximum = max,
			Value = Math.Clamp(value, min, max),
			Width = 70
		};
	}

	private static Button Wide(string text, Action action, int width)
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

	private void RefreshPeople()
	{
		try
		{
			((object)main).GetType().GetMethod("LoadPeople", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(main, null);
			if (!(((object)main).GetType().GetField("peopleList", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) is CheckedListBox checkedListBox))
			{
				return;
			}
			HashSet<string> hashSet = people.CheckedItems.Cast<string>().ToHashSet<string>(StringComparer.OrdinalIgnoreCase);
			people.Items.Clear();
			foreach (string item in from object x in checkedListBox.Items
				select Convert.ToString(x) ?? "" into x
				where x.Length >= 5
				select x)
			{
				people.Items.Add(item, hashSet.Count == 0 || hashSet.Contains(item));
			}
			status.Text = $"{people.Items.Count} aktif personel";
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.InnerException?.Message ?? ex.Message, "TNF Hazırla");
		}
	}

	private void RebuildDays()
	{
		HashSet<DateTime> hashSet = (from DayChoice x in days.CheckedItems
			select x.Date).ToHashSet();
		days.Items.Clear();
		if (end.Value.Date < start.Value.Date)
		{
			return;
		}
		DateTime dateTime = start.Value.Date;
		while (dateTime <= end.Value.Date)
		{
			if (!weekends.Checked || (dateTime.DayOfWeek != DayOfWeek.Saturday && dateTime.DayOfWeek != DayOfWeek.Sunday))
			{
				days.Items.Add(new DayChoice(dateTime), hashSet.Count == 0 || hashSet.Contains(dateTime));
			}
			dateTime = dateTime.AddDays(1.0);
		}
	}

	private void CheckAllPeople()
	{
		for (int i = 0; i < people.Items.Count; i++)
		{
			people.SetItemChecked(i, value: true);
		}
	}

	private void CheckAllDays()
	{
		for (int i = 0; i < days.Items.Count; i++)
		{
			days.SetItemChecked(i, value: true);
		}
	}

	private void PreviewRows()
	{
		try
		{
			preview.DataSource = BuildPreview();
			status.Text = $"Önizleme: {preview.Rows.Count} kişi/gün";
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "TNF Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
		}
	}

	private DataTable BuildPreview()
	{
		List<string> list = (from string x in people.CheckedItems
			select x.Substring(0, 5) into x
			orderby x
			select x).ToList();
		List<DateTime> list2 = (from DayChoice x in days.CheckedItems
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

	private List<string> BuildTxtLines()
	{
		DataTable source = BuildPreview();
		List<string> list = new List<string>();
		foreach (IGrouping<DateTime, DataRow> item in from r in source.AsEnumerable()
			group r by r.Field<DateTime>("Tarih").Date into g
			orderby g.Key
			select g)
		{
			var orderedEnumerable = from r in item
				select new
				{
					Card = r.Field<string>("Kart No"),
					Time = r.Field<string>("Giriş")
				} into x
				orderby ToMinute(x.Time), x.Card
				select x;
			var orderedEnumerable2 = from r in item
				select new
				{
					Card = r.Field<string>("Kart No"),
					Time = r.Field<string>("Çıkış")
				} into x
				orderby ToMinute(x.Time), x.Card
				select x;
			foreach (var item2 in orderedEnumerable)
			{
				list.Add(BuildLine(item2.Card, item.Key, item2.Time));
			}
			foreach (var item3 in orderedEnumerable2)
			{
				list.Add(BuildLine(item3.Card, item.Key, item3.Time));
			}
		}
		return list;
	}

	private void CreateTxt()
	{
		try
		{
			List<string> list = BuildTxtLines();
			string folderPath = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
			DateTime now = DateTime.Now;
			string text = $"{now.Day}&{now.Month}&{now.Year}";
			string text2 = Path.Combine(folderPath, text + ".txt");
			int num = 1;
			while (File.Exists(text2))
			{
				text2 = Path.Combine(folderPath, $"{text}({num++}).txt");
			}
			File.WriteAllLines(text2, list, Encoding.GetEncoding(1254));
			status.Text = $"Hazır: {Path.GetFileName(text2)} / {list.Count} satır";
			MessageBox.Show($"TXT hazır.\n\n{text2}\n\n{list.Count} satır.\nDATABASE.GDB'ye hiçbir kayıt yazılmadı.", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Asterisk);
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "TXT Oluştur", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
	}

	private string BuildLine(string card, DateTime day, string time)
	{
		FormatSettings formatSettings = CurrentSettings();
		TimeSpan timeSpan = TimeSpan.Parse(time);
		(int, int, string)[] obj = new(int, int, string)[8]
		{
			(formatSettings.CardStart, formatSettings.CardLen, card),
			(formatSettings.YearStart, formatSettings.YearLen, day.ToString("yy")),
			(formatSettings.MonthStart, formatSettings.MonthLen, day.ToString("MM")),
			(formatSettings.DayStart, formatSettings.DayLen, day.ToString("dd")),
			(formatSettings.TypeStart, formatSettings.TypeLen, formatSettings.TypeValue),
			(formatSettings.HourStart, formatSettings.HourLen, timeSpan.Hours.ToString("00")),
			(formatSettings.MinuteStart, formatSettings.MinuteLen, timeSpan.Minutes.ToString("00")),
			(formatSettings.CodeStart, formatSettings.CodeLen, formatSettings.CodeValue)
		};
		Dictionary<int, char> dictionary = ParseSeparators(formatSettings.Separators);
		int count = Math.Max(obj.Max(((int Start, int Count, string Value) x) => x.Start + x.Count - 1), dictionary.Keys.DefaultIfEmpty(1).Max());
		char[] array = Enumerable.Repeat(' ', count).ToArray();
		(int, int, string)[] array2 = obj;
		for (int num = 0; num < array2.Length; num++)
		{
			(int, int, string) tuple = array2[num];
			Put(array, tuple.Item1, tuple.Item2, tuple.Item3);
		}
		foreach (KeyValuePair<int, char> item in dictionary)
		{
			if (item.Key >= 1 && item.Key <= array.Length)
			{
				array[item.Key - 1] = item.Value;
			}
		}
		return new string(array).TrimEnd();
	}

	private static void Put(char[] chars, int start, int count, string value)
	{
		string text = value ?? "";
		if (text.Length > count)
		{
			text = text.Substring(0, count);
		}
		if (text.Length < count)
		{
			text = text.PadLeft(count, '0');
		}
		for (int i = 0; i < count && start - 1 + i < chars.Length; i++)
		{
			chars[start - 1 + i] = text[i];
		}
	}

	private static Dictionary<int, char> ParseSeparators(string text)
	{
		Dictionary<int, char> dictionary = new Dictionary<int, char>();
		string[] array = (text ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		foreach (string text2 in array)
		{
			int num = text2.IndexOf('=');
			if (num > 0 && num != text2.Length - 1 && int.TryParse(text2.Substring(0, num), out var result))
			{
				dictionary[result] = text2.Substring(num + 1)[0];
			}
		}
		return dictionary;
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

	private FormatSettings CurrentSettings()
	{
		return new FormatSettings
		{
			CardStart = (int)pos["Card"].Value,
			CardLen = (int)len["Card"].Value,
			YearStart = (int)pos["Year"].Value,
			YearLen = (int)len["Year"].Value,
			MonthStart = (int)pos["Month"].Value,
			MonthLen = (int)len["Month"].Value,
			DayStart = (int)pos["Day"].Value,
			DayLen = (int)len["Day"].Value,
			TypeStart = (int)pos["Type"].Value,
			TypeLen = (int)len["Type"].Value,
			HourStart = (int)pos["Hour"].Value,
			HourLen = (int)len["Hour"].Value,
			MinuteStart = (int)pos["Minute"].Value,
			MinuteLen = (int)len["Minute"].Value,
			CodeStart = (int)pos["Code"].Value,
			CodeLen = (int)len["Code"].Value,
			TypeValue = typeValue.Text.Trim(),
			CodeValue = codeValue.Text.Trim(),
			Separators = separators.Text.Trim()
		};
	}

	private void RefreshFormatPreview()
	{
		try
		{
			if (pos.Count > 0)
			{
				formatPreview.Text = BuildLine("00003", new DateTime(2026, 9, 29), "08:28");
			}
		}
		catch (Exception ex)
		{
			formatPreview.Text = "FORMAT HATASI: " + ex.Message;
		}
	}

	private void SaveFormat()
	{
		try
		{
			settings = CurrentSettings();
			File.WriteAllText(settingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions
			{
				WriteIndented = true
			}), Encoding.UTF8);
			RefreshFormatPreview();
			MessageBox.Show("Terminal format ayarı kaydedildi.", "HKN PDKS");
		}
		catch (Exception ex)
		{
			MessageBox.Show(ex.Message, "Format Kaydet", MessageBoxButtons.OK, MessageBoxIcon.Hand);
		}
	}

	private FormatSettings LoadSettings()
	{
		try
		{
			if (File.Exists(settingsPath))
			{
				return JsonSerializer.Deserialize<FormatSettings>(File.ReadAllText(settingsPath)) ?? new FormatSettings();
			}
		}
		catch
		{
		}
		return new FormatSettings();
	}
}
