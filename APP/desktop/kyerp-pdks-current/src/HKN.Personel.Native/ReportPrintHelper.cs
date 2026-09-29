using System.Drawing.Printing;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal static class ReportPrintHelper
{
    public static void Preview(IWin32Window owner, ReportTable report, bool landscape = false, IReadOnlyList<int>? sourceWidths = null)
    {
        report = report with { Title = CompanyBranding.DecorateTitle(report.Title) };
        using var preview = new ReportPreviewWindow(report, landscape, sourceWidths);
        preview.ShowDialog(owner);
    }

    public static void Print(IWin32Window owner, ReportTable report, bool landscape = false, IReadOnlyList<int>? sourceWidths = null)
    {
        report = report with { Title = CompanyBranding.DecorateTitle(report.Title) };
        using var document = CreateDocument(report, landscape, sourceWidths);
        using var dialog = new PrintDialog { Document = document, UseEXDialog = true };
        if (dialog.ShowDialog(owner) == DialogResult.OK) document.Print();
    }

    static PrintDocument CreateDocument(ReportTable report, bool landscape, IReadOnlyList<int>? sourceWidths)
    {
        var rowIndex = 0;
        var pageNo = 0;
        var document = new PrintDocument { DocumentName = report.Title };
        document.DefaultPageSettings.Landscape = landscape || report.Columns.Count > 7;
        document.DefaultPageSettings.Margins = new Margins(28, 28, 32, 32);
        if (report.Columns.Count > 7) document.DefaultPageSettings.PaperSize = new PaperSize("A3", 1169, 1654);

        document.PrintPage += (_, e) =>
        {
            pageNo++;
            var g = e.Graphics;
            if (g is null) { e.HasMorePages = false; return; }
            using var titleFont = new Font("Segoe UI", 14, FontStyle.Bold);
            using var metaFont = new Font("Segoe UI", 7.5f);
            using var headerFont = new Font("Segoe UI", 8, FontStyle.Bold);
            using var bodyFont = new Font("Segoe UI", 8);
            using var titleBrush = new SolidBrush(Color.FromArgb(28, 91, 180));
            using var textBrush = new SolidBrush(Color.FromArgb(32, 45, 64));
            using var mutedBrush = new SolidBrush(Color.FromArgb(96, 108, 125));
            using var headerBrush = new SolidBrush(Color.FromArgb(232, 241, 252));
            using var altBrush = new SolidBrush(Color.FromArgb(248, 250, 253));
            using var borderPen = new Pen(Color.FromArgb(205, 214, 226));
            var bounds = e.MarginBounds;
            var y = (float)bounds.Top;
            g.DrawString(report.Title, titleFont, titleBrush, bounds.Left, y);
            y += titleFont.Height + 4;
            g.DrawString($"KY ERP • PDKS   |   {DateTime.Now:dd.MM.yyyy HH:mm}   |   Sayfa {pageNo}", metaFont, mutedBrush, bounds.Left, y);
            y += metaFont.Height + 8;
            using (var accent = new Pen(Color.FromArgb(36, 107, 230), 1.5f)) g.DrawLine(accent, bounds.Left, y, bounds.Right, y);
            y += 6;

            var widths = ColumnWidths(report, bounds.Width, sourceWidths);
            DrawRow(g, report.Columns, headerFont, textBrush, headerBrush, borderPen, bounds.Left, ref y, widths, 24);
            var rowOnPage = 0;
            while (rowIndex < report.Rows.Count && y + 21 <= bounds.Bottom)
            {
                var back = rowOnPage % 2 == 1 ? altBrush : Brushes.White;
                DrawRow(g, report.Rows[rowIndex], bodyFont, textBrush, back, borderPen, bounds.Left, ref y, widths, 21);
                rowIndex++;
                rowOnPage++;
            }

            g.DrawString($"Toplam kayıt: {report.Rows.Count}", metaFont, mutedBrush, bounds.Left, bounds.Bottom + 5);
            e.HasMorePages = rowIndex < report.Rows.Count;
        };

        document.BeginPrint += (_, _) => { rowIndex = 0; pageNo = 0; };
        return document;
    }

    static void DrawRow(Graphics g, IReadOnlyList<string> values, Font font, Brush textBrush,
        Brush background, Pen borderPen, float left, ref float y, IReadOnlyList<float> widths, float height)
    {
        var x = left;
        for (var i = 0; i < widths.Count; i++)
        {
            var rect = new RectangleF(x, y, widths[i], height);
            g.FillRectangle(background, rect);
            g.DrawRectangle(borderPen, rect.X, rect.Y, rect.Width, rect.Height);
            var value = i < values.Count ? Clean(values[i]) : string.Empty;
            using var format = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, LineAlignment = StringAlignment.Center };
            g.DrawString(value, font, textBrush, new RectangleF(rect.X + 3, rect.Y + 1, Math.Max(1, rect.Width - 6), rect.Height - 2), format);
            x += widths[i];
        }
        y += height;
    }

    static IReadOnlyList<float> ColumnWidths(ReportTable report, int totalWidth, IReadOnlyList<int>? sourceWidths)
    {
        if (sourceWidths is not null && sourceWidths.Count == report.Columns.Count && sourceWidths.Sum() > 0)
        {
            var sumPixels = (float)sourceWidths.Sum();
            return sourceWidths.Select(w => Math.Max(1, w) / sumPixels * totalWidth).ToArray();
        }

        var weights = new float[report.Columns.Count];
        for (var i = 0; i < weights.Length; i++)
        {
            var max = report.Columns[i].Length;
            foreach (var row in report.Rows.Take(100)) if (i < row.Count) max = Math.Max(max, Clean(row[i]).Length);
            weights[i] = Math.Clamp(max + 2, 6, 24);
        }
        var sum = Math.Max(1, weights.Sum());
        return weights.Select(w => w / sum * totalWidth).ToArray();
    }

    static string Clean(string? value) => (value ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
}
