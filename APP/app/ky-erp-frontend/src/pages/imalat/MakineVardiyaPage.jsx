import { useEffect, useState } from "react";
import {
  deleteMakineVardiya,
  getMakineSilmeOzeti,
  getMakineVardiya,
  saveMakineVardiya,
  updateMakineVardiya,
} from "../../services/imalatApi";
import { Field, Status } from "./ImalatShared";

export default function MakineVardiyaPage({ activeMainCompany }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState({
    makineNo: "",
    makineAdi: "",
    vardiya: "Gündüz",
    makinaci: "",
    durum: "Aktif",
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getMakineVardiya(activeMainCompany);
        if (cancelled) return;
        setRows((Array.isArray(data) ? data : []).map(normalizeMachine));
      } catch (error) {
        setMessage(error?.message || "Makine listesi okunamadı.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeMainCompany?.slug, activeMainCompany?.id]);
  const save = async () => {
    try {
      const saved = selectedId
         ? await updateMakineVardiya(activeMainCompany, selectedId, draft)
        : await saveMakineVardiya(activeMainCompany, draft);
      const next = normalizeMachine(saved);
      setRows((prev) => [next, ...prev?.filter((row) => row?.id !== next.id)]);
      setMessage(
        selectedId
           ? "Makine kaydı güncellendi."
          : "Makine / vardiya kaydedildi.",
      );
      setSelectedId(next.id);
    } catch (error) {
      setMessage(error?.message || "Makine / vardiya kaydedilemedi.");
    }
  };

  const resetForm = () => {
    setSelectedId("");
    setDraft({
      makineNo: "",
      makineAdi: "",
      vardiya: "Gündüz",
      makinaci: "",
      durum: "Aktif",
    });
  };

  const remove = async () => {
    if (!selectedId) {
      setMessage("Silmek için listeden bir makine seçin.");
      return;
    }
    try {
      const summary = await getMakineSilmeOzeti(activeMainCompany, selectedId);
      const linkedCount = Number(summary.linkedProductionCount || 0);
      const note = linkedCount
         ? `Bu makineye bağlı ${linkedCount} üretim kaydı var. Makineyi silmek üretim kayıtlarını silmez.\n\n`
        : "";
      const confirmed = confirm(`${note}Makine silinsin mi`);
      if (!confirmed) return;
      await deleteMakineVardiya(activeMainCompany, selectedId);
      setRows((prev) => prev?.filter((row) => row?.id !== selectedId));
      setMessage("Makine kaydı silindi.");
      resetForm();
    } catch (error) {
      setMessage(error?.message || "Makine kaydı silinemedi.");
    }
  };

  return (
    <div className="iw-grid-2">
      <aside className="iw-card">
        <div className="iw-card-head">
          <h2>Makine Listesi</h2>
        </div>
        <div className="iw-card-body iw-list">
          {rows.length ? (
            rows.map((row) => (
              <button
                key={row?.id}
                type="button"
                className={row.id === selectedId ? "active" : ""}
                onClick={() => {
                  setSelectedId(row?.id);
                  setDraft(row);
                }}
              >
                <strong>{row?.makineNo}</strong>
                <span>
                  {row?.makineAdi || "-"} / {row?.vardiya}: {row?.makinaci || "-"}
                </span>
                <Status tone={row.durum === "Aktif" ? "green" : "blue"}>
                  {row?.durum}
                </Status>
              </button>
            ))
          ) : (
            <div className="iw-empty">Makine kaydı yok.</div>
          )}
        </div>
      </aside>
      <main className="iw-card">
        <div className="iw-card-head">
          <h2>Makine / Vardiya Makinacı Atama</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="iw-btn" onClick={resetForm}>
              Yeni
            </button>
            <button className="iw-btn primary" onClick={save}>
              {selectedId ? "Güncelle" : "Kaydet"}
            </button>
            <button className="iw-btn" onClick={remove} disabled={!selectedId}>
              Sil
            </button>
          </div>
        </div>
        <div className="iw-card-body">
          <div className="iw-form-grid">
            <Field label="Makine no">
              <input
                value={draft.makineNo}
                onChange={(e) =>
                  setDraft({ ...draft, makineNo: e.target.value })
                }
              />
            </Field>
            <Field label="Makine adı">
              <input
                value={draft.makineAdi}
                onChange={(e) =>
                  setDraft({ ...draft, makineAdi: e.target.value })
                }
              />
            </Field>
            <Field label="Vardiya">
              <select
                value={draft.vardiya}
                onChange={(e) =>
                  setDraft({ ...draft, vardiya: e.target.value })
                }
              >
                <option>Gündüz</option>
                <option>Gece</option>
              </select>
            </Field>
            <Field label="Makinacı">
              <input
                value={draft.makinaci}
                onChange={(e) =>
                  setDraft({ ...draft, makinaci: e.target.value })
                }
              />
            </Field>
            <Field label="Durum">
              <select
                value={draft.durum}
                onChange={(e) => setDraft({ ...draft, durum: e.target.value })}
              >
                <option>Aktif</option>
                <option>Pasif</option>
              </select>
            </Field>
          </div>
          <div className="iw-table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>Makine no</th>
                  <th>Makine adı</th>
                  <th>Vardiya</th>
                  <th>Makinacı</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row?.id}>
                    <td>{row?.makineNo}</td>
                    <td>{row?.makineAdi}</td>
                    <td>{row?.vardiya}</td>
                    <td>{row?.makinaci}</td>
                    <td>
                      <Status tone={row.durum === "Aktif" ? "green" : "blue"}>
                        {row?.durum}
                      </Status>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message ? <div className="iw-notice green">{message}</div> : null}
        </div>
      </main>
    </div>
  );
}

function normalizeMachine(row = {}) {
  return {
    id: row?.id,
    makineNo:
      row?.id ||
      row?.makineNo ||
      row?.makinaNo ||
      row?.makine ||
      row?.ad ||
      row?.name ||
      "",
    makineAdi:
      row?.ad || row?.name || row?.makineAdi || row?.makinaAdi || row?.makine || "",
    vardiya: row?.vardiya || row?.shift || "Gündüz",
    makinaci: row?.makinaci || row?.operator || "",
    durum: row?.durum || row?.status || "Aktif",
  };
}
