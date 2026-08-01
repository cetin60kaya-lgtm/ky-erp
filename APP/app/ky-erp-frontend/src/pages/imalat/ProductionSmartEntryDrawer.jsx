import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Eraser,
  Save,
  ScanText,
  X,
} from "lucide-react";
import {
  createProductionCenterEntries,
  getProductionCenterDictionaries,
} from "../../services/productionCenterApi";
import {
  operatorForMachine,
  parseProductionEntries,
  validateProductionRows,
} from "./smart/productionEntryParser";

const today = () => new Date().toISOString().slice(0, 10);

function machineId(machine) {
  return String(machine?.id || machine?.machineNo || machine?.no || "");
}

function machineName(machine) {
  return (
    machine?.machineName ||
    machine?.makineAdi ||
    machine?.ad ||
    machine?.machineNo ||
    ""
  );
}

function rowTone(status) {
  if (status === "ready") return "ready";
  if (status === "review") return "review";
  if (status === "context") return "context";
  return "error";
}

export default function ProductionSmartEntryDrawer({
  open,
  activeMainCompany,
  onClose,
  onSaved,
}) {
  const storageKey = `kyerp-production-center-smart-${
    activeMainCompany?.slug || activeMainCompany?.id || "default"
  }`;
  const [dictionaries, setDictionaries] = useState({
    models: [],
    machines: [],
    operators: [],
  });
  const [defaults, setDefaults] = useState({
    date: today(),
    shift: "Gündüz",
    machineId: "",
    machineName: "",
    operatorName: "",
  });
  const [text, setText] = useState(
    () => localStorage.getItem(storageKey) || "",
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await getProductionCenterDictionaries(activeMainCompany);
      const next = {
        models: Array.isArray(result?.models)
          ? result.models.filter((model) => !model.isVirtual)
          : [],
        machines: Array.isArray(result?.machines) ? result.machines : [],
        operators: Array.isArray(result?.operators) ? result.operators : [],
      };
      setDictionaries(next);
      const firstMachine = next.machines[0];
      if (firstMachine) {
        setDefaults((current) => ({
          ...current,
          machineId: current.machineId || machineId(firstMachine),
          machineName: current.machineName || machineName(firstMachine),
          operatorName:
            current.operatorName ||
            operatorForMachine(firstMachine, current.shift),
        }));
      }
      setMessage(
        `${next.models.length} model ve ${next.machines.length} aktif makine seri giriş için hazır.`,
      );
    } catch (error) {
      setMessage(error?.message || "Üretim sözlükleri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, open]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (text) localStorage.setItem(storageKey, text);
    else localStorage.removeItem(storageKey);
  }, [storageKey, text]);

  const visibleRows = useMemo(
    () =>
      issuesOnly
        ? rows.filter((row) => !["ready", "context"].includes(row.status))
        : rows,
    [issuesOnly, rows],
  );

  const totals = useMemo(() => {
    const activeRows = rows.filter((row) => row.status !== "context");
    return {
      rowCount: activeRows.length,
      readyCount: activeRows.filter((row) => row.status === "ready").length,
      issueCount: activeRows.filter((row) => row.status !== "ready").length,
      quantity: activeRows.reduce(
        (sum, row) => sum + Number(row.quantity || 0),
        0,
      ),
    };
  }, [rows]);

  function updateMachine(nextMachineId) {
    const machine = dictionaries.machines.find(
      (item) => machineId(item) === String(nextMachineId),
    );
    setDefaults((current) => ({
      ...current,
      machineId: nextMachineId,
      machineName: machineName(machine),
      operatorName: operatorForMachine(machine, current.shift),
    }));
  }

  function updateShift(shift) {
    const machine = dictionaries.machines.find(
      (item) => machineId(item) === String(defaults.machineId),
    );
    setDefaults((current) => ({
      ...current,
      shift,
      operatorName: operatorForMachine(machine, shift),
    }));
  }

  function parse() {
    const parsed = parseProductionEntries(text, dictionaries, defaults);
    const checked = validateProductionRows(parsed);
    setRows(checked);
    setIssuesOnly(false);
    const activeRows = checked.filter((row) => row.status !== "context");
    const issueCount = activeRows.filter(
      (row) => row.status !== "ready",
    ).length;
    setMessage(
      issueCount
        ? `${activeRows.length} satır çözümlendi; ${issueCount} satır düzeltilmeli.`
        : `${activeRows.length} satır model kimliğiyle kayda hazır.`,
    );
  }

  function patchRow(id, patch) {
    setRows((current) =>
      validateProductionRows(
        current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      ),
    );
  }

  function selectModel(row, modelId) {
    const model = dictionaries.models.find(
      (item) => String(item.id || item.modelId) === String(modelId),
    );
    const regions = model?.printRegions || [];
    patchRow(row.id, {
      modelId,
      modelName: model?.modelName || model?.modelAdi || "",
      printRegion:
        row.printRegion ||
        (regions.length === 1 ? regions[0]?.regionName : ""),
      warnings: [],
    });
  }

  async function save() {
    const checked = validateProductionRows(rows);
    setRows(checked);
    const entries = checked.filter((row) => row.status === "ready");
    if (!entries.length) {
      setMessage("Kaydedilecek hazır satır bulunmuyor.");
      return;
    }
    if (!window.confirm(`${entries.length} üretim satırı kaydedilsin mi?`)) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await createProductionCenterEntries(activeMainCompany, {
        requestId: crypto.randomUUID(),
        entries: entries.map((entry) => {
          const model = dictionaries.models.find(
            (item) =>
              String(item.id || item.modelId) === String(entry.modelId),
          );
          return {
            ...entry,
            clientId: entry.id,
            dispatchNo:
              entry.dispatchNo || model?.defaultDispatchNo || "",
            orderNo: entry.orderNo || model?.defaultOrderNo || "",
          };
        }),
      });
      const successIds = new Set(
        (result?.success || []).map((item) => item.clientId),
      );
      const failures = new Map(
        (result?.failed || []).map((item) => [item.clientId, item.error]),
      );
      setRows((current) =>
        current
          .filter((row) => !successIds.has(row.id))
          .map((row) =>
            failures.has(row.id)
              ? {
                  ...row,
                  status: "error",
                  warnings: [failures.get(row.id)],
                }
              : row,
          ),
      );
      setMessage(
        `${successIds.size} satır kaydedildi; ${failures.size} satır düzeltme için kaldı.`,
      );
      if (!failures.size && successIds.size === entries.length) {
        setText("");
        localStorage.removeItem(storageKey);
      }
      await onSaved?.();
      await load();
    } catch (error) {
      setMessage(error?.message || "Seri üretim kaydı tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="pcc-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="pcc-drawer pcc-drawer-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Akıllı seri üretim girişi"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="pcc-drawer-header">
          <div>
            <h2>
              <ScanText size={20} /> Akıllı Seri Üretim Girişi
            </h2>
            <p>
              Satır sırası serbesttir. Kayıt yalnız tek merkez model kimliğine
              ve açık irsaliyeye bağlanır.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </header>

        <div className="pcc-drawer-body pcc-smart-body">
          <section className="pcc-form-card">
            <div className="pcc-form-grid four">
              <label>
                Tarih
                <input
                  type="date"
                  value={defaults.date}
                  onChange={(event) =>
                    setDefaults((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Vardiya
                <select
                  value={defaults.shift}
                  onChange={(event) => updateShift(event.target.value)}
                >
                  <option>Gündüz</option>
                  <option>Gece</option>
                </select>
              </label>
              <label>
                Makine
                <select
                  value={defaults.machineId}
                  onChange={(event) => updateMachine(event.target.value)}
                >
                  <option value="">Makine seçin</option>
                  {dictionaries.machines.map((machine) => (
                    <option key={machineId(machine)} value={machineId(machine)}>
                      {machine.machineNo || machine.no} - {machineName(machine)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kayıtlı makinacı
                <input value={defaults.operatorName} disabled />
              </label>
            </div>

            <textarea
              className="pcc-smart-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.ctrlKey && event.key === "Enter") {
                  event.preventDefault();
                  parse();
                }
              }}
              placeholder={
                "01-08 windy ön 2500 gündüz 1\nwindy arka 2400 gece 2\nmervod polo ön 1900 gündüz ali"
              }
            />

            <div className="pcc-action-row">
              <button
                type="button"
                className="primary"
                onClick={parse}
                disabled={loading}
              >
                <ScanText size={16} /> Çözümle ve Denetle
              </button>
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setRows([]);
                  setMessage("");
                }}
              >
                <Eraser size={16} /> Temizle
              </button>
              <button type="button" onClick={load} disabled={loading}>
                Sözlükleri Yenile
              </button>
            </div>
          </section>

          {message ? (
            <div className="pcc-notice" role="status">
              <CircleAlert size={17} /> {message}
            </div>
          ) : null}

          {rows.length ? (
            <>
              <section className="pcc-mini-summary">
                <div>
                  <span>Satır</span>
                  <strong>{totals.rowCount}</strong>
                </div>
                <div className="success">
                  <span>Hazır</span>
                  <strong>{totals.readyCount}</strong>
                </div>
                <div className={totals.issueCount ? "danger" : "success"}>
                  <span>Sorunlu</span>
                  <strong>{totals.issueCount}</strong>
                </div>
                <div>
                  <span>Brüt adet</span>
                  <strong>{totals.quantity.toLocaleString("tr-TR")}</strong>
                </div>
              </section>

              <section className="pcc-table-card">
                <header className="pcc-section-header">
                  <div>
                    <h3>Seri kayıt denetimi</h3>
                    <p>Sarı ve kırmızı satırlar düzeltilmeden kaydedilmez.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIssuesOnly((current) => !current)}
                  >
                    <CircleAlert size={15} />
                    {issuesOnly ? "Tüm satırlar" : "Sadece sorunlular"}
                  </button>
                </header>
                <div className="pcc-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Durum</th>
                        <th>Tarih</th>
                        <th>Model</th>
                        <th>Bölge</th>
                        <th>Adet</th>
                        <th>Makine</th>
                        <th>Vardiya</th>
                        <th>Makinacı</th>
                        <th>Uyarı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.id} className={`pcc-review-${rowTone(row.status)}`}>
                          <td>
                            <span className={`pcc-status ${rowTone(row.status)}`}>
                              {row.status === "ready"
                                ? "Hazır"
                                : row.status === "context"
                                  ? "Bağlam"
                                  : row.status === "review"
                                    ? "Kontrol"
                                    : "Hata"}
                            </span>
                          </td>
                          <td>
                            <input
                              type="date"
                              value={row.date || ""}
                              onChange={(event) =>
                                patchRow(row.id, { date: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={row.modelId || ""}
                              onChange={(event) =>
                                selectModel(row, event.target.value)
                              }
                            >
                              <option value="">Model seçin</option>
                              {dictionaries.models.map((model) => (
                                <option
                                  key={model.id || model.modelId}
                                  value={model.id || model.modelId}
                                >
                                  {model.modelName || model.modelAdi} · {model.companyName || "Firma yok"}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={row.printRegion || ""}
                              onChange={(event) =>
                                patchRow(row.id, {
                                  printRegion: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={row.quantity || ""}
                              onChange={(event) =>
                                patchRow(row.id, {
                                  quantity: Number(event.target.value || 0),
                                })
                              }
                            />
                          </td>
                          <td>{row.machineName || row.machineId || "-"}</td>
                          <td>{row.shift || "-"}</td>
                          <td>{row.operatorName || "-"}</td>
                          <td className="pcc-warning-cell">
                            {(row.warnings || []).join(" · ") || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <footer className="pcc-drawer-footer">
          <span>
            <CheckCircle2 size={16} /> Yalnız denetimden geçen satırlar
            kaydedilir.
          </span>
          <div>
            <button type="button" onClick={onClose}>
              Kapat
            </button>
            <button
              type="button"
              className="primary"
              onClick={save}
              disabled={saving || !totals.readyCount}
            >
              <Save size={16} />
              {saving ? "Kaydediliyor..." : `Hazırları Kaydet (${totals.readyCount})`}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
