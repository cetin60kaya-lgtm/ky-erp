import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  finalizeEBelge,
  getEBelgeCompanySuggestions,
  getEBelgeDetail,
  getEBelgeFilePreview,
  getEBelgePool,
  openEBelgeBlob,
  reconcileAllEBelge,
  reconcileEBelge,
  resolveEBelgeIssue,
  updateEBelge,
  uploadEBelge,
} from "../../../services/eBelgeApi";
import EBelgeLineReview from "./EBelgeLineReview";
import "./eBelgeCenter.css";

const today = () => new Date().toISOString().slice(0, 10);
const sixtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 62);
  return d.toISOString().slice(0, 10);
};

const FILTERS = [
  ["ALL", "Tüm Belgeler"],
  ["INCOMING_INVOICE", "Gelen Fatura"],
  ["OUTGOING_INVOICE", "Giden Fatura"],
  ["INCOMING_DISPATCH", "Gelen İrsaliye"],
  ["OUTGOING_DISPATCH", "Giden İrsaliye"],
  ["MATCHING_WAIT", "Eşleşme Bekleyen"],
  ["ISSUE", "Kontrol Gereken"],
];

const money = (value, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";

const typeLabel = (value) => {
  const v = String(value || "").toUpperCase();
  if (v.includes("IRSALIYE")) return v.includes("GIDEN") ? "Giden İrsaliye" : "Gelen İrsaliye";
  if (v.includes("FATURA") || v.includes("ARSIV") || v.includes("IADE")) return v.includes("GIDEN") ? "Giden Fatura" : "Gelen Fatura";
  return value || "Belge";
};

const sourceLabel = (value) => ({
  XML_IMPORT: "XML",
  AI_SCAN: "PDF / Görsel",
  ISNET: "İşNet",
  ISNET_DIRECT: "İşNet",
  PARASUT: "Paraşüt",
  MANUAL: "Manuel",
}[String(value || "").toUpperCase()] || value || "-");

const statusLabel = (value) => ({
  INGESTED: "Yeni",
  REVIEW_REQUIRED: "Kontrol Bekliyor",
  READY_FOR_APPROVAL: "Onaya Hazır",
  APPROVED: "Onaylandı",
  POSTED: "Muhasebeleşti",
  REJECTED: "Reddedildi",
  ERROR: "Hata",
}[String(value || "").toUpperCase()] || value || "-");

const routingLabel = (line) => {
  const raw = line?.raw_metadata || {};
  const routing = String(raw.routingType || "EXPENSE").toUpperCase();
  if (routing === "BOYAHANE") return raw.lotRequired ? "Boyahane · LOT" : "Boyahane";
  if (routing === "STOCK") return "Stok";
  return `Gider · ${raw.expenseCategoryName || "Mal ve Hizmet Alımı"}`;
};

function StatCard({ label, value, hint }) {
  return <div className="eb-stat"><span>{label}</span><strong>{Number(value || 0).toLocaleString("tr-TR")}</strong><small>{hint}</small></div>;
}

function Empty({ title, text }) {
  return <div className="eb-empty"><FileText size={30} /><strong>{title}</strong><span>{text}</span></div>;
}

function UploadPanel({ onUploaded }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("success");

  const addFiles = (list) => {
    const next = Array.from(list || []).filter((file) => /\.(xml|pdf|jpe?g|png|webp|bmp|tiff?)$/i.test(file.name));
    setFiles((current) => [...current, ...next].slice(0, 20));
    setMessage("");
  };

  const send = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage("");
    setTone("success");
    try {
      const selectedCount = files.length;
      const result = await uploadEBelge(files);
      const failed = result?.errors?.length || 0;
      let matchWarning = "";
      try {
        await reconcileAllEBelge();
      } catch (matchError) {
        matchWarning = matchError?.message || "Otomatik eşleştirme tamamlanamadı.";
      }
      setFiles([]);
      if (failed || matchWarning) {
        setTone("warning");
        setMessage(`${result?.items?.length || selectedCount} dosya havuza alındı. ${failed ? `${failed} dosya kontrol istiyor. ` : ""}${matchWarning ? "Eşleştirme kontrolü gerekebilir." : ""}`.trim());
      } else {
        setMessage(`${result?.items?.length || selectedCount} dosya havuza alındı; belge türü, yönü ve fatura–irsaliye eşleşmesi otomatik kontrol edildi.`);
      }
      onUploaded?.();
    } catch (error) {
      setTone("error");
      setMessage(error?.message || "Belge yükleme tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="eb-upload-card">
    <div className="eb-section-title">
      <div>
        <strong>Belge Yükle</strong>
        <span>Dosyayı yükleyin; sistem Hakan Empirme tarafını, belge türünü ve gelen/giden yönünü kendisi belirlesin.</span>
      </div>
    </div>
    <div className="eb-overview-note">
      <CheckCircle2 size={18} />
      <div>
        <strong>Tek havuz, otomatik sınıflandırma</strong>
        <span>Fatura ve irsaliyeyi ayrı ayrı seçmeniz gerekmez. XML doğrudan okunur; PDF ve görseller analiz edilir. Net olmayan kayıt yalnızca kontrol bekleyen olarak bırakılır.</span>
      </div>
    </div>
    <button
      type="button"
      className="eb-drop"
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
    >
      <Upload size={28} />
      <strong>Dosyaları sürükle veya seç</strong>
      <span>XML · PDF · JPG · PNG · WEBP · BMP · TIFF — en fazla 20 dosya, dosya başına 20 MB</span>
    </button>
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
      hidden
      onChange={(event) => addFiles(event.target.files)}
    />
    {files.length > 0 && <div className="eb-file-queue">
      {files.map((file, index) => <div key={`${file.name}-${index}`}>
        <FileText size={16} />
        <span>{file.name}</span>
        <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
        <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={15} /></button>
      </div>)}
    </div>}
    <div className="eb-upload-footer">
      <span className={message ? `eb-inline-message ${tone}` : ""}>{message}</span>
      <button type="button" className="eb-primary" disabled={!files.length || busy} onClick={send}>
        {busy ? <LoaderCircle className="eb-spin" size={17} /> : <Upload size={17} />}
        {busy ? "Okunuyor ve eşleştiriliyor" : "Havuza Al ve Eşleştir"}
      </button>
    </div>
  </section>;
}

function DetailDrawer({ id, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companies, setCompanies] = useState([]);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      setDetail(await getEBelgeDetail(id));
    } catch (e) {
      setError(e?.message || "Belge detayı alınamadı.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (companyQuery.trim().length < 2) {
      setCompanies([]);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      getEBelgeCompanySuggestions(companyQuery).then(setCompanies).catch(() => setCompanies([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companyQuery]);

  const action = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e?.message || "İşlem tamamlanamadı.");
    } finally {
      setBusy("");
    }
  };

  const preview = async (file) => action(`file-${file.id}`, async () => openEBelgeBlob(await getEBelgeFilePreview(file.id)));

  if (!id) return null;

  return <div className="eb-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="eb-drawer">
      <header>
        <div><span>{detail ? typeLabel(detail.document_type) : "Belge"}</span><h2>{detail?.document_no || "Belge detayı"}</h2></div>
        <button type="button" onClick={onClose}><X /></button>
      </header>
      {error && <div className="eb-error"><AlertTriangle size={17} />{error}</div>}
      {!detail ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belge yükleniyor</div> : <div className="eb-drawer-body">
        <section className="eb-detail-grid">
          <div><span>Firma / Cari</span><strong>{detail.party_name || "Eşleşmedi"}</strong><small>{detail.party_tax_no || "VKN yok"}</small></div>
          <div><span>Tarih</span><strong>{dateText(detail.issue_date)}</strong><small>{sourceLabel(detail.source_type)}</small></div>
          <div><span>Toplam</span><strong>{money(detail.payable_total, detail.currency)}</strong><small>KDV {money(detail.tax_total, detail.currency)}</small></div>
          <div><span>Durum</span><strong>{statusLabel(detail.status)}</strong><small>{detail.direction === "OUTGOING" ? "Giden" : detail.direction === "INCOMING" ? "Gelen" : "Otomatik kontrol"}</small></div>
        </section>

        {!detail.party_company_id && <section className="eb-company-match">
          <strong>Cari Eşleştir</strong>
          <input value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="Firma adı veya VKN yazın" />
          {companies.length > 0 && <div>{companies.map((row) => <button key={row.id} type="button" onClick={() => action("company", () => updateEBelge(id, { partyCompanyId: row.id }))}><span>{row.name}</span><small>{row.tax_no || "VKN yok"}</small></button>)}</div>}
        </section>}

        <section>
          <div className="eb-section-title"><strong>Kalemler</strong><span>{detail.lines?.length || 0} satır</span></div>
          {detail.lines?.length ? <div className="eb-lines">
            <div className="eb-line head"><span>Ürün</span><span>Miktar</span><span>LOT</span><span>Yönlendirme</span><span>Eşleşme</span></div>
            {detail.lines.map((line) => <div className="eb-line" key={line.id}>
              <span><strong>{line.description || line.product_code || "Kalem"}</strong><small>{line.product_code || line.supplier_product_code || ""}</small><EBelgeLineReview documentId={id} line={line} onChanged={load} /></span>
              <span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}</span>
              <span>{line.raw_metadata?.lotNo || "-"}</span>
              <span><strong>{routingLabel(line)}</strong></span>
              <span className={`eb-chip ${String(line.match_status || "").toLowerCase()}`}>{line.product_id ? (line.match_status || "MATCHED") : String(line.raw_metadata?.routingType || "EXPENSE").toUpperCase() === "EXPENSE" ? "GİDER" : (line.match_status || "UNMATCHED")}</span>
            </div>)}
          </div> : <Empty title="Kalem bulunamadı" text="Belge kalemleri kontrol gerektiriyor." />}
        </section>

        <section>
          <div className="eb-section-title"><strong>Sorunlar / Kontroller</strong><span>{detail.issues?.filter((item) => !item.is_resolved).length || 0} açık</span></div>
          {detail.issues?.length ? <div className="eb-issues">{detail.issues.map((issue) => <div key={issue.id} className={issue.is_resolved ? "resolved" : ""}><AlertTriangle size={17} /><span><strong>{issue.issue_code}</strong><small>{issue.message}</small></span>{!issue.is_resolved && issue.severity !== "ERROR" && <button type="button" onClick={() => action(`issue-${issue.id}`, () => resolveEBelgeIssue(id, issue.id))}>Çözüldü</button>}</div>)}</div> : <div className="eb-good"><CheckCircle2 size={17} /> Açık sorun yok.</div>}
        </section>

        <section>
          <div className="eb-section-title"><strong>Fatura – İrsaliye Bağı</strong><span>{detail.relations?.length || 0}</span></div>
          {detail.relations?.length ? <div className="eb-relations">{detail.relations.map((row) => <div key={row.id}><Link2 size={16} /><span>{row.related_document_no || row.related_document_id}</span><small>{row.relation_type}</small></div>)}</div> : <span className="eb-muted">Otomatik eşleşme bulunmadı. Gerekirse aşağıdaki eşleştirme kontrolünü çalıştırın.</span>}
        </section>

        <section>
          <div className="eb-section-title"><strong>Dosyalar</strong><span>File Hub</span></div>
          <div className="eb-files">{detail.files?.map((file) => <button type="button" key={file.id} disabled={busy === `file-${file.id}`} onClick={() => preview(file)}><FileText size={17} /><span>{file.file_name}</span><small>{file.source_type} · {file.preview_status}</small></button>)}</div>
        </section>

        <section className="eb-drawer-actions">
          <button type="button" disabled={Boolean(busy)} onClick={() => action("match", () => reconcileEBelge(id))}>
            {busy === "match" ? <LoaderCircle className="eb-spin" size={17} /> : <Link2 size={17} />} Eşleştir / Yeniden Kontrol Et
          </button>
          <button type="button" className="eb-primary" disabled={Boolean(busy) || detail.status === "POSTED"} onClick={() => action("final", () => finalizeEBelge(id))}>
            {busy === "final" ? <LoaderCircle className="eb-spin" size={17} /> : <FileCheck2 size={17} />} Son Onay / Muhasebeleştir
          </button>
        </section>
      </div>}
    </aside>
  </div>;
}

export default function EBelgeCenterPage({ activeMainCompany }) {
  const [pool, setPool] = useState({ items: [], stats: {}, total: 0 });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [from, setFrom] = useState(sixtyDaysAgo());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const params = useMemo(() => ({ filter, q: query, from, to, page: 1, pageSize: 100 }), [filter, from, query, to]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await getEBelgePool(params);
      setPool(data || { items: [], stats: {}, total: 0 });
    } catch (e) {
      setError(e?.message || "Belge havuzu yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [params]);

  useEffect(() => { void load(); }, [load, activeMainCompany?.slug, activeMainCompany?.id]);

  const runMatching = async () => {
    if (matching) return;
    setMatching(true);
    setError("");
    setNotice("");
    try {
      await reconcileAllEBelge();
      setNotice("Açık belgeler yeniden kontrol edildi. Uygun fatura–irsaliye bağlantıları otomatik eşleştirildi; kararsız olanlar kontrol için havuzda bırakıldı.");
      await load();
    } catch (e) {
      setError(e?.message || "Eşleştirme kontrolü tamamlanamadı.");
    } finally {
      setMatching(false);
    }
  };

  const rows = pool.items || [];
  const companyName = activeMainCompany?.name || activeMainCompany?.title || activeMainCompany?.slug || "Hakan Empirme";

  return <section className="eb-page">
    <div className="eb-company-context"><span>Belge Sahibi</span><strong>{companyName}</strong></div>

    <div className="eb-hero">
      <div>
        <span className="eb-kicker">e-Belge · Manuel Çalışma</span>
        <h2>Belge Havuzu</h2>
        <p>Dosyayı bir kez yükleyin. Sistem belgenin fatura mı irsaliye mi olduğunu, gelen mi giden mi olduğunu ve hangi belgeyle eşleştiğini otomatik kontrol etsin.</p>
      </div>
      <div className="eb-hero-actions">
        <button type="button" onClick={load} disabled={busy}><RefreshCw size={17} /> Güncelle</button>
        <button type="button" className="eb-primary" onClick={runMatching} disabled={matching || busy}>{matching ? <LoaderCircle className="eb-spin" size={17} /> : <Link2 size={17} />} Eşleşmeleri Kontrol Et</button>
      </div>
    </div>

    {error && <div className="eb-error"><AlertTriangle size={18} />{error}</div>}
    {notice && <div className="eb-overview-note"><CheckCircle2 size={18} /><div><strong>Kontrol tamamlandı</strong><span>{notice}</span></div></div>}

    <UploadPanel onUploaded={load} />

    <div className="eb-stats">
      <StatCard label="Toplam Belge" value={pool.stats?.total} hint="Havuzdaki kayıt" />
      <StatCard label="Gelen Fatura" value={pool.stats?.incomingInvoices} hint="Tedarikçi faturası" />
      <StatCard label="Giden Fatura" value={pool.stats?.outgoingInvoices} hint="Satış faturası" />
      <StatCard label="İrsaliye" value={pool.stats?.dispatches} hint="Gelen + giden" />
      <StatCard label="Muhasebeleşti" value={pool.stats?.posted} hint="Son onayı tamamlanan" />
    </div>

    <section className="eb-pool">
      <div className="eb-section-title">
        <div><strong>Belge Havuzu</strong><span>Türler sekme değil, yalnız filtre olarak kullanılır.</span></div>
        <span>{pool.total || 0} kayıt</span>
      </div>
      <div className="eb-pool-toolbar">
        <div className="eb-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Belge no, firma veya VKN ara" /></div>
        <label>Göster<select value={filter} onChange={(event) => setFilter(event.target.value)}>{FILTERS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label>Başlangıç<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Bitiş<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>

      {busy && !rows.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belgeler yükleniyor</div> : rows.length ? <div className="eb-table">
        <div className="eb-tr eb-th"><span>Belge</span><span>Firma / Cari</span><span>Tarih</span><span>Kaynak</span><span>Toplam</span><span>Kontrol</span></div>
        {rows.map((row) => {
          const hasIssue = Number(row.issue_count || 0) > 0;
          const posted = String(row.status || "").toUpperCase() === "POSTED";
          return <button type="button" className="eb-tr" key={row.id} onClick={() => setSelectedId(row.id)}>
            <span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span>
            <span><strong>{row.party_name || "Cari eşleşmesi bekliyor"}</strong><small>{row.party_tax_no || ""}</small></span>
            <span>{dateText(row.issue_date)}</span>
            <span><small>{sourceLabel(row.source_type)}</small><em>{row.archive_status || "-"}</em></span>
            <span><strong>{money(row.payable_total, row.currency)}</strong><small>{row.currency || "TRY"}</small></span>
            <span className={`eb-chip ${hasIssue ? "review_required" : posted ? "posted" : "ready"}`}>{hasIssue ? `${row.issue_count} kontrol` : statusLabel(row.status)}</span>
          </button>;
        })}
      </div> : <Empty title="Bu filtrede belge yok" text="Dosya yükleyin veya tarih / filtre alanlarını değiştirin." />}
    </section>

    <DetailDrawer id={selectedId} onClose={() => setSelectedId("")} onChanged={load} />
  </section>;
}
