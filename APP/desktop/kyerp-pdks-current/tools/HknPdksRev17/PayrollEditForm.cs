using System;
using System.Collections.Generic;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
	private readonly Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();

	public static readonly string[] Fields = new string[75]
	{
		"DMAAS", "GUN1", "SAAT1", "UCRET1", "GUN2", "SAAT2", "UCRET2", "GUN3", "SAAT3", "UCRET3",
		"GUN4", "SAAT4", "UCRET4", "GUN5", "SAAT5", "UCRET5", "GUN6", "SAAT6", "UCRET6", "GUN7",
		"SAAT7", "UCRET7", "GUN8", "SAAT8", "UCRET8", "GUN9", "SAAT9", "UCRET9", "GUN10", "SAAT10",
		"UCRET10", "NCGUN", "NCSAAT", "NCUCRET", "NCODENEN", "FMSAAT", "FMUCRET", "FMODENEN", "DEVS", "DEVG",
		"DEVU", "DEVCEZAS", "DEVCEZAU", "ERS", "ERG", "ERU", "ERCEZAS", "ERCEZAU", "GECS", "GECG",
		"GECU", "GECCEZAS", "GECCEZAU", "EKS", "EKG", "EKU", "EKCEZAS", "EKCEZAU", "AYS", "AYU",
		"TOPEKS", "YOLU", "YEMEKU", "DEVIR", "EX1", "EX2", "EX3", "EX4", "EX5", "EX6",
		"EKKES", "EKKAZ", "SSKG", "BOLUM", "MESAIKESINTIS"
	};

	public string Get(string key)
	{
		return boxes[key].Text.Trim();
	}

	public PayrollEditForm(string card, DataGridViewRow row)
	{
		Text = "Bordro Düzenle - " + card;
		base.Width = 760;
		base.Height = 760;
		base.StartPosition = FormStartPosition.CenterParent;
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			Padding = new Padding(14),
			ColumnCount = 2,
			AutoScroll = true
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		string[] fields = Fields;
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
				Text = text,
				Dock = DockStyle.Top,
				Height = 28
			}, 0, tableLayoutPanel.RowCount);
			tableLayoutPanel.Controls.Add(textBox, 1, tableLayoutPanel.RowCount);
			tableLayoutPanel.RowCount++;
		}
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
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			FlowDirection = FlowDirection.RightToLeft,
			Height = 48
		};
		flowLayoutPanel.Controls.Add(button);
		flowLayoutPanel.Controls.Add(button2);
		tableLayoutPanel.Controls.Add(flowLayoutPanel, 0, tableLayoutPanel.RowCount);
		tableLayoutPanel.SetColumnSpan(flowLayoutPanel, 2);
		base.Controls.Add(tableLayoutPanel);
		base.AcceptButton = button;
		base.CancelButton = button2;
	}
}
