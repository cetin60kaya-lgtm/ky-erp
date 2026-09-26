using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace KYERP.PDKS.Core.Reports;

public sealed record ReportTable(
    string Title,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<string>> Rows);

public static class ReportExporter
{
    public static void ExportExcel(string path, ReportTable report)
    {
        using var document = SpreadsheetDocument.Create(path, SpreadsheetDocumentType.Workbook);
        var workbookPart = document.AddWorkbookPart();
        workbookPart.Workbook = new Workbook();
        var styles = workbookPart.AddNewPart<WorkbookStylesPart>();
        styles.Stylesheet = BuildStyles();
        styles.Stylesheet.Save();

        var worksheetPart = workbookPart.AddNewPart<WorksheetPart>();
        var sheetData = new SheetData();
        var worksheet = new Worksheet();
        worksheet.Append(BuildColumns(report));
        worksheet.Append(sheetData);
        worksheetPart.Worksheet = worksheet;
        var sheets = workbookPart.Workbook.AppendChild(new Sheets());
        sheets.Append(new Sheet
        {
            Id = workbookPart.GetIdOfPart(worksheetPart),
            SheetId = 1,
            Name = SafeSheetName(report.Title)
        });

        var lastColumn = ColumnName(Math.Max(1, report.Columns.Count));
        sheetData.Append(StyledRow([report.Title], 1, 24));
        worksheet.InsertAfter(new MergeCells(new MergeCell
        {
            Reference = new StringValue($"A1:{lastColumn}1")
        }), worksheet.Elements<SheetData>().First());
        sheetData.Append(StyledRow(report.Columns, 2, 22));
        foreach (var values in report.Rows)
            sheetData.Append(StyledRow(values, 0, 19));

        worksheet.InsertAt(new SheetViews(
            new SheetView(new Pane
            {
                VerticalSplit = 2D,
                TopLeftCell = "A3",
                ActivePane = PaneValues.BottomLeft,
                State = PaneStateValues.Frozen
            }) { WorkbookViewId = 0U }), 0);
        workbookPart.Workbook.Save();
    }
    public static void ExportPdf(string path, ReportTable report)
    {
        using var document = new PdfDocument();
        document.Info.Title = report.Title;
        var titleFont = new XFont("Arial", 15, XFontStyle.Bold);
        var metaFont = new XFont("Arial", 7.5, XFontStyle.Regular);
        var headerFont = new XFont("Arial", 7.2, XFontStyle.Bold);
        var bodyFont = new XFont("Arial", 7, XFontStyle.Regular);
        var blue = XColor.FromArgb(33, 101, 190);
        var headerBack = XColor.FromArgb(232, 241, 252);
        var altBack = XColor.FromArgb(248, 250, 253);
        var border = XColor.FromArgb(205, 214, 226);
        var text = XColor.FromArgb(32, 45, 64);
        var offset = 0;
        var pageNo = 0;

        do
        {
            pageNo++;
            var page = document.AddPage();
            var wide = report.Columns.Count > 7;
            page.Size = wide ? PdfSharpCore.PageSize.A3 : PdfSharpCore.PageSize.A4;
            page.Orientation = wide
                ? PdfSharpCore.PageOrientation.Landscape
                : PdfSharpCore.PageOrientation.Portrait;
            using var g = XGraphics.FromPdfPage(page);
            const double margin = 26;
            var width = page.Width - margin * 2;
            var weights = ColumnWeights(report);
            var colWidths = weights.Select(x => x / weights.Sum() * width).ToArray();
            var y = margin;
            g.DrawString(report.Title, titleFont, new XSolidBrush(blue), new XRect(margin, y, width, 22), XStringFormats.TopLeft);
            y += 23;
            var meta = $"KY ERP • PDKS   |   {DateTime.Now:dd.MM.yyyy HH:mm}   |   Sayfa {pageNo}";
            g.DrawString(meta, metaFont, new XSolidBrush(XColor.FromArgb(96, 108, 125)), new XRect(margin, y, width, 12), XStringFormats.TopLeft);
            y += 16;
            g.DrawLine(new XPen(blue, 1.6), margin, y, margin + width, y);
            y += 7;

            DrawPdfRow(g, report.Columns, headerFont, margin, ref y, colWidths, 22,
                new XSolidBrush(headerBack), new XPen(border, .65), new XSolidBrush(text));

            var usableBottom = page.Height - margin - 18;
            var rowOnPage = 0;
            while (offset < report.Rows.Count && y + 19 <= usableBottom)
            {
                var back = rowOnPage % 2 == 1 ? new XSolidBrush(altBack) : XBrushes.White;
                DrawPdfRow(g, report.Rows[offset], bodyFont, margin, ref y, colWidths, 19,
                    back, new XPen(border, .45), new XSolidBrush(text));
                offset++;
                rowOnPage++;
            }

            g.DrawString($"Toplam kayıt: {report.Rows.Count}", metaFont,
                new XSolidBrush(XColor.FromArgb(96, 108, 125)),
                new XRect(margin, page.Height - margin, width, 12), XStringFormats.TopLeft);
        }
        while (offset < report.Rows.Count);

        document.Save(path);
    }
    static void DrawPdfRow(
        XGraphics g, IReadOnlyList<string> values, XFont font,
        double left, ref double y, IReadOnlyList<double> widths, double height,
        XBrush background, XPen borderPen, XBrush textBrush)
    {
        var x = left;
        for (var i = 0; i < widths.Count; i++)
        {
            var width = widths[i];
            g.DrawRectangle(background, x, y, width, height);
            g.DrawRectangle(borderPen, x, y, width, height);
            var value = i < values.Count ? Clean(values[i]) : string.Empty;
            var fitted = FitText(g, value, font, Math.Max(8, width - 7));
            g.DrawString(fitted, font, textBrush,
                new XRect(x + 4, y + 4, Math.Max(1, width - 8), height - 7),
                XStringFormats.TopLeft);
            x += width;
        }
        y += height;
    }

    static string FitText(XGraphics g, string value, XFont font, double maxWidth)
    {
        if (g.MeasureString(value, font).Width <= maxWidth) return value;
        const string ellipsis = "…";
        var length = value.Length;
        while (length > 1 && g.MeasureString(value[..length] + ellipsis, font).Width > maxWidth)
            length--;
        return value[..Math.Max(1, length)] + ellipsis;
    }
    static IReadOnlyList<double> ColumnWeights(ReportTable report)
    {
        var result = new double[report.Columns.Count];
        for (var i = 0; i < result.Length; i++)
        {
            var max = report.Columns[i].Length;
            foreach (var row in report.Rows.Take(120))
                if (i < row.Count) max = Math.Max(max, Clean(row[i]).Length);
            result[i] = Math.Clamp(max + 2, 7, 24);
        }
        return result;
    }

    static Columns BuildColumns(ReportTable report)
    {
        var columns = new Columns();
        for (var i = 0; i < report.Columns.Count; i++)
        {
            var max = report.Columns[i].Length;
            foreach (var row in report.Rows.Take(150))
                if (i < row.Count) max = Math.Max(max, Clean(row[i]).Length);
            columns.Append(new Column
            {
                Min = (uint)(i + 1), Max = (uint)(i + 1),
                Width = Math.Clamp(max + 2.5, 10, 32), CustomWidth = true
            });
        }
        return columns;
    }

    static Row StyledRow(IEnumerable<string> values, uint style, double height)
    {
        var row = new Row { Height = height, CustomHeight = true };
        foreach (var value in values)
            row.Append(Cell(Clean(value), style));
        return row;
    }
    static Cell Cell(string value, uint style) => new()
    {
        DataType = CellValues.InlineString,
        StyleIndex = style,
        InlineString = new InlineString(new Text(value) { Space = SpaceProcessingModeValues.Preserve })
    };

    static Stylesheet BuildStyles()
    {
        var fonts = new Fonts(
            new Font(new FontName { Val = "Segoe UI" }, new FontSize { Val = 9 }),
            new Font(new Bold(), new FontName { Val = "Segoe UI" }, new FontSize { Val = 15 }, new Color { Rgb = "FFFFFFFF" }),
            new Font(new Bold(), new FontName { Val = "Segoe UI" }, new FontSize { Val = 9 }, new Color { Rgb = "FF1F4374" }));
        var fills = new Fills(
            new Fill(new PatternFill { PatternType = PatternValues.None }),
            new Fill(new PatternFill { PatternType = PatternValues.Gray125 }),
            new Fill(new PatternFill(new ForegroundColor { Rgb = "FF246BE6" }) { PatternType = PatternValues.Solid }),
            new Fill(new PatternFill(new ForegroundColor { Rgb = "FFE8F1FC" }) { PatternType = PatternValues.Solid }));
        var borders = new Borders(
            new Border(),
            new Border(
                new LeftBorder { Style = BorderStyleValues.Thin, Color = new Color { Rgb = "FFD8E1EC" } },
                new RightBorder { Style = BorderStyleValues.Thin, Color = new Color { Rgb = "FFD8E1EC" } },
                new TopBorder { Style = BorderStyleValues.Thin, Color = new Color { Rgb = "FFD8E1EC" } },
                new BottomBorder { Style = BorderStyleValues.Thin, Color = new Color { Rgb = "FFD8E1EC" } }));
        var formats = new CellFormats(
            new CellFormat { FontId = 0, FillId = 0, BorderId = 1, ApplyBorder = true, Alignment = new Alignment { Vertical = VerticalAlignmentValues.Center } },
            new CellFormat { FontId = 1, FillId = 2, BorderId = 0, ApplyFont = true, ApplyFill = true, Alignment = new Alignment { Vertical = VerticalAlignmentValues.Center, Horizontal = HorizontalAlignmentValues.Left } },
            new CellFormat { FontId = 2, FillId = 3, BorderId = 1, ApplyFont = true, ApplyFill = true, ApplyBorder = true, Alignment = new Alignment { Vertical = VerticalAlignmentValues.Center, WrapText = true } });

        return new Stylesheet(fonts, fills, borders, new CellStyleFormats(new CellFormat()), formats);
    }

    static string Clean(string? value) =>
        (value ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();

    static string ColumnName(int index)
    {
        var name = string.Empty;
        while (index > 0)
        {
            index--;
            name = (char)('A' + index % 26) + name;
            index /= 26;
        }
        return name;
    }

    static string SafeSheetName(string value)
    {
        var cleaned = new string(value.Where(c => !"[]:*?/\\".Contains(c)).Take(31).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "Rapor" : cleaned;
    }
}
