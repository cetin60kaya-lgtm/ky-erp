function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function exportRowsToExcelFile(fileName, sheetTitle, rows) {
  if (!rows || !rows.length) return;

  const headers = Object.keys(rows[0]);
  const headerHtml = headers.map((h) => `<th>${normalize(h)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers.map((h) => `<td>${normalize(row[h])}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${sheetTitle}</title>
      </head>
      <body>
        <table border="1">
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`;
  try {
    document.body.appendChild(link);
    link?.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
