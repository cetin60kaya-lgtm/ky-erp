export default function ErpDataTable({ columns = [], rows = [], selectedId, onSelect }) {
  return (
    <div className="table-wrap erp-data-table">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row?.id}
              className={String(selectedId) === String(row?.id) ? "erp-selected-row" : ""}
              onClick={() => onSelect?.(row)}
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {typeof column.render === "function" ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>Kayıt bulunamadı.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
