import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../utils/api";
import "./PsdModelLinksPanel.css";

const BOYS = [
  ["KUCUK_BOY", "Küçük Boy"],
  ["BUYUK_BOY", "Büyük Boy"],
  ["OZEL_BOY", "Özel Boy"],
];
const AREAS = [
  ["FRONT", "Ön"], ["BACK", "Arka"], ["NECK", "Ense"],
  ["NECK_LABEL", "Ense Etiket"], ["LEFT_SLEEVE", "Sol Kol"],
  ["RIGHT_SLEEVE", "Sağ Kol"], ["LEFT_LEG", "Sol Paça"],
  ["RIGHT_LEG", "Sağ Paça"], ["POCKET", "Cep"],
  ["COLLAR", "Yaka"], ["FRONT_HEM", "Ön Etek"],
  ["BACK_HEM", "Arka Etek"], ["HOOD", "Kapüşon"],
  ["SIDE_PANEL", "Yan Panel"], ["STRIP", "Şerit"], ["OTHER", "Diğer"],
];
const valueOf = (row, ...names) => names.map((name) => row?.[name]).find((value) => value != null && String(value).trim()) || "";
const unwrap = (response) => response?.data ?? response;
const isPsd = (row) => /\.(psd|psb)$/i.test(String(valueOf(row, "file_name", "fileName"))) ||
  ["PSD", "PSB"].includes(String(valueOf(row, "extension")).toUpperCase());
const makeRow = (id, modelId) => ({ id, modelId, boyCode: "", printAreaCode: "", boyLabel: "" });

/** Model detayındaki PSD bağlantıları; fiziksel dosyayı File Hub'da tek tutar. */
export default function PsdModelLinksPanel({ model, allModels = [], activeMainCompany }) {
  const slug = String(activeMainCompany?.slug || activeMainCompany?.id || "");
  const idCounter = useRef(1);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [fileId, setFileId] = useState("");
  const [rows, setRows] = useState([makeRow(0, model?.id || "")]);
  const [related, setRelated] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const models = useMemo(() => {
    const unique = new Map();
    for (const item of [model, ...allModels]) {
      if (item?.id && !unique.has(String(item.id))) unique.set(String(item.id), item);
    }
    return [...unique.values()].sort((a, b) =>
      String(a.modelName || a.modelCode || "").localeCompare(String(b.modelName || b.modelCode || ""), "tr"));
  }, [model, allModels]);

  const loadRelated = useCallback(async () => {
    if (!model?.id || !slug) return;
    try {
      const response = await apiGet("/file-hub/entity-files", { mainCompanySlug: slug, entityType: "MODEL", entityId: model.id });
      const links = unwrap(response);
      setRelated((Array.isArray(links) ? links : []).filter((item) =>
        item.relation_type === "OUTGOING_DESIGN" && isPsd(item)));
    } catch (cause) { setError(cause?.message || "PSD bağlantıları okunamadı."); }
  }, [model?.id, slug]);

  useEffect(() => { void loadRelated(); }, [loadRelated]);

  const searchPsd = async () => {
    if (busy || query.trim().length < 2) {
      setError("En az iki karakterle PSD dosyasını ara.");
      return;
    }
    setBusy("search"); setError(""); setMessage("");
    try {
      const response = await apiGet("/file-hub/files", { mainCompanySlug: slug, q: query.trim(), take: 100 });
      const items = unwrap(response);
      const list = (Array.isArray(items) ? items : []).filter((item) =>
        isPsd(item) && String(item.status || "").toUpperCase() === "AVAILABLE");
      setCandidates(list);
      setFileId(list.length === 1 ? String(list[0].id) : "");
      if (!list.length) setMessage("Eşleşen PSD/PSB bulunamadı. Önce mevcut Drive kaynağının File Hub indeksini kontrol edin.");
    } catch (cause) { setError(cause?.message || "PSD araması başarısız."); }
    finally { setBusy(""); }
  };

  const changeRow = (id, key, value) => setRows((items) =>
    items.map((item) => item.id === id ? { ...item, [key]: value } : item));

  const save = async () => {
    if (busy || !fileId) { setError("Önce mevcut Drive'dan bir PSD seç."); return; }
    if (rows.some((row) => !row.modelId || !row.boyCode || !row.printAreaCode ||
      (row.boyCode === "OZEL_BOY" && !row.boyLabel.trim()))) {
      setError("Her satırda model, boy ve baskı bölgesi seç; özel boy açıklaması zorunludur.");
      return;
    }
    setBusy("save"); setError(""); setMessage("");
    try {
      const response = await apiPost("/file-hub/files/" + encodeURIComponent(fileId) + "/desen-model-links", {
        mainCompanySlug: slug,
        links: rows.map(({ modelId, boyCode, printAreaCode, boyLabel }) => ({ modelId, boyCode, printAreaCode, boyLabel })),
      });
      const result = unwrap(response);
      await loadRelated();
      setMessage((result?.modelCount || 0) + " modele " + (result?.placementCount || 0) +
        " boy/bölge bağlantısı kaydedildi. PSD Drive'da tek dosya olarak korundu.");
    } catch (cause) { setError(cause?.message || "PSD bağlantıları kaydedilemedi."); }
    finally { setBusy(""); }
  };

  return <section className="dsg-psd-link-panel" aria-label="Giden PSD model ve boy bağlantıları">
    <h3>Giden PSD · Model / BOY / Baskı Bölgesi</h3>
    <p>Desenci bir PSD'yi birden fazla modele, aynı modelin küçük ve büyük boyuna bağlayabilir. Drive'daki dosya taşınmaz veya çoğaltılmaz.</p>
    <div className="dsg-psd-find">
      <input type="search" placeholder="Drive'da PSD dosya adını ara" aria-label="PSD dosya adı" value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchPsd(); } }} />
      <button type="button" disabled={Boolean(busy)} onClick={searchPsd}>{busy === "search" ? "Aranıyor…" : "PSD Ara"}</button>
    </div>
    {candidates.length ? <label>Drive'daki kaynak dosya
      <select value={fileId} onChange={(event) => setFileId(event.target.value)}>
        <option value="">PSD seç</option>
        {candidates.map((file) => <option key={file.id} value={file.id}>
          {String(valueOf(file, "file_name", "fileName"))} · {String(valueOf(file, "relative_path", "relativePath"))}
        </option>)}
      </select>
    </label> : null}
    {fileId ? <div className="dsg-psd-targets">
      <strong>PSD içindeki model ve boylar</strong>
      {rows.map((row) => <div key={row.id} className="dsg-psd-target">
        <select aria-label="Bağlanacak model" value={row.modelId} onChange={(event) => changeRow(row.id, "modelId", event.target.value)}>
          <option value="">Model seç</option>
          {models.map((item) => <option key={item.id} value={item.id}>
            {item.modelName || item.modelCode || item.id}{item.companyName ? " · " + item.companyName : ""}
          </option>)}
        </select>
        <select aria-label="Boy" value={row.boyCode} onChange={(event) => changeRow(row.id, "boyCode", event.target.value)}>
          <option value="">Boy seç</option>{BOYS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select aria-label="Baskı bölgesi" value={row.printAreaCode} onChange={(event) => changeRow(row.id, "printAreaCode", event.target.value)}>
          <option value="">Bölge seç</option>{AREAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {row.boyCode === "OZEL_BOY" ? <input aria-label="Özel boy açıklaması" placeholder="Özel boy / ölçü" value={row.boyLabel}
          onChange={(event) => changeRow(row.id, "boyLabel", event.target.value)} /> : null}
        <button type="button" disabled={Boolean(busy) || rows.length === 1} onClick={() => setRows((items) => items.filter((item) => item.id !== row.id))}>Kaldır</button>
      </div>)}
      <div className="dsg-psd-actions">
        <button type="button" disabled={Boolean(busy) || rows.length >= 30} onClick={() =>
          setRows((items) => [...items, makeRow(idCounter.current++, model.id)])}>+ Boy / Model Ekle</button>
        <button type="button" disabled={Boolean(busy)} onClick={save}>{busy === "save" ? "Kaydediliyor…" : "Bağlantıları Kaydet"}</button>
      </div>
    </div> : null}
    {error ? <p role="alert" className="dsg-psd-error">{error}</p> : null}
    {message ? <p role="status" className="dsg-psd-message">{message}</p> : null}
    {related.length ? <div className="dsg-psd-existing">
      <strong>Bu modelin bağlı giden PSD dosyaları</strong>
      {related.map((file) => <div key={file.id + String(file.relation_type)}>
        <span>{valueOf(file, "file_name", "fileName")}</span>
        <small>{(file.relationMetadata?.placements || []).map((part) => {
          const boy = BOYS.find(([code]) => code === part.boyCode)?.[1] || part.boyCode;
          const area = AREAS.find(([code]) => code === part.printAreaCode)?.[1] || part.printAreaCode;
          return boy + (part.boyLabel ? " (" + part.boyLabel + ")" : "") + " · " + area;
        }).join(" | ") || "Boy ve bölge henüz tanımlanmadı"}</small>
      </div>)}
    </div> : null}
  </section>;
}
