import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFetch, apiGet } from "../../../utils/api";

const today = new Date().toISOString().slice(0, 10);
const week = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const KINDS = [
  { value: "despatch:incoming", label: "Gelen e-İrsaliye" },
  { value: "invoice:incoming", label: "Gelen e-Fatura" },
  { value: "despatch:outgoing", label: "Giden e-İrsaliye" },
  { value: "invoice:outgoing", label: "Giden e-Fatura" },
];
const unwrap = x => x?.data?.data ?? x?.data ?? x;
const isUuid = s => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s || "");
function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a);
  a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function IsnetLiveAcceptanceQA({ mainCompanySlug, apiConnected, onOpenSettings }) {
  const [category, setCategory] = useState("despatch:incoming");
  const [from, setFrom] = useState(week);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [queried, setQueried] = useState(false);
  const [lastQuery, setLastQuery] = useState(null);
  const params = useMemo(() => {
    const [kind, direction] = category.split(":");
    return { mainCompanySlug, kind, direction, from, to };
  }, [category, from, to, mainCompanySlug]);
  const reset = useCallback(() => {
    setRows([]); setSelected([]); setChecked({}); setNotice(null);
    setQueried(false); setLastQuery(null);
  }, []);
  const validity = Boolean(mainCompanySlug && from && to && from <= to &&
    (new Date(to).valueOf() - new Date(from).valueOf()) <= 31 * 86400000);

  const listRealDocuments = async () => {
    if (busy || !apiConnected || !validity) return;
    setBusy("list"); reset();
    try {
      const data = unwrap(await apiGet("/isnet/qa/documents", params, {
        timeoutMs: 26000, forceFresh: true,
      }));
      if (!Array.isArray(data?.rows) || data.readOnly !== true)
        throw Error("İşNet gerçek liste yanıtı doğrulanamadı.");
      setRows(data.rows);
      setLastQuery(params);
      setQueried(true);
      setNotice({ type: "info", text: data.rows.length
        ? "İşNet API'den gerçek liste alındı. En çok iki belge seçip XML ve PDF'lerini ayrı ayrı indirin."
        : "İşNet API listeyi doğruladı; seçilen tarihlerde belge yok." });
    } catch (error) {
      setNotice({ type: "error", text: error?.message || "İşNet listeleme başarısız." });
    } finally { setBusy(""); }
  };
  const toggle = ettn => {
    setSelected(old => old.includes(ettn) ? old.filter(id => id !== ettn)
      : old.length < 2 ? [...old, ettn] : old);
  };
  const download = async (row, format) => {
    if (busy || !lastQuery || !selected.includes(row.ettn) || !isUuid(row.ettn)) return;
    setBusy(row.ettn + ":" + format);
    setNotice(null);
    try {
      const blob = await apiFetch("/isnet/qa/download", {
        method: "GET",
        params: { ...lastQuery, ettn: row.ettn, format },
        responseType: "blob",
        timeoutMs: 40000,
      });
      if (!(blob instanceof Blob) || blob.size === 0)
        throw Error("İndirilen dosya boş veya doğrulanamadı.");
      const fileName = "ISNET-TEST-" + lastQuery.kind + "-" + row.ettn + "." + format;
      saveFile(blob, fileName);
      setChecked(old => ({
        ...old, [row.ettn]: { ...old[row.ettn], [format]: true },
      }));
      setNotice({ type: "success", text: format.toUpperCase() +
        " gerçek İşNet sağlayıcısından doğrulandı ve indirme başlatıldı. Dosyayı bilgisayarda ayrıca kontrol edin." });
    } catch (error) {
      setChecked(old => ({
        ...old, [row.ettn]: { ...old[row.ettn], [format]: false },
      }));
      setNotice({ type: "error", text: error?.message || format.toUpperCase() +
        " indirme testi başarısız. Başarılı sayılmadı." });
    } finally { setBusy(""); }
  };
  const both = selected.length > 0 && selected.every(id => checked[id]?.xml && checked[id]?.pdf);
  return <section className="isnet-qa" aria-label="Gerçek İşNet API belge indirme kabul testi">
    <header className="isnet-qa-title">
      <div><h4><ShieldCheck size={17}/> Gerçek İşNet belge kabul testi</h4>
        <p>Giriş → firma seçimi → gerçek liste → en fazla 2 irsaliye veya fatura → XML ve PDF. Yalnız okur; muhasebe kaydı, fatura kesimi veya resmî gönderim yapmaz.</p>
      </div>
      <span className="isnet-qa-readonly">SALT OKUNUR</span>
    </header>
    {!apiConnected ? <div className="isnet-qa-needed">
      <AlertTriangle size={18}/>
      <div><strong>İşNet API girişi ve firma seçimi gerekiyor.</strong>
        <p>API Bağlantısı bölümünde kullanıcı adı/şifreni güvenli formda gir, yetkili firmanı seçip kaydet. Şifreyi sohbete gönderme.</p>
        <button type="button" onClick={onOpenSettings}>Giriş ve Firma Seçimine Git</button>
      </div>
    </div> : <div className="isnet-qa-criteria">
      <label>Belge türü
        <select value={category} onChange={e => { setCategory(e.target.value); reset(); }} disabled={!!busy}>
          {KINDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label>Başlangıç
        <input type="date" value={from} max={today} onChange={e => { setFrom(e.target.value); reset(); }} disabled={!!busy}/>
      </label>
      <label>Bitiş
        <input type="date" value={to} max={today} onChange={e => { setTo(e.target.value); reset(); }} disabled={!!busy}/>
      </label>
      <button type="button" disabled={!validity || !!busy} onClick={() => void listRealDocuments()}>
        <RefreshCw size={15}/> {busy === "list" ? "İşNet sorgulanıyor..." : "Gerçek Belgeleri Listele"}
      </button>
    </div>}
    {!validity && apiConnected && <small>Geçerli bir tarih aralığı seçin (en fazla 31 gün).</small>}
    {queried && <div className="isnet-qa-results">
      <strong>Gerçek API ilk sayfa: {rows.length} belge (en çok 25)</strong>
      {rows.length > 0 && <p>Test için en fazla iki belge seç. XML ve PDF indirme butonları yalnız seçilen belgelerde açılır.</p>}
      <div className="isnet-qa-scroll"><table>
        <thead><tr><th>Seç</th><th>Belge no / Tarih</th><th>Firma</th><th>Durum</th><th>Gerçek dosya testi</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.ettn}>
          <td><input aria-label={(row.documentNo || row.ettn) + " seç"} type="checkbox"
            checked={selected.includes(row.ettn)}
            disabled={!!busy || (!selected.includes(row.ettn) && selected.length >= 2)}
            onChange={() => toggle(row.ettn)}/></td>
          <td><strong>{row.documentNo || "Belge numarası yok"}</strong><small>{row.issueDate}</small></td>
          <td>{row.companyName || "İşNet firma adı dönmedi"}</td>
          <td>{row.status || "—"}</td>
          <td className="isnet-qa-actions">
            <button type="button" disabled={!!busy || !selected.includes(row.ettn)}
              onClick={() => void download(row, "xml")}>
              {checked[row.ettn]?.xml ? <CheckCircle2 size={15}/> : <FileText size={15}/>} XML İndir
            </button>
            <button type="button" disabled={!!busy || !selected.includes(row.ettn)}
              onClick={() => void download(row, "pdf")}>
              {checked[row.ettn]?.pdf ? <CheckCircle2 size={15}/> : <Download size={15}/>} PDF İndir
            </button>
          </td>
        </tr>)}</tbody>
      </table></div>
      {rows.length === 0 && <p>Belge yoksa başka tarih aralığıyla yeniden deneyebilirsin.</p>}
      {both && <p className="isnet-qa-pass"><CheckCircle2 size={17}/> Seçilen belgelerin XML ve PDF yanıtları sunucuda doğrulandı; tarayıcı indirmeleri başlatıldı. Dosya içeriği ayrıca kullanıcı tarafından incelenmeli.</p>}
    </div>}
    {notice && <p className={"isnet-qa-message " + notice.type} role="status">{notice.text}</p>}
    <p className="isnet-qa-foot">Bu ekran belge kaydetmez, çoğaltmaz, muhasebeleştirmez veya başka firmaya aktaramaz. İşNet PDF bağlantısı gerçek PDF baytları vermiyorsa sonuç açıkça başarısızdır.</p>
  </section>;
}
