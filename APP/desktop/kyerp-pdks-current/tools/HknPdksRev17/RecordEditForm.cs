using System;
using System.Collections.Generic;
using System.Windows.Forms;

namespace QuickDataTool;

public sealed class RecordEditForm : Form
{
	private readonly Dictionary<string, TextBox> boxes = new Dictionary<string, TextBox>();

	public string Get(string key)
	{
		return boxes[key].Text.Trim();
	}

	public RecordEditForm(string title, DataGridViewRow row, params string[] fields)
	{
		Text = title;
		base.Width = 560;
		base.Height = Math.Min(720, 130 + fields.Length * 42);
		base.StartPosition = FormStartPosition.CenterParent;
		TableLayoutPanel tableLayoutPanel = new TableLayoutPanel
		{
			Dock = DockStyle.Fill,
			Padding = new Padding(14),
			ColumnCount = 2,
			AutoScroll = true
		};
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190f));
		tableLayoutPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
		foreach (string text in fields)
		{
			TextBox obj = new TextBox
			{
				Dock = DockStyle.Top
			};
			DataGridView? dataGridView = row.DataGridView;
			obj.Text = ((dataGridView != null && dataGridView.Columns.Contains(text)) ? (Convert.ToString(row.Cells[text].Value) ?? "") : "");
			TextBox textBox = obj;
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
			Width = 110
		};
		Button button2 = new Button
		{
			Text = "Vazgeç",
			DialogResult = DialogResult.Cancel,
			Width = 110
		};
		FlowLayoutPanel flowLayoutPanel = new FlowLayoutPanel
		{
			Dock = DockStyle.Top,
			FlowDirection = FlowDirection.RightToLeft,
			Height = 45
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
