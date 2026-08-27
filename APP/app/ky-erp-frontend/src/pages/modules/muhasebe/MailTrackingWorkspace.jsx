import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Mail, RefreshCcw, Search, X } from "lucide-react";
import { apiGet, apiPatch } from "../../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "./mailTrackingWorkspace.css";

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};
const money = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};

const STATUS_LABELS = {
  EKSTRE_ISTENECEK: "Ekstre istenecek",
  GONDERILDI: "Mail gönderildi",
  EKSTRE_GELDI: "Ekstre geldi",
  KARSILASTIRILDI: "Karşılaştırıldı",
  FARK_VAR: "Fark var",
  TAMAMLANDI: "Tamamlandı",
  MAIL_EKSIK: "Mail adresi eksik",
};

function statusLabel(value) {
  return STATUS_LABELS[value] || value || "Ekstre istenecek";
}

function statusTone(value) {
  if (["TAMAMLANDI", "KARSILASTIRILDI"].includes(value)) return "success";
  if (["FARK_VAR", "MAIL_EKSIK"].includes(value)) return "danger";
  if (["GONDERILDI", "EKSTRE_GELDI"].includes(value)) return "ready";
  return "warning";
}

function defaultDraft(row, template) {
  const subject = template?.subject || template?.konu || `Cari ekstre talebi - ${row.firma}`;
  const body =
    template?.body ||
    template?.govde ||
    `Merhaba,\n\nCari hesap mutabakatımız için güncel ekstrenizi paylaşmanızı rica ederiz.\n\nFirma: ${row.firma}\nSistemimizde görünen bakiye: ${money(row.bakiye)}\n\nTeşekkür ederiz.`;
  return { subject, body };
}

export default function MailTrackingWorkspace({ activeMainCompany, refreshKey }) {
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const [templates, setTemplates] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
    }),
    [activeMainCompany?.id, activeMainCompany?.slug],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const tenant = params.mainCompanySlug || params.mainCompanyId || "main";
      const result = await loadModuleData({
        scope: `muhasebe:${tenant}:mail-ekstre`,
        sources: {
          tracking: { critical: true, load: () => apiGet("/muhasebe/mail-ekstre", { ...params, _ts: Date.now() }) },
          templates: { fallback: [], load: () => apiGet("/muhasebe/mail/templates", { ...params, _ts: Date.now() }) },
        },
      });
      if (result.states.templates.status !== "error") {
        const templateData = unwrap(result.data.templates);
        setTemplates(Array.isArray(templateData) ? templateData : []);
      }
      setState((current) => ({
        loading: false,
        error: moduleLoadMessage(result, "Ekstre ve mail ana listesi alınamadı; son başarılı liste korunuyor.", "Mail şablonları yenilenemedi; ekstre listesi kullanılabilir."),
        data: result.states.tracking.status === "error" ? current.data : unwrap(result.data.tracking),
      }));
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Ekstre ve mail listesi alınamadı.",
        data: {},
      });
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rows = useMemo(() => {
    const source = Array.isArray(state.data?.liste) ? state.data.liste : [];
    const term = query.trim().toLocaleLowerCase("tr-TR");
    if (!term) return source;
    return source.filter((row) =>
      `${row.firma || ""} ${row.email || ""} ${statusLabel(row.status)}`
        .toLocaleLowerCase("tr-TR")
        .includes(term),
    );
  }, [query, state.data]);

  const openDraft = (row) => {
    const template = templates.find((item) =>
      /ekstre|statement/i.test(`${item.name || item.ad || ""} ${item.type || item.tur || ""}`),
    );
    setSelected(row);
    setDraft(defaultDraft(row, template));
    setNotice("");
  };

  const patchStatus = async (row, patch) => {
    setSaving(true);
    setNotice("");
    try {
      await apiPatch(`/muhasebe/mail-ekstre/${encodeURIComponent(row.companyId)}`, {
        ...params,
        email: row.email || "",
        ...patch,
      });
      setNotice(`${row.firma} takip durumu güncellendi.`);
      await load();
      if (selected?.companyId === row.companyId) {
        setSelected((current) => ({ ...current, ...patch }));
      }
    } catch (error) {
      setNotice(error?.message || "Takip durumu güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const copyDraft = async () => {
    const text = `${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Mail taslağı panoya kopyalandı. Gönderim yapılmadı.");
    } catch {
      setNotice("Taslak kopyalanamadı; metni elle seçebilirsiniz.");
    }
  };

  if (state.loading) {
    return <div className="accounting-list-skeleton">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>;
  }

  if (state.error) {
    return (
      <section className="accounting-controlled-state">
        <strong>Liste yüklenemedi.</strong>
        <span>{state.error}</span>
        <button type="button" onClick={load}>Tekrar dene</button>
      </section>
    );
  }

  return (
    <div className="mtw-root">
      <header className="mtw-toolbar">
        <label>
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, mail veya durum ara" />
        </label>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>
        <span>{rows.length} firma</span>
      </header>

      {notice ? <div className="mtw-notice" role="status">{notice}</div> : null}

      <section className="mtw-summary">
        <div><span>Ekstre istenecek</span><strong>{Number(state.data?.gonderilecek || 0)}</strong></div>
        <div><span>Gönderildi</span><strong>{Number(state.data?.gonderildi || 0)}</strong></div>
        <div><span>Ekstre geldi</span><strong>{Number(state.data?.ekstedeVar || 0)}</strong></div>
        <div className={Number(state.data?.aliciEksik || 0) > 0 ? "attention" : ""}>
          <span>Mail eksik</span><strong>{Number(state.data?.aliciEksik || 0)}</strong>
        </div>
      </section>

      <section className="mtw-table-card">
        <div className="mtw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Firma</th>
                <th>Mail</th>
                <th>Bakiye</th>
                <th>Son ekstre</th>
                <th>Son istek</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.companyId}>
                  <td><strong>{row.firma || "-"}</strong></td>
                  <td>{row.email || "Mail adresi eksik"}</td>
                  <td><strong>{money(row.bakiye)}</strong></td>
                  <td>{dateText(row.sonEkstre || row.lastStatementAt)}</td>
                  <td>{dateText(row.sonIstek || row.lastRequestAt)}</td>
                  <td><span className={`mtw-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                  <td>
                    <div className="mtw-actions">
                      <button type="button" disabled={!row.email} onClick={() => openDraft(row)}>
                        <Mail size={15} /> Ekstre iste
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => patchStatus(row, { status: "EKSTRE_GELDI", lastStatementAt: new Date().toISOString() })}
                      >
                        <Check size={15} /> Ekstre geldi
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan="7"><div className="mtw-empty">Takip edilecek firma bulunamadı.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="mtw-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="mtw-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{selected.firma}</h2>
                <p>{selected.email} · Gönderim öncesi mail önizlemesi</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="mtw-drawer-body">
              <section className="mtw-company-info">
                <div><span>Bakiye</span><strong>{money(selected.bakiye)}</strong></div>
                <div><span>Son ekstre</span><strong>{dateText(selected.sonEkstre || selected.lastStatementAt)}</strong></div>
                <div><span>Takip durumu</span><strong>{statusLabel(selected.status)}</strong></div>
              </section>
              <label className="mtw-field">
                Konu
                <input value={draft.subject} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} />
              </label>
              <label className="mtw-field">
                Mesaj
                <textarea rows="16" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <div className="mtw-warning">
                Bu ekran maili otomatik göndermiyor. Taslak kopyalanır; gerçek gönderimden sonra “Gönderildi” kaydı verilir.
              </div>
            </div>
            <footer>
              <button type="button" onClick={copyDraft}><Clipboard size={16} /> Taslağı kopyala</button>
              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={() => patchStatus(selected, {
                  status: "GONDERILDI",
                  lastRequestAt: new Date().toISOString(),
                  subject: draft.subject,
                  body: draft.body,
                })}
              >
                <Check size={16} /> Gönderildi işaretle
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
