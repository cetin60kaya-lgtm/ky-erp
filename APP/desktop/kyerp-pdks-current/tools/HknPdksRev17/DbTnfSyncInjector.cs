using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class DbTnfSyncInjector
{
	private static bool injected;

	[ModuleInitializer]
	internal static void Initialize()
	{
		Application.Idle += InjectOnce;
	}

	private static void InjectOnce(object? sender, EventArgs e)
	{
		if (injected)
		{
			return;
		}
		Form form = ((IEnumerable)Application.OpenForms).Cast<Form>().FirstOrDefault((Form f) => f is MainForm);
		if (form == null)
		{
			return;
		}
		TabControl tabControl = FindControls<TabControl>(form).FirstOrDefault((TabControl t) => t.TabPages.Cast<TabPage>().Any((TabPage p) => p.Text == "Personel"));
		if (tabControl == null)
		{
			return;
		}
		injected = true;
		Application.Idle -= InjectOnce;
		foreach (TabPage item in (from TabPage p in tabControl.TabPages
			where p.Text.Equals("Data Kontrol", StringComparison.OrdinalIgnoreCase) || p.Text.Equals("DB - TNF Eşitle", StringComparison.OrdinalIgnoreCase)
			select p).ToList())
		{
			tabControl.TabPages.Remove(item);
		}
		TabPage tabPage = new TabPage("DB - TNF Eşitle")
		{
			Padding = new Padding(8),
			BackColor = Color.White
		};
		tabPage.Controls.Add(new DbTnfSyncControl(form));
		int num = tabControl.TabPages.Cast<TabPage>().ToList().FindIndex((TabPage p) => p.Text.Equals("TNF Hazırla", StringComparison.OrdinalIgnoreCase));
		if (num >= 0)
		{
			tabControl.TabPages.Insert(num, tabPage);
		}
		else
		{
			tabControl.TabPages.Add(tabPage);
		}
	}

	private static IEnumerable<T> FindControls<T>(Control root) where T : Control
	{
		foreach (Control child in root.Controls)
		{
			if (child is T val)
			{
				yield return val;
			}
			foreach (T item in FindControls<T>(child))
			{
				yield return item;
			}
		}
	}
}
