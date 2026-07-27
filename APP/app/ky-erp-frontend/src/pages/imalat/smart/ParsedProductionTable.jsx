import { Copy, Trash2 } from "lucide-react";
import { operatorForMachine, validateProductionRows } from "./productionEntryParser.js";

const statusLabel = {
  ready: "Hazır",
  review: "Kontrol",
  error: "Hatalı",
  context: "Bağlam",
};

function machineId(machine) {
  return String(machine?.id || machine?.machineNo || machine?.no || "");
}

export default function ParsedProductionTable({ rows, setRows, dictionaries }) {
  function edit(id, patch) {
    setRows((current) => validateProductionRows(current.map((row) => row.id === id ? { ...row, ...patch } : row)));
  }

  function updateMachine(row, value) {
    const machine = dictionaries.machines.find((item) => machineId(item) === String(value));
    edit(row.id, {
      machineId: value,
      machineName: machine?.machineName || machine?.makineAdi || machine?.ad || machine?.machineNo || "",
      operatorId: operatorForMachine(machine, row.shift),
      operatorName: operatorForMachine(machine, row.shift),
    });
  }

  function updateShift(row, shift) {
    const machine = dictionaries.machines.find((item) => machineId(item) === String(row.machineId));
    const operator = operatorForMachine(machine, shift);
    edit(row.id, { shift, ...(operator ? { operatorId: operator, operatorName: operator } : {}) });
  }

  function copy(row) {
    setRows((current) => validateProductionRows([
      ...current,
      { ...row, id: `${row.id}-copy-${Date.now()}` },
    ]));
  }

  return (
    <div className="iw-table-wrap smart-table">
      <table>
        <thead>
          <tr><th>#</th><th>Durum</th><th>Tarih</th><th>Model</th><th>Zemin</th><th>Baskı Bölgesi</th><th>Adet</th><th>Vardiya</th><th>Makine</th><th>Makinacı</th><th>Denetim sonucu</th><th>İşlem</th></tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} className={`smart-${row.status}`}>
              <td className="smart-row-number">{rowIndex + 1}</td>
              <td><span className={`iw-badge b-${row.status === "ready" ? "green" : row.status === "review" ? "yellow" : row.status === "error" ? "red" : "gray"}`}>{statusLabel[row.status] || row.status}</span></td>
              <td><input type="date" value={row.date || ""} onChange={(event) => edit(row.id, { date: event.target.value })} /></td>
              <td>
                <select value={row.modelId || ""} onChange={(event) => {
                  const model = dictionaries.models.find((item) => String(item.id) === event.target.value);
                  edit(row.id, { modelId: model?.id || "", modelName: model?.modelName || model?.modelAdi || model?.name || "" });
                }}>
                  <option value="">Model seçin</option>
                  {dictionaries.models.map((model) => <option key={model.id} value={model.id}>{model.modelName || model.modelAdi || model.name}</option>)}
                </select>
              </td>
              <td><input value={row.ground || ""} onChange={(event) => edit(row.id, { ground: event.target.value })} /></td>
              <td><input value={row.printRegion || ""} onChange={(event) => edit(row.id, { printRegion: event.target.value })} /></td>
              <td><input type="number" min="1" value={row.quantity || ""} onChange={(event) => edit(row.id, { quantity: Number(event.target.value) })} /></td>
              <td><select value={row.shift || ""} onChange={(event) => updateShift(row, event.target.value)}><option value="">Seçin</option><option>Gündüz</option><option>Gece</option></select></td>
              <td>
                <select value={row.machineId || ""} onChange={(event) => updateMachine(row, event.target.value)}>
                  <option value="">Makine seçin</option>
                  {dictionaries.machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.no} - {machine.machineName || machine.makineAdi || machine.ad}</option>)}
                </select>
              </td>
              <td><input list="smart-operator-list" value={row.operatorName || ""} onChange={(event) => edit(row.id, { operatorId: event.target.value, operatorName: event.target.value })} /></td>
              <td><div className="smart-validation-cell">{row.warnings?.length ? row.warnings.map((warning) => <span key={warning}>{warning}</span>) : <strong>Kontroller geçti</strong>}</div></td>
              <td><div className="row-actions"><button type="button" title="Satırı kopyala" onClick={() => copy(row)}><Copy size={14} /></button><button type="button" title="Satırı kaldır" onClick={() => setRows((current) => validateProductionRows(current.filter((item) => item.id !== row.id)))}><Trash2 size={14} /></button></div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="smart-operator-list">{dictionaries.operators.map((operator) => <option key={operator.id || operator.name} value={operator.name || operator.ad || operator.fullName} />)}</datalist>
    </div>
  );
}
