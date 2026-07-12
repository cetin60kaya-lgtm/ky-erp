import { useEffect, useMemo, useRef, useState } from "react";
import {
  getFaturaKesimDetail,
  getFaturaKesimHavuz,
  getFirmaKartlari,
  linkFaturaKesimModel,
  softDeleteBelgeHavuzu,
  uploadFaturaKesimIsnetFiles,
  uploadFaturaKesimPdf,
} from "../../services/muhasebeApi";
import { getDesenHavuz } from "../../services/desenApi";
import { API_BASE } from "../../utils/api";
import { getModelImageSource } from "../../utils/modelImage";
import { ErpIcon } from "../../components/erp/IconMap";
import { formatMoney, formatNumber, Status } from "./_MuhasebeShared";
import "./BelgeIslemMerkezi.css";

const FILTERS = [
  ["", "Bekleyen"],
  ["Fatura Bekliyor", "Fatura Bekleyen"],
  ["Kısmi", "Kısmi"],
  ["Tam", "Tamamlanan"],
  ["Kontrol", "Kontrol"],
];

const NOTE = "TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function moneyInput(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number ? String(number) : "";
}

function assetUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https:\/\//i.test(url)) return url;
  if (/^(storage|uploads|model-previews|model-files)\//i.test(url)) {
    return `${API_BASE}/${url.replace(/^\/+/, "")}`;
  }
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusTone(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  if (text.includes("tam") || text.includes("işlendi") || text.includes("onay"))
    return "ok";
  if (
    text.includes("eksik") ||
    text.includes("bekliyor") ||
    text.includes("kontrol")
  )
    return "warn";
  if (text.includes("hata")) return "bad";
  return "blue";
}

function statusChipClass(value) {
  const text = String(value || "").toLocaleLowerCase("tr-TR");
  if (text.includes("tam") || text.includes("işlendi") || text.includes("onay"))
    return "green";
  if (
    text.includes("eksik") ||
    text.includes("bekliyor") ||
    text.includes("kontrol")
  )
    return "amber";
  if (text.includes("hata")) return "red";
  return "blue";
}

function baseInvoiceState() {
  return {
    invoiceNo: "",
    invoiceDate: todayIso(),
    lineId: "",
    billedQuantity: "",
    unitPrice: "",
    vatRate: "20",
    invoiceOfficerNote: "",
  };
}

function buildManualDetail(form) {
  const id = `manual-${Date.now()}`;
  const quantity = Number(form.quantity || 0);
  const unitPrice = 0;
  const vatRate = 20;
  const goodsTotal = quantity * unitPrice;
  const vatAmount = (goodsTotal * vatRate) / 100;
  const customerName =
    String(form.customerName || "").trim() || "Irsaliye sahibi girilmedi";
  const orderNo = String(form.orderNo || "").trim() || `MANUEL-${Date.now()}`;
  const modelName = String(form.modelName || "").trim();
  return {
    id,
    header: {
      belgeNo: orderNo,
      belgeTuru: "MANUEL",
      firma: customerName,
      tarih: form.date || todayIso(),
      scenario: "TEMELFATURA",
      ettn: "",
      irsaliyeNo: orderNo,
      faturaNo: "",
      plateNo: "",
      trailerPlateNo: "",
      driverName: "",
      driverTckn: "",
      durum: "Fatura Bekliyor",
    },
    lines: [
      {
        id: `${id}-line-1`,
        rowNo: 1,
        rawName: modelName,
        productName: modelName || "Model girilmedi",
        quantity,
        unit: "Adet",
        unitPrice,
        vatRate,
        vatAmount,
        lineTotal: goodsTotal,
        payableTotal: goodsTotal + vatAmount,
        isTestSample: false,
        status: unitPrice > 0 ? "Fatura Bekliyor" : "FIYAT_EKSIK",
        manufacturedQuantity: quantity,
        billedQuantity: 0,
        remainingQuantity: quantity,
      },
    ],
    summary: {
      dispatchQuantity: quantity,
      manufacturedQuantity: quantity,
      billedQuantity: 0,
      billableQuantity: quantity,
      goodsTotal,
      vatTotal: vatAmount,
      payableTotal: goodsTotal + vatAmount,
    },
    invoicePreparation: {
      lineId: `${id}-line-1`,
      productName: modelName || "Model girilmedi",
      quantity,
      unitPrice,
      vatRate,
      goodsTotal,
      vatAmount,
      payableTotal: goodsTotal + vatAmount,
      invoiceNote: NOTE,
      invoiceOfficerNote: `Siparis No: ${orderNo}`,
    },
    tracking: {
      mail: "BEKLIYOR",
      ekstre: "KONTROL_EDILMEDI",
      tasnif: "GEREKLI_DEGIL",
    },
    testSample: null,
    rawText: "",
    rawLines: [],
    files: [],
  };
}

export default function FaturaKesimYardimcisi({
  activeMainCompany,
  embedded = false,
}) {
  const [companyCards, setCompanyCards] = useState([]);
  const [serverDocs, setServerDocs] = useState([]);
  const [manualDocs, setManualDocs] = useState([]);
  const [manualDetails, setManualDetails] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingPool, setLoadingPool] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [invoice, setInvoice] = useState(baseInvoiceState);
  const [drawer, setDrawer] = useState("");
  const [toast, setToast] = useState("");
  const [processingIsnet, setProcessingIsnet] = useState(false);
  const [isnetDropActive, setIsnetDropActive] = useState(false);
  const [settings, setSettings] = useState({
    partialMode: true,
    autoMail: false,
    autoTasnif: false,
  });
  const toastTimerRef = useRef(0);
  const [manualForm, setManualForm] = useState({
    customerName: "",
    orderNo: "",
    date: todayIso(),
    modelName: "",
    quantity: "",
  });
  const [modelRows, setModelRows] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const uploadRef = useRef(null);
  const isnetUploadRef = useRef(null);

  const docs = useMemo(
    () => [...manualDocs, ...serverDocs],
    [manualDocs, serverDocs],
  );

  const showToast = (text) => {
    setToast(text);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const applyInvoicePrep = (payload) => {
    const prep = payload?.invoicePreparation || {};
    setInvoice((current) => ({
      ...baseInvoiceState(),
      invoiceNo: current?.invoiceNo,
      invoiceDate: current?.invoiceDate || todayIso(),
      lineId: prep.lineId || "",
      billedQuantity: prep.quantity ? String(prep.quantity) : "",
      unitPrice: moneyInput(prep.unitPrice),
      vatRate: prep.vatRate ? String(prep.vatRate) : "20",
      invoiceOfficerNote: prep.invoiceOfficerNote || "",
    }));
  };

  const loadPool = async (preferredId = "") => {
    setLoadingPool(true);
    try {
      const rows = await getFaturaKesimHavuz(activeMainCompany || {}, {
        status: filter,
      });
      const safeRows = Array.isArray(rows) ? rows : [];
      setServerDocs(safeRows);
      setSelectedId((current) => {
        const nextDocs = [...manualDocs, ...safeRows];
        const desired = String(preferredId || current || "");
        return nextDocs.some((item) => String(item?.id) === desired)
           ? desired
          : String(nextDocs[0].id || "");
      });
      setNotice("");
    } catch (error) {
      setNotice(error?.message || "Belge havuzu alınamadı.");
    } finally {
      setLoadingPool(false);
    }
  };

  useEffect(() => {
    loadPool();
  }, [activeMainCompany?.slug, activeMainCompany?.id, filter]);

  useEffect(() => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setCompanyCards([]);
      return;
    }
    getFirmaKartlari(activeMainCompany || {})
      .then((rows) => {
        const items = Array.isArray(rows) ? rows : [];
        setCompanyCards(items);
      })
      .catch(() => setCompanyCards([]));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setModelRows([]);
      return;
    }
    getDesenHavuz(activeMainCompany || {}, {
      hasVisual: "true",
      sortBy: "date",
      syncWatchFolder: "true",
    })
      .then((rows) => setModelRows(Array.isArray(rows) ? rows : []))
      .catch(() => setModelRows([]));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  const visibleDocs = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    return docs.filter((doc) => {
      if (filter) {
        const statusText = String(doc.durum || "").toLocaleLowerCase("tr-TR");
        if (!statusText.includes(filter.toLocaleLowerCase("tr-TR")))
          return false;
      }
      if (!keyword) return true;
      const haystack = [
        doc.belgeNo,
        doc.firma,
        doc.modelUrunOzeti,
        doc.tarih,
        doc.durum,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return haystack.includes(keyword);
    });
  }, [docs, filter, search]);

  useEffect(() => {
    if (!visibleDocs.length) {
      setSelectedId("");
      setDetail(null);
      return;
    }
    if (!visibleDocs.some((doc) => String(doc.id) === String(selectedId))) {
      setSelectedId(String(visibleDocs[0].id));
    }
  }, [visibleDocs, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setInvoice(baseInvoiceState());
      return;
    }
    const manualPayload = manualDetails[selectedId];
    if (manualPayload) {
      setDetail(manualPayload);
      applyInvoicePrep(manualPayload);
      return;
    }
    setLoadingDetail(true);
    getFaturaKesimDetail(activeMainCompany || {}, selectedId)
      .then((payload) => {
        setDetail(payload);
        applyInvoicePrep(payload);
        setNotice("");
      })
      .catch((error) => setNotice(error?.message || "Belge detayı alınamadı."))
      .finally(() => setLoadingDetail(false));
  }, [
    selectedId,
    activeMainCompany?.slug,
    activeMainCompany?.id,
    manualDetails,
  ]);

  const selectedLine = useMemo(() => {
    const lines = Array.isArray(detail?.lines) ? detail?.lines : [];
    return (
      lines.find((line) => String(line?.id) === String(invoice?.lineId)) ||
      lines.find((line) => !line?.isTestSample) ||
      lines[0] ||
      {}
    );
  }, [detail, invoice?.lineId]);

  const isManualRecord = Boolean(manualDetails[selectedId]);

  const calc = useMemo(() => {
    const qtySource =
      invoice?.billedQuantity !== "" && invoice?.billedQuantity != null
         ? invoice?.billedQuantity
        : (selectedLine.remainingQuantity ? selectedLine.quantity ?? 0);
    const qty = Number(qtySource);
    const unitPrice = Number(invoice?.unitPrice || selectedLine.unitPrice || 0);
    const vatRate = Number(invoice?.vatRate || selectedLine.vatRate || 0);
    const goodsTotal = qty * unitPrice;
    const vatAmount = (goodsTotal * vatRate) / 100;
    return {
      qty,
      unitPrice,
      vatRate,
      goodsTotal,
      vatAmount,
      payableTotal: goodsTotal + vatAmount,
    };
  }, [invoice, selectedLine]);

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      showToast(`${label} kopyalandı.`);
    } catch {
      setNotice("Kopyalama yapılamadı.");
    }
  };

  const uploadFile = async (event) => {
    const file = event?.target.files?.[0];
    if (!file) return;
    setNotice("Belge okunuyor...");
    try {
      const saved = await uploadFaturaKesimPdf(activeMainCompany || {}, file);
      await loadPool(String(saved?.id || ""));
      setNotice("Belge havuza alındı ve satırlar işlendi.");
    } catch (error) {
      setNotice(error?.message || "Belge okunamadı.");
    } finally {
      event.target.value = "";
    }
  };

  const addManualRecord = () => {
    const payload = buildManualDetail(manualForm);
    const line = payload?.lines[0] || {};
    const doc = {
      id: payload?.id,
      belgeNo: payload?.header.belgeNo,
      firma: payload?.header.firma,
      tarih: payload?.header.tarih,
      modelUrunOzeti: line?.productName || "-",
      toplamAdet: line?.quantity || 0,
      durum: payload?.header.durum,
      mailDurumu: payload?.tracking.mail,
      ekstreDurumu: payload?.tracking.ekstre,
      tasnifGerekliMi: false,
    };
    setManualDetails((current) => ({ ...current, [payload?.id]: payload }));
    setManualDocs((current) => [doc, ...current]);
    setSelectedId(payload?.id);
    setDrawer("");
    setManualForm({
      customerName: payload?.header.firma || suggestedCustomerName,
      orderNo: "",
      date: todayIso(),
      modelName: "",
      quantity: "",
    });
    setNotice(
      "İrsaliyesi gelmeyen model için taslak kayıt açıldı. Kayıt irsaliyenin ait olduğu müşteri adıyla açıldı.",
    );
  };

  const processIsnetFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) =>
      /\.pdf$/i.test(String(file?.name || "")),
    );
    if (!files.length) {
      setNotice("İşNet için en az bir PDF bırakılmalı.");
      return;
    }
    if (!detail?.id || isManualRecord) {
      setNotice("Önce havuzdan kalıcı bir müşteri irsaliyesi seçin.");
      return;
    }
    if (!selectedLine.id) {
      setNotice("İşlenecek model satırı seçilemedi.");
      return;
    }
    setProcessingIsnet(true);
    setNotice("İşNet dosyaları okunuyor ve ERP kaydı hazırlanıyor...");
    try {
      const next = await uploadFaturaKesimIsnetFiles(
        activeMainCompany || {},
        detail?.id,
        files,
        { lineId: selectedLine.id },
      );
      setDetail(next);
      applyInvoicePrep(next);
      await loadPool(detail?.id);
      const lastRecord = Array.isArray(next.invoiceHistory)
         ? next.invoiceHistory[0]
        : null;
      setNotice(
        lastRecord.invoiceNo
           ? `${lastRecord.invoiceNo} otomatik işlendi.`
          : "İşNet dosyaları işlendi.",
      );
    } catch (error) {
      setNotice(error?.message || "İşNet dosyaları işlenemedi.");
    } finally {
      setProcessingIsnet(false);
      if (isnetUploadRef.current) isnetUploadRef.current.value = "";
    }
  };

  const onIsnetInputChange = async (event) => {
    await processIsnetFiles(event?.target.files);
  };

  const onIsnetDrop = async (event) => {
    event?.preventDefault();
    setIsnetDropActive(false);
    await processIsnetFiles(event?.dataTransfer.files);
  };

  const riskItems = [
    [
      "Bu satır kesime uygun mu",
      selectedLine.remainingQuantity > 0 && calc.unitPrice > 0,
    ],
    ["Model bağlı mı", selectedLine.status !== "MODEL_BAGLANTISI_BEKLIYOR"],
    ["İmalat var mı", Number(selectedLine.manufacturedQuantity || 0) > 0],
    ["Fiyat var mı", calc.unitPrice > 0],
  ];

  const selectedDoc =
    visibleDocs.find((doc) => String(doc.id) === String(selectedId)) || null;
  const summary = detail?.summary || {};
  const header = detail?.header || {};
  const invoiceHistory = Array.isArray(detail?.invoiceHistory)
     ? detail?.invoiceHistory
    : [];
  const lastInvoiceRecord = invoiceHistory[0] || null;
  const normalizedSelectedLineName = String(
    selectedLine.modelAdi || selectedLine.productName || "",
  );
  const normalizedSelectedLineNameKey = normalizeSearchText(
    normalizedSelectedLineName,
  );
  const modelCandidates = useMemo(() => {
    const query = normalizeSearchText(modelSearch);
    const source = query
       modelRows.filter((row) =>
          normalizeSearchText([
            row?.modelName,
            row?.modelAdi,
            row?.firmName,
            row?.firmaAdi,
            row?.musteriFirma,
            row?.firmName,
            row?.originalFileName,
            ...(Array.isArray(row?.fileNames) ? row?.fileNames : []),
          ].join(" ")).includes(query),
        ? )
      : modelRows;
    if (!normalizedSelectedLineNameKey && !query) return source.slice(0, 12);
    return source
      .map((row) => {
        const name = normalizeSearchText(row?.modelName || row?.modelAdi || "");
        let score = 0;
        if (query && name.includes(query)) score += 4;
        if (name === normalizedSelectedLineNameKey) score += 5;
        if (name && normalizedSelectedLineNameKey.includes(name)) score += 3;
        if (name && name.includes(normalizedSelectedLineNameKey)) score += 2;
        return { ...row, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [modelRows, modelSearch, normalizedSelectedLineNameKey]);
  const selectedModel =
    modelCandidates.find((row) => String(row?.id) === String(selectedModelId)) ||
    modelCandidates.find((row) => Number(row?.score || 0) >= 5) ||
    null;
  const selectedModelImage =
    getModelImageSource(selectedModel) ||
    getModelImageSource(selectedLine) ||
    assetUrl(selectedLine.modelImageUrl);
  const availableCompanyCards = companyCards.filter((row) => {
    const type = String(row?.type || row?.firmaTipi || "").toLocaleUpperCase(
      "tr-TR",
    );
    return (
      !type || type === "MUSTERI" || type === "CUSTOMER" || type === "BOTH"
    );
  });
  const suggestedCustomerName =
    String(header.firma || "").trim() ||
    String(selectedDoc.firma || "").trim() ||
    String(manualDocs[0].firma || "").trim() ||
    String(manualForm.customerName || "").trim();

  const openManualDrawer = () => {
    setManualForm((current) => ({
      ...current,
      customerName:
        current?.customerName ||
        suggestedCustomerName ||
        String(availableCompanyCards[0].name || ""),
    }));
    setDrawer("manual");
  };

  const deleteSelected = async () => {
    if (!selectedId) return;
    if (manualDetails[selectedId]) {
      setManualDetails((current) => {
        const next = { ...current };
        delete next[selectedId];
        return next;
      });
      setManualDocs((current) =>
        current.filter((doc) => String(doc.id) !== String(selectedId)),
      );
      setSelectedId("");
      setDetail(null);
      setNotice("Elle kayit silindi.");
      return;
    }
    if (!window.confirm("Secili irsaliye pasife alinsin mi")) return;
    try {
      await softDeleteBelgeHavuzu(
        activeMainCompany || {},
        selectedId,
        "Belge islem merkezi silme",
      );
      await loadPool();
      setNotice("Belge pasife alindi.");
    } catch (error) {
      setNotice(error?.message || "Belge silinemedi.");
    }
  };

  const directLinkModel = async () => {
    if (!detail?.id || !selectedLine.id) {
      setNotice("Önce bağlanacak belge satırını seç.");
      return;
    }
    const visualModelName = String(
      selectedModel?.modelName ||
        selectedModel?.modelAdi ||
        selectedLine.productName ||
        "",
    ).trim();
    const productionModelName = String(
      selectedLine.productName || selectedLine.modelAdi || visualModelName,
    ).trim();
    if (!productionModelName) {
      setNotice("Bağlanacak model adı bulunamadı.");
      return;
    }
    setModelBusy(true);
    try {
      const next = await linkFaturaKesimModel(activeMainCompany || {}, detail?.id, {
        lineId: selectedLine.id,
        modelId:
          selectedLine.modelKaydiId ||
          selectedLine.modelId ||
          selectedModel?.modelRecordId ||
          selectedModel?.globalModelId ||
          "",
        modelAdi: visualModelName || productionModelName,
        visualModelName,
        productionModelName,
        lineProductName: selectedLine.productName || productionModelName,
        firmaAdi: header.firma || selectedDoc.firma || "",
        siparisNo: header.irsaliyeNo || header.belgeNo || "",
        quantity: selectedLine.quantity || selectedLine.remainingQuantity || 0,
        modelImageUrl:
          selectedModel?.desenImageThumb ||
          selectedModel?.imageUrl ||
          selectedModel?.thumbnailUrl ||
          "",
      });
      setDetail(next);
      applyInvoicePrep(next);
      await loadPool(detail?.id);
      setNotice(`${productionModelName} seçili satıra bağlandı. İmalat havuzunda iş kartı hazır.`);
    } catch (error) {
      setNotice(error?.message || "Model bağlantısı kaydedilemedi.");
    } finally {
      setModelBusy(false);
    }
  };

  return (
    <div className="bim-root">
      <div className={`bim-top ${embedded ? "bim-top-embedded" : ""}`}>
        {!embedded ? (
          <div>
            <h1>Belge İşlem Merkezi</h1>
            <p>
              Belge havuzunu sade tut, satırları kontrol et, fatura kaydını aynı
              merkezden işle.
            </p>
          </div>
        ) : null}
        <div className="bim-actions">
          <button
            className="bim-btn"
            type="button"
            onClick={() => uploadRef.current.click()}
          >
            <ErpIcon name="yukle" size={15} /> Yükle
          </button>
          <button className="bim-btn" type="button" onClick={openManualDrawer}>
            <ErpIcon name="duzenle" size={15} /> Ekle
          </button>
          <button className="bim-btn" type="button" onClick={deleteSelected}>
            <ErpIcon name="sil" size={15} /> Sil
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={() => loadPool(selectedId)}
          >
            <ErpIcon name="yenile" size={15} /> Güncelle
          </button>
        </div>
      </div>

      <input
        ref={uploadRef}
        hidden
        type="file"
        accept=".pdf,.xml,.zip"
        onChange={uploadFile}
      />
      <input
        ref={isnetUploadRef}
        hidden
        type="file"
        accept=".pdf"
        multiple
        onChange={onIsnetInputChange}
      />

      <div className="bim-layout">
        <aside className="bim-left bim-stack">
          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Havuz Girişi</h3>
              <span className="bim-pill blue">PDF / XML / ZIP</span>
            </div>
            <div className="bim-card-body bim-stack">
              <div className="bim-upload">
                <div>
                  <b>Toplu belge alımı</b>
                  <small>
                    Tek dosya seçildiğinde mevcut ayrıştırıcı ile havuza
                    yazılır.
                  </small>
                </div>
                <button
                  className="bim-btn primary"
                  type="button"
                  onClick={() => uploadRef.current.click()}
                >
                  Dosya Seç
                </button>
              </div>
              <div className="bim-inline-actions">
                <button
                  className="bim-btn"
                  type="button"
                  onClick={openManualDrawer}
                >
                  Elle kayıt
                </button>
                <button
                  className="bim-btn"
                  type="button"
                  onClick={() => setDrawer("follow")}
                >
                  Mail / Ekstre
                </button>
              </div>
            </div>
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Belge Havuzu</h3>
              <span className={`bim-pill ${loadingPool ? "amber" : "gray"}`}>
                {loadingPool ? "Yükleniyor" : `${visibleDocs.length} kayıt`}
              </span>
            </div>
            <div className="bim-card-body bim-stack">
              <div className="bim-filter-grid">
                {FILTERS.map(([key, label]) => (
                  <button
                    key={label}
                    className={`bim-filter-chip ${filter === key ? "active" : ""}`}
                    type="button"
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="bim-search">
                <ErpIcon name="ara" size={15} className="bim-search-icon" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event?.target.value)}
                  placeholder="Belge no, firma veya ürün ara"
                />
              </div>
              <div className="bim-doc-list">
                {visibleDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={`bim-doc ${String(doc.id) === String(selectedId) ? "active" : ""}`}
                    onClick={() => setSelectedId(String(doc.id))}
                  >
                    <div className="topline">
                      <b>{doc.belgeNo || "Belge"}</b>
                      <span
                        className={`bim-pill ${statusChipClass(doc.durum)}`}
                      >
                        {doc.durum || "Bekliyor"}
                      </span>
                    </div>
                    <div className="firm">{doc.firma || "Firma yok"}</div>
                    <div className="meta">
                      <span>{doc.tarih || "-"}</span>
                      <span>{formatNumber(doc.toplamAdet || 0)} adet</span>
                    </div>
                    <div className="meta">
                      <span>{doc.modelUrunOzeti || "Ürün özeti yok"}</span>
                    </div>
                  </button>
                ))}
                {!visibleDocs.length ? (
                  <div className="bim-empty">
                    Filtreye uyan kayıt bulunamadı.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <main className="bim-center bim-stack">
          <div className="bim-stats">
            <Metric label="İrsaliye Adedi" value={summary.dispatchQuantity} />
            <Metric
              label="İmalatta Basılan"
              value={summary.manufacturedQuantity}
            />
            <Metric label="Daha Önce Kesilen" value={summary.billedQuantity} />
            <Metric
              label="Faturalanabilir"
              value={summary.billableQuantity}
              dark
            />
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Ön Kontrol</h3>
              <Status tone={statusTone(header.durum)}>
                {header.durum || "Seçim bekleniyor"}
              </Status>
            </div>
            <div className="bim-card-body bim-stack">
              {!selectedDoc ? (
                <div className="bim-empty">
                  Soldan bir belge seçildiğinde özet, satır ve fatura hazırlama
                  alanı burada açılır.
                </div>
              ) : (
                <>
                  <div className="bim-four">
                    <ReadOnlyField
                      label="İrsaliye No"
                      value={header.irsaliyeNo || header.belgeNo}
                    />
                    <ReadOnlyField label="Tarih" value={header.tarih} />
                    <ReadOnlyField label="Firma" value={header.firma} />
                    <ReadOnlyField
                      label="Kesim Tipi"
                      value={
                        (summary.billableQuantity || 0) <
                        (summary.dispatchQuantity || 0)
                           ? "Kısmi"
                          : "Komple"
                      }
                    />
                  </div>
                  <div className="bim-two">
                    <ReadOnlyField
                      label="Seçilen Satır"
                      value={selectedLine.productName || "-"}
                    />
                    <ReadOnlyField label="Durum" value={header.durum || "-"} />
                  </div>
                  {loadingDetail ? (
                    <div className="bim-notice blue">
                      Belge detayı yükleniyor...
                    </div>
                  ) : null}
                  {detail?.testSample ? (
                    <div className="bim-notice amber">
                      Test numunesi mevcut:{" "}
                      {formatNumber(detail?.testSample.quantity)}{" "}
                      {detail?.testSample.unit}. Muafiyet:{" "}
                      {detail?.testSample.exemption}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Model / Ürün Satırları</h3>
              <span className="bim-pill gray">
                {formatNumber(detail?.lines.length || 0)} satır
              </span>
            </div>
            <div className="bim-card-body">
              <div className="bim-table">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün / Model</th>
                      <th className="num">İrsaliye</th>
                      <th className="num">Basılan</th>
                      <th className="num">Kesilen</th>
                      <th className="num">Kalan</th>
                      <th className="num">Fiyat</th>
                      <th>Durum</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.lines || []).map((line) => (
                      <tr
                        key={line?.id}
                        className={
                          String(line.id) === String(selectedLine.id)
                             ? "selected"
                            : ""
                        }
                      >
                        <td>
                          <strong>{line?.productName || "-"}</strong>
                          {line?.isTestSample ? (
                            <div className="meta">Test numunesi</div>
                          ) : null}
                        </td>
                        <td className="num">
                          {formatNumber(line?.quantity || 0)}
                        </td>
                        <td className="num">
                          {formatNumber(line?.manufacturedQuantity || 0)}
                        </td>
                        <td className="num">
                          {formatNumber(line?.billedQuantity || 0)}
                        </td>
                        <td className="num">
                          {formatNumber(line?.remainingQuantity || 0)}
                        </td>
                        <td className="num">
                          {formatMoney(line?.unitPrice || 0)}
                        </td>
                        <td>
                          <Status tone={statusTone(line?.status)}>
                            {line?.status || "-"}
                          </Status>
                        </td>
                        <td>
                          <button
                            className="bim-btn small"
                            type="button"
                            onClick={() =>
                              setInvoice((current) => ({
                                ...current,
                                lineId: line?.id,
                                billedQuantity: String(
                                  line?.remainingQuantity ?? line?.quantity ?? "",
                                ),
                                unitPrice: moneyInput(line?.unitPrice),
                                vatRate: line?.vatRate
                                   ? String(line?.vatRate)
                                  : current?.vatRate,
                              }))
                            }
                          >
                            Hazırla
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!detail?.lines.length ? (
                      <tr>
                        <td colSpan="8">
                          <div className="bim-empty">
                            Belge kalemleri henüz görünmüyor.
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Fatura / İrsaliye Bırakma Alanı</h3>
              <span className="bim-pill blue">PDF bırak</span>
            </div>
            <div className="bim-card-body bim-stack">
              {selectedDoc && !isManualRecord ? (
                <>
                  <div
                    className={`bim-isnet-drop ${isnetDropActive ? "active" : ""} ${processingIsnet ? "busy" : ""}`}
                    onDragOver={(event) => {
                      event?.preventDefault();
                      setIsnetDropActive(true);
                    }}
                    onDragEnter={(event) => {
                      event?.preventDefault();
                      setIsnetDropActive(true);
                    }}
                    onDragLeave={(event) => {
                      event?.preventDefault();
                      if (event.currentTarget === event?.target) {
                        setIsnetDropActive(false);
                      }
                    }}
                    onDrop={onIsnetDrop}
                  >
                    <strong>
                      Kestiğin fatura veya irsaliyeyi buraya bırak
                    </strong>
                    <span>
                      Seçili model satırı için fatura no, irsaliye no, adet,
                      fiyat, KDV ve toplam otomatik işlenir. Adet kapandıysa
                      tam, kapanmadıysa kısmi kayıt düşer.
                    </span>
                    <div className="bim-inline-actions">
                      <button
                        className="bim-btn primary"
                        type="button"
                        disabled={processingIsnet}
                        onClick={() => isnetUploadRef.current.click()}
                      >
                        {processingIsnet ? "İşleniyor..." : "PDF Seç / Bırak"}
                      </button>
                    </div>
                  </div>

                  <div className="bim-three">
                    <ReadOnlyField
                      label="Aktif Model"
                      value={selectedLine.productName || "-"}
                    />
                    <ReadOnlyField
                      label="Kalan Adet"
                      value={formatNumber(
                        selectedLine.remainingQuantity 
                          selectedLine.quantity 
                          0,
                      )}
                    />
                    <ReadOnlyField
                      label="Son Durum"
                      value={header.durum || "-"}
                    />
                  </div>

                  <div className="bim-calc">
                    <CalcBox
                      label="Beklenen birim fiyat"
                      value={formatMoney(selectedLine.unitPrice || 0)}
                    />
                    <CalcBox
                      label="Beklenen KDV"
                      value={`%${formatNumber(selectedLine.vatRate || 0)}`}
                    />
                    <CalcBox
                      label="Son fatura"
                      value={lastInvoiceRecord.invoiceNo || "-"}
                    />
                    <CalcBox
                      label="Son kesilen irsaliye"
                      value={lastInvoiceRecord.dispatchNo || "-"}
                    />
                    <CalcBox
                      label="Son toplam"
                      value={formatMoney(lastInvoiceRecord.payableTotal || 0)}
                      total
                    />
                  </div>
                </>
              ) : (
                <div className="bim-empty">
                  Havuzdan bir müşteri irsaliyesi seçildiğinde İşNet bırakma
                  alanı açılır.
                </div>
              )}
            </div>
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>İrsaliye Geçmişi</h3>
              <span className="bim-pill gray">
                {formatNumber(invoiceHistory.length)} kayıt
              </span>
            </div>
            <div className="bim-card-body">
              {invoiceHistory.length ? (
                <div className="bim-log-list">
                  {invoiceHistory.map((record) => (
                    <div
                      className="bim-log-row"
                      key={
                        record.id || `${record.invoiceNo}-${record.createdAt}`
                      }
                    >
                      <div className="bim-log-main">
                        <strong>{record.invoiceNo || "Fatura"}</strong>
                        <span>{record.productName || "Satır"}</span>
                      </div>
                      <div className="bim-log-meta">
                        <span>{record.invoiceDate || "-"}</span>
                        <span>{record.dispatchNo || "Irsaliye yok"}</span>
                        <span>
                          {formatNumber(record.billedQuantity || 0)} adet
                        </span>
                        <span>{formatMoney(record.payableTotal || 0)}</span>
                        <span
                          className={`bim-pill ${statusChipClass(record.status)}`}
                        >
                          {record.status || "-"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bim-empty">
                  Bu irsaliyede henuz kesilmis fatura kaydi yok.
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="bim-right bim-stack">
          <div className="bim-card">
            <div className="bim-card-head">
              <h3>Model Kartı</h3>
              <span className="bim-pill blue">Teyit</span>
            </div>
            <div className="bim-card-body bim-stack">
              <div className="bim-model-preview">
                {selectedModelImage ? (
                  <img
                    src={selectedModelImage}
                    alt={selectedModel?.modelName || selectedLine.productName || "Model"}
                  />
                ) : (
                  <span>Model görseli yok</span>
                )}
              </div>
              <Field label="Model">
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event?.target.value)}
                  placeholder="Model ara..."
                />
                <select
                  value={selectedModel?.id || ""}
                  onChange={(event) => setSelectedModelId(event?.target.value)}
                >
                  {modelCandidates.map((row) => (
                    <option key={row?.id} value={row?.id}>
                      {row?.modelName || row?.modelAdi || "-"}
                    </option>
                  ))}
                </select>
              </Field>
              <CompactLine
                label="Sipariş / İrsaliye"
                value={header.irsaliyeNo || header.belgeNo || "-"}
              />
              <CompactLine
                label="Bağlı satır"
                value={selectedLine.modelAdi || selectedLine.productName || "-"}
              />
              <button
                className="bim-btn primary"
                type="button"
                onClick={directLinkModel}
                disabled={modelBusy || !selectedLine.id}
              >
                {modelBusy ? "Bağlanıyor..." : "Direkt Modele Bağla"}
              </button>
            </div>
          </div>

          <div className="bim-card">
            <div className="bim-card-head">
              <h3>İşlem Özeti</h3>
              <span className="bim-pill gray">Kontrol</span>
            </div>
            <div className="bim-card-body bim-side-list">
              {riskItems.map(([label, ok]) => (
                <div className="bim-check" key={label}>
                  <span>{label}</span>
                  <Status tone={ok ? "ok" : "warn"}>
                    {ok ? "Evet" : "Kontrol"}
                  </Status>
                </div>
              ))}
              <CompactLine
                label="Mail"
                value={detail?.tracking.mail || "BEKLIYOR"}
              />
              <CompactLine
                label="Ekstre"
                value={detail?.tracking.ekstre || "KONTROL_EDILMEDI"}
              />
              <CompactLine
                label="Tasnif"
                value={detail?.tracking.tasnif || "GEREKLI_DEGIL"}
              />
              <div className="bim-footer">
                <button
                  className="bim-btn"
                  type="button"
                  onClick={() => setDrawer("follow")}
                >
                  Mail / Ekstre
                </button>
                <button
                  className="bim-btn"
                  type="button"
                  onClick={() => setDrawer("tasnif")}
                >
                  Tasnif
                </button>
              </div>
            </div>
          </div>

          {notice ? <div className="bim-notice blue">{notice}</div> : null}
        </aside>
      </div>

      <Drawer
        title="İrsaliyesiz Model Kaydı"
        open={drawer === "manual"}
        onClose={() => setDrawer("")}
      >
        <div className="bim-two">
          <Field label="İrsaliyenin Ait Olduğu">
            <select
              value={manualForm.customerName}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  customerName: event?.target.value,
                }))
              }
            >
              <option value="">Firma kartindan sec</option>
              {availableCompanyCards.map((row) => {
                const value = String(
                  row?.name || row?.firmaUnvani || "",
                ).trim();
                if (!value) return null;
                return (
                  <option key={row?.id || value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Sipariş No">
            <input
              value={manualForm.orderNo}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  orderNo: event?.target.value,
                }))
              }
            />
          </Field>
        </div>
        <div className="bim-three">
          <Field label="Tarih">
            <input
              type="date"
              value={manualForm.date}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  date: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Model Adı">
            <input
              value={manualForm.modelName}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  modelName: event?.target.value,
                }))
              }
            />
          </Field>
          <Field label="Adet">
            <input
              value={manualForm.quantity}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  quantity: event?.target.value,
                }))
              }
            />
          </Field>
        </div>
        <div className="bim-notice amber">
          Bu alan irsaliyesi henüz gelmeyen modeller için hızlı taslak açar. Ana
          firma burada kullanılmaz; sadece irsaliyenin ait olduğu isim, sipariş
          no, model adı, adet ve tarih yeterlidir.
        </div>
        <div className="bim-footer">
          <button
            className="bim-btn"
            type="button"
            onClick={() => setDrawer("")}
          >
            Kapat
          </button>
          <button
            className="bim-btn primary"
            type="button"
            disabled={
              !manualForm.customerName ||
              !manualForm.orderNo ||
              !manualForm.modelName ||
              !manualForm.quantity
            }
            onClick={addManualRecord}
          >
            Taslak Kayıt Aç
          </button>
        </div>
      </Drawer>

      <Drawer
        title="Takip Çekmecesi"
        open={drawer === "follow"}
        onClose={() => setDrawer("")}
      >
        <div className="bim-two">
          <ReadOnlyField
            label="Mail Durumu"
            value={detail?.tracking.mail || "BEKLIYOR"}
          />
          <ReadOnlyField
            label="Ekstre Durumu"
            value={detail?.tracking.ekstre || "KONTROL_EDILMEDI"}
          />
        </div>
        <div className="bim-notice blue">
          Bu alan mevcut backend takibini yalnızca özetler. Ayrı mail / ekstre
          aksiyonları mevcut sekmeden yönetilebilir.
        </div>
      </Drawer>

      <Drawer
        title="Tasnif Çekmecesi"
        open={drawer === "tasnif"}
        onClose={() => setDrawer("")}
      >
        <ReadOnlyField
          label="Tasnif Durumu"
          value={detail?.tracking.tasnif || "GEREKLI_DEGIL"}
        />
        <ReadOnlyField
          label="Ham Satır Sayısı"
          value={formatNumber(detail?.rawLines.length || 0)}
        />
        <div className="bim-notice amber">
          Tasnif raporunu ayrı modüle taşımadan önce bu çekmecede özet görünür
          durumda tutuldu.
        </div>
      </Drawer>

      <Drawer
        title="Merkez Ayarları"
        open={drawer === "settings"}
        onClose={() => setDrawer("")}
      >
        <div className="bim-check">
          <span>Kısmi faturalama modunu öne çıkar</span>
          <Status tone={settings.partialMode ? "ok" : "blue"}>
            {settings.partialMode ? "Açık" : "Kapalı"}
          </Status>
        </div>
        <div className="bim-check">
          <span>Mail sonrası uyarı göster</span>
          <Status tone={settings.autoMail ? "ok" : "blue"}>
            {settings.autoMail ? "Açık" : "Kapalı"}
          </Status>
        </div>
        <div className="bim-check">
          <span>Tasnif hatırlatıcısı göster</span>
          <Status tone={settings.autoTasnif ? "ok" : "blue"}>
            {settings.autoTasnif ? "Açık" : "Kapalı"}
          </Status>
        </div>
        <div className="bim-footer">
          <button
            className="bim-btn"
            type="button"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                partialMode: !current?.partialMode,
              }))
            }
          >
            Kısmi Mod
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                autoMail: !current?.autoMail,
              }))
            }
          >
            Mail Uyarısı
          </button>
          <button
            className="bim-btn"
            type="button"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                autoTasnif: !current?.autoTasnif,
              }))
            }
          >
            Tasnif Uyarısı
          </button>
        </div>
      </Drawer>

      {toast ? <div className="bim-toast">{toast}</div> : null}
    </div>
  );
}

function Metric({ label, value, dark = false }) {
  return (
    <div className={`bim-stat ${dark ? "dark" : ""}`}>
      <span>{label}</span>
      <b>{formatNumber(value || 0)}</b>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="bim-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="bim-field">
      <label>{label}</label>
      <input value={value || "-"} readOnly />
    </div>
  );
}

function CopyBox({ label, value, onCopy, note = false }) {
  return (
    <div className={`bim-copybox ${note ? "note" : ""}`}>
      <div className="cap">
        <strong>{label}</strong>
        <button
          className="bim-btn small copy"
          type="button"
          onClick={() => onCopy(value, label)}
        >
          Kopyala
        </button>
      </div>
      <div className="val">{value || "-"}</div>
    </div>
  );
}

function CalcBox({ label, value, total = false }) {
  return (
    <div className={total ? "total" : ""}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function CompactLine({ label, value }) {
  return (
    <div className="bim-compact">
      <span>{label}</span>
      <Status tone={statusTone(value)}>{value || "-"}</Status>
    </div>
  );
}

function Drawer({ title, open, onClose, children }) {
  return (
    <>
      {open ? <div className="bim-drawer-bg" onClick={onClose} /> : null}
      <div className={`bim-drawer ${open ? "show" : ""}`}>
        <div className="bim-drawer-head">
          <h3>{title}</h3>
          <button className="bim-btn" type="button" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="bim-drawer-body">{children}</div>
      </div>
    </>
  );
}
