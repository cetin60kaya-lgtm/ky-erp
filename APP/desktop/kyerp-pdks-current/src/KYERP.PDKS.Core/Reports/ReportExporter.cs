using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace KYERP.PDKS.Core.Reports;

public sealed record ReportTable(string Title,IReadOnlyList<string> Columns,IReadOnlyList<IReadOnlyList<string>> Rows);

public static class ReportExporter
{
    public static void ExportExcel(string path,ReportTable report)
    {
        using var document=SpreadsheetDocument.Create(path,SpreadsheetDocumentType.Workbook);
        var workbookPart=document.AddWorkbookPart();workbookPart.Workbook=new Workbook();
        var worksheetPart=workbookPart.AddNewPart<WorksheetPart>();var sheetData=new SheetData();worksheetPart.Worksheet=new Worksheet(sheetData);
        var sheets=workbookPart.Workbook.AppendChild(new Sheets());sheets.Append(new Sheet{Id=workbookPart.GetIdOfPart(worksheetPart),SheetId=1,Name=SafeSheetName(report.Title)});
        sheetData.Append(Row(report.Columns));foreach(var values in report.Rows)sheetData.Append(Row(values));workbookPart.Workbook.Save();
    }

    public static void ExportPdf(string path,ReportTable report)
    {
        using var document=new PdfDocument();document.Info.Title=report.Title;var titleFont=new XFont("Arial",14,XFontStyle.Bold);var font=new XFont("Arial",8,XFontStyle.Regular);var bold=new XFont("Arial",8,XFontStyle.Bold);
        var offset=0;do
        {
            var page=document.AddPage();page.Size=PdfSharpCore.PageSize.A4;using var graphics=XGraphics.FromPdfPage(page);double y=35;
            graphics.DrawString(report.Title,titleFont,XBrushes.Black,new XPoint(35,y));y+=24;DrawRow(report.Columns,bold);
            foreach(var row in report.Rows.Skip(offset).Take(48)){DrawRow(row,font);offset++;}
            void DrawRow(IReadOnlyList<string> values,XFont rowFont){var text=string.Join(" | ",values.Select(value=>value.Replace("\r"," ").Replace("\n"," ")));graphics.DrawString(text,rowFont,XBrushes.Black,new XRect(35,y,page.Width-70,14),XStringFormats.TopLeft);y+=14;}
        }while(offset<report.Rows.Count);
        document.Save(path);
    }

    static Row Row(IEnumerable<string> values){var row=new Row();foreach(var value in values)row.Append(new Cell{DataType=CellValues.InlineString,InlineString=new InlineString(new Text(value??string.Empty){Space=SpaceProcessingModeValues.Preserve})});return row;}
    static string SafeSheetName(string value){var cleaned=new string(value.Where(c=>!"[]:*?/\\".Contains(c)).Take(31).ToArray());return string.IsNullOrWhiteSpace(cleaned)?"Rapor":cleaned;}
}
