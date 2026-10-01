using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class TnfPrepareInjector
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
		TabControl tabControl = FindControls<TabControl>(form).FirstOrDefault();
		if (tabControl == null)
		{
			return;
		}
		injected = true;
		Application.Idle -= InjectOnce;
		if (!tabControl.TabPages.Cast<TabPage>().Any((TabPage p) => p.Text == "TNF Hazırla"))
		{
			tabControl.TabPages.Add(new TabPage("TNF Hazırla")
			{
				Padding = new Padding(8),
				BackColor = Color.White,
				Controls = { (Control?)new TnfPrepareControl(form) }
			});
		}
		TabPage tabPage = tabControl.TabPages.Cast<TabPage>().FirstOrDefault((TabPage p) => p.Text.Contains("Toplu", StringComparison.OrdinalIgnoreCase));
		if (tabPage == null)
		{
			return;
		}
		foreach (Button item in from b in FindControls<Button>(tabPage)
			where string.Equals(b.Text, "Uygula", StringComparison.OrdinalIgnoreCase)
			select b)
		{
			item.Text = "DB + TNF UYGULA";
			item.Width = Math.Max(item.Width, 145);
			item.BackColor = Color.MistyRose;
		}
	}

	internal static IEnumerable<T> FindControls<T>(Control root) where T : Control
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
