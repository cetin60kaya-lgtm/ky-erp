/**
 * ÖLÜ KOD — BelgeEditorTab, BelgeAkisTab, BelgelerTab
 * Bu fonksiyonlar hiçbir yerde kullanılmıyor. Arşivlendi.
 * Silinebilir.
 */

function BelgeEditorTab({
  sectionKey,
  draft,
  setDraft,
  companies,
  activeCompany,
  activeMainCompany,
  onCompanySelect,
  recentCompanies,
}) {
  const config = DOCUMENT_SECTION_CONFIG[sectionKey];
  const isGenelGider = sectionKey === "alis-gider-belgeleri";
  const [rows, setRows] = useState([]);
  const [modelKayitlari, setModelKayitlari] = useState([]);
  const [products, setProducts] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentTypeBusy, setPaymentTypeBusy] = useState(false);
  const [showPaymentTypeManager, setShowPaymentTypeManager] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [documentPathSettings, setDocumentPathSettings] = useState({
    ...DEFAULT_BIZIM_DOCUMENT_PATHS,
  });
  const [documentPathBusy, setDocumentPathBusy] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [historyFilters, setHistoryFilters] = useState({
    firma: "",
    tedarikci: "",
    documentNo: "",
    faturaNo: "",
    irsaliyeNo: "",
    modelAdi: "",
    status: "",
    fromDate: "",
    toDate: "",
  });
  const [poolSearchText, setPoolSearchText] = useState("");
  const [modelSearchText, setModelSearchText] = useState("");
  const [historyPageSize, setHistoryPageSize] = useState(20);
  const [historyPage, setHistoryPage] = useState(1);
  const [showModelQuickCreate, setShowModelQuickCreate] = useState(false);
  const [modelCreateBusy, setModelCreateBusy] = useState(false);
  const [modelQuickForm, setModelQuickForm] = useState({
    id: "",
    firma: "",
    modelAdi: "",
    zemin: "",
    not: "",
  });
  const [showProductQuickEditor, setShowProductQuickEditor] = useState(false);
  const [productQuickBusy, setProductQuickBusy] = useState(false);
  const [productQuickForm, setProductQuickForm] = useState({
    id: "",
    urunAdi: "",
    kategori: "Genel",
    birim: "ADET",
    varsayilanAmbalaj: "",
    not: "",
    aktif: true,
  });
  const [selectedSecondaryId, setSelectedSecondaryId] = useState("");
  const [activeDocTab, setActiveDocTab] = useState("belge");
  const isFocusedDocumentFlow = [
    "musteri-irsaliye",
    "bizim-belgeler",
    "tedarikci-fatura",
  ].includes(sectionKey);
  const isMusteriIrsaliyeLayout = sectionKey === "musteri-irsaliye";
  const isBizimBelgelerLayout = sectionKey === "bizim-belgeler";
  const isTedarikciFaturaLayout = sectionKey === "tedarikci-fatura";

  const selectedCompanyName = String(
    draft.selectedCompanyName || draft.matchedCompanyName || "",
  ).trim();
  const rawParsedCompanyName = String(
    draft.rawParsedCompanyName || draft.rawDetectedCompanyName || "",
  ).trim();

  const companyHelperText = selectedCompanyName
     `Kayıtlı Firma: ${selectedCompanyName}${
        rawParsedCompanyName && rawParsedCompanyName !== selectedCompanyName
           ? ` | Ham Unvan: ${rawParsedCompanyName}`
          : ""
      ? }${draft.firmaEslesmeTipi ? ` | Tip: ${draft.firmaEslesmeTipi}` : ""}`
    : rawParsedCompanyName
       ? `Ham Unvan: ${rawParsedCompanyName}`
      : "";
  const totals = useMemo(
    () => deriveDraftTotals(draft.items, draft.kdv),
    [draft.items, draft.kdv],
  );
  const isDirectNonOfficialSupplierMode =
    isTedarikciFaturaLayout &&
    String(draft.resmiDurum || "").trim() === "GAYRI_RESMI" &&
    String(draft.sourceType || "").trim() === "MANUEL_DIREKT_CARI";
  const isDirectNonOfficialSupplierScreen =
    isTedarikciFaturaLayout && activeDocTab === "gayri-resmi";
  const reviewState = useMemo(() => {
    if (isDirectNonOfficialSupplierMode) {
      return {
        needsAttention: false,
        confidenceAverage: 0,
        textQuality: 0,
        lowConfidenceCount: 0,
        notes: [],
      };
    }
    const confidenceAverage = Number(
      draft.metrics.avgConfidence ?? draft.metrics.confidenceAverage ?? 0,
    );
    const textQuality = Number(draft.metrics.textQualityScore || 0);
    const lowConfidenceCount = (draft.items || []).filter((item) => {
      const confidence = Number(item?.confidence ?? item?.matchConfidence ?? 1);
      return confidence > 0 && confidence < 0.75;
    }).length;
    const needsAttention =
      Boolean(draft.needsReview) ||
      Boolean(draft.warnings.length) ||
      Boolean(draft.candidateRows.length) ||
      lowConfidenceCount > 0 ||
      (confidenceAverage > 0 && confidenceAverage < 0.75) ||
      (!String(draft.modelKaydiId || "").trim() &&
        flowTypeMeta(draft.flowType || draft.workflowType).belgeYonu ===
          "giden") ||
      (!String(draft.irsaliyeNo || "").trim() &&
        flowTypeMeta(draft.flowType || draft.workflowType).belgeYonu ===
          "giden") ||
      (!String(draft.faturaNo || "").trim() &&
        flowTypeMeta(draft.flowType || draft.workflowType).belgeYonu ===
          "giden" &&
        flowTypeMeta(draft.flowType || draft.workflowType).belgeTipi ===
          "fatura");

    const notes = [];
    if (
      lowConfidenceCount > 0 ||
      (confidenceAverage > 0 && confidenceAverage < 0.75)
    ) {
      notes.push(
        "Belgeden okunan bazı bilgiler net değil. Firma, belge no ve tutarları kontrol edin.",
      );
    }
    if (draft.candidateRows.length) {
      notes.push(
        "Bazı satırlar kalemlere otomatik eklenemedi. Gerekli olanları aşağıdan kaleme alın.",
      );
    }
    if (draft.warnings.length) {
      notes.push(
        "Taslağı finale çevirmeden önce belgeyi gözden geçirmeniz gerekiyor.",
      );
    }
    const flowMeta = flowTypeMeta(draft.flowType || draft.workflowType);
    if (
      flowMeta.belgeYonu === "giden" &&
      !String(draft.modelKaydiId || "").trim()
    ) {
      notes.push("Giden belge için model kaydı seçimi gerekli.");
    }
    if (
      flowMeta.belgeYonu === "giden" &&
      !String(draft.irsaliyeNo || "").trim()
    ) {
      notes.push("Giden belge için irsaliye no eksik.");
    }
    if (
      flowMeta.belgeYonu === "giden" &&
      flowMeta.belgeTipi === "fatura" &&
      !String(draft.faturaNo || "").trim()
    ) {
      notes.push("Giden faturada fatura no eksik.");
    }

    return {
      needsAttention,
      confidenceAverage,
      textQuality,
      lowConfidenceCount,
      notes,
    };
  }, [draft, isDirectNonOfficialSupplierMode]);
  const workflowLabel =
    config.workflowOptions.find((item) => item.value === draft.workflowType)
      .label || config.title;
  const draftFlowMeta = flowTypeMeta(draft.flowType || draft.workflowType);
  const isIncomingDispatchMode =
    draftFlowMeta.belgeYonu === "gelen" &&
    draftFlowMeta.belgeTipi === "irsaliye";
  const selectedModelKaydi = useMemo(
    () =>
      modelKayitlari.find(
        (item) => String(item?.id) === String(draft.modelKaydiId || ""),
      ) || null,
    [draft.modelKaydiId, modelKayitlari],
  );
  const incomingLinkedModelKaydi = useMemo(() => {
    if (selectedModelKaydi) return selectedModelKaydi;
    const modelAdi = String(draft.modelAdi || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const musteriFirma = String(draft.firma || draft.musteriFirma || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    if (!modelAdi) return null;
    return (
      modelKayitlari.find((item) => {
        const itemFirma = String(item?.musteriFirma || item?.firma || "")
          .trim()
          .toLocaleLowerCase("tr-TR");
        return (
          String(item?.modelAdi || "")
            .trim()
            .toLocaleLowerCase("tr-TR") === modelAdi &&
          (!musteriFirma || !itemFirma || itemFirma === musteriFirma)
        );
      }) || null
    );
  }, [
    draft.firma,
    draft.modelAdi,
    draft.musteriFirma,
    modelKayitlari,
    selectedModelKaydi,
  ]);
  const parsedItemCountDisplay = Number(
    draft.metrics.parsedItemCount 
      draft.metrics.itemCount 
      draft.items.length,
  );
  const candidateRowCountDisplay = Number(
    draft.metrics.candidateLineCount 
      draft.metrics.candidateCount 
      draft.candidateRows.length,
  );

  const filteredRows = useMemo(() => {
    return rows
      .filter((doc) => {
        const visibleCompanyName = String(
          doc.matchedCompanyName ||
            doc.relatedCompanyName ||
            doc.header.cariFirma ||
            doc.header.tedarikciFirma ||
            doc.firma ||
            "",
        );
        const visibleSupplierName = String(
          doc.header.tedarikciFirma ||
            doc.relatedCompanyName ||
            doc.matchedCompanyName ||
            doc.firma ||
            "",
        );
        const firmaOk = historyFilters.firma
           visibleCompanyName
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.firma.toLocaleLowerCase("tr-TR"))
          : true;
        const tedarikciOk = historyFilters.tedarikci
           visibleSupplierName
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.tedarikci.toLocaleLowerCase("tr-TR"))
          : true;
        const noOk = historyFilters.documentNo
           String(doc.header.documentNo || "")
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.documentNo.toLocaleLowerCase("tr-TR"))
          : true;
        const faturaOk = historyFilters.faturaNo
           String(doc.header.faturaNo || "")
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.faturaNo.toLocaleLowerCase("tr-TR"))
          : true;
        const irsaliyeOk = historyFilters.irsaliyeNo
           String(doc.header.irsaliyeNo || doc.header.dispatchNo || "")
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.irsaliyeNo.toLocaleLowerCase("tr-TR"))
          : true;
        const modelOk = historyFilters.modelAdi
           String(doc.header.modelAdi || "")
              .toLocaleLowerCase("tr-TR")
              ? .includes(historyFilters.modelAdi.toLocaleLowerCase("tr-TR"))
          : true;
        const statusOk = historyFilters.status
           ? String(doc.status || "") === historyFilters.status
          : true;
        const docDate = String(doc.header.date || doc.updatedAt || "").slice(
          0,
          10,
        );
        const fromOk = historyFilters.fromDate
           ? docDate >= historyFilters.fromDate
          : true;
        const toOk = historyFilters.toDate
           ? docDate <= historyFilters.toDate
          : true;
        return (
          firmaOk &&
          tedarikciOk &&
          noOk &&
          faturaOk &&
          irsaliyeOk &&
          modelOk &&
          statusOk &&
          fromOk &&
          toOk
        );
      })
      .sort((left, right) => {
        const leftTime = new Date(
          left.updatedAt || left.createdAt || left.header.date || 0,
        ).getTime();
        const rightTime = new Date(
          right.updatedAt || right.createdAt || right.header.date || 0,
        ).getTime();
        return rightTime - leftTime;
      });
  }, [rows, historyFilters]);

  const poolRows = useMemo(
    () =>
      filteredRows.filter(
        (doc) =>
          !["ONAYLANDI", "FINAL", "FİNAL"].includes(
            String(doc.status || "").toLocaleUpperCase("tr-TR"),
          ) &&
          !(
            isTedarikciFaturaLayout &&
            String(doc.sourceType || "").trim() === "MANUEL_DIREKT_CARI"
          ),
      ),
    [filteredRows, isTedarikciFaturaLayout],
  );
  const finalHistoryRows = useMemo(
    () =>
      filteredRows.filter((doc) =>
        ["ONAYLANDI", "FINAL", "FİNAL"].includes(
          String(doc.status || "").toLocaleUpperCase("tr-TR"),
        ),
      ),
    [filteredRows],
  );
  const secondaryPanelTitle =
    sectionKey === "tedarikci-fatura"
       ? "Ürün / Eşleşme"
      : "Model Bağlantısı Bekleyenler";
  const secondaryPanelRows =
    sectionKey === "tedarikci-fatura" ? products : modelKayitlari;
  const companySelectOptions = useMemo(() => {
    const options = getSelectableCompanies(companies).map((item) => ({
      value: item?.firma,
      label: item?.firma,
    }));
    if (
      draft.firma &&
      !options.some((item) => String(item?.value || "") === String(draft.firma))
    ) {
      options.unshift({ value: draft.firma, label: draft.firma });
    }
    return [{ value: "", label: "Firma seçiniz..." }, ...options];
  }, [companies, draft.firma]);
  const historyCompanyFilterOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        rows
          .map(
            (doc) =>
              doc.matchedCompanyName ||
              doc.relatedCompanyName ||
              doc.header.cariFirma ||
              doc.header.tedarikciFirma ||
              doc.firma ||
              "",
          )
          .filter(Boolean),
      ),
    ).sort((a, b) => String(a).localeCompare(String(b), "tr"));
    return [{ value: "", label: "Firma seçiniz..." }].concat(
      names.map((name) => ({ value: name, label: name })),
    );
  }, [rows]);
  const historyModelFilterOptions = useMemo(() => {
    const modelNames = Array.from(
      new Set(
        rows
          .map((doc) => doc.header.modelAdi || "")
          .filter((value) => String(value).trim()),
      ),
    ).sort((a, b) => String(a).localeCompare(String(b), "tr"));
    return [{ value: "", label: "Model seçiniz..." }].concat(
      modelNames.map((name) => ({ value: name, label: name })),
    );
  }, [rows]);
  const filteredPoolRowsBySearch = useMemo(() => {
    const query = String(poolSearchText || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    if (!query) return poolRows;
    return poolRows.filter((doc) => {
      const summary = [
        documentPoolNo(doc),
        documentPoolCompany(doc),
        doc.header.aciklama || "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return summary.includes(query);
    });
  }, [poolRows, poolSearchText]);
  const filteredModelRowsBySearch = useMemo(() => {
    const query = String(modelSearchText || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    if (!query) return modelKayitlari;
    return modelKayitlari.filter((item) => {
      const summary = [
        item?.modelAdi || "",
        item?.modelKodu || "",
        item?.musteriFirma || item?.firma || "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return summary.includes(query);
    });
  }, [modelKayitlari, modelSearchText]);
  const filteredSecondaryRowsBySearch = useMemo(() => {
    if (sectionKey !== "tedarikci-fatura") return filteredModelRowsBySearch;
    const query = String(modelSearchText || "")
      .trim()
      .toLocaleLowerCase("tr-TR");
    if (!query) return products;
    return products.filter((item) => {
      const summary = [
        item?.urunAdi || item?.ticariAdi || "",
        item?.kategori || "",
        item?.birim || "",
        item?.varsayilanAmbalaj || "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR");
      return summary.includes(query);
    });
  }, [filteredModelRowsBySearch, modelSearchText, products, sectionKey]);
  const selectedPoolRow = useMemo(
    () =>
      rows.find(
        (item) =>
          String(item.documentId || "") === String(selectedHistoryId || ""),
      ) || null,
    [rows, selectedHistoryId],
  );
  const selectedSecondaryRow = useMemo(
    () =>
      filteredSecondaryRowsBySearch.find(
        (item) => String(item?.id || "") === String(selectedSecondaryId || ""),
      ) || null,
    [filteredSecondaryRowsBySearch, selectedSecondaryId],
  );
  const focusedDocTabs = useMemo(
    () =>
      isBizimBelgelerLayout
         [
            { key: "belge", label: "Belge" },
            { key: "gecmis", label: "Geçmiş" },
          ? ]
        : isMusteriIrsaliyeLayout
           [
              { key: "belge", label: "Belge + PDF" },
              { key: "gecmis", label: "Geçmiş" },
            ? ]
          : isTedarikciFaturaLayout
             [
                { key: "belge", label: "Tedarikci Fatura" },
                { key: "gayri-resmi", label: "Gayri Resmi Kayit" },
              ? ]
            : [
                { key: "belge", label: "Belge Bilgisi" },
                { key: "kalemler", label: "Kalemler + PDF" },
                { key: "gecmis", label: "Geçmiş" },
              ],
    [isBizimBelgelerLayout, isMusteriIrsaliyeLayout, isTedarikciFaturaLayout],
  );
  const outgoingRequiredFieldList = useMemo(() => {
    if (sectionKey !== "bizim-belgeler") return [];
    const flowMeta = flowTypeMeta(draft.flowType || draft.workflowType);
    const missing = [];
    const modelLines = Array.isArray(draft.items) ? draft.items : [];
    const documentQuantity = Number(
      draft.belgeAdediToplami ||
        draft.faturalananAdet ||
        draft.irsaliyeAdedi ||
        modelLines.reduce((sum, item) => sum + Number(item?.miktar || 0), 0) ||
        0,
    );
    const hasModelLine = modelLines.some((item) =>
      String(item?.modelAdi || item?.aciklama || "").trim(),
    );
    if (!String(draft.firma || "").trim()) missing.push("Firma");
    if (!String(draft.workflowType || "").trim())
      missing.push("Belge Tipi / İş Akışı");
    if (!hasModelLine) missing.push("Model Adı");
    if (!String(draft.irsaliyeNo || "").trim()) missing.push("İrsaliye No");
    if (
      flowMeta.belgeTipi === "fatura" &&
      !String(draft.faturaNo || "").trim()
    ) {
      missing.push("Fatura No");
    }
    if (documentQuantity <= 0) missing.push("Adet");
    if (Number(draft.subtotal || 0) <= 0) missing.push("Ara Toplam");
    return missing;
  }, [draft, sectionKey]);
  const incomingRequiredFieldList = useMemo(() => {
    const incomingMode =
      flowTypeMeta(draft.flowType || draft.workflowType).belgeYonu ===
        "gelen" &&
      flowTypeMeta(draft.flowType || draft.workflowType).belgeTipi ===
        "irsaliye";
    if (!incomingMode) return [];
    const missing = [];
    if (!String(draft.firma || "").trim()) missing.push("Firma");
    if (!String(draft.irsaliyeNo || "").trim()) missing.push("İrsaliye No");
    if (!String(draft.tarih || "").trim()) missing.push("Tarih");
    if (
      !String(draft.modelKaydiId || "").trim() &&
      !String(draft.modelAdi || "").trim()
    ) {
      missing.push("Model Seçimi (Sol Panel)");
    }
    if (Number(draft.belgeAdediToplami || draft.irsaliyeAdedi || 0) <= 0) {
      missing.push("Gelen Adet");
    }
    return missing;
  }, [draft]);
  const historyRowsForTable = useMemo(() => {
    if (isFocusedDocumentFlow) return filteredRows;
    return filteredRows;
  }, [filteredRows, isFocusedDocumentFlow]);
  const historyTotalPages = useMemo(() => {
    const total = Math.ceil(historyRowsForTable.length / historyPageSize);
    return total > 0 ? total : 1;
  }, [historyRowsForTable.length, historyPageSize]);
  const pagedHistoryRows = useMemo(() => {
    const safePage = Math.min(historyPage, historyTotalPages);
    const start = (safePage - 1) * historyPageSize;
    return historyRowsForTable.slice(start, start + historyPageSize);
  }, [historyPage, historyPageSize, historyRowsForTable, historyTotalPages]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyFilters, sectionKey]);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      setHistoryPage(historyTotalPages);
    }
  }, [historyPage, historyTotalPages]);

  useEffect(() => {
    if (!(isTedarikciFaturaLayout && activeDocTab === "gecmis")) return;
    setHistoryFilters((prev) => {
      if (
        !prev?.firma &&
        !prev?.tedarikci &&
        !prev?.documentNo &&
        !prev?.faturaNo &&
        !prev?.irsaliyeNo &&
        !prev?.modelAdi &&
        !prev?.status &&
        !prev?.fromDate &&
        !prev?.toDate
      ) {
        return prev;
      }
      return {
        firma: "",
        tedarikci: "",
        documentNo: "",
        faturaNo: "",
        irsaliyeNo: "",
        modelAdi: "",
        status: "",
        fromDate: "",
        toDate: "",
      };
    });
  }, [activeDocTab, isTedarikciFaturaLayout]);

  useEffect(() => {
    setActiveDocTab("belge");
  }, [sectionKey]);

  useEffect(() => {
    if (!isDirectNonOfficialSupplierScreen) return;
    setDraft((prev) => {
      const nextFlowType =
        normalizeFlowType(
          prev?.flowType || prev?.workflowType || "GELEN_FATURA",
        ) || "GELEN_FATURA";
      if (
        prev.resmiDurum === "GAYRI_RESMI" &&
        prev.sourceType === "MANUEL_DIREKT_CARI" &&
        prev.flowType === nextFlowType &&
        prev.workflowType === nextFlowType &&
        Array.isArray(prev?.items) &&
        prev.items.length === 0 &&
        Array.isArray(prev?.candidateRows) &&
        prev.candidateRows.length === 0 &&
        Array.isArray(prev?.warnings) &&
        prev.warnings.length === 0
      ) {
        return prev;
      }
      return {
        ...prev,
        resmiDurum: "GAYRI_RESMI",
        sourceType: "MANUEL_DIREKT_CARI",
        flowType: nextFlowType,
        workflowType: nextFlowType,
        items: [],
        parsedItems: [],
        candidateRows: [],
        warnings: [],
        needsReview: false,
        kdv: 0,
        subtotal:
          Number(prev?.subtotal || 0) > 0
             ? Number(prev?.subtotal || 0)
            : Number(prev?.grandTotal || 0),
        grandTotal:
          Number(prev?.grandTotal || 0) > 0
             ? Number(prev?.grandTotal || 0)
            : Number(prev?.subtotal || 0),
      };
    });
  }, [isDirectNonOfficialSupplierScreen, setDraft]);

  useEffect(() => {
    if (!isTedarikciFaturaLayout) {
      setSelectedSecondaryId(String(draft.modelKaydiId || ""));
      return;
    }
    if (
      selectedSecondaryId &&
      !filteredSecondaryRowsBySearch.some(
        (item) => String(item?.id || "") === String(selectedSecondaryId || ""),
      )
    ) {
      setSelectedSecondaryId("");
    }
  }, [
    draft.modelKaydiId,
    filteredSecondaryRowsBySearch,
    isTedarikciFaturaLayout,
    selectedSecondaryId,
  ]);

  function documentPoolTitle() {
    if (sectionKey === "musteri-irsaliye") return "İrsaliye Havuzu";
    if (sectionKey === "bizim-belgeler") return "Belge Havuzu";
    if (sectionKey === "tedarikci-fatura") return "Fatura Havuzu";
    return "Havuz";
  }

  function documentPoolNo(doc) {
    return (
      doc.header.faturaNo ||
      doc.header.documentNo ||
      doc.header.musteriIrsaliyeNo ||
      doc.header.irsaliyeNo ||
      doc.header.dispatchNo ||
      doc.documentId ||
      "-"
    );
  }

  function documentPoolCompany(doc) {
    return (
      doc.matchedCompanyName ||
      doc.relatedCompanyName ||
      doc.header.cariFirma ||
      doc.header.tedarikciFirma ||
      doc.firma ||
      "Firma yok"
    );
  }

  function documentPoolType(doc) {
    const meta = flowTypeMeta(doc.header.flowType || doc.workflowType);
    return meta.label || doc.documentClass || doc.documentType || "Belge";
  }

  function unmatchedDocumentItemCount(doc) {
    const items = Array.isArray(doc.items) ? doc.items : [];
    return items.filter(
      (item) =>
        !item?.matchedProductId &&
        !item?.eslesenUrunId &&
        !item?.urunId &&
        !item?.productReference,
    ).length;
  }

  useEffect(() => {
    if (!draft.items.length) return;
    setDraft((prev) => {
      if (!prev?.items.length) return prev;
      const nextTotals = deriveDraftTotals(prev?.items, prev?.kdv);
      const sameItems = prev?.items.every((item, index) => {
        const nextItem = nextTotals.items[index];
        return (
          nextItem &&
          Number(item.tutar || 0) === Number(nextItem.tutar || 0) &&
          Number(item.kdvTutari || 0) === Number(nextItem.kdvTutari || 0)
        );
      });
      if (
        sameItems &&
        Number(prev.subtotal || 0) === nextTotals.subtotal &&
        Number(prev.kdv || 0) === nextTotals.kdv &&
        Number(prev.grandTotal || 0) === nextTotals.grandTotal
      ) {
        return prev;
      }
      return {
        ...prev,
        items: nextTotals.items,
        subtotal: nextTotals.subtotal,
        kdv: nextTotals.kdv,
        grandTotal: nextTotals.grandTotal,
      };
    });
  }, [draft.items, setDraft]);

  async function load() {
    const data = await apiGet("/muhasebe/belgeler", activeMainCompany);
    setRows(
      data.filter((x) => {
        if (x.sourceTab === sectionKey) return true;
        // Geriye dönük uyumluluk: eski sourceTab kayıtlarını yeni akışlarda göster
        const ft = String(x.flowType || x.workflowType || "").toUpperCase();
        if (sectionKey === "musteri-irsaliye") {
          return (
            (x.sourceTab === "irsaliye-fatura" ||
              x.sourceTab === "alis-gider-belgeleri") &&
            ft === "GELEN_IRSALIYE"
          );
        }
        if (sectionKey === "bizim-belgeler") {
          return (
            x.sourceTab === "irsaliye-fatura" &&
            (ft === "GIDEN_IRSALIYE" || ft === "GIDEN_FATURA")
          );
        }
        if (sectionKey === "tedarikci-fatura") {
          return (
            x.sourceTab === "alis-gider-belgeleri" && ft === "GELEN_FATURA"
          );
        }
        return false;
      }),
    );
  }

  async function loadProducts() {
    const payload = await apiGet("/muhasebe/urunler", {
      ...activeMainCompany,
      limit: 1000,
    });
    setProducts(
      Array.isArray(payload)
         ? payload
        : Array.isArray(payload?.data)
           ? payload?.data
          : [],
    );
  }

  async function loadModelKayitlari() {
    const payload = await apiGet(
      "/model-takip/models/shared-list",
      activeMainCompany,
    );
    // Merkezi model listesi { ok, data } standart yanıt döndürür.
    const rows =
      payload.ok === true && Array.isArray(payload?.data)
         ? payload?.data
        : Array.isArray(payload)
           ? payload
          : [];
    // Muhasebe'nin beklediği alanlarla uyumlu hale getir
    setModelKayitlari(
      rows.map((m) => ({
        ...m,
        modelAdi: m.modelAdi || m.modelName || "",
        musteriFirma:
          m.musteriFirma || m.firma || m.customer || m.musteri || "",
      })),
    );
  }

  async function loadPaymentTypes() {
    setPaymentTypes(await apiGet("/muhasebe/odeme-turleri", activeMainCompany));
  }

  async function loadDocumentPathSettings() {
    const settings = await apiGet(
      "/muhasebe/document-path-settings",
      activeMainCompany,
    );
    setDocumentPathSettings((prev) => ({
      ...DEFAULT_BIZIM_DOCUMENT_PATHS,
      ...prev,
      ...(settings || {}),
      gidenIrsaliyeBasePath:
        settings.gidenIrsaliyeBasePath ||
        prev?.gidenIrsaliyeBasePath ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.gidenIrsaliyeBasePath,
      gidenFaturaBasePath:
        settings.gidenFaturaBasePath ||
        prev?.gidenFaturaBasePath ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.gidenFaturaBasePath,
      faturaDosyaPrefix:
        settings.faturaDosyaPrefix ||
        prev?.faturaDosyaPrefix ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.faturaDosyaPrefix,
      irsaliyeDosyaPrefix:
        settings.irsaliyeDosyaPrefix ||
        prev?.irsaliyeDosyaPrefix ||
        DEFAULT_BIZIM_DOCUMENT_PATHS.irsaliyeDosyaPrefix,
    }));
  }

  async function saveDocumentPathSettings() {
    setDocumentPathBusy(true);
    setMessage("");
    try {
      const payload = {
        ...documentPathSettings,
        belgeYuklemeFaturaFolder:
          documentPathSettings.gidenFaturaBasePath ||
          documentPathSettings.belgeYuklemeFaturaFolder ||
          "",
        belgeYuklemeIrsaliyeFolder:
          documentPathSettings.gidenIrsaliyeBasePath ||
          documentPathSettings.belgeYuklemeIrsaliyeFolder ||
          "",
        belgeYuklemeGelenFaturaFolder:
          documentPathSettings.tedarikciFaturaBasePath ||
          documentPathSettings.belgeYuklemeGelenFaturaFolder ||
          "",
        belgeYuklemeGelenIrsaliyeFolder:
          documentPathSettings.musteriIrsaliyeBasePath ||
          documentPathSettings.belgeYuklemeGelenIrsaliyeFolder ||
          "",
        belgeYuklemeXmlFolder:
          documentPathSettings.xmlBasePath ||
          documentPathSettings.belgeYuklemeXmlFolder ||
          "",
        belgeYuklemeTasnifFolder:
          documentPathSettings.tasnifBekleyenBasePath ||
          documentPathSettings.belgeYuklemeTasnifFolder ||
          "",
      };
      const saved = await apiPost(
        "/muhasebe/document-path-settings",
        payload,
        activeMainCompany,
      );
      setDocumentPathSettings((prev) => ({ ...prev, ...(saved || {}) }));
      setMessage("Belge klasör yolları kaydedildi.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setDocumentPathBusy(false);
    }
  }

  async function savePaymentType(payload) {
    setPaymentTypeBusy(true);
    try {
      await apiPost("/muhasebe/odeme-turleri", payload, activeMainCompany);
      await loadPaymentTypes();
    } finally {
      setPaymentTypeBusy(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    loadProducts().catch((e) => setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    loadModelKayitlari().catch((e) => setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    loadPaymentTypes().catch((e) => setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMainCompany]);

  useEffect(() => {
    if (!isBizimBelgelerLayout) return;
    loadDocumentPathSettings().catch((e) => setMessage(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBizimBelgelerLayout, activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    if (!draft.firma && activeCompany) {
      setDraft((prev) => ({ ...prev, firma: activeCompany }));
    }
  }, [activeCompany, draft.firma, setDraft]);

  useEffect(() => {
    if (!draft.odemeTuru && paymentTypes.length) {
      const first = paymentTypes.find((item) => item?.aktif) || paymentTypes[0];
      if (first.ad) {
        setDraft((prev) => ({ ...prev, odemeTuru: first.ad }));
      }
    }
  }, [draft.odemeTuru, paymentTypes, setDraft]);

  function buildLine(overrides = {}) {
    return normalizeLineItem({
      id: uid("itm"),
      aciklama: "",
      rawDescription: "",
      hamKalemMetni: "",
      normalizedDescription: "",
      firmaId: "",
      firmaAdi: "",
      matchedProductId: "",
      matchedProductName: "",
      matchedProductCode: "",
      matchConfidence: 0,
      productReference: null,
      productStatus: "ESLESMEDI",
      eslesmeTipi: "KULLANICI_ONAYI",
      firmaEslesmeTipi: "",
      urunEslesmeTipi: "KULLANICI_ONAYI",
      kaynak: "manuel",
      eslesenUrunId: "",
      urunId: "",
      urunAdi: "",
      ambalaj: "",
      lotNo: "",
      orijinalKalemMetni: "",
      modelAdayi: "",
      matchWarning: "Kayıtlı ürün eşleşmesi bulunamadı",
      miktar: 0,
      birim: "ADET",
      kg: 0,
      birim2: "",
      birimFiyat: 0,
      tutar: 0,
      kdvOrani: 0,
      kdvTutari: 0,
      ...overrides,
    });
  }

  function extractBizimModelName(item = {}) {
    return String(
      item?.modelAdi ||
        item?.modelAdayi ||
        item?.aciklama ||
        item?.description ||
        item?.rawDescription ||
        "",
    )
      .replace(/^\d+\s*[-/]\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildBizimBelgeLine(overrides = {}) {
    return buildLine({
      kaynak: "bizim-belge",
      birim: "ADET",
      modelAdi: "",
      piyonNo: "",
      aciklama: "",
      rawDescription: "",
      miktar: 0,
      birimFiyat: 0,
      tutar: 0,
      kdvOrani: 0,
      kdvTutari: 0,
      ...overrides,
    });
  }

  function mapParsedItemToBizimLine(item, index = 0, fallbackModelName = "") {
    const quantity = Number(item?.quantity || item?.miktar || item?.adet || 0);
    const lineTotal = Number(item?.lineTotal || item?.tutar || 0);
    const kdvAmount = Number(item?.kdvAmount || item?.kdvTutari || 0);
    const description = String(
      item?.description || item?.aciklama || item?.rawDescription || "",
    ).trim();
    return buildBizimBelgeLine({
      id: item?.id || uid(`bizim_${index}`),
      modelAdi: fallbackModelName || extractBizimModelName(item),
      aciklama: description,
      rawDescription: description,
      miktar: quantity,
      birimFiyat: quantity > 0 ? Number((lineTotal / quantity).toFixed(4)) : 0,
      tutar: lineTotal,
      kdvOrani: Number(item?.kdvRate || item?.kdvOrani || 0),
      kdvTutari: kdvAmount,
    });
  }

  function addBizimBelgeLine() {
    setDraft((prev) => ({
      ...prev,
      items: [
        ...prev?.items,
        buildBizimBelgeLine({
          modelAdi: selectedModelKaydi.modelAdi || prev?.modelAdi || "",
          miktar:
            Number(prev?.belgeAdediToplami || prev?.faturalananAdet || 0) || 0,
          tutar: Number(prev?.subtotal || 0),
          kdvTutari: Number(prev?.kdv || 0),
        }),
      ],
    }));
  }

  function mapParsedItemToLine(item) {
    return normalizeLineItem(
      buildLine({
        id: item?.id || uid("itm"),
        aciklama:
          item?.rawDescription || item?.description || item?.aciklama || "",
        rawDescription:
          item?.rawDescription || item?.description || item?.aciklama || "",
        hamKalemMetni:
          item?.hamKalemMetni ||
          item?.orijinalKalemMetni ||
          item?.rawDescription ||
          item?.description ||
          item?.aciklama ||
          "",
        normalizedDescription: item?.normalizedDescription || "",
        firmaId:
          item?.firmaId ||
          item?.matchedCompanyId ||
          draft.selectedCompanyId ||
          draft.matchedCompanyId ||
          "",
        firmaAdi:
          item?.firmaAdi ||
          item?.matchedCompanyName ||
          draft.selectedCompanyName ||
          draft.matchedCompanyName ||
          draft.firma ||
          "",
        matchedProductId: item?.matchedProductId || "",
        matchedProductName: item?.matchedProductName || "",
        matchedProductCode: item?.matchedProductCode || item?.productCode || "",
        matchConfidence: Number(item?.matchConfidence || 0),
        eslesmeTipi: item?.eslesmeTipi || "KULLANICI_ONAYI",
        firmaEslesmeTipi: item?.firmaEslesmeTipi || draft.firmaEslesmeTipi || "",
        urunEslesmeTipi:
          item?.urunEslesmeTipi || item?.eslesmeTipi || "KULLANICI_ONAYI",
        kaynak: item?.kaynak || "parse",
        eslesenUrunId: item?.eslesenUrunId || item?.matchedProductId || "",
        urunId: item?.urunId || item?.matchedProductId || "",
        urunAdi: item?.urunAdi || item?.matchedProductName || "",
        ambalaj: item?.ambalaj || item?.productReference.packaging || "",
        lotNo: item?.lotNo || item?.lot || "",
        orijinalKalemMetni:
          item?.orijinalKalemMetni ||
          item?.rawDescription ||
          item?.description ||
          item?.aciklama ||
          "",
        modelAdayi: item?.modelAdayi || "",
        productReference: item?.productReference || null,
        productStatus:
          item?.productStatus ||
          (item?.matchedProductId || item?.matchedProductName
             ? "ESLESTI"
            : "ESLESMEDI"),
        matchWarning: item?.matchWarning || "",
        miktar: Number(item?.quantity ? item?.miktar ?? 0),
        birim:
          item?.unit ||
          item?.birim ||
          item?.productReference.defaultUnit ||
          "ADET",
        kg: Number(item?.quantity2 ? item?.kg ?? 0),
        birim2: item?.unit2 || item?.birim2 || "",
        birimFiyat: Number(item?.unitPrice ? item?.birimFiyat ?? 0),
        tutar: Number(item?.lineTotal ? item?.tutar ?? 0),
        kdvOrani: Number(item?.kdvRate ? item?.kdvOrani ?? 0),
        kdvTutari: Number(item?.kdvAmount ? item?.kdvTutari ?? 0),
        confidence: Number(item?.confidence ? item?.matchConfidence ?? 0),
        needsReview: Boolean(item?.needsReview),
      }),
    );
  }

  function mapCandidateRowToLine(row, index = 0) {
    const quantity = Number(row?.detectedNumbers?.[0] || 0);
    const unitPrice = Number(row?.detectedNumbers?.[1] || 0);
    const lineTotal = Number(
      row?.detectedNumbers?.[2] ||
        (quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0),
    );
    return buildLine({
      id: String(row?.id || uid("itm") || `cand_${index + 1}`),
      aciklama: row?.rawText || "",
      rawDescription: row?.rawText || "",
      hamKalemMetni: row?.rawText || "",
      firmaId: draft.selectedCompanyId || draft.matchedCompanyId || "",
      firmaAdi:
        draft.selectedCompanyName ||
        draft.matchedCompanyName ||
        draft.firma ||
        "",
      orijinalKalemMetni: row?.rawText || "",
      miktar: quantity,
      birim: row?.detectedUnit || "ADET",
      birimFiyat: unitPrice,
      tutar: lineTotal,
      eslesmeTipi: "KULLANICI_ONAYI",
      firmaEslesmeTipi: draft.firmaEslesmeTipi || "",
      urunEslesmeTipi: "KULLANICI_ONAYI",
      kaynak: "manuel",
      productStatus: "ESLESME_BEKLIYOR",
      matchWarning: "Satır kaleme alındı, ürün eşleşmesi bekleniyor",
      confidence: Number(row?.score || 0.6),
      needsReview: true,
    });
  }
  function updateItem(itemId, patch) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item?.id !== itemId) return item;
        return normalizeLineItem(
          typeof patch === "function" ? patch(item) : { ...item, ...patch },
        );
      }),
    }));
  }

  function findProductById(productId) {
    return products.find((item) => String(item?.id) === String(productId));
  }

  function selectMatchedProduct(itemId, productId) {
    const product = findProductById(productId);
    updateItem(itemId, (item) => {
      if (!product) {
        return {
          ...item,
          matchedProductId: "",
          matchedProductName: "",
          matchedProductCode: "",
          matchConfidence: 0,
          eslesmeTipi: "KULLANICI_ONAYI",
          urunEslesmeTipi: "KULLANICI_ONAYI",
          eslesenUrunId: "",
          productReference: null,
          productStatus: "ESLESMEDI",
          matchWarning: "Kayıtlı ürün eşleşmesi bulunamadı",
          kaynak: item?.kaynak || "manuel",
        };
      }

      return {
        ...item,
        matchedProductId: product.id,
        matchedProductName: product.urunAdi || product.ticariAdi || "",
        matchedProductCode:
          product.productCode || product.urunKodu || product.stokKodu || "",
        matchConfidence: 1,
        eslesmeTipi: "KULLANICI_ONAYI",
        urunEslesmeTipi: "KULLANICI_ONAYI",
        eslesenUrunId: product.id,
        productReference: {
          productId: product.id,
          productName: product.urunAdi || product.ticariAdi || "",
          productCode:
            product.productCode || product.urunKodu || product.stokKodu || "",
          defaultUnit: product.birim || "",
          stockInfo:
            product.stok ?? product.stokMiktari ?? product.envanter ?? null,
          referencePrice:
            product.fiyat ?? product.defaultPrice ?? product.alisFiyati ?? null,
        },
        urunId: product.id,
        urunAdi: product.urunAdi || product.ticariAdi || "",
        productStatus: "ESLESTI",
        matchWarning: "",
        kaynak: "manuel",
        birim: item?.birim || product.birim || "ADET",
        ambalaj: item?.ambalaj || product.varsayilanAmbalaj || "",
      };
    });
  }

  async function resolveProductMatchForItem(itemId) {
    const item = draft.items.find((x) => x.id === itemId);
    const rawName = String(item?.aciklama || item?.rawDescription || "").trim();
    if (!rawName) {
      setMessage("Ürün eşleştirmek için önce kalem açıklaması girin.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await apiGet(
        `/muhasebe/product-matchname=${encodeURIComponent(rawName)}`,
        activeMainCompany,
      );
      if (!result?.matchedProductId) {
        updateItem(itemId, {
          eslesmeTipi: "KULLANICI_ONAYI",
          urunEslesmeTipi: "KULLANICI_ONAYI",
          productStatus: "ESLESMEDI",
          matchWarning: "Admin/ürün eşleşmesi bulunamadı",
          kaynak: "manuel",
        });
        setMessage(
          "Ürün eşleşmesi bulunamadı. Mevcut ürünü seçin veya yeni ürün oluşturun.",
        );
        return;
      }
      selectMatchedProduct(itemId, result?.matchedProductId);
      updateItem(itemId, {
        eslesmeTipi: result?.matchType || "ADMIN_ESLEME",
        urunEslesmeTipi: result?.matchType || "ADMIN_ESLEME",
        kaynak:
          (result.matchType || "").toUpperCase() === "ADMIN_ESLEME"
             ? "admin_esleme"
            : "parse",
      });
      setMessage("Ürün eşleşmesi uygulandı.");
    } catch (e) {
      setMessage(e.message || "Ürün eşleştirme yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createProductFromItem(item) {
    const urunAdi = String(item?.aciklama || item?.rawDescription || "").trim();
    if (!urunAdi) {
      setMessage("Yeni ürün oluşturmak için kalem açıklaması zorunludur.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiPost(
        "/muhasebe/urunler",
        {
          urunAdi,
          ticariAdi: urunAdi,
          birim: item?.birim || "ADET",
          varsayilanAmbalaj: item?.ambalaj || "",
          not: "Belge kaleminden oluşturuldu",
          aktif: true,
        },
        activeMainCompany,
      );
      await loadProducts();
      selectMatchedProduct(item?.id, created.id || "");
      updateItem(item?.id, {
        eslesmeTipi: "KULLANICI_ONAYI",
        urunEslesmeTipi: "KULLANICI_ONAYI",
        kaynak: "manuel",
      });
      setMessage("Yeni ürün oluşturuldu ve kaleme bağlandı.");
    } catch (e) {
      setMessage(e.message || "Yeni ürün oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createAliasForItem(item) {
    if (!item?.aciklama || !item?.matchedProductId) {
      setMessage(
        "Alias oluşturmak için satır açıklaması ve seçili ürün gerekir.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiPost(
        "/muhasebe/product-aliases",
        {
          rawName: item?.aciklama,
          matchedProductId: item?.matchedProductId,
          matchedProductName: item?.matchedProductName,
          matchedProductCode: item?.matchedProductCode,
          sourceType: "BELGE_ONAY_PANELI",
        },
        activeMainCompany,
      );
      setMessage("Ürün alias kaydedildi.");
    } catch (e) {
      setMessage(e.message || "Alias oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  function hasVatInItems(items) {
    if (!Array.isArray(items)) return false;
    return items.some((item) => {
      const rate = Number(item?.kdvOrani ?? item?.kdvRate ?? 0);
      const amount = Number(item?.kdvTutari ?? item?.kdvAmount ?? 0);
      return rate > 0 || amount > 0;
    });
  }

  function applyCompanyDefaults(prev, company) {
    if (!company) return prev;

    const defaultRecordType =
      company.varsayilanRecordType === "GAYRI_RESMI" ? "GAYRI_RESMI" : "RESMI";
    const defaultVatRate = Number(company?.varsayilanVatRate ?? 0);
    const defaultVatMode =
      company.varsayilanVatMode === "DAHIL" ? "DAHIL" : "HARIC";
    const vatApplicable = company?.vatApplicable !== false;
    const hasHeaderVat = Number(prev?.kdv || 0) > 0;
    const hasItemsVat = hasVatInItems(prev?.items);
    const subtotal = Number(prev?.subtotal || 0);

    let nextKdv = Number(prev?.kdv || 0);
    let nextGrandTotal = Number(prev?.grandTotal || 0);

    // Parser veya kullanıcı KDV girmişse onu koru; sadece boşsa varsayılan öner.
    if (!hasHeaderVat && !hasItemsVat) {
      if (vatApplicable && defaultVatRate > 0 && subtotal > 0) {
        nextKdv = Number(((subtotal * defaultVatRate) / 100).toFixed(2));
        if (!nextGrandTotal) {
          nextGrandTotal =
            defaultVatMode === "DAHIL"
               ? subtotal
              : Number((subtotal + nextKdv).toFixed(2));
        }
      } else if (!vatApplicable) {
        nextKdv = 0;
      }
    }

    return {
      ...prev,
      resmiDurum: defaultRecordType,
      kdv: nextKdv,
      grandTotal: nextGrandTotal,
    };
  }

  async function resolveCompanyMatch(name) {
    const rawName = String(
      name || draft.rawDetectedCompanyName || draft.firma || "",
    ).trim();
    if (!rawName) {
      setMessage("Firma eşleştirmek için unvan bilgisi girin.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await apiGet(
        `/muhasebe/company-matchname=${encodeURIComponent(rawName)}`,
        activeMainCompany,
      );
      setDraft((prev) => {
        const detectedName = prev?.rawDetectedCompanyName || rawName;
        const selectedCompany =
          companies.find(
            (item) =>
              String(item.id) === String(result?.matchedCompanyId || ""),
          ) || null;
        const next = {
          ...prev,
          firma: result?.matchedCompanyName || prev?.firma || rawName,
          selectedCompanyId: result?.matchedCompanyId || "",
          selectedCompanyName: result?.matchedCompanyName || "",
          selectedCompanyType: result?.matchType || "",
          rawParsedCompanyName: detectedName,
          rawDetectedCompanyName: detectedName,
          matchedCompanyId: result?.matchedCompanyId || "",
          matchedCompanyName: result?.matchedCompanyName || "",
          firmaEslesmeTipi: result?.matchType || "KULLANICI_ONAYI",
        };
        return applyCompanyDefaults(next, selectedCompany);
      });
      if (result?.matchedCompanyName) {
        onCompanySelect(result?.matchedCompanyName);
        setMessage("Firma eşleşmesi uygulandı.");
      } else {
        setMessage(
          "Firma eşleşmesi bulunamadı. Kayıtlı firmayı manuel seçebilirsiniz.",
        );
      }
    } catch (e) {
      setMessage(e.message || "Firma eşleştirme yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function syncCompanyDraft(name) {
    // Try best-effort matching: exact > starts-with > contains > partial
    const selected = findBestCompanyMatch(companies, name);

    setDraft((prev) => {
      // Keep the detected name from PDF/source as-is (for display/reference)
      const detectedName = prev?.rawDetectedCompanyName || name;

      // If we found a match, use registered company; otherwise keep as-is
      const registeredCompanyName = selected.firma || "";
      const matchedCompanyId = selected.id || "";

      const next = {
        ...prev,
        // Form field: firma = selected registered company, or user input
        firma: registeredCompanyName || name,
        selectedCompanyId: matchedCompanyId,
        selectedCompanyName: registeredCompanyName,
        selectedCompanyType: selected ? "BIREBIR" : "KULLANICI_ONAYI",
        // Company card ID from registered list
        matchedCompanyId: matchedCompanyId,
        // Registered company name
        matchedCompanyName: registeredCompanyName,
        firmaEslesmeTipi: selected ? "BIREBIR" : "KULLANICI_ONAYI",
        // Preserve detected/parsed company name from PDF (for info/review)
        rawParsedCompanyName: detectedName,
        rawDetectedCompanyName: detectedName,
      };
      return applyCompanyDefaults(next, selected);
    });
    onCompanySelect(selected.firma || name);
  }

  function applyModelKaydiToDraft(modelKaydiId) {
    const selected = modelKayitlari.find(
      (item) => String(item?.id) === String(modelKaydiId || ""),
    );
    if (!selected) {
      setDraft((prev) => ({
        ...prev,
        modelKaydiId: "",
      }));
      return;
    }
    setDraft((prev) => ({
      ...prev,
      modelKaydiId: selected.id,
      modelAdi: selected.modelAdi || "",
      musteriIrsaliyeNo: selected.musteriIrsaliyeNo || "",
      irsaliyeNo: selected.musteriIrsaliyeNo || "",
      documentNo:
        draftFlowMeta.belgeTipi === "irsaliye"
           ? prev?.documentNo || selected.musteriIrsaliyeNo || ""
          : prev?.documentNo,
      firma: selected.musteriFirma || selected.firma || prev?.firma,
      musteriFirma: selected.musteriFirma || selected.firma || "",
      zemin: selected.zemin || "",
      belgeAdediToplami:
        Number(prev?.belgeAdediToplami || 0) > 0
           ? prev?.belgeAdediToplami
          : selected.gelenAdet || 0,
      irsaliyeAdedi:
        draftFlowMeta.belgeTipi === "irsaliye"
           ? Number(prev?.irsaliyeAdedi || selected.gelenAdet || 0)
          : prev?.irsaliyeAdedi,
      faturalananAdet:
        draftFlowMeta.belgeTipi === "fatura"
           ? Number(prev?.faturalananAdet || 0)
          : prev?.faturalananAdet,
      matchedCompanyName: selected.musteriFirma || selected.firma || "",
      selectedCompanyId: selected.relatedCompanyId || "",
      selectedCompanyName: selected.musteriFirma || selected.firma || "",
      selectedCompanyType: prev?.firmaEslesmeTipi || "MODEL_BAGLANTI",
      rawParsedCompanyName:
        prev?.rawParsedCompanyName ||
        prev?.rawDetectedCompanyName ||
        selected.musteriFirma ||
        selected.firma ||
        "",
      rawDetectedCompanyName:
        prev?.rawDetectedCompanyName ||
        selected.musteriFirma ||
        selected.firma ||
        "",
      items:
        sectionKey === "bizim-belgeler"
           prev?.items.length
             prev.items.map((item, index) =>
                index === 0 && !String(item?.modelAdi || "").trim()
                   ? { ...item, modelAdi: selected.modelAdi || "" }
                  : item,
              ? )
            : [
                buildBizimBelgeLine({
                  modelAdi: selected.modelAdi || "",
                  miktar: Number(prev?.belgeAdediToplami || 0),
                  tutar: Number(prev?.subtotal || 0),
                  kdvTutari: Number(prev?.kdv || 0),
                }),
              ? ]
          : prev?.items,
    }));
    if (selected.musteriFirma || selected.firma) {
      onCompanySelect(selected.musteriFirma || selected.firma);
    }
  }

  function openModelQuickCreate(existingRow = null) {
    setModelQuickForm({
      id: String(existingRow.id || ""),
      firma: String(
        existingRow.musteriFirma ||
          existingRow.firma ||
          draft.firma ||
          draft.musteriFirma ||
          "",
      ).trim(),
      modelAdi: String(existingRow.modelAdi || draft.modelAdi || "").trim(),
      zemin: String(existingRow.zemin || draft.zemin || "").trim(),
      not: String(existingRow.not || draft.aciklama || "").trim(),
    });
    setShowModelQuickCreate(true);
  }

  function closeModelQuickCreate() {
    setShowModelQuickCreate(false);
  }

  async function saveQuickModelFromDialog() {
    const firma = String(modelQuickForm.firma || "").trim();
    const modelAdi = String(modelQuickForm.modelAdi || "").trim();
    const recordId = String(modelQuickForm.id || "").trim();
    if (!firma) {
      setMessage("Yeni model için firma zorunludur.");
      return;
    }
    if (!modelAdi) {
      setMessage("Yeni model için model adı zorunludur.");
      return;
    }
    const dispatchNo = String(
      draft.irsaliyeNo ||
        draft.musteriIrsaliyeNo ||
        draft.documentNo ||
        `MK-${Date.now()}`,
    ).trim();
    const quantity = Number(
      draft.belgeAdediToplami ||
        draft.irsaliyeAdedi ||
        draft.faturalananAdet ||
        0,
    );
    const zemin = String(modelQuickForm.zemin || "").trim();
    const note = String(modelQuickForm.not || "").trim();

    setModelCreateBusy(true);
    setMessage("");
    try {
      const row = await apiPost(
        "/models",
        {
          id: recordId || undefined,
          musteriFirma: firma,
          firma,
          firmaAdi: firma,
          modelAdi,
          musteriIrsaliyeNo: dispatchNo,
          musteriIrsaliyeleri: [
            {
              dispatchNo,
              date: draft.tarih,
              quantity,
              companyName: firma,
              zemin,
              sourceBelgeId: draft.documentId || "",
              note,
            },
          ],
          zemin,
          gelenAdet: quantity,
          tarih: draft.tarih,
          not: note,
          kaynak: "Muhasebe Hızlı Model",
          kaynakBelgeId: draft.documentId || "",
          gelenBelgeId: draft.documentId || "",
          gelenBelgePdf: draft.originalFileName || draft.pdfFileName || "",
        },
        activeMainCompany,
      );
      await loadModelKayitlari();
      if (row?.id) {
        applyModelKaydiToDraft(row?.id);
        setSelectedSecondaryId(String(row?.id));
      }
      setShowModelQuickCreate(false);
      setMessage(
        recordId
           ? "Model kaydı güncellendi ve forma bağlandı."
          : "Yeni model kaydı oluşturuldu ve forma bağlandı.",
      );
    } catch (e) {
      setMessage(e.message || "Yeni model kaydedilemedi.");
    } finally {
      setModelCreateBusy(false);
    }
  }

  function openProductQuickEditor(existingRow = null) {
    setProductQuickForm({
      id: String(existingRow.id || ""),
      urunAdi: String(
        existingRow.urunAdi || existingRow.ticariAdi || "",
      ).trim(),
      kategori: String(existingRow.kategori || "Genel"),
      birim: String(existingRow.birim || "ADET"),
      varsayilanAmbalaj: String(existingRow.varsayilanAmbalaj || "").trim(),
      not: String(existingRow.not || "").trim(),
      aktif: existingRow ? existingRow.aktif !== false : true,
    });
    setShowProductQuickEditor(true);
  }

  function closeProductQuickEditor() {
    setShowProductQuickEditor(false);
  }

  async function saveProductQuickEditor() {
    const urunAdi = String(productQuickForm.urunAdi || "").trim();
    if (!urunAdi) {
      setMessage("Ürün adı zorunludur.");
      return;
    }
    setProductQuickBusy(true);
    setMessage("");
    try {
      const saved = await apiPost(
        "/muhasebe/urunler",
        {
          id: productQuickForm.id || undefined,
          urunAdi,
          ticariAdi: urunAdi,
          kategori: productQuickForm.kategori || "Genel",
          birim: productQuickForm.birim || "ADET",
          varsayilanAmbalaj: productQuickForm.varsayilanAmbalaj || "",
          not: productQuickForm.not || "",
          aktif: productQuickForm.aktif !== false,
        },
        activeMainCompany,
      );
      await loadProducts();
      setSelectedSecondaryId(String(saved?.id || productQuickForm.id || ""));
      setShowProductQuickEditor(false);
      setMessage(
        productQuickForm.id
           ? "Ürün kaydı güncellendi."
          : "Yeni ürün kaydı oluşturuldu.",
      );
    } catch (e) {
      setMessage(e.message || "Ürün kaydı kaydedilemedi.");
    } finally {
      setProductQuickBusy(false);
    }
  }

  async function refreshPoolRows() {
    setBusy(true);
    setMessage("");
    try {
      await load();
      if (selectedHistoryId) {
        setMessage("Havuz kayıtları güncellendi.");
      } else {
        setMessage("Havuz listesi güncellendi.");
      }
    } catch (e) {
      setMessage(e.message || "Havuz güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedPoolRow() {
    if (!selectedPoolRow.documentId) {
      setMessage("Silinecek havuz kaydı seçin.");
      return;
    }
    await deleteHistoryRow(selectedPoolRow);
  }

  async function deleteSecondaryRow() {
    if (!selectedSecondaryRow.id) {
      setMessage(
        isTedarikciFaturaLayout
           ? "Silinecek ürün seçin."
          : "Silinecek model kaydını seçin.",
      );
      return;
    }

    const confirmed = window.confirm(
      isTedarikciFaturaLayout
         ? "Seçili ürün pasife alınsın mı"
        : "Seçili model kaydı silinsin mi",
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    try {
      if (isTedarikciFaturaLayout) {
        await apiPost(
          "/muhasebe/urunler",
          {
            ...selectedSecondaryRow,
            id: selectedSecondaryRow.id,
            aktif: false,
          },
          activeMainCompany,
        );
        await loadProducts();
        setSelectedSecondaryId("");
        setMessage("Ürün kaydı pasife alındı.");
      } else {
        await apiDelete(
          `/models/${encodeURIComponent(selectedSecondaryRow.id)}`,
          activeMainCompany,
        );
        await loadModelKayitlari();
        setDraft((prev) => {
          if (
            String(prev?.modelKaydiId || "") !== String(selectedSecondaryRow.id)
          ) {
            return prev;
          }
          return {
            ...prev,
            modelKaydiId: "",
            modelAdi: "",
          };
        });
        setSelectedSecondaryId("");
        setMessage("Model kaydı silindi.");
      }
    } catch (e) {
      setMessage(e.message || "Kayıt silinemedi.");
    } finally {
      setBusy(false);
    }
  }

  function updateCandidateRow(rowId, patch) {
    setDraft((prev) => ({
      ...prev,
      candidateRows: (prev.candidateRows || []).map((row) => {
        if (String(row?.id) !== String(rowId)) return row;
        return typeof patch === "function" ? patch(row) : { ...row, ...patch };
      }),
    }));
  }

  function parseCandidateText(rawText, currentRow = {}) {
    const line = String(rawText || "").trim();
    const numbers = Array.from(
      line?.matchAll(/-(:\d{1,3}(:[.,]\d{3})*|\d+)(:[.,]\d+)/g),
    ).map((match) => parseMoney(match[0]));
    const detectedUnit =
      /\b(KG|ADET|PAKET|KOLI|LT|LITRE|M|METRE|TOP)\b/i.exec(line)?.[1] || "";
    const rejectReason = line?.length < 3 ? "bos_satir" : "";
    return {
      ...currentRow,
      rawText: line,
      normalizedText: line?.toLocaleLowerCase("tr-TR"),
      detectedNumbers: numbers,
      detectedUnit,
      looksLikeItem: !rejectReason && numbers.length > 0,
      rejectReason,
      score: !rejectReason && numbers.length > 0 ? 0.72 : 0.35,
    };
  }

  function editCandidateRow(row) {
    const nextRaw = window.prompt(
      "Okunan satırı düzenleyin",
      row?.rawText || "",
    );
    if (nextRaw === null) return;
    updateCandidateRow(row?.id, parseCandidateText(nextRaw, row));
  }

  function removeCandidateRow(rowId) {
    setDraft((prev) => ({
      ...prev,
      candidateRows: (prev?.candidateRows || []).filter(
        (row) => String(row?.id) !== String(rowId),
      ),
    }));
  }

  function splitCandidateRow(row) {
    const rawText = String(row?.rawText || "");
    const parts = rawText
      .split(/\s*[;|/]\s*|\s{2,}/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (parts.length < 2) {
      setMessage("Bu satır bölünebilir bir ayraç içermiyor.");
      return;
    }
    setDraft((prev) => {
      const nextRows = [];
      for (const current of prev?.candidateRows || []) {
        if (String(current?.id) !== String(row?.id)) {
          nextRows.push(current);
          continue;
        }
        parts.forEach((part, index) => {
          nextRows.push(
            parseCandidateText(part, {
              ...current,
              id: `${current?.id}_${index + 1}_${uid("part")}`,
            }),
          );
        });
      }
      return { ...prev, candidateRows: nextRows };
    });
  }

  function mergeCandidateRowWithNext(rowId) {
    setDraft((prev) => {
      const rowsCurrent = Array.isArray(prev?.candidateRows)
         ? prev?.candidateRows
        : [];
      const index = rowsCurrent.findIndex(
        (row) => String(row?.id) === String(rowId),
      );
      if (index < 0 || index >= rowsCurrent.length - 1) {
        return prev;
      }
      const current = rowsCurrent[index];
      const next = rowsCurrent[index + 1];
      const merged = parseCandidateText(
        `${String(current?.rawText || "").trim()} ${String(next.rawText || "").trim()}`,
        {
          ...current,
          id: `${current?.id}_merged_${uid("cand")}`,
        },
      );
      const nextRows = [...rowsCurrent];
      nextRows.splice(index, 2, merged);
      return { ...prev, candidateRows: nextRows };
    });
  }

  function quickEditLineItem(item) {
    const nextDescription = window.prompt(
      "Kalem açıklamasını düzenleyin",
      item?.aciklama || item?.rawDescription || "",
    );
    if (nextDescription === null) return;
    updateItem(item?.id, {
      aciklama: nextDescription,
      rawDescription: nextDescription,
    });
  }

  async function createModelKaydiFromDraft() {
    if (!String(draft.modelAdi || "").trim()) {
      setMessage("Model kaydı açmak için model adı zorunludur.");
      return;
    }
    if (!String(draft.irsaliyeNo || "").trim()) {
      setMessage("Model kaydı açmak için müşteri irsaliye no zorunludur.");
      return;
    }
    if (!String(draft.firma || draft.musteriFirma || "").trim()) {
      setMessage("Model kaydı açmak için müşteri firma zorunludur.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const existingModel =
        modelKayitlari.find((item) => {
          const sameModel =
            String(item?.modelAdi || "")
              .trim()
              .toLocaleLowerCase("tr-TR") ===
            String(draft.modelAdi || "")
              .trim()
              .toLocaleLowerCase("tr-TR");
          const sameFirma =
            String(item?.musteriFirma || item?.firma || "")
              .trim()
              .toLocaleLowerCase("tr-TR") ===
            String(draft.firma || draft.musteriFirma || "")
              .trim()
              .toLocaleLowerCase("tr-TR");
          return sameModel && sameFirma;
        }) || null;

      let useExistingModel = false;
      if (existingModel.id) {
        useExistingModel = window.confirm(
          "Bu müşteri ve model için mevcut bir ana model kaydı var. EVET: mevcut modele bağla, HAYIR: yeni model aç.",
        );
      }

      const row = await apiPost(
        "/models",
        {
          id: useExistingModel ? existingModel.id || "" : "",
          forceNewModel: existingModel.id ? !useExistingModel : false,
          musteriFirma: draft.firma || draft.musteriFirma || "",
          firma: draft.firma || draft.musteriFirma || "",
          firmaAdi: draft.firma || draft.musteriFirma || "",
          modelAdi: draft.modelAdi,
          musteriIrsaliyeNo: draft.irsaliyeNo,
          musteriIrsaliyeleri: [
            {
              dispatchNo: draft.irsaliyeNo,
              date: draft.tarih,
              quantity: Number(
                draft.belgeAdediToplami ||
                  draft.irsaliyeAdedi ||
                  draft.faturalananAdet ||
                  0,
              ),
              companyName: draft.firma || draft.musteriFirma || "",
              zemin: draft.zemin || "",
              piyonNo: draft.piyonNo || "",
              kesimhaneAdi: draft.kesimhaneBilgisi || "",
              sourceBelgeId: draft.documentId || "",
              note: draft.aciklama || "",
            },
          ],
          zemin: draft.zemin || "",
          kesimhaneBilgisi: draft.kesimhaneBilgisi || "",
          gelenAdet: Number(
            draft.belgeAdediToplami ||
              draft.irsaliyeAdedi ||
              draft.faturalananAdet ||
              0,
          ),
          tarih: draft.tarih,
          not: draft.aciklama || "",
          kaynak: "Muhasebe Gelen İrsaliye",
          kaynakBelgeId: draft.documentId || "",
          gelenBelgeId: draft.documentId || "",
          gelenBelgePdf: draft.originalFileName || draft.pdfFileName || "",
        },
        activeMainCompany,
      );
      await loadModelKayitlari();
      if (row?.id) {
        applyModelKaydiToDraft(row?.id);
      }
      setMessage(
        useExistingModel
           ? "Gelen irsaliye mevcut model kaydına bağlandı."
          : "Gelen irsaliyeden model ana kaydı açıldı.",
      );
    } catch (e) {
      setMessage(e.message || "Model kaydı açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function addLine() {
    setDraft((prev) => ({
      ...prev,
      items: [...prev?.items, buildLine()],
    }));
  }

  function addCandidateToItems(row) {
    const quantity = Number(row?.detectedNumbers?.[0] || 0);
    const unitPrice = Number(row?.detectedNumbers?.[1] || 0);
    const lineTotal = Number(
      row?.detectedNumbers?.[2] || quantity * unitPrice || 0,
    );
    setDraft((prev) => ({
      ...prev,
      items: [
        ...prev?.items,
        buildLine({
          aciklama: row?.rawText || "",
          rawDescription: row?.rawText || "",
          miktar: quantity,
          birim: row?.detectedUnit || "ADET",
          birimFiyat: unitPrice,
          tutar: lineTotal,
        }),
      ],
      candidateRows: prev.candidateRows.filter((item) => item?.id !== row?.id),
    }));
  }

  function removeLine(itemId) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item?.id !== itemId),
    }));
  }

  function isUploadFileAccepted(file) {
    if (!file) return false;
    const mime = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    const extOk = /\?.(pdf|jpg|jpeg|png)$/.test(name);
    const mimeOk = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ].includes(mime);
    return mimeOk || extOk;
  }

  function selectUploadFile(file) {
    if (!file) {
      setSelectedFile(null);
      setSelectedFiles([]);
      return;
    }
    if (!isUploadFileAccepted(file)) {
      setMessage("Desteklenmeyen dosya türü. PDF/JPG/JPEG/PNG yükleyin.");
      return;
    }
    setSelectedFile(file);
    setSelectedFiles([file]);
    setMessage("");
  }

  function selectUploadFiles(files) {
    const acceptedFiles = Array.from(files || []).filter(Boolean);
    if (!acceptedFiles.length) {
      setSelectedFile(null);
      setSelectedFiles([]);
      return;
    }
    const rejected = acceptedFiles.filter(
      (file) => !isUploadFileAccepted(file),
    );
    if (rejected.length) {
      setMessage("Desteklenmeyen dosya türü var. PDF/JPG/JPEG/PNG yükleyin.");
      return;
    }
    setSelectedFiles(acceptedFiles);
    setSelectedFile(acceptedFiles[0] || null);
    setMessage("");
  }

  function resetDraftState() {
    setSelectedHistoryId("");
    setSelectedFile(null);
    setSelectedFiles([]);
    setDraft(emptyDraft(sectionKey));
    setMessage("");
  }

  async function deleteHistoryRow(doc) {
    if (!doc.documentId) {
      setMessage("Silinecek belge bulunamadı.");
      return;
    }

    const isApproved = String(doc.status || "") === "ONAYLANDI";
    const hasLinkedRecords =
      Boolean(doc.bagliKayitVar) ||
      Boolean(doc.modelKaydiId) ||
      Number(doc.ayniModeleBagliBelgeSayisi || 0) > 0;
    const confirmed = window.confirm(
      isApproved
         ? "Bu belge onaylı kayıttır. Silersen bağlı kayıtlar etkilenebilir. Devam edilsin mi"
        : hasLinkedRecords
           ? "Bu taslak bağlı kayıt içerebilir. Yine de silinsin mi"
          : "Bu taslak silinsin mi",
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await apiDelete(
        `/muhasebe/belgeler/${encodeURIComponent(doc.documentId)}`,
        activeMainCompany,
      );
      await load();
      await loadModelKayitlari();
      if (String(draft.documentId || "") === String(doc.documentId || "")) {
        resetDraftState();
      }
      setMessage(response.message || "Belge silindi.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  function classifyBizimBelgeFile(file) {
    const name = String(file?.name || "").toLocaleUpperCase("tr-TR");
    const invoicePrefix = String(
      documentPathSettings.faturaDosyaPrefix || "HKN",
    ).toLocaleUpperCase("tr-TR");
    const dispatchPrefix = String(
      documentPathSettings.irsaliyeDosyaPrefix || "DDM",
    ).toLocaleUpperCase("tr-TR");
    if (invoicePrefix && name.startsWith(invoicePrefix)) {
      return {
        kind: "fatura",
        flowType: "GIDEN_FATURA",
        documentClass: "FATURA",
      };
    }
    if (dispatchPrefix && name.startsWith(dispatchPrefix)) {
      return {
        kind: "irsaliye",
        flowType: "GIDEN_IRSALIYE",
        documentClass: "IRSALIYE",
        storeOnly: true,
      };
    }
    return {
      kind: "belge",
      flowType: draft.flowType || draft.workflowType,
      documentClass: draft.documentClass,
    };
  }

  function buildDocumentIntakeFormData(file, overrides = {}) {
    const fileModelName = extractModelNameFromDocumentFileName(
      file?.name || "",
    );
    const formData = new FormData();
    formData.append("sectionKey", sectionKey);
    formData.append(
      "workflowType",
      overrides.workflowType || draft.workflowType || "",
    );
    formData.append(
      "flowType",
      normalizeFlowType(
        overrides.flowType || draft.flowType || draft.workflowType,
      ) || "",
    );
    formData.append(
      "documentClass",
      overrides.documentClass || draft.documentClass || "",
    );
    formData.append("file", file);
    formData.append("firma", draft.firma || activeCompany || "");
    formData.append(
      "modelAdi",
      overrides.modelAdi || draft.modelAdi || fileModelName || "",
    );
    formData.append("modelKaydiId", draft.modelKaydiId || "");
    if (overrides.storeOnly) formData.append("storeOnly", "true");
    return formData;
  }

  async function uploadIntakeFile(file, overrides = {}) {
    return apiUploadForm(
      "/muhasebe/documents/intake",
      buildDocumentIntakeFormData(file, overrides),
      activeMainCompany,
    );
  }

  async function intakeDocument() {
    const filesToUpload = selectedFiles.length
       ? selectedFiles
      : selectedFile
         ? [selectedFile]
        : [];
    if (!filesToUpload.length) {
      setMessage("Önce bir PDF veya görsel seçin.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (filesToUpload.length > 1) {
        let invoiceCount = 0;
        let dispatchCount = 0;
        const failed = [];
        for (const file of filesToUpload) {
          try {
            const fileMeta = isBizimBelgelerLayout
               ? classifyBizimBelgeFile(file)
              : {};
            await uploadIntakeFile(file, fileMeta);
            if (fileMeta.kind === "irsaliye") {
              dispatchCount += 1;
            } else {
              invoiceCount += 1;
            }
          } catch (e) {
            failed.push(`${file?.name}: ${e.message}`);
          }
        }
        await load();
        setSelectedFile(null);
        setSelectedFiles([]);
        setMessage(
          failed.length
             ? `${invoiceCount} fatura havuza alındı, ${dispatchCount} irsaliye klasöre kaydedildi. Hatalı: ${failed.join(" | ")}`
            : `${invoiceCount} fatura havuza alındı, ${dispatchCount} irsaliye ilgili klasöre kaydedildi.`,
        );
        return;
      }

      const uploadFile = filesToUpload[0];
      const fileMeta = isBizimBelgelerLayout
         ? classifyBizimBelgeFile(uploadFile)
        : {};
      const result = await uploadIntakeFile(uploadFile, fileMeta);
      if (result?.storeOnly) {
        await load();
        setSelectedFile(null);
        setSelectedFiles([]);
        setMessage(
          `${uploadFile.name} irsaliye klasörüne kaydedildi. Havuza fatura kaydı açılmadı.`,
        );
        return;
      }
      const resolvedFlowType =
        normalizeFlowType(
          result?.flowType || result?.workflowType || draft.workflowType,
        ) || normalizeFlowType(draft.workflowType);
      const meta = flowTypeMeta(resolvedFlowType);
      const fileModelName = extractModelNameFromDocumentFileName(
        uploadFile.name,
        result?.header.faturaNo || result?.header.documentNo || result?.faturaNo,
      );
      const parsedFromResult = Array.isArray(result?.parsedItems)
         ? result?.parsedItems
        : Array.isArray(result?.items)
           ? result?.items
          : [];
      const parsedOutgoingQuantity = Number(
        parsedFromResult
          .reduce(
            (sum, item) =>
              sum + Number(item?.quantity || item?.miktar || item?.adet || 0),
            0,
          )
          .toFixed(3),
      );
      const candidatesFromResult = Array.isArray(result?.candidateRows)
         ? result?.candidateRows
        : [];
      const candidateBasedItems = candidatesFromResult
        .filter((row) => row && row?.looksLikeItem && !row?.rejectReason)
        .map((row, index) => mapCandidateRowToLine(row, index));
      const parsedCompanyName = String(
        result?.matchedCompanyName ||
          result?.parsedCompanyName ||
          result?.rawDetectedCompanyName ||
          result?.header.parsedCompanyName ||
          result?.header.companyName ||
          "",
      ).trim();
      const incomingDispatchMode =
        String(result.mode || "").toLowerCase() === "gelen_irsaliye_sade_mod" ||
        (meta.belgeYonu === "gelen" && meta.belgeTipi === "irsaliye");
      const outgoingSimpleDocumentMode =
        isBizimBelgelerLayout || meta.belgeYonu === "giden";
      const outgoingModelLines = parsedFromResult.length
         parsedFromResult.map((item, index) =>
            mapParsedItemToBizimLine(
              item,
              index,
              parsedFromResult.length === 1 ? fileModelName : "",
            ),
          ? )
        : fileModelName
           [
              buildBizimBelgeLine({
                modelAdi: fileModelName,
                miktar: Number(
                  result?.header.belgeAdediToplami ||
                    result?.header.faturalananAdet ||
                    0,
                ),
                tutar: Number(result?.header.subtotal || 0),
                kdvTutari: Number(result?.header.kdv || 0),
                aciklama: fileModelName,
              }),
            ? ]
          : [];
      const parsedIncomingAdet = Number(
        result?.gelenAdet ||
          result?.header.gelenAdet ||
          result?.header.belgeAdediToplami ||
          result?.header.irsaliyeAdedi ||
          0,
      );
      const parsedDispatchSummaryReady = Boolean(
        result.parseStatus === "TAM_BASARILI" ||
        result.parseStatus === "KISMI_BASARILI" ||
        result?.irsaliyeNo ||
        result?.dispatchNo ||
        result?.header.irsaliyeNo ||
        result?.header.dispatchNo ||
        result?.gelenAdet ||
        result?.header.gelenAdet ||
        result?.header.belgeAdediToplami ||
        result?.aciklamaSuggestion ||
        result?.header.hamAciklama ||
        result?.header.aciklama,
      );
      setDraft((prev) => {
        const lockedCompanyName = String(prev?.matchedCompanyName || "").trim();
        const hasParsedCompany = Boolean(parsedCompanyName);
        const keepUserCompany = Boolean(
          !hasParsedCompany &&
          (prev?.matchedCompanyId || prev?.matchedCompanyName),
        );
        const parsedDateValue = normalizeDateForInput(
          result?.belgeTarihi ||
            result?.header.belgeTarihi ||
            result?.header.date ||
            result?.header.dispatchDate ||
            result?.header.irsaliyeTarihi,
        );
        return {
          ...prev,
          documentId: result?.documentId || prev?.documentId,
          documentClass: result?.documentClass || prev?.documentClass,
          workflowType: resolvedFlowType || prev?.workflowType,
          flowType: resolvedFlowType || prev?.flowType,
          belgeYonu:
            result?.header.belgeYonu || meta.belgeYonu || prev?.belgeYonu,
          belgeTipi:
            result?.header.belgeTipi || meta.belgeTipi || prev?.belgeTipi,
          documentNo: result?.header.documentNo || prev?.documentNo,
          faturaNo:
            result?.header.faturaNo ||
            (meta.belgeTipi === "fatura"
               ? result?.header.documentNo || prev?.faturaNo
              : prev?.faturaNo),
          irsaliyeNo:
            result?.dispatchNo ||
            result?.irsaliyeNo ||
            result?.header.irsaliyeNo ||
            result?.header.dispatchNo ||
            prev?.irsaliyeNo,
          modelAdi: incomingDispatchMode
             ? prev?.modelAdi
            : outgoingSimpleDocumentMode
               fileModelName ||
                prev?.modelAdi ||
                outgoingModelLines[0].modelAdi ||
                ? ""
              : prev?.modelAdi ||
                result?.header.modelAdi ||
                result?.header.modelLineSuggestion ||
                prev?.modelAdi,
          zemin:
            prev?.zemin ||
            result?.zeminSuggestion ||
            result?.header.zemin ||
            result?.header.zeminSuggestion ||
            "",
          aciklama:
            result?.aciklamaSuggestion ||
            result?.header.hamAciklama ||
            result?.header.belgeHamKod ||
            result?.header.aciklama ||
            prev?.aciklama,
          tarih: parsedDateValue || prev?.tarih,
          firma: keepUserCompany
             ? lockedCompanyName
            : parsedCompanyName || prev?.firma,
          rawParsedCompanyName:
            result?.rawDetectedCompanyName || result?.header.companyName || "",
          rawDetectedCompanyName:
            result?.rawDetectedCompanyName || result?.header.companyName || "",
          selectedCompanyId:
            keepUserCompany && prev?.selectedCompanyId
               ? prev?.selectedCompanyId
              : result?.matchedCompanyId || "",
          selectedCompanyName:
            keepUserCompany && prev?.selectedCompanyName
               ? prev?.selectedCompanyName
              : result?.matchedCompanyName || "",
          selectedCompanyType:
            keepUserCompany && prev?.selectedCompanyType
               ? prev?.selectedCompanyType
              : result?.firmaEslesmeTipi || "",
          matchedCompanyId:
            keepUserCompany && prev?.matchedCompanyId
               ? prev?.matchedCompanyId
              : result?.matchedCompanyId || "",
          matchedCompanyName:
            keepUserCompany && prev?.matchedCompanyName
               ? prev?.matchedCompanyName
              : result?.matchedCompanyName || "",
          firmaEslesmeTipi:
            keepUserCompany && prev?.firmaEslesmeTipi
               ? prev?.firmaEslesmeTipi
              : result?.firmaEslesmeTipi || "",
          pdfFileName: result?.fileName || uploadFile.name,
          originalFileName:
            result?.originalFileName || result?.fileName || uploadFile.name,
          fileType: result?.fileType || "",
          intakeMethod: result?.intakeMethod || "",
          previewUrl: result?.previewUrl || "",
          parseMode: result?.mode || "",
          detectedProfile: result?.detectedProfile || "",
          subtotal: Number(result?.header.subtotal || prev?.subtotal || 0),
          kdv: Number(result?.header.kdv || prev?.kdv || 0),
          grandTotal: Number(result?.header.grandTotal || prev?.grandTotal || 0),
          belgeAdediToplami:
            incomingDispatchMode && parsedIncomingAdet > 0
               ? parsedIncomingAdet
              : outgoingSimpleDocumentMode && parsedOutgoingQuantity > 0
                 ? parsedOutgoingQuantity
                : prev?.belgeAdediToplami,
          faturalananAdet:
            outgoingSimpleDocumentMode &&
            meta.belgeTipi === "fatura" &&
            parsedOutgoingQuantity > 0
               ? parsedOutgoingQuantity
              : prev?.faturalananAdet,
          irsaliyeAdedi:
            incomingDispatchMode && parsedIncomingAdet > 0
               ? parsedIncomingAdet
              : outgoingSimpleDocumentMode &&
                  meta.belgeTipi === "irsaliye" &&
                  parsedOutgoingQuantity > 0
                 ? parsedOutgoingQuantity
                : prev?.irsaliyeAdedi,
          parsedItems: outgoingSimpleDocumentMode
             ? outgoingModelLines
            : parsedFromResult,
          items: incomingDispatchMode
             ? prev?.items
            : outgoingSimpleDocumentMode
               outgoingModelLines.length
                 ? outgoingModelLines
                ? : prev?.items
              : parsedFromResult.length > 0
                 ? parsedFromResult.map(mapParsedItemToLine)
                : candidateBasedItems.length > 0
                   ? candidateBasedItems
                  : prev?.items,
          candidateRows:
            incomingDispatchMode || outgoingSimpleDocumentMode
               ? []
              : candidatesFromResult,
          warnings: Array.isArray(result?.warnings) ? result?.warnings : [],
          metrics: {
            ...(result?.metrics || {}),
            flowType: resolvedFlowType || "",
          },
          needsReview: outgoingSimpleDocumentMode
             ? false
            : Boolean(result?.needsReview),
        };
      });
      if (outgoingSimpleDocumentMode) {
        const summaryParts = [
          parsedCompanyName,
          result?.header.faturaNo || result?.faturaNo,
          result?.irsaliyeNo ||
            result?.dispatchNo ||
            result?.header.irsaliyeNo ||
            result?.header.dispatchNo,
          parsedOutgoingQuantity > 0 ? `${parsedOutgoingQuantity} adet` : "",
          Number(result?.header.subtotal || 0) > 0
             ? `Ara toplam ${formatMoney(result?.header.subtotal || 0)}`
            : "",
          Number(result?.header.kdv || 0) > 0
             ? `KDV ${formatMoney(result?.header.kdv || 0)}`
            : "",
        ].filter(Boolean);
        setMessage(
          summaryParts.length
             ? `PDF okundu: ${summaryParts.join(" | ")}. Model kaydına bağlayıp kaydedebilirsiniz.`
            : "PDF okundu. Firma, adet, tutar, KDV ve model kaydını kontrol edip kaydedebilirsiniz.",
        );
      } else if (incomingDispatchMode && parsedDispatchSummaryReady) {
        const summaryParts = [
          parsedCompanyName,
          result?.irsaliyeNo ||
            result?.dispatchNo ||
            result?.header.irsaliyeNo ||
            result?.header.dispatchNo,
          parsedIncomingAdet > 0 ? `${parsedIncomingAdet} adet` : "",
          result?.aciklamaSuggestion ||
            result?.header.hamAciklama ||
            result?.header.aciklama,
        ].filter(Boolean);
        setMessage(
          summaryParts.length
             ? `PDF okundu: ${summaryParts.join(" | ")}`
            : "PDF okundu. Alanları kontrol edip kaydedebilirsiniz.",
        );
      } else if (!parsedFromResult.length && !candidatesFromResult.length) {
        setMessage(
          "Belge önizlemesi hazır ancak parse sonucu boş döndü. Dosya metni okunamadı veya format destek dışı olabilir; alanları manuel kontrol edin.",
        );
      } else if (
        parsedCompanyName &&
        !String(result?.matchedCompanyId || "").trim()
      ) {
        setMessage(
          `PDF'den firma adı okundu: ${parsedCompanyName}. Firma kartı bulunamadı; isterseniz Firma Kartları'ndan ekleyebilirsiniz.`,
        );
      } else if (!parsedFromResult.length && candidatesFromResult.length) {
        setMessage(
          "Belge taslağa alındı. Kalemler candidate modunda yakalandı; kontrol edip kalemlere dönüştürerek devam edin.",
        );
      } else {
        setMessage(
          "Belge taslağa alındı. Okunan alanları kontrol edip ardından kaydedebilirsiniz.",
        );
      }
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(status = "TASLAK", options = {}) {
    if (!draft.firma.trim()) {
      setMessage("Belgeyi kaydetmek için firma seçin.");
      return;
    }
    const directCariSave = Boolean(options.directCariSave);
    const normalizedSubtotal = parseMoney(draft.subtotal);
    const normalizedKdv = parseMoney(draft.kdv);
    const normalizedGrandTotal = parseMoney(draft.grandTotal);
    const flowType = normalizeFlowType(draft.flowType || draft.workflowType);
    const meta = flowTypeMeta(flowType);
    const isIncomingDispatchFlow =
      meta.belgeYonu === "gelen" && meta.belgeTipi === "irsaliye";
    const isOutgoingSimpleDocumentFlow =
      sectionKey === "bizim-belgeler" || meta.belgeYonu === "giden";
    const hasOutgoingModelLines = (draft.items || []).some((item) =>
      String(item?.modelAdi || item?.aciklama || "").trim(),
    );
    const modelRequired =
      sectionKey !== "bizim-belgeler" &&
      meta.belgeYonu === "giden" &&
      (meta.belgeTipi === "irsaliye" || meta.belgeTipi === "fatura");
    const isDirectNonOfficialSupplierDraft =
      isTedarikciFaturaLayout &&
      String(draft.resmiDurum || "").trim() === "GAYRI_RESMI" &&
      String(draft.sourceType || "").trim() === "MANUEL_DIREKT_CARI";
    const isDirectNonOfficialSupplierSave =
      (directCariSave || isDirectNonOfficialSupplierDraft) &&
      isTedarikciFaturaLayout &&
      String(draft.resmiDurum || "").trim() === "GAYRI_RESMI";
    const targetStatus = status;
    if (directCariSave && !isDirectNonOfficialSupplierSave) {
      setMessage(
        "Direkt cari kayıt yalnız gayri resmi tedarikçi faturasında kullanılabilir.",
      );
      return;
    }
    if (modelRequired && !String(draft.modelKaydiId || "").trim()) {
      setMessage("Giden belgede model kaydı seçimi zorunludur.");
      return;
    }
    if (
      isDirectNonOfficialSupplierSave &&
      !String(draft.documentNo || draft.faturaNo || "").trim()
    ) {
      setMessage("Direkt kayıt için belge no zorunludur.");
      return;
    }
    if (isDirectNonOfficialSupplierSave && !String(draft.tarih || "").trim()) {
      setMessage("Direkt kayıt için tarih zorunludur.");
      return;
    }
    if (isDirectNonOfficialSupplierSave && normalizedGrandTotal <= 0) {
      setMessage("Direkt cari kayıt için genel toplam pozitif olmalıdır.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      meta.belgeYonu === "giden" &&
      !String(draft.irsaliyeNo || "").trim()
    ) {
      setMessage("Giden belgede irsaliye no zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      meta.belgeYonu === "giden" &&
      meta.belgeTipi === "fatura" &&
      !String(draft.faturaNo || "").trim()
    ) {
      setMessage("Giden faturada fatura no zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isOutgoingSimpleDocumentFlow &&
      sectionKey === "bizim-belgeler" &&
      !hasOutgoingModelLines
    ) {
      setMessage("Giden belgede en az bir model satırı zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isOutgoingSimpleDocumentFlow &&
      Number(
        draft.belgeAdediToplami ||
          draft.faturalananAdet ||
          draft.irsaliyeAdedi ||
          (draft.items || []).reduce(
            (sum, item) => sum + Number(item?.miktar || 0),
            0,
          ) ||
          0,
      ) <= 0
    ) {
      setMessage("Giden belgede adet zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isIncomingDispatchFlow &&
      !String(draft.irsaliyeNo || "").trim()
    ) {
      setMessage("Gelen irsaliyede irsaliye no zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isIncomingDispatchFlow &&
      !String(draft.tarih || "").trim()
    ) {
      setMessage("Gelen irsaliyede tarih zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isIncomingDispatchFlow &&
      !String(draft.modelKaydiId || "").trim() &&
      !String(draft.modelAdi || "").trim()
    ) {
      setMessage("Gelen irsaliyede sol panelden model seçimi zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isIncomingDispatchFlow &&
      Number(draft.belgeAdediToplami || draft.irsaliyeAdedi || 0) <= 0
    ) {
      setMessage("Gelen irsaliyede gelen adet zorunludur.");
      return;
    }
    if (
      targetStatus === "ONAYLANDI" &&
      isTedarikciFaturaLayout &&
      reviewState.needsAttention &&
      !isDirectNonOfficialSupplierSave
    ) {
      setMessage(
        "Final kayıttan önce uyarılı alanları kontrol edin. Firma, toplam ve kalemler netleşmeden belge onaylanamaz.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const endpoint =
        targetStatus === "ONAYLANDI"
           ? "/muhasebe/documents/confirm"
          : "/muhasebe/documents/draft";
      const response = await apiPost(
        endpoint,
        {
          documentId: draft.documentId || undefined,
          modelKaydiId: draft.modelKaydiId || undefined,
          flowType: flowType || undefined,
          documentType:
            sectionKey === "alis-gider-belgeleri"
               ? "ALIS_GIDER"
              : flowType || draft.workflowType,
          documentClass: draft.documentClass,
          workflowType: flowType || draft.workflowType,
          companyType: draft.resmiDurum || "RESMI",
          firma: draft.firma,
          selectedCompanyId:
            draft.selectedCompanyId || draft.matchedCompanyId || "",
          selectedCompanyName:
            draft.selectedCompanyName ||
            draft.matchedCompanyName ||
            draft.firma,
          selectedCompanyType:
            draft.selectedCompanyType || draft.firmaEslesmeTipi || "",
          rawParsedCompanyName:
            draft.rawParsedCompanyName || draft.rawDetectedCompanyName || "",
          rawDetectedCompanyName: draft.rawDetectedCompanyName,
          matchedCompanyId: draft.matchedCompanyId,
          matchedCompanyName: draft.matchedCompanyName,
          firmaEslesmeTipi: draft.firmaEslesmeTipi,
          sourceType: directCariSave
             ? "MANUEL_DIREKT_CARI"
            : isDirectNonOfficialSupplierDraft
               ? "MANUEL_DIREKT_CARI"
              : draft.parseMode
                 ? "PARSE"
                : "MANUEL",
          directCariSave: isDirectNonOfficialSupplierSave,
          sourceTab: sectionKey,
          pdfFileName: draft.originalFileName || draft.pdfFileName,
          status: targetStatus,
          detectedProfile: draft.detectedProfile,
          metrics: draft.metrics,
          header: {
            flowType: flowType || "",
            belgeYonu: meta.belgeYonu || draft.belgeYonu || "",
            belgeTipi: meta.belgeTipi || draft.belgeTipi || "",
            anaFirma: activeMainCompany?.name || "",
            cariFirma: draft.firma,
            tedarikciFirma: draft.firma,
            documentNo: draft.documentNo || draft.faturaNo || draft.irsaliyeNo,
            faturaNo: isDirectNonOfficialSupplierSave
               ? draft.documentNo || draft.faturaNo
              : draft.faturaNo,
            irsaliyeNo: isDirectNonOfficialSupplierSave ? "" : draft.irsaliyeNo,
            musteriIrsaliyeNo: draft.musteriIrsaliyeNo || draft.irsaliyeNo,
            modelAdi: draft.modelAdi,
            zemin: draft.zemin,
            date: draft.tarih,
            companyName: draft.firma,
            giderTuru: draft.giderTuru,
            odemeTuru: draft.odemeTuru,
            resmiDurum: draft.resmiDurum,
            subtotal: isDirectNonOfficialSupplierSave
               ? normalizedGrandTotal
              : normalizedSubtotal,
            kdv: isDirectNonOfficialSupplierSave ? 0 : normalizedKdv,
            grandTotal: normalizedGrandTotal,
            belgeAdediToplami: draft.belgeAdediToplami,
            faturalananAdet: draft.faturalananAdet,
            irsaliyeAdedi: draft.irsaliyeAdedi,
            makinaKarsilastirmaKey: draft.makinaKarsilastirmaKey,
            aciklama: draft.aciklama,
          },
          items: isDirectNonOfficialSupplierSave ? [] : draft.items,
          parsedItems: isDirectNonOfficialSupplierSave ? [] : draft.items,
          candidateRows: isDirectNonOfficialSupplierSave
             ? []
            : isOutgoingSimpleDocumentFlow
               ? []
              : draft.candidateRows,
          warnings: isDirectNonOfficialSupplierSave ? [] : draft.warnings,
        },
        activeMainCompany,
      );
      setDraft((prev) => {
        if (isDirectNonOfficialSupplierSave) {
          const clearedDraft = emptyDraft(sectionKey);
          return {
            ...clearedDraft,
            firma: prev?.firma,
            selectedCompanyId: prev?.selectedCompanyId,
            selectedCompanyName: prev?.selectedCompanyName,
            selectedCompanyType: prev?.selectedCompanyType,
            rawParsedCompanyName: prev?.rawParsedCompanyName,
            rawDetectedCompanyName: prev?.rawDetectedCompanyName,
            matchedCompanyId: prev?.matchedCompanyId,
            matchedCompanyName: prev?.matchedCompanyName,
            firmaEslesmeTipi: prev?.firmaEslesmeTipi,
            resmiDurum: prev?.resmiDurum,
            tarih: prev?.tarih,
            giderTuru: prev?.giderTuru,
            odemeTuru: prev?.odemeTuru,
          };
        }
        return {
          ...prev,
          status: response.status || targetStatus,
          documentId: response.documentId || prev?.documentId,
          modelKaydiId:
            response.modelKaydiId ||
            response.header.modelKaydiId ||
            prev?.modelKaydiId,
          workflowType:
            normalizeFlowType(
              response.header.flowType ||
                response.workflowType ||
                prev?.workflowType,
            ) || prev?.workflowType,
          flowType:
            normalizeFlowType(
              response.header.flowType ||
                response.workflowType ||
                prev?.flowType,
            ) || prev?.flowType,
          belgeYonu: response.header.belgeYonu || prev?.belgeYonu,
          belgeTipi: response.header.belgeTipi || prev?.belgeTipi,
          faturaNo: response.header.faturaNo || prev?.faturaNo,
          irsaliyeNo: response.header.irsaliyeNo || prev?.irsaliyeNo,
          modelAdi: response.header.modelAdi || prev?.modelAdi,
          zemin: response.header.zemin || prev?.zemin,
          kesimhaneBilgisi:
            response.header.kesimhaneBilgisi || prev?.kesimhaneBilgisi,
          firma: response.matchedCompanyName || response.firma || prev?.firma,
          selectedCompanyId:
            response.matchedCompanyId || prev?.selectedCompanyId || "",
          selectedCompanyName:
            response.matchedCompanyName || prev?.selectedCompanyName || "",
          selectedCompanyType:
            response.firmaEslesmeTipi || prev?.selectedCompanyType || "",
          sourceType:
            response.sourceType ||
            (isDirectNonOfficialSupplierSave
               ? "MANUEL_DIREKT_CARI"
              : prev?.sourceType),
          rawParsedCompanyName:
            response.rawParsedCompanyName ||
            response.rawDetectedCompanyName ||
            prev?.rawParsedCompanyName,
          rawDetectedCompanyName:
            response.rawDetectedCompanyName || prev?.rawDetectedCompanyName,
          matchedCompanyId: response.matchedCompanyId || prev?.matchedCompanyId,
          matchedCompanyName:
            response.matchedCompanyName || prev?.matchedCompanyName,
          parsedItems: Array.isArray(response.items)
             ? response.items
            : prev?.parsedItems,
          items:
            Array.isArray(response.items) && response.items.length
               response.items.map(
                  isOutgoingSimpleDocumentFlow
                     ? mapParsedItemToBizimLine
                    : mapParsedItemToLine,
                ? )
              : prev?.items,
          candidateRows: isOutgoingSimpleDocumentFlow
             ? []
            : Array.isArray(response.candidateRows)
               ? response.candidateRows
              : prev?.candidateRows,
          warnings: Array.isArray(response.warnings)
             ? response.warnings
            : prev?.warnings,
          metrics: response.metrics || prev?.metrics,
          needsReview: Boolean(response.needsReview),
        };
      });
      if (isDirectNonOfficialSupplierSave) {
        setSelectedHistoryId("");
        setActiveDocTab("gecmis");
      }
      await load();
      await loadModelKayitlari();
      setMessage(
        isDirectNonOfficialSupplierSave
           ? "Gayri resmi cari kaydi dogrudan olusturuldu. Kayit gecmis ekraninda listelenir."
          : targetStatus === "ONAYLANDI"
             ? "Belge onaylanarak final kaydedildi."
            : "Belge taslak olarak kaydedildi.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  function loadHistoryToDraft(doc) {
    if (!doc) return;
    const docItems = Array.isArray(doc.items) ? doc.items : [];
    const mappedItems = docItems.length
       ? docItems.map(mapParsedItemToLine)
      : Array.isArray(doc.parsedItems)
         ? doc.parsedItems.map(mapParsedItemToLine)
        : [];

    setSelectedHistoryId(String(doc.documentId || ""));
    setDraft((prev) => ({
      ...prev,
      status: doc.status || "TASLAK",
      documentId: doc.documentId || "",
      modelKaydiId: doc.modelKaydiId || doc.header.modelKaydiId || "",
      sourceTab: doc.sourceTab || sectionKey,
      documentClass: doc.documentClass || prev?.documentClass,
      workflowType:
        normalizeFlowType(
          doc.header.flowType || doc.workflowType || prev?.workflowType,
        ) || prev?.workflowType,
      flowType:
        normalizeFlowType(
          doc.header.flowType || doc.workflowType || prev?.flowType,
        ) || prev?.flowType,
      belgeYonu: doc.header.belgeYonu || prev?.belgeYonu,
      belgeTipi: doc.header.belgeTipi || prev?.belgeTipi,
      documentNo: doc.header.documentNo || "",
      faturaNo: doc.header.faturaNo || "",
      irsaliyeNo: doc.header.irsaliyeNo || doc.header.dispatchNo || "",
      modelAdi: doc.header.modelAdi || "",
      musteriIrsaliyeNo:
        doc.header.musteriIrsaliyeNo ||
        doc.header.irsaliyeNo ||
        doc.header.dispatchNo ||
        "",
      zemin: doc.header.zemin || "",
      kesimhaneBilgisi: doc.header.kesimhaneBilgisi || "",
      musteriFirma: doc.header.cariFirma || doc.firma || "",
      tarih: normalizeDateForInput(doc.header.date) || prev?.tarih,
      firma: doc.firma || "",
      resmiDurum: doc.header.resmiDurum || doc.companyType || prev?.resmiDurum,
      selectedCompanyId: doc.matchedCompanyId || "",
      selectedCompanyName: doc.matchedCompanyName || "",
      selectedCompanyType: doc.firmaEslesmeTipi || "",
      rawParsedCompanyName:
        doc.rawParsedCompanyName || doc.rawDetectedCompanyName || "",
      rawDetectedCompanyName: doc.rawDetectedCompanyName || "",
      matchedCompanyId: doc.matchedCompanyId || "",
      matchedCompanyName: doc.matchedCompanyName || "",
      firmaEslesmeTipi: doc.firmaEslesmeTipi || "",
      sourceType: doc.sourceType || prev?.sourceType || "MANUEL",
      pdfFileName: doc.pdfFileName || "",
      originalFileName: doc.pdfFileName || "",
      parseMode: doc.mode || prev?.parseMode,
      detectedProfile: doc.detectedProfile || "",
      subtotal: Number(doc.header.subtotal || 0),
      kdv: Number(doc.header.kdv || 0),
      grandTotal: Number(doc.header.grandTotal || 0),
      belgeAdediToplami: Number(doc.header.belgeAdediToplami || 0),
      faturalananAdet: Number(doc.header.faturalananAdet || 0),
      irsaliyeAdedi: Number(doc.header.irsaliyeAdedi || 0),
      makinaKarsilastirmaKey: doc.header.makinaKarsilastirmaKey || "",
      aciklama: doc.header.aciklama || "",
      parsedItems: docItems,
      items: mappedItems,
      candidateRows:
        doc.sourceType === "MANUEL_DIREKT_CARI"
           ? []
          : Array.isArray(doc.candidateRows)
             ? doc.candidateRows
            : [],
      warnings:
        doc.sourceType === "MANUEL_DIREKT_CARI"
           ? []
          : Array.isArray(doc.warnings)
             ? doc.warnings
            : [],
      metrics: doc.metrics || {},
      needsReview:
        doc.sourceType === "MANUEL_DIREKT_CARI"
           ? false
          : Boolean(doc.needsReview),
    }));
    setActiveDocTab(
      doc.sourceType === "MANUEL_DIREKT_CARI" ? "gayri-resmi" : "belge",
    );
    setMessage("Geçmiş belge forma yüklendi. Güncelleme yapabilirsiniz.");
  }

  function createDocumentSavePayload(source, status = "TASLAK", options = {}) {
    const flowType = normalizeFlowType(
      source.flowType || source.workflowType || source.header.flowType,
    );
    const meta = flowTypeMeta(flowType);
    const directCariSave = Boolean(options.directCariSave);
    return {
      documentId: source.documentId || undefined,
      modelKaydiId: source.modelKaydiId || source.header.modelKaydiId,
      flowType: flowType || undefined,
      documentType: source.documentType || flowType || source.workflowType,
      documentClass: source.documentClass,
      workflowType: flowType || source.workflowType,
      companyType:
        source.resmiDurum || source.header.resmiDurum || source.companyType,
      firma: source.firma,
      selectedCompanyId:
        source.selectedCompanyId || source.matchedCompanyId || "",
      selectedCompanyName:
        source.selectedCompanyName ||
        source.matchedCompanyName ||
        source.firma ||
        "",
      selectedCompanyType:
        source.selectedCompanyType || source.firmaEslesmeTipi || "",
      rawParsedCompanyName:
        source.rawParsedCompanyName || source.rawDetectedCompanyName || "",
      rawDetectedCompanyName: source.rawDetectedCompanyName,
      matchedCompanyId: source.matchedCompanyId,
      matchedCompanyName: source.matchedCompanyName,
      firmaEslesmeTipi: source.firmaEslesmeTipi,
      sourceType:
        directCariSave || source.sourceType === "MANUEL_DIREKT_CARI"
           ? "MANUEL_DIREKT_CARI"
          : source.sourceType || "MANUEL",
      directCariSave,
      sourceTab: source.sourceTab || sectionKey,
      pdfFileName: source.originalFileName || source.pdfFileName,
      status,
      detectedProfile: source.detectedProfile,
      metrics: source.metrics,
      header: {
        ...(source.header || {}),
        flowType: flowType || source.header.flowType || "",
        belgeYonu:
          meta.belgeYonu || source.belgeYonu || source.header.belgeYonu || "",
        belgeTipi:
          meta.belgeTipi || source.belgeTipi || source.header.belgeTipi || "",
        anaFirma: source.header.anaFirma || activeMainCompany?.name || "",
        cariFirma: source.firma || source.header.cariFirma || "",
        tedarikciFirma: source.firma || source.header.tedarikciFirma || "",
        documentNo:
          source.documentNo ||
          source.header.documentNo ||
          source.faturaNo ||
          source.irsaliyeNo,
        faturaNo: source.faturaNo || source.header.faturaNo,
        irsaliyeNo:
          source.irsaliyeNo ||
          source.header.irsaliyeNo ||
          source.header.dispatchNo,
        musteriIrsaliyeNo:
          source.musteriIrsaliyeNo ||
          source.header.musteriIrsaliyeNo ||
          source.irsaliyeNo ||
          source.header.irsaliyeNo,
        modelAdi: source.modelAdi || source.header.modelAdi,
        zemin: source.zemin || source.header.zemin,
        date: source.tarih || source.header.date,
        companyName: source.firma || source.header.companyName,
        giderTuru: source.giderTuru || source.header.giderTuru,
        odemeTuru: source.odemeTuru || source.header.odemeTuru,
        resmiDurum:
          source.resmiDurum || source.header.resmiDurum || source.companyType,
        subtotal: parseMoney(source.subtotal ? source.header.subtotal),
        kdv: parseMoney(source.kdv ? source.header.kdv),
        grandTotal: parseMoney(source.grandTotal ? source.header.grandTotal),
        belgeAdediToplami:
          source.belgeAdediToplami || source.header.belgeAdediToplami,
        faturalananAdet:
          source.faturalananAdet || source.header.faturalananAdet,
        irsaliyeAdedi: source.irsaliyeAdedi || source.header.irsaliyeAdedi,
        makinaKarsilastirmaKey:
          source.makinaKarsilastirmaKey ||
          source.header.makinaKarsilastirmaKey,
        aciklama: source.aciklama || source.header.aciklama,
      },
      items: Array.isArray(source.items) ? source.items : [],
      parsedItems: Array.isArray(source.items) ? source.items : [],
      candidateRows:
        Array.isArray(source.candidateRows) &&
        source.sourceType !== "MANUEL_DIREKT_CARI"
           ? source.candidateRows
          : [],
      warnings:
        Array.isArray(source.warnings) &&
        source.sourceType !== "MANUEL_DIREKT_CARI"
           ? source.warnings
          : [],
    };
  }

  async function savePoolRowsDirectly() {
    setMessage(
      "Gayri resmi kayitlar artik havuza alinmiyor. Gayri Resmi Kayit sekmesinden Direk Kaydet kullanin.",
    );
  }

  if (isFocusedDocumentFlow) {
    const uploadInputId = `belge-yukle-${sectionKey}`;
    const leftSecondSearchPlaceholder = isTedarikciFaturaLayout
       ? "Ürün adı, kategori, kod ara..."
      : "Model adı & kod ara...";
    return (
      <div
        className={`mgi-screen mgi-belge-family-screen ${
          isMusteriIrsaliyeLayout ? "mgi-customer-dispatch-screen" : ""
        } ${isBizimBelgelerLayout ? "mgi-our-documents-screen" : ""} ${
          isTedarikciFaturaLayout ? "mgi-supplier-invoice-screen" : ""
        }`}
      >
        <div className="mgi-main-grid mgi-belge-family-grid">
          <div className="content-card mgi-left-panel mgi-belge-family-left">
            <div className="mgi-left-stack mgi-belge-family-left-stack">
              <div className="mgi-list-panel mgi-belge-family-panel mgi-belge-family-panel-top">
                <div className="section-header">
                  <div>
                    <h3>{documentPoolTitle()}</h3>
                  </div>
                </div>
                <input
                  className="search-input"
                  value={poolSearchText}
                  onChange={(e) => setPoolSearchText(e.target.value)}
                  placeholder={
                    isTedarikciFaturaLayout
                       ? "Belge no, tedarikçi, fatura no..."
                      : "Belge no, firma, açıklama..."
                  }
                />
                <div className="mgi-left-actions mt-12">
                  <button
                    className="primary-btn"
                    type="button"
                    onClick={resetDraftState}
                    disabled={busy}
                  >
                    Yeni Taslak
                  </button>
                  <button
                    className="soft-btn"
                    type="button"
                    onClick={() => {
                      if (selectedPoolRow) {
                        loadHistoryToDraft(selectedPoolRow);
                      } else {
                        setMessage("Güncellenecek havuz kaydı seçin.");
                      }
                    }}
                    disabled={busy || !selectedPoolRow}
                  >
                    Güncelle
                  </button>
                  <button
                    className="soft-btn mgi-danger-btn"
                    type="button"
                    onClick={deleteSelectedPoolRow}
                    disabled={busy || !selectedPoolRow}
                  >
                    Sil
                  </button>
                  <button
                    className="soft-btn mgi-full-btn"
                    type="button"
                    onClick={refreshPoolRows}
                    disabled={busy}
                  >
                    Listeyi Yenile
                  </button>
                </div>
                <div className="mgi-list-scroll mt-12">
                  {filteredPoolRowsBySearch.map((doc) => (
                    <button
                      key={doc.documentId}
                      type="button"
                      className={`mgi-list-item ${
                        selectedHistoryId === String(doc.documentId)
                           ? "is-selected"
                          : ""
                      }`}
                      onClick={() => loadHistoryToDraft(doc)}
                    >
                      <div className="mgi-list-item-title">
                        {documentPoolNo(doc)}
                      </div>
                      <div className="mgi-list-item-sub">
                        {documentPoolType(doc)}
                      </div>
                      <div className="mgi-list-item-sub">
                        {documentPoolCompany(doc)}
                      </div>
                      <div className="mgi-list-item-meta">
                        {doc.header.date || doc.updatedAt.slice(0, 10) || "-"}{" "}
                        |{" "}
                        {isTedarikciFaturaLayout
                           `Toplam ${formatMoney(
                              doc.header.grandTotal || 0,
                            ? )} | KDV ${formatMoney(doc.header.kdv || 0)}`
                          : `Adet ${
                              doc.header.belgeAdediToplami ||
                              doc.header.irsaliyeAdedi ||
                              doc.header.faturalananAdet ||
                              0
                            }`}
                      </div>
                      <div className="mgi-list-item-meta">
                        {isTedarikciFaturaLayout
                           `Eşleşmeyen: ${unmatchedDocumentItemCount(doc)} | Durum: ${
                              doc.status || "TASLAK"
                            } | ${
                              doc.header.resmiDurum ||
                              doc.companyType ||
                              "RESMI"
                            ? }`
                          : `Durum: ${doc.status || "TASLAK"}`}
                      </div>
                    </button>
                  ))}
                  {!filteredPoolRowsBySearch.length ? (
                    <div className="notice-box">
                      Aktif havuz kaydı bulunamadı.
                    </div>
                  ) : null}
                </div>
              </div>

              {!(isTedarikciFaturaLayout && activeDocTab === "gecmis") ? (
                <div className="mgi-list-panel mgi-belge-family-panel mgi-belge-family-panel-bottom">
                  <div className="section-header">
                    <div>
                      <h3>{secondaryPanelTitle}</h3>
                    </div>
                  </div>
                  <input
                    className="search-input"
                    value={modelSearchText}
                    onChange={(e) => setModelSearchText(e.target.value)}
                    placeholder={leftSecondSearchPlaceholder}
                  />
                  <div className="mgi-left-actions mt-12">
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => {
                        if (isTedarikciFaturaLayout) {
                          openProductQuickEditor(null);
                        } else {
                          openModelQuickCreate(null);
                        }
                      }}
                      disabled={busy || modelCreateBusy || productQuickBusy}
                    >
                      {isTedarikciFaturaLayout ? "Yeni Ürün" : "Yeni Model"}
                    </button>
                    <button
                      className="soft-btn"
                      type="button"
                      onClick={() => {
                        if (!selectedSecondaryRow) {
                          setMessage(
                            isTedarikciFaturaLayout
                               ? "Güncellenecek ürün seçin."
                              : "Güncellenecek model seçin.",
                          );
                          return;
                        }
                        if (isTedarikciFaturaLayout) {
                          openProductQuickEditor(selectedSecondaryRow);
                        } else {
                          openModelQuickCreate(selectedSecondaryRow);
                        }
                      }}
                      disabled={
                        busy ||
                        !selectedSecondaryRow ||
                        modelCreateBusy ||
                        productQuickBusy
                      }
                    >
                      Güncelle
                    </button>
                    <button
                      className="soft-btn mgi-danger-btn"
                      type="button"
                      onClick={deleteSecondaryRow}
                      disabled={busy || !selectedSecondaryRow}
                    >
                      Sil
                    </button>
                  </div>
                  <div className="mgi-list-scroll mt-12">
                    {filteredSecondaryRowsBySearch.slice(0, 200).map((item) => (
                      <button
                        key={item?.id}
                        type="button"
                        className={`mgi-list-item ${
                          String(selectedSecondaryId || "") === String(item?.id)
                             ? "is-selected"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedSecondaryId(String(item?.id || ""));
                          if (!isTedarikciFaturaLayout) {
                            applyModelKaydiToDraft(item?.id);
                          }
                        }}
                      >
                        <div className="mgi-list-item-title">
                          {item?.modelAdi ||
                            item?.modelKodu ||
                            item?.urunAdi ||
                            "-"}
                        </div>
                        <div className="mgi-list-item-sub">
                          {item?.musteriFirma ||
                            item?.firma ||
                            item?.kategori ||
                            item?.ticariAdi ||
                            "-"}
                        </div>
                        <div className="mgi-list-item-meta">
                          {isTedarikciFaturaLayout
                             `Kg: ${
                                item?.varsayilanKg ||
                                item?.kg ||
                                item?.stokMiktari ||
                                "-"
                              ? } | Ambalaj: ${item?.varsayilanAmbalaj || "-"}`
                            : `Model: ${item?.gelenAdet || 0} | Kalan: ${
                                item?.kalanAdet || 0
                              }`}
                        </div>
                        <div className="mgi-list-item-meta">
                          {isTedarikciFaturaLayout
                             ? `Durum: ${item?.urunDurumu || item?.aktifDurum || "KONTROL"}`
                            : ""}
                        </div>
                      </button>
                    ))}
                    {!filteredSecondaryRowsBySearch.length ? (
                      <div className="notice-box">
                        {isTedarikciFaturaLayout
                           ? "Ürün kaydı bulunamadı."
                          : "Model kaydı bulunamadı."}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={`mgi-right-column mgi-belge-family-right ${
              isTedarikciFaturaLayout ? "mgi-supplier-invoice-right" : ""
            }`}
          >
            <div className="mgi-doc-tabs">
              {focusedDocTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`mgi-doc-tab ${activeDocTab === tab.key ? "is-active" : ""}`}
                  onClick={() => setActiveDocTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {isBizimBelgelerLayout && activeDocTab === "belge"  (
              <div className="content-card mgi-process-card">
                <SectionHeader title="Belge" />

                <div className="mgi-form-grid mgi-form-grid-3">
                  <Input
                    label="Firma"
                    value={draft.firma || ""}
                    onChange={(e) => syncCompanyDraft(e.target.value)}
                  />
                  <Input
                    label="Tarih"
                    type="date"
                    value={draft.tarih || ""}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, tarih: e.target.value }))
                    }
                  />
                  <Input
                    label="Durum"
                    value={draft.status || "TASLAK"}
                    readOnly
                  />
                </div>

                <div className="mgi-form-grid mgi-form-grid-4 mt-12">
                  <Input
                    label="Fatura No"
                    value={draft.faturaNo || draft.documentNo || ""}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        faturaNo: e.target.value,
                        documentNo: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="İrsaliye No"
                    value={draft.irsaliyeNo || ""}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, irsaliyeNo: e.target.value }))
                    }
                  />
                  <MoneyInput
                    label="Tutar"
                    value={draft.subtotal}
                    onValueChange={(v) =>
                      setDraft((p) => ({
                        ...p,
                        subtotal: v,
                        grandTotal: Number((v + Number(p.kdv || 0)).toFixed(2)),
                      }))
                    }
                  />
                  <MoneyInput
                    label="KDV"
                    value={draft.kdv}
                    onValueChange={(v) =>
                      setDraft((p) => ({
                        ...p,
                        kdv: v,
                        grandTotal: Number(
                          (Number(p.subtotal || 0) + v).toFixed(2),
                        ),
                      }))
                    }
                  />
                </div>

                <div className="mgi-form-grid mgi-form-grid-4 mt-12">
                  <MoneyInput
                    label="Toplam Tutar"
                    value={draft.grandTotal}
                    onValueChange={(v) =>
                      setDraft((p) => ({ ...p, grandTotal: v }))
                    }
                  />
                  <Input
                    label="Fatura Klasörü"
                    value={documentPathSettings.gidenFaturaBasePath || ""}
                    onChange={(e) =>
                      setDocumentPathSettings((prev) => ({
                        ...prev,
                        gidenFaturaBasePath: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Fatura Prefix"
                    value={documentPathSettings.faturaDosyaPrefix || "HKN"}
                    onChange={(e) =>
                      setDocumentPathSettings((prev) => ({
                        ...prev,
                        faturaDosyaPrefix: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="İrsaliye Prefix"
                    value={documentPathSettings.irsaliyeDosyaPrefix || "DDM"}
                    onChange={(e) =>
                      setDocumentPathSettings((prev) => ({
                        ...prev,
                        irsaliyeDosyaPrefix: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="field mt-12">
                  <span>Fatura PDF</span>
                  <div
                    className={`mgi-upload-drop ${isDragActive ? "is-drag" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                      selectUploadFiles(e.dataTransfer.files || []);
                    }}
                  >
                    <div className="mgi-upload-icon">&uarr;</div>
                    <div className="mgi-upload-text">
                      Fatura ve irsaliyeleri birlikte bırakın
                    </div>
                    <label
                      className="soft-btn tiny-btn"
                      htmlFor={uploadInputId}
                    >
                      Dosya Seç
                    </label>
                    <input
                      id={uploadInputId}
                      className="mgi-hidden-file-input"
                      type="file"
                      multiple
                      accept="application/pdf"
                      onChange={(e) => selectUploadFiles(e.target.files || [])}
                    />
                  </div>
                  {selectedFile ? (
                    <div className="status-text mt-8">
                      {selectedFiles.length > 1
                         ? `Seçilen dosya: ${selectedFiles.length} adet`
                        : `Seçilen dosya: ${selectedFile.name}`}
                    </div>
                  ) : null}
                </div>

                <div className="mgi-process-actions mt-12">
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={!selectedFile || busy}
                    onClick={intakeDocument}
                  >
                    Faturayı Havuza Al
                  </button>
                  <button
                    className="soft-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => saveDocumentPathSettings()}
                  >
                    Klasörü Kaydet
                  </button>
                  <button
                    className="soft-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => save("TASLAK")}
                  >
                    Kaydet
                  </button>
                </div>

                {message ? (
                  <div className="notice-box mt-12">{message}</div>
                ) : null}
                {outgoingRequiredFieldList.length ? (
                  <div className="warning-box mt-12">
                    <strong>Eksik Alan</strong>
                    <div>{outgoingRequiredFieldList.join(", ")}</div>
                  </div>
                ) : null}

                <div className="belge-items-toolbar mt-16">
                  <div>
                    <h4>Model Satırları</h4>
                    <div className="status-text">
                      Dosya adı fatura no + model adı ise model otomatik gelir.
                      Gerekirse piyon no ekleyip satırı düzeltin.
                    </div>
                  </div>
                  <button
                    className="soft-btn"
                    type="button"
                    onClick={addBizimBelgeLine}
                  >
                    + Model Satırı
                  </button>
                </div>

                <div className="table-wrap mt-8">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Model Adı</th>
                        <th>Piyon No</th>
                        <th>Adet</th>
                        <th>Tutar</th>
                        <th>KDV</th>
                        <th>Toplam</th>
                        <th>Açıklama</th>
                        <th>Öneri</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(draft.items || []).map((item) => {
                        const modelName = String(
                          item?.modelAdi || item?.aciklama || "",
                        ).trim();
                        const matchedModel = modelKayitlari.find(
                          (model) =>
                            String(model?.modelAdi || "")
                              .trim()
                              .toLocaleLowerCase("tr-TR") ===
                            modelName.toLocaleLowerCase("tr-TR"),
                        );
                        return (
                          <tr key={item?.id}>
                            <td>
                              <input
                                value={item?.modelAdi || ""}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    modelAdi: e.target.value,
                                    aciklama: item?.aciklama || e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={item?.piyonNo || ""}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    piyonNo: e.target.value,
                                  })
                                }
                                placeholder="Varsa"
                              />
                            </td>
                            <td>
                              <input
                                value={item?.miktar || 0}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    miktar: parseMoney(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={item?.tutar || 0}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    tutar: parseMoney(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={item?.kdvTutari || 0}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    kdvTutari: parseMoney(e.target.value),
                                  })
                                }
                              />
                            </td>
                            <td>
                              {formatMoney(
                                Number(item?.tutar || 0) +
                                  Number(item?.kdvTutari || 0),
                              )}
                            </td>
                            <td>
                              <input
                                value={item?.aciklama || ""}
                                onChange={(e) =>
                                  updateItem(item?.id, {
                                    aciklama: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td>
                              {matchedModel
                                 ? "Mevcut model"
                                : modelName
                                   ? "Yeni model açılabilir"
                                  : "-"}
                            </td>
                            <td>
                              <button
                                className="soft-btn tiny-btn mgi-danger-btn"
                                type="button"
                                onClick={() => removeLine(item?.id)}
                              >
                                Sil
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!draft.items.length ? (
                        <tr>
                          <td colSpan={9}>Henüz model satırı yok.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="mt-12">
                  <Textarea
                    label="Açıklama"
                    value={draft.aciklama}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, aciklama: e.target.value }))
                    }
                    rows={3}
                    placeholder="Açıklama..."
                  />
                </div>
              </div>
            ) : null}

            {activeDocTab === "belge" && !isBizimBelgelerLayout ? (
              <div
                className={`content-card mgi-belge-card ${
                  isTedarikciFaturaLayout ? "mgi-supplier-belge-card" : ""
                }`}
              >
                <SectionHeader
                  title={isTedarikciFaturaLayout ? "Belge" : "Belge Bilgisi"}
                />
                <div className="mgi-form-grid mgi-form-grid-4">
                  <Input
                    label="Ana Firma"
                    value={activeMainCompany?.name || ""}
                    readOnly
                  />
                  {isMusteriIrsaliyeLayout ? (
                    <Select
                      label="Firma"
                      value={draft.firma || ""}
                      onChange={(e) => syncCompanyDraft(e.target.value)}
                      options={companySelectOptions}
                    />
                  ) : (
                    <Select
                      label={
                        isTedarikciFaturaLayout ? "Firma / Tedarikçi" : "Firma"
                      }
                      value={draft.firma || ""}
                      onChange={(e) => syncCompanyDraft(e.target.value)}
                      options={companySelectOptions}
                    />
                  )}
                  <Input
                    label="Tarih"
                    type="date"
                    value={draft.tarih || ""}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, tarih: e.target.value }))
                    }
                  />
                  <Input
                    label="Durum"
                    value={draft.status || "TASLAK"}
                    readOnly
                  />
                </div>

                {isMusteriIrsaliyeLayout ? (
                  <>
                    <div className="mgi-form-grid mgi-form-grid-3 mt-16">
                      <Input
                        label="İrsaliye No"
                        value={draft.irsaliyeNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            irsaliyeNo: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Zemin"
                        value={draft.zemin || ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, zemin: e.target.value }))
                        }
                      />
                      <Input
                        label="Kesimhane Adı"
                        value={draft.kesimhaneBilgisi || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            kesimhaneBilgisi: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="mgi-form-grid mgi-form-grid-3 mt-16">
                      <Input
                        label="Firma"
                        value={draft.matchedCompanyName || draft.firma || ""}
                        readOnly
                      />
                      <Input
                        label="Gelen Adet"
                        value={draft.belgeAdediToplami || 0}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            belgeAdediToplami: parseMoney(e.target.value),
                          }))
                        }
                      />
                      <Input
                        label="Piyon No (opsiyonel)"
                        value={draft.piyonNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, piyonNo: e.target.value }))
                        }
                      />
                    </div>
                  </>
                ) : isTedarikciFaturaLayout ? (
                  <>
                    <div className="mgi-form-grid mgi-form-grid-4 mt-16">
                      <Input
                        label="Fatura No"
                        value={draft.faturaNo || draft.documentNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            faturaNo: e.target.value,
                            documentNo: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="İrsaliye No"
                        value={draft.irsaliyeNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            irsaliyeNo: e.target.value,
                          }))
                        }
                      />
                      <MoneyInput
                        label="Ara Toplam"
                        value={draft.subtotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            subtotal: v,
                            grandTotal: Number(
                              (v + Number(p.kdv || 0)).toFixed(2),
                            ),
                          }))
                        }
                      />
                      <MoneyInput
                        label="KDV"
                        value={draft.kdv}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            kdv: v,
                            grandTotal: Number(
                              (Number(p.subtotal || 0) + v).toFixed(2),
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="mgi-form-grid mgi-form-grid-2 mt-12">
                      <MoneyInput
                        label="Genel Toplam"
                        value={draft.grandTotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({ ...p, grandTotal: v }))
                        }
                      />
                      <Select
                        label="Resmi / Gayri Resmi"
                        value={draft.resmiDurum || "RESMI"}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            resmiDurum: e.target.value,
                          }))
                        }
                        options={[
                          { value: "RESMI", label: "Resmi" },
                          { value: "GAYRI_RESMI", label: "Gayri Resmi" },
                        ]}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mgi-form-grid mgi-form-grid-4 mt-16">
                      <Select
                        label="Belge Tipi / İş Akışı"
                        value={draft.workflowType}
                        onChange={(e) => {
                          const normalized =
                            normalizeFlowType(e.target.value) || e.target.value;
                          const meta = flowTypeMeta(normalized);
                          setDraft((p) => ({
                            ...p,
                            workflowType: normalized,
                            flowType: normalized,
                            belgeYonu: meta.belgeYonu || p.belgeYonu,
                            belgeTipi: meta.belgeTipi || p.belgeTipi,
                          }));
                        }}
                        options={config.workflowOptions}
                      />
                      {isBizimBelgelerLayout ? (
                        <div className="field mgi-field-with-action">
                          <span>Model Kaydı</span>
                          <div className="mgi-field-action-row">
                            <select
                              value={draft.modelKaydiId || ""}
                              onChange={(e) =>
                                applyModelKaydiToDraft(e.target.value)
                              }
                            >
                              <option value="">Model kaydı seçin</option>
                              {modelKayitlari.map((item) => (
                                <option key={item?.id} value={item?.id}>
                                  {`${item?.modelAdi} | ${
                                    item?.musteriFirma || item?.firma
                                  } | Kalan: ${item?.kalanAdet || 0}`}
                                </option>
                              ))}
                            </select>
                            <button
                              className="soft-btn tiny-btn mgi-inline-action-btn"
                              type="button"
                              onClick={openModelQuickCreate}
                              disabled={busy || modelCreateBusy}
                            >
                              + Yeni Model
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <Select
                        label="Belge Sınıfı"
                        value={draft.documentClass}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            documentClass: e.target.value,
                          }))
                        }
                        options={PDF_DOCUMENT_CLASS_OPTIONS}
                      />
                      <Input
                        label="Belge No"
                        value={draft.documentNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            documentNo: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="mgi-form-grid mgi-form-grid-3 mt-12">
                      <Input
                        label="Fatura No"
                        value={draft.faturaNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, faturaNo: e.target.value }))
                        }
                      />
                      <Input
                        label="İrsaliye No"
                        value={draft.irsaliyeNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            irsaliyeNo: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Zemin"
                        value={draft.zemin || ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, zemin: e.target.value }))
                        }
                      />
                    </div>

                    <div className="mgi-form-grid mgi-form-grid-4 mt-12">
                      <Select
                        label="Firma Eşleme"
                        value={draft.firma || ""}
                        onChange={(e) => syncCompanyDraft(e.target.value)}
                        options={companySelectOptions}
                      />
                      <Select
                        label="Resmi / Gayri Resmi"
                        value={draft.resmiDurum || "RESMI"}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            resmiDurum: e.target.value,
                          }))
                        }
                        options={[
                          { value: "RESMI", label: "Resmi" },
                          { value: "GAYRI_RESMI", label: "Gayri Resmi" },
                        ]}
                      />
                      <MoneyInput
                        label="Ara Toplam"
                        value={draft.subtotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            subtotal: v,
                            grandTotal: Number(
                              (v + Number(p.kdv || 0)).toFixed(2),
                            ),
                          }))
                        }
                      />
                      <MoneyInput
                        label="KDV"
                        value={draft.kdv}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            kdv: v,
                            grandTotal: Number(
                              (Number(p.subtotal || 0) + v).toFixed(2),
                            ),
                          }))
                        }
                      />
                    </div>

                    <div className="mgi-form-grid mgi-form-grid-4 mt-12">
                      <MoneyInput
                        label="Genel Toplam"
                        value={draft.grandTotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({ ...p, grandTotal: v }))
                        }
                      />
                      <Input
                        label="Belge Adedi Toplamı"
                        value={draft.belgeAdediToplami || 0}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            belgeAdediToplami: parseMoney(e.target.value),
                          }))
                        }
                      />
                      <Input
                        label="Faturalanan Adet"
                        value={draft.faturalananAdet || 0}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            faturalananAdet: parseMoney(e.target.value),
                          }))
                        }
                      />
                      <Input
                        label="İrsaliye Adedi"
                        value={draft.irsaliyeAdedi || 0}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            irsaliyeAdedi: parseMoney(e.target.value),
                          }))
                        }
                      />
                    </div>

                    <div className="mgi-form-grid mgi-form-grid-1 mt-12">
                      <Input
                        label="Makina Karşılaştırma Key"
                        value={draft.makinaKarsilastirmaKey || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            makinaKarsilastirmaKey: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                )}

                <div className="mt-16">
                  <Textarea
                    label="Açıklama"
                    value={draft.aciklama}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, aciklama: e.target.value }))
                    }
                    rows={5}
                    placeholder="Açıklama giriniz..."
                  />
                </div>
              </div>
            ) : null}

            {(!isBizimBelgelerLayout &&
              !isMusteriIrsaliyeLayout &&
              activeDocTab ===
                (isTedarikciFaturaLayout ? "belge" : "kalemler")) ||
            (isMusteriIrsaliyeLayout && activeDocTab === "belge") ? (
              <div
                className={`content-card mgi-process-card ${
                  isTedarikciFaturaLayout ? "mgi-supplier-pdf-card" : ""
                }`}
              >
                <SectionHeader title="PDF / Taslak / Final İşlemleri" />

                <div className="field">
                  <span>Çalışma Modu</span>
                  <div className="mgi-mode-switch">
                    <button className="mgi-mode-btn is-active" type="button">
                      Taslak
                    </button>
                    <button
                      className="mgi-mode-btn"
                      type="button"
                      disabled={busy}
                      onClick={() => save("TASLAK")}
                    >
                      Taslağı Kaydet
                    </button>
                    <button
                      className="mgi-mode-btn"
                      type="button"
                      disabled={busy}
                      onClick={() => save("ONAYLANDI")}
                    >
                      Onayla ve Final Kaydet
                    </button>
                  </div>
                </div>

                <div className="mt-12">
                  <Input
                    label="Durum"
                    value={draft.status || "TASLAK"}
                    readOnly
                  />
                </div>

                {isBizimBelgelerLayout ? (
                  <div className="mt-12">
                    <div className="mgi-form-grid mgi-form-grid-2">
                      <Input
                        label="Bizim Kestiğimiz İrsaliye Klasörü"
                        value={documentPathSettings.gidenIrsaliyeBasePath || ""}
                        onChange={(e) =>
                          setDocumentPathSettings((prev) => ({
                            ...prev,
                            gidenIrsaliyeBasePath: e.target.value,
                          }))
                        }
                        placeholder="D:\onedrive hkngursu\OneDrive\Masaüstü\HKN\DDM E-İRSALİYE"
                      />
                      <Input
                        label="Bizim Kestiğimiz Fatura Klasörü"
                        value={documentPathSettings.gidenFaturaBasePath || ""}
                        onChange={(e) =>
                          setDocumentPathSettings((prev) => ({
                            ...prev,
                            gidenFaturaBasePath: e.target.value,
                          }))
                        }
                        placeholder="D:\onedrive hkngursu\OneDrive\Masaüstü\HKN\HKN E-FATURA"
                      />
                    </div>
                    <div className="mgi-process-actions mt-12">
                      <button
                        className="soft-btn"
                        type="button"
                        disabled={documentPathBusy || busy}
                        onClick={saveDocumentPathSettings}
                      >
                        Klasör Yollarını Kaydet
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="field mt-12">
                  <span>Belge Yükle</span>
                  <div
                    className={`mgi-upload-drop ${isDragActive ? "is-drag" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragActive(false);
                      selectUploadFiles(e.dataTransfer.files || []);
                    }}
                  >
                    <div className="mgi-upload-icon">&uarr;</div>
                    <div className="mgi-upload-text">
                      Dosyaları sürükleyip bırakın
                    </div>
                    <div className="mgi-upload-text">veya</div>
                    <label
                      className="soft-btn tiny-btn"
                      htmlFor={uploadInputId}
                    >
                      Dosya Seç
                    </label>
                    <input
                      id={uploadInputId}
                      className="mgi-hidden-file-input"
                      type="file"
                      multiple
                      accept="application/pdf,image/jpeg,image/png,image/jpg"
                      onChange={(e) => selectUploadFiles(e.target.files || [])}
                    />
                  </div>
                  {selectedFile ? (
                    <div className="status-text mt-8">
                      {selectedFiles.length > 1
                         ? `Seçilen dosya: ${selectedFiles.length} adet`
                        : `Seçilen dosya: ${selectedFile.name}`}
                    </div>
                  ) : null}
                </div>

                <div className="mgi-process-actions mt-16">
                  <button
                    className="soft-btn"
                    type="button"
                    disabled={!selectedFile || busy}
                    onClick={intakeDocument}
                  >
                    Taslağa Al
                  </button>
                  <button
                    className="soft-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => save("TASLAK")}
                  >
                    Taslağı Kaydet
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => save("ONAYLANDI")}
                  >
                    Onayla ve Final Kaydet
                  </button>
                  {isTedarikciFaturaLayout &&
                  String(draft.resmiDurum || "").trim() === "GAYRI_RESMI"  (
                    <button
                      className="primary-btn"
                      type="button"
                      disabled={busy}
                      onClick={() => save("TASLAK", { directCariSave: true })}
                    >
                      Gayri Resmi Havuza Al
                    </button>
                  ) : null}
                </div>

                {message ? (
                  <div className="notice-box mt-16">{message}</div>
                ) : null}

                {isMusteriIrsaliyeLayout && incomingRequiredFieldList.length ? (
                  <div className="warning-box mt-16">
                    <strong>Eksik Zorunlu Alanlar Var</strong>
                    <div className="firma-kartlari-warning-list">
                      <div>
                        {`Final için doldurulması gereken alanlar: ${incomingRequiredFieldList.join(", ")}`}
                      </div>
                    </div>
                  </div>
                ) : null}

                {isBizimBelgelerLayout && outgoingRequiredFieldList.length ? (
                  <div className="warning-box mt-16">
                    <strong>Eksik Zorunlu Alanlar Var</strong>
                    <div className="firma-kartlari-warning-list">
                      <div>{`Final için doldurulması gereken alanlar: ${outgoingRequiredFieldList.join(", ")}`}</div>
                    </div>
                  </div>
                ) : null}

                {isBizimBelgelerLayout ? (
                  <div className="mt-16">
                    <SectionHeader title="Model Bağlantılı Belge Özeti" />
                    <div className="status-text">
                      Bizim kestiğimiz belgelerde ürün eşleştirme yoktur.
                      PDF'den gelen belge bilgilerini modele bağlayıp kaydedin.
                    </div>
                    <div className="mgi-form-grid mgi-form-grid-4 mt-16">
                      <Input
                        label="Model"
                        value={
                          selectedModelKaydi.modelAdi || draft.modelAdi || ""
                        }
                        readOnly
                      />
                      <Input
                        label="Firma"
                        value={draft.firma || ""}
                        onChange={(e) => syncCompanyDraft(e.target.value)}
                      />
                      <Input
                        label="İrsaliye No"
                        value={draft.irsaliyeNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            irsaliyeNo: e.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Fatura No"
                        value={draft.faturaNo || ""}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, faturaNo: e.target.value }))
                        }
                      />
                    </div>
                    <div className="mgi-form-grid mgi-form-grid-4 mt-12">
                      <Input
                        label="Adet"
                        value={
                          draft.belgeAdediToplami ||
                          draft.faturalananAdet ||
                          draft.irsaliyeAdedi ||
                          0
                        }
                        onChange={(e) => {
                          const value = parseMoney(e.target.value);
                          setDraft((p) => ({
                            ...p,
                            belgeAdediToplami: value,
                            faturalananAdet:
                              flowTypeMeta(p.flowType || p.workflowType)
                                .belgeTipi === "fatura"
                                 ? value
                                : p.faturalananAdet,
                            irsaliyeAdedi:
                              flowTypeMeta(p.flowType || p.workflowType)
                                .belgeTipi === "irsaliye"
                                 ? value
                                : p.irsaliyeAdedi,
                          }));
                        }}
                      />
                      <MoneyInput
                        label="Tutar"
                        value={draft.subtotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            subtotal: v,
                            grandTotal: Number(
                              (v + Number(p.kdv || 0)).toFixed(2),
                            ),
                          }))
                        }
                      />
                      <MoneyInput
                        label="KDV"
                        value={draft.kdv}
                        onValueChange={(v) =>
                          setDraft((p) => ({
                            ...p,
                            kdv: v,
                            grandTotal: Number(
                              (Number(p.subtotal || 0) + v).toFixed(2),
                            ),
                          }))
                        }
                      />
                      <MoneyInput
                        label="Genel Toplam"
                        value={draft.grandTotal}
                        onValueChange={(v) =>
                          setDraft((p) => ({ ...p, grandTotal: v }))
                        }
                      />
                    </div>
                  </div>
                ) : null}

                {isTedarikciFaturaLayout && reviewState.needsAttention ? (
                  <div className="warning-box mt-16">
                    <strong>Eşleşme Kontrolü Önerisi</strong>
                    <div className="firma-kartlari-warning-list">
                      {(reviewState.notes.length
                         ? reviewState.notes
                        : [
                            "Belge kalemlerinde eşleşmeyen veya kontrol gerektiren satırlar bulunuyor.",
                          ]
                      ).map((note, index) => (
                        <div key={`${note}_${index}`}>{note}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isTedarikciFaturaLayout && activeDocTab === "belge"  (
              <div className="content-card mgi-history-card mgi-supplier-items-card">
                {!isDirectNonOfficialSupplierMode ? (
                  <>
                    <SectionHeader title="Belge Kalemleri" />
                    <div className="belge-items-toolbar">
                      <div className="status-text">
                        {isTedarikciFaturaLayout
                           ? "Kalem eşleşmesi ve ürün bağlama bu ekranın ana çalışma alanıdır."
                          : "Belge kalemlerini kontrol edip finalize edin."}
                      </div>
                      <button
                        className="soft-btn"
                        type="button"
                        onClick={addLine}
                      >
                        + Kalem Ekle
                      </button>
                    </div>

                    {draft.candidateRows.length ? (
                      <>
                        <div className="belge-items-toolbar mt-16">
                          <div>
                            <h4>Okunan Satırlar</h4>
                            <div className="status-text">
                              Ham satırları temizleyip düzenleyin, ardından
                              kalemlere alın.
                            </div>
                          </div>
                        </div>
                        <div className="table-wrap mt-8 mgi-candidate-table-scroll">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Okunan Satır</th>
                                <th>Eşleşen Firma</th>
                                <th>Birim</th>
                                <th>Bulunan Değerler</th>
                                <th>Durum</th>
                                <th>İşlem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {draft.candidateRows.map((row) => (
                                <tr key={row?.id}>
                                  <td>{row?.rawText || "-"}</td>
                                  <td>
                                    {draft.matchedCompanyName ||
                                      draft.firma ||
                                      "Eşleşme bekliyor"}
                                  </td>
                                  <td>{row?.detectedUnit || "-"}</td>
                                  <td>
                                    {Array.isArray(row?.detectedNumbers)
                                       ? row?.detectedNumbers.join(" / ")
                                      : "-"}
                                  </td>
                                  <td>
                                    {row?.rejectReason
                                       ? "Kontrol gerekli"
                                      : row?.looksLikeItem
                                         ? "Kaleme alınabilir"
                                        : "Belirsiz"}
                                  </td>
                                  <td className="mgi-table-actions">
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      disabled={Boolean(row?.rejectReason)}
                                      onClick={() => addCandidateToItems(row)}
                                    >
                                      Kaleme Al
                                    </button>
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      onClick={() => editCandidateRow(row)}
                                    >
                                      Düzenle
                                    </button>
                                    <button
                                      className="soft-btn tiny-btn mgi-danger-btn"
                                      type="button"
                                      onClick={() => removeCandidateRow(row?.id)}
                                    >
                                      Sil
                                    </button>
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      onClick={() => splitCandidateRow(row)}
                                    >
                                      Böl
                                    </button>
                                    <button
                                      className="soft-btn tiny-btn"
                                      type="button"
                                      onClick={() =>
                                        mergeCandidateRowWithNext(row?.id)
                                      }
                                    >
                                      Birleştir
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : null}

                    <div className="table-wrap mt-16 mgi-supplier-items-scroll">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Kalem / Açıklama</th>
                            <th>Ürün / Eşleşme</th>
                            <th>Ambalaj</th>
                            <th>Lot No</th>
                            <th>Miktar</th>
                            <th>Birim</th>
                            <th>Birim Fiyat</th>
                            <th>KDV Oranı</th>
                            <th>KDV Tutarı</th>
                            <th>Satır Toplamı</th>
                            <th>Eşleşme Durumu</th>
                            <th>İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.items.map((item) => (
                            <tr key={item?.id}>
                              <td>
                                <input
                                  value={item?.aciklama || ""}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      aciklama: e.target.value,
                                      rawDescription:
                                        item?.rawDescription || e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={item?.matchedProductId || ""}
                                  onChange={(e) =>
                                    selectMatchedProduct(
                                      item?.id,
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">
                                    {item?.matchedProductName
                                       ? "Eşleşmeyi kaldır"
                                      : "Ürün seçin"}
                                  </option>
                                  {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.urunAdi || product.ticariAdi}
                                    </option>
                                  ))}
                                </select>
                                <div className="status-text">
                                  {item?.matchedProductName
                                     `${item?.matchedProductName}${
                                        item?.matchedProductCode
                                           ? ` | ${item?.matchedProductCode}`
                                          : ""
                                      ? }`
                                    : item?.matchWarning ||
                                      "Ürün eşleşmesi henüz yok"}
                                </div>
                              </td>
                              <td>
                                <input
                                  value={item?.ambalaj || ""}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      ambalaj: e.target.value,
                                    })
                                  }
                                  placeholder="25 x 50 kg"
                                />
                              </td>
                              <td>
                                <input
                                  value={item?.lotNo || ""}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      lotNo: e.target.value,
                                    })
                                  }
                                  placeholder="Lot no"
                                />
                              </td>
                              <td>
                                <input
                                  value={item?.miktar || 0}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      miktar: parseMoney(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  value={item?.birim || "ADET"}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      birim: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  value={item?.birimFiyat || 0}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      birimFiyat: parseMoney(e.target.value),
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  value={item?.kdvOrani || 0}
                                  onChange={(e) =>
                                    updateItem(item?.id, {
                                      kdvOrani: parseMoney(e.target.value),
                                      kdvTutari: 0,
                                    })
                                  }
                                />
                              </td>
                              <td>{formatMoney(item?.kdvTutari || 0)}</td>
                              <td>{formatMoney(item?.tutar || 0)}</td>
                              <td>
                                <div className="status-text">
                                  {item?.eslesmeTipi ||
                                    item?.productStatus ||
                                    "-"}
                                </div>
                              </td>
                              <td className="mgi-table-actions">
                                <button
                                  className="soft-btn tiny-btn"
                                  type="button"
                                  onClick={() => quickEditLineItem(item)}
                                >
                                  Düzenle
                                </button>
                                <button
                                  className="soft-btn tiny-btn mgi-danger-btn"
                                  type="button"
                                  onClick={() => removeLine(item?.id)}
                                >
                                  Sil
                                </button>
                                <button
                                  className="soft-btn tiny-btn"
                                  type="button"
                                  onClick={() =>
                                    resolveProductMatchForItem(item?.id)
                                  }
                                >
                                  Ürüne Bağla
                                </button>
                                <button
                                  className="soft-btn tiny-btn"
                                  type="button"
                                  onClick={() => createProductFromItem(item)}
                                >
                                  Yeni Ürün
                                </button>
                                <button
                                  className="soft-btn tiny-btn"
                                  type="button"
                                  disabled={!item?.matchedProductId}
                                  onClick={() => createAliasForItem(item)}
                                >
                                  Alias
                                </button>
                              </td>
                            </tr>
                          ))}
                          {!draft.items.length ? (
                            <tr>
                              <td colSpan={12}>Henüz kalem eklenmedi.</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="notice-box mt-16">
                    Bu belge gayri resmi cari modunda. Ayrı görünüm için Gayri
                    Resmi Cari sekmesini açın.
                  </div>
                )}

                <div className="document-intake-meta mt-16">
                  <div className="document-meta-card">
                    <span>Ara Toplam</span>
                    <strong>{formatMoney(totals.subtotal)}</strong>
                  </div>
                  <div className="document-meta-card">
                    <span>KDV</span>
                    <strong>{formatMoney(totals.kdv)}</strong>
                  </div>
                  <div className="document-meta-card">
                    <span>Genel Toplam</span>
                    <strong>{formatMoney(totals.grandTotal)}</strong>
                  </div>
                  <div className="document-meta-card">
                    <span>Kalem</span>
                    <strong>{draft.items.length}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {isTedarikciFaturaLayout && activeDocTab === "gayri-resmi"  (
              <div className="content-card mgi-history-card mgi-supplier-items-card">
                <SectionHeader
                  title="Gayri Resmi Direkt Kayit"
                  subtitle="Tarih, belge no, miktar ve aciklama ile dogrudan cari kayit olusturun. Havuz kullanilmaz."
                />
                <div className="mgi-form-grid mgi-form-grid-2 mt-16">
                  <Select
                    label="Firma / Tedarikci"
                    value={draft.firma || ""}
                    onChange={(e) => syncCompanyDraft(e.target.value)}
                    options={companySelectOptions}
                  />
                  <Input
                    label="Tarih"
                    type="date"
                    value={draft.tarih || ""}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, tarih: e.target.value }))
                    }
                  />
                  <Input
                    label="Belge No"
                    value={draft.documentNo || draft.faturaNo || ""}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        documentNo: e.target.value,
                        faturaNo: e.target.value,
                      }))
                    }
                  />
                  <MoneyInput
                    label="Miktar"
                    value={draft.grandTotal || draft.subtotal || 0}
                    onValueChange={(value) =>
                      setDraft((p) => ({
                        ...p,
                        subtotal: value,
                        kdv: 0,
                        grandTotal: value,
                      }))
                    }
                  />
                </div>
                <div className="mt-16">
                  <Textarea
                    label="Aciklama"
                    value={draft.aciklama || ""}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, aciklama: e.target.value }))
                    }
                    rows={5}
                    placeholder="Kisa aciklama girin..."
                  />
                </div>
                <div className="document-intake-meta mt-16">
                  <div className="document-meta-card">
                    <span>Durum</span>
                    <strong>{draft.status || "YENI KAYIT"}</strong>
                  </div>
                  <div className="document-meta-card">
                    <span>Kayit Tipi</span>
                    <strong>Gayri Resmi</strong>
                  </div>
                  <div className="document-meta-card">
                    <span>Tutar</span>
                    <strong>{formatMoney(draft.grandTotal || 0)}</strong>
                  </div>
                </div>
                <div className="mgi-process-actions mgi-direct-save-actions mt-16">
                  <button
                    className="soft-btn"
                    type="button"
                    disabled={busy}
                    onClick={resetDraftState}
                  >
                    Yeni Kayit
                  </button>
                  <button
                    className="primary-btn"
                    type="button"
                    disabled={busy}
                    onClick={() => save("ONAYLANDI", { directCariSave: true })}
                  >
                    Direk Kaydet
                  </button>
                </div>
                {message ? (
                  <div className="notice-box mt-16">{message}</div>
                ) : null}

                <div className="mgi-embedded-history-section mt-16">
                  <SectionHeader
                    title="Belge Gecmisi"
                    subtitle="Gayri resmi direkt kayitlar ve diger tedarikci belgeleri burada listelenir. Liste sabit yukseklikte kayar."
                  />
                  <div className="mgi-history-filters is-supplier mt-16">
                    <Select
                      label="Firma Filtresi"
                      value={historyFilters.firma}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          firma: e.target.value,
                        }))
                      }
                      options={historyCompanyFilterOptions}
                    />
                    <Input
                      label="Belge No Ara"
                      value={historyFilters.documentNo}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          documentNo: e.target.value,
                        }))
                      }
                    />
                    <Select
                      label="Durum"
                      value={historyFilters.status}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          status: e.target.value,
                        }))
                      }
                      options={[
                        { value: "", label: "Tüm Durumlar" },
                        { value: "TASLAK", label: "Taslak" },
                        { value: "ONAYLANDI", label: "Onaylandı" },
                      ]}
                    />
                    <Input
                      label="Başlangıç"
                      type="date"
                      value={historyFilters.fromDate}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          fromDate: e.target.value,
                        }))
                      }
                    />
                    <Input
                      label="Bitiş"
                      type="date"
                      value={historyFilters.toDate}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          toDate: e.target.value,
                        }))
                      }
                    />
                    <div className="mgi-history-filter-actions">
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => setHistoryPage(1)}
                      >
                        Filtrele
                      </button>
                      <button
                        className="soft-btn"
                        type="button"
                        onClick={() => {
                          setHistoryFilters({
                            firma: "",
                            tedarikci: "",
                            documentNo: "",
                            faturaNo: "",
                            irsaliyeNo: "",
                            modelAdi: "",
                            status: "",
                            fromDate: "",
                            toDate: "",
                          });
                          setHistoryPage(1);
                        }}
                      >
                        Temizle
                      </button>
                    </div>
                  </div>

                  <div className="table-wrap mt-16 mgi-embedded-history-scroll">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tarih</th>
                          <th>Belge No</th>
                          <th>Firma</th>
                          <th>Kayit Tipi</th>
                          <th>Tutar</th>
                          <th>Açıklama</th>
                          <th>Durum</th>
                          <th>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedHistoryRows.map((doc) => (
                          <tr
                            key={doc.documentId}
                            className={
                              selectedHistoryId === String(doc.documentId)
                                 ? "firma-row-selected"
                                : ""
                            }
                          >
                            <td>
                              {doc.header.date ||
                                doc.updatedAt.slice(0, 10) ||
                                "-"}
                            </td>
                            <td>
                              {doc.header.documentNo ||
                                doc.header.faturaNo ||
                                "-"}
                            </td>
                            <td>
                              {doc.header.tedarikciFirma ||
                                doc.relatedCompanyName ||
                                doc.matchedCompanyName ||
                                doc.firma ||
                                "-"}
                            </td>
                            <td>
                              {doc.header.resmiDurum ||
                                doc.companyType ||
                                "RESMI"}
                            </td>
                            <td>{formatMoney(doc.header.grandTotal || 0)}</td>
                            <td>{doc.header.aciklama || "-"}</td>
                            <td>
                              <span
                                className={`status-chip ${
                                  ["ONAYLANDI", "FINAL", "FİNAL"].includes(
                                    String(doc.status || "").toLocaleUpperCase(
                                      "tr-TR",
                                    ),
                                  )
                                     ? "ok-chip"
                                    : "warn-chip"
                                }`}
                              >
                                {doc.status || "TASLAK"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="soft-btn tiny-btn"
                                type="button"
                                disabled={busy}
                                onClick={() => loadHistoryToDraft(doc)}
                              >
                                Aç
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!pagedHistoryRows.length ? (
                          <tr>
                            <td colSpan={8}>Kayıt bulunamadı.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="mgi-history-footer">
                    <div className="status-text">{`Toplam ${historyRowsForTable.length} kayıt`}</div>
                    <div className="mgi-history-footer-right">
                      <label className="field mgi-page-size">
                        <span>Sayfa Boyutu</span>
                        <select
                          value={historyPageSize}
                          onChange={(e) => {
                            setHistoryPageSize(Number(e.target.value) || 20);
                            setHistoryPage(1);
                          }}
                        >
                          <option value={20}>20 / sayfa</option>
                          <option value={50}>50 / sayfa</option>
                          <option value={100}>100 / sayfa</option>
                        </select>
                      </label>
                      <div className="mgi-pagination">
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={() =>
                            setHistoryPage((p) => Math.max(1, p - 1))
                          }
                          disabled={historyPage <= 1}
                        >
                          {"<"}
                        </button>
                        <span>{historyPage}</span>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          onClick={() =>
                            setHistoryPage((p) =>
                              Math.min(historyTotalPages, p + 1),
                            )
                          }
                          disabled={historyPage >= historyTotalPages}
                        >
                          {">"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {activeDocTab === "gecmis" && !isTedarikciFaturaLayout ? (
              <div
                className={`content-card mgi-history-card ${
                  isTedarikciFaturaLayout ? "mgi-supplier-history-card" : ""
                }`}
              >
                <SectionHeader
                  title="Belge Gecmisi"
                  subtitle={
                    isTedarikciFaturaLayout
                       ? "Tum tedarikci belgeleri burada listelenir. Firma filtresi istege baglidir."
                      : "Taslak ve final tum belge hareketleri en guncelden eskiye listelenir."
                  }
                />
                <div
                  className={`mgi-history-filters ${
                    isTedarikciFaturaLayout ? "is-supplier" : ""
                  }`}
                >
                  <Select
                    label={
                      isTedarikciFaturaLayout ? "Firma Filtresi" : "Firma Ara"
                    }
                    value={historyFilters.firma}
                    onChange={(e) =>
                      setHistoryFilters((p) => ({
                        ...p,
                        firma: e.target.value,
                      }))
                    }
                    options={historyCompanyFilterOptions}
                  />
                  <Input
                    label="Belge No Ara"
                    value={historyFilters.documentNo}
                    onChange={(e) =>
                      setHistoryFilters((p) => ({
                        ...p,
                        documentNo: e.target.value,
                      }))
                    }
                  />
                  {isTedarikciFaturaLayout ? null : (
                    <>
                      <Input
                        label="İrsaliye No Ara"
                        value={historyFilters.irsaliyeNo}
                        onChange={(e) =>
                          setHistoryFilters((p) => ({
                            ...p,
                            irsaliyeNo: e.target.value,
                          }))
                        }
                      />
                      <Select
                        label="Model Ara"
                        value={historyFilters.modelAdi}
                        onChange={(e) =>
                          setHistoryFilters((p) => ({
                            ...p,
                            modelAdi: e.target.value,
                          }))
                        }
                        options={historyModelFilterOptions}
                      />
                    </>
                  )}
                  {isTedarikciFaturaLayout ? (
                    <Select
                      label="Durum"
                      value={historyFilters.status}
                      onChange={(e) =>
                        setHistoryFilters((p) => ({
                          ...p,
                          status: e.target.value,
                        }))
                      }
                      options={[
                        { value: "", label: "Tüm Durumlar" },
                        { value: "TASLAK", label: "Taslak" },
                        { value: "ONAYLANDI", label: "Onaylandı" },
                      ]}
                    />
                  ) : null}
                  <Input
                    label="Başlangıç"
                    type="date"
                    value={historyFilters.fromDate}
                    onChange={(e) =>
                      setHistoryFilters((p) => ({
                        ...p,
                        fromDate: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Bitiş"
                    type="date"
                    value={historyFilters.toDate}
                    onChange={(e) =>
                      setHistoryFilters((p) => ({
                        ...p,
                        toDate: e.target.value,
                      }))
                    }
                  />
                  <div className="mgi-history-filter-actions">
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => setHistoryPage(1)}
                    >
                      Filtrele
                    </button>
                    <button
                      className="soft-btn"
                      type="button"
                      onClick={() => {
                        setHistoryFilters({
                          firma: "",
                          tedarikci: "",
                          documentNo: "",
                          faturaNo: "",
                          irsaliyeNo: "",
                          modelAdi: "",
                          status: "",
                          fromDate: "",
                          toDate: "",
                        });
                        setHistoryPage(1);
                      }}
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="table-wrap mt-16">
                  <table className="table">
                    <thead>
                      {isTedarikciFaturaLayout ? (
                        <tr>
                          <th>Tarih</th>
                          <th>Belge No</th>
                          <th>Firma</th>
                          <th>Kayit Tipi</th>
                          <th>Tutar</th>
                          <th>Açıklama</th>
                          <th>Durum</th>
                          <th>İşlem</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Tarih</th>
                          <th>Firma</th>
                          <th>Belge No</th>
                          <th>Fatura No</th>
                          <th>İrsaliye No</th>
                          <th>Model</th>
                          <th>Belge Tipi</th>
                          <th>Toplam Tutar</th>
                          <th>Durum</th>
                          <th>Açıklama</th>
                          <th>İşlem</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {pagedHistoryRows.map((doc) => (
                        <tr
                          key={doc.documentId}
                          className={
                            selectedHistoryId === String(doc.documentId)
                               ? "firma-row-selected"
                              : ""
                          }
                        >
                          <td>
                            {doc.header.date ||
                              doc.updatedAt.slice(0, 10) ||
                              "-"}
                          </td>
                          {isTedarikciFaturaLayout ? (
                            <>
                              <td>
                                {doc.header.documentNo ||
                                  doc.header.faturaNo ||
                                  "-"}
                              </td>
                              <td>
                                {doc.header.tedarikciFirma ||
                                  doc.relatedCompanyName ||
                                  doc.matchedCompanyName ||
                                  doc.firma ||
                                  "-"}
                              </td>
                              <td>
                                {doc.header.resmiDurum ||
                                  doc.companyType ||
                                  "RESMI"}
                              </td>
                              <td>
                                {formatMoney(doc.header.grandTotal || 0)}
                              </td>
                              <td>{doc.header.aciklama || "-"}</td>
                            </>
                          ) : (
                            <>
                              <td>{doc.header.documentNo || "-"}</td>
                              <td>{doc.header.faturaNo || "-"}</td>
                              <td>
                                {doc.header.irsaliyeNo ||
                                  doc.header.dispatchNo ||
                                  "-"}
                              </td>
                              <td>{doc.header.modelAdi || "-"}</td>
                              <td>
                                {flowTypeMeta(
                                  doc.header.flowType || doc.workflowType,
                                ).label || "-"}
                              </td>
                              <td>
                                {formatMoney(doc.header.grandTotal || 0)}
                              </td>
                            </>
                          )}
                          <td>
                            <span
                              className={`status-chip ${
                                ["ONAYLANDI", "FINAL", "FİNAL"].includes(
                                  String(doc.status || "").toLocaleUpperCase(
                                    "tr-TR",
                                  ),
                                )
                                   ? "ok-chip"
                                  : "warn-chip"
                              }`}
                            >
                              {doc.status || "TASLAK"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="soft-btn tiny-btn"
                              type="button"
                              disabled={busy}
                              onClick={() => loadHistoryToDraft(doc)}
                            >
                              Aç
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!pagedHistoryRows.length ? (
                        <tr>
                          <td colSpan={isTedarikciFaturaLayout ? 8 : 11}>
                            Kayıt bulunamadı.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="mgi-history-footer">
                  <div className="status-text">{`Toplam ${historyRowsForTable.length} kayıt`}</div>
                  <div className="mgi-history-footer-right">
                    <label className="field mgi-page-size">
                      <span>Sayfa Boyutu</span>
                      <select
                        value={historyPageSize}
                        onChange={(e) => {
                          setHistoryPageSize(Number(e.target.value) || 20);
                          setHistoryPage(1);
                        }}
                      >
                        <option value={20}>20 / sayfa</option>
                        <option value={50}>50 / sayfa</option>
                        <option value={100}>100 / sayfa</option>
                      </select>
                    </label>
                    <div className="mgi-pagination">
                      <button
                        className="soft-btn tiny-btn"
                        type="button"
                        onClick={() =>
                          setHistoryPage((p) => Math.max(1, p - 1))
                        }
                        disabled={historyPage <= 1}
                      >
                        {"<"}
                      </button>
                      <span>{historyPage}</span>
                      <button
                        className="soft-btn tiny-btn"
                        type="button"
                        onClick={() =>
                          setHistoryPage((p) =>
                            Math.min(historyTotalPages, p + 1),
                          )
                        }
                        disabled={historyPage >= historyTotalPages}
                      >
                        {">"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {showModelQuickCreate ? (
          <div className="mgi-modal-overlay" onClick={closeModelQuickCreate}>
            <div
              className="mgi-modal-card"
              onClick={(event) => event?.stopPropagation()}
            >
              <SectionHeader
                title={modelQuickForm.id ? "Model Güncelle" : "Yeni Model"}
                subtitle={
                  modelQuickForm.id
                     ? "Seçili model kaydını hızlıca düzenleyin."
                    : "Hızlı model kaydı açıp belgeye otomatik bağlayın."
                }
              />
              <div className="mgi-form-grid mgi-form-grid-2">
                <Input
                  label="Ana Firma"
                  value={activeMainCompany?.name || ""}
                  readOnly
                />
                <Input
                  label="Firma"
                  value={modelQuickForm.firma}
                  onChange={(e) =>
                    setModelQuickForm((prev) => ({
                      ...prev,
                      firma: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Model Adı"
                  value={modelQuickForm.modelAdi}
                  onChange={(e) =>
                    setModelQuickForm((prev) => ({
                      ...prev,
                      modelAdi: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Zemin"
                  value={modelQuickForm.zemin}
                  onChange={(e) =>
                    setModelQuickForm((prev) => ({
                      ...prev,
                      zemin: e.target.value,
                    }))
                  }
                />
                <Textarea
                  label="Açıklama / Not (opsiyonel)"
                  value={modelQuickForm.not}
                  onChange={(e) =>
                    setModelQuickForm((prev) => ({
                      ...prev,
                      not: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
              <ActionBar>
                <button
                  className="soft-btn"
                  type="button"
                  onClick={closeModelQuickCreate}
                  disabled={modelCreateBusy}
                >
                  Vazgeç
                </button>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={saveQuickModelFromDialog}
                  disabled={modelCreateBusy}
                >
                  {modelCreateBusy
                     ? "Kaydediliyor..."
                    : modelQuickForm.id
                       ? "Modeli Güncelle"
                      : "Modeli Kaydet"}
                </button>
              </ActionBar>
            </div>
          </div>
        ) : null}
        {showProductQuickEditor ? (
          <div className="mgi-modal-overlay" onClick={closeProductQuickEditor}>
            <div
              className="mgi-modal-card"
              onClick={(event) => event?.stopPropagation()}
            >
              <SectionHeader
                title={productQuickForm.id ? "Ürün Güncelle" : "Yeni Ürün"}
                subtitle="Tedarikçi ekranındaki ürün/eşleşme listesi için hızlı kayıt alanı."
              />
              <div className="mgi-form-grid mgi-form-grid-2">
                <Input
                  label="Ürün Adı"
                  value={productQuickForm.urunAdi}
                  onChange={(e) =>
                    setProductQuickForm((prev) => ({
                      ...prev,
                      urunAdi: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Kategori"
                  value={productQuickForm.kategori}
                  onChange={(e) =>
                    setProductQuickForm((prev) => ({
                      ...prev,
                      kategori: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Birim"
                  value={productQuickForm.birim}
                  onChange={(e) =>
                    setProductQuickForm((prev) => ({
                      ...prev,
                      birim: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Varsayılan Ambalaj"
                  value={productQuickForm.varsayilanAmbalaj}
                  onChange={(e) =>
                    setProductQuickForm((prev) => ({
                      ...prev,
                      varsayilanAmbalaj: e.target.value,
                    }))
                  }
                />
                <Textarea
                  label="Not"
                  value={productQuickForm.not}
                  onChange={(e) =>
                    setProductQuickForm((prev) => ({
                      ...prev,
                      not: e.target.value,
                    }))
                  }
                  rows={3}
                />
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={productQuickForm.aktif !== false}
                    onChange={(e) =>
                      setProductQuickForm((prev) => ({
                        ...prev,
                        aktif: e.target.checked,
                      }))
                    }
                  />{" "}
                  Aktif
                </label>
              </div>
              <ActionBar>
                <button
                  className="soft-btn"
                  type="button"
                  onClick={closeProductQuickEditor}
                  disabled={productQuickBusy}
                >
                  Vazgeç
                </button>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={saveProductQuickEditor}
                  disabled={productQuickBusy}
                >
                  {productQuickBusy
                     ? "Kaydediliyor..."
                    : productQuickForm.id
                       ? "Ürünü Güncelle"
                      : "Ürünü Kaydet"}
                </button>
              </ActionBar>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="content-grid"
      style={
        isFocusedDocumentFlow
           {
              display: "grid",
              gridTemplateColumns: "360px minmax(0, 1fr)",
              alignItems: "start",
              gap: 16,
              width: "100%",
              maxWidth: "none",
            ? }
          : undefined
      }
    >
      {isFocusedDocumentFlow ? (
        <div
          className="content-card"
          style={{
            position: "sticky",
            top: 12,
            maxHeight: "calc(100vh - 32px)",
            width: "100%",
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <SectionHeader
            title={documentPoolTitle()}
            subtitle="Final olmayan kayıtlar burada aktif çalışma listesi olarak durur."
          />
          <button
            className="primary-btn"
            type="button"
            onClick={resetDraftState}
          >
            Yeni Taslak
          </button>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: "40vh",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {poolRows.map((doc) => (
              <button
                key={doc.documentId}
                type="button"
                className={`soft-btn ${
                  selectedHistoryId === String(doc.documentId)
                     ? "firma-row-selected"
                    : ""
                }`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  whiteSpace: "normal",
                  borderRadius: 12,
                  padding: 10,
                }}
                onClick={() => loadHistoryToDraft(doc)}
              >
                <div className="status-text">{documentPoolType(doc)}</div>
                <strong>{documentPoolNo(doc)}</strong>
                <div className="status-text">{documentPoolCompany(doc)}</div>
                <div className="status-text">
                  {doc.header.date || doc.updatedAt.slice(0, 10) || "-"} |{" "}
                  {sectionKey === "tedarikci-fatura"
                     `${formatMoney(doc.header.grandTotal || 0)} | KDV ${formatMoney(
                        doc.header.kdv || 0,
                      ? )} | ${Array.isArray(doc.items) ? doc.items.length : 0} kalem | ${unmatchedDocumentItemCount(doc)} eşleşmeyen`
                    : `Adet ${
                        doc.header.belgeAdediToplami ||
                        doc.header.irsaliyeAdedi ||
                        doc.header.faturalananAdet ||
                        0
                      }`}
                </div>
                <div className="status-text">
                  Durum: {doc.status || "TASLAK"}
                </div>
              </button>
            ))}
            {!poolRows.length ? (
              <div className="notice-box">Aktif havuz kaydı yok.</div>
            ) : null}
          </div>

          <div
            style={{ borderTop: "1px solid rgba(15,23,42,.1)", paddingTop: 12 }}
          >
            <SectionHeader
              title={secondaryPanelTitle}
              subtitle={
                sectionKey === "tedarikci-fatura"
                   ? "Kalem eşleştirme için ürün referansı."
                  : "Belgeyi bağlamak için model seçin."
              }
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: "34vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {secondaryPanelRows.slice(0, 80).map((item) => (
                <button
                  key={item?.id}
                  type="button"
                  className={`soft-btn ${
                    String(draft.modelKaydiId || "") === String(item?.id)
                       ? "firma-row-selected"
                      : ""
                  }`}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    whiteSpace: "normal",
                    borderRadius: 12,
                    padding: 10,
                  }}
                  onClick={() => {
                    if (sectionKey !== "tedarikci-fatura") {
                      applyModelKaydiToDraft(item?.id);
                    }
                  }}
                >
                  <strong>
                    {item?.modelAdi || item?.urunAdi || item?.ticariAdi || "-"}
                  </strong>
                  <div className="status-text">
                    {item?.musteriFirma || item?.firma || item?.kategori || "-"}
                  </div>
                  <div className="status-text">
                    {sectionKey === "tedarikci-fatura"
                       ? `${item?.birim || "-"} | ${item?.varsayilanAmbalaj || "-"}`
                      : `Gelen ${item?.gelenAdet || 0} | Kalan ${
                          item?.kalanAdet || 0
                        }`}
                  </div>
                </button>
              ))}
              {!secondaryPanelRows.length ? (
                <div className="notice-box">Liste kaydı yok.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="belge-workspace"
        style={
          isFocusedDocumentFlow
             {
                display: "flex",
                flexDirection: "column",
                gap: 14,
                width: "100%",
                minWidth: 0,
                maxWidth: "none",
              ? }
            : undefined
        }
      >
        <div
          className="content-card belge-form-card"
          style={
            isFocusedDocumentFlow
               ? { width: "100%", minWidth: 0, maxWidth: "none" }
              : undefined
          }
        >
          <SectionHeader
            title={config.title}
            subtitle={
              isGenelGider
                 ? "Önce temel belge bilgilerini girin, ardından kalemleri ve toplamları kontrol edin."
                : "Havuzdan seçin, eksikleri tamamlayın, bağlayın ve final kaydedin."
            }
            right={
              <button
                className="soft-btn"
                type="button"
                onClick={resetDraftState}
              >
                Yeni Taslak
              </button>
            }
          />

          {!isGenelGider ? (
            <div className="info-grid info-grid-4 mt-16">
              <MetricBox
                icon="firma-kartlari"
                label="Ana Firma"
                value={activeMainCompany?.name || "-"}
                subText="Aktif ana firma"
                tone="blue"
              />
              <MetricBox
                icon="users"
                label="Firma"
                value={draft.firma || draft.matchedCompanyName || "-"}
                subText="Belge firması"
                tone="green"
              />
              <MetricBox
                icon="takvim"
                label="Tarih"
                value={draft.tarih || "-"}
                subText="Belge tarihi"
                tone="orange"
              />
              <MetricBox
                icon={draft.status === "FINAL" ? "onay" : "saat"}
                label="Durum"
                value={draft.status || "TASLAK"}
                subText="Belge akışı"
                tone={draft.status === "FINAL" ? "green" : "purple"}
              />
            </div>
          ) : null}

          {isGenelGider ? (
            <>
              <div className="form-grid mt-16">
                <Select
                  label="Gider Türü"
                  value={draft.giderTuru || "DIGER"}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, giderTuru: e.target.value }))
                  }
                  options={[
                    { value: "SU", label: "Su" },
                    { value: "ELEKTRIK", label: "Elektrik" },
                    { value: "DOGALGAZ", label: "Doğalgaz" },
                    { value: "KIRA", label: "Kira" },
                    { value: "PERSONEL_YEVMIYE", label: "Personel Yevmiye" },
                    {
                      value: "KREDI_KARTI_ODEMESI",
                      label: "Kredi Kartı Ödemesi",
                    },
                    { value: "NAKIT_ODEME", label: "Nakit Ödeme" },
                    { value: "SARF_ALIMI", label: "Sarf Alımı" },
                    { value: "HIZMET_ALIMI", label: "Hizmet Alımı" },
                    { value: "DIGER", label: "Diğer Genel Gider" },
                  ]}
                />
                <Select
                  label="Ödeme Türü"
                  value={draft.odemeTuru || ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, odemeTuru: e.target.value }))
                  }
                  options={(paymentTypes.length
                     ? paymentTypes.filter((item) => item?.aktif)
                    : [{ id: 0, ad: "Nakit" }]
                  ).map((item) => ({ value: item?.ad, label: item?.ad }))}
                />
                <Input
                  label="Tarih"
                  type="date"
                  value={draft.tarih}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, tarih: e.target.value }))
                  }
                />
                <Input
                  label="Belge No"
                  value={draft.documentNo}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, documentNo: e.target.value }))
                  }
                />
                <Select
                  label="Resmi / Gayri Resmi"
                  value={draft.resmiDurum || "RESMI"}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, resmiDurum: e.target.value }))
                  }
                  options={[
                    { value: "RESMI", label: "Resmi" },
                    { value: "GAYRI_RESMI", label: "Gayri Resmi" },
                  ]}
                />
                <CompanyQuickPicker
                  label="Gider Bağlantı Firması"
                  companies={companies}
                  value={draft.firma}
                  recentCompanies={recentCompanies}
                  helperText={companyHelperText}
                  onChange={(name) => syncCompanyDraft(name)}
                  fullWidth={false}
                />
                <div className="field">
                  <span>Firma Eşleme</span>
                  <div className="action-bar">
                    <button
                      className="soft-btn tiny-btn"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        resolveCompanyMatch(
                          draft.rawDetectedCompanyName || draft.firma,
                        )
                      }
                    >
                      Firma Eşleştir
                    </button>
                    <span className="status-text">
                      {draft.firmaEslesmeTipi || "KULLANICI_ONAYI"}
                    </span>
                  </div>
                </div>
                <MoneyInput
                  label="Tutar"
                  value={draft.subtotal}
                  onValueChange={(v) =>
                    setDraft((p) => ({
                      ...p,
                      subtotal: v,
                      grandTotal: Number((v + Number(p.kdv || 0)).toFixed(2)),
                    }))
                  }
                />
                <MoneyInput
                  label="KDV"
                  value={draft.kdv}
                  onValueChange={(v) =>
                    setDraft((p) => ({
                      ...p,
                      kdv: v,
                      grandTotal: Number(
                        (Number(p.subtotal || 0) + v).toFixed(2),
                      ),
                    }))
                  }
                />
                <Textarea
                  label="Açıklama"
                  value={draft.aciklama}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, aciklama: e.target.value }))
                  }
                />
              </div>
            </>
          ) : (
            <div className="form-grid mt-16">
              {!isIncomingDispatchMode && (
                <Select
                  label="Belge Tipi / İş Akışı"
                  value={draft.workflowType}
                  onChange={(e) => {
                    const normalized =
                      normalizeFlowType(e.target.value) || e.target.value;
                    const meta = flowTypeMeta(normalized);
                    setDraft((p) => ({
                      ...p,
                      workflowType: normalized,
                      flowType: normalized,
                      belgeYonu: meta.belgeYonu || p.belgeYonu,
                      belgeTipi: meta.belgeTipi || p.belgeTipi,
                    }));
                  }}
                  options={config.workflowOptions}
                />
              )}
              {draftFlowMeta.belgeYonu === "giden"  (
                <Select
                  label="Model Kaydı"
                  value={draft.modelKaydiId || ""}
                  onChange={(e) => applyModelKaydiToDraft(e.target.value)}
                  options={[
                    { value: "", label: "Model kaydı seçin" },
                    ...modelKayitlari.map((item) => ({
                      value: item?.id,
                      label: `${item?.modelAdi} | ${item?.musteriIrsaliyeNo} | ${
                        item?.musteriFirma || item?.firma
                      } | Gelen: ${item?.gelenAdet} | Kalan: ${item?.kalanAdet}`,
                    })),
                  ]}
                />
              ) : null}
              {!isIncomingDispatchMode && (
                <Select
                  label="Belge Sınıfı"
                  value={draft.documentClass}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, documentClass: e.target.value }))
                  }
                  options={PDF_DOCUMENT_CLASS_OPTIONS}
                />
              )}
              {!isIncomingDispatchMode && (
                <Input
                  label="Belge No"
                  value={draft.documentNo}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, documentNo: e.target.value }))
                  }
                />
              )}
              {!isIncomingDispatchMode && (
                <Input
                  label="Fatura No"
                  value={draft.faturaNo || ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, faturaNo: e.target.value }))
                  }
                />
              )}
              <Input
                label="İrsaliye No"
                value={draft.irsaliyeNo || ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, irsaliyeNo: e.target.value }))
                }
                readOnly={draftFlowMeta.belgeYonu === "giden"}
              />
              <Input
                label="Model Adı"
                value={draft.modelAdi || ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, modelAdi: e.target.value }))
                }
                placeholder="Giden belgelerde zorunlu"
                readOnly={draftFlowMeta.belgeYonu === "giden"}
              />
              <Input
                label="Zemin"
                value={draft.zemin || ""}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, zemin: e.target.value }))
                }
                readOnly={draftFlowMeta.belgeYonu === "giden"}
              />
              {draftFlowMeta.belgeYonu === "gelen" &&
              draftFlowMeta.belgeTipi === "irsaliye"  (
                <Input
                  label="Kesimhane Adı"
                  value={draft.kesimhaneBilgisi || ""}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      kesimhaneBilgisi: e.target.value,
                    }))
                  }
                />
              ) : null}
              <Input
                label="Tarih"
                type="date"
                value={draft.tarih}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, tarih: e.target.value }))
                }
              />
              <CompanyQuickPicker
                label="Firma"
                companies={companies}
                value={draft.firma}
                recentCompanies={recentCompanies}
                helperText={companyHelperText}
                onChange={(name) => syncCompanyDraft(name)}
                fullWidth={false}
                disabled={
                  draftFlowMeta.belgeYonu === "giden" || isIncomingDispatchMode
                }
              />
              {!isIncomingDispatchMode && (
                <div className="field">
                  <span>Firma Eşleme</span>
                  <div className="action-bar">
                    <button
                      className="soft-btn tiny-btn"
                      type="button"
                      disabled={busy || draftFlowMeta.belgeYonu === "giden"}
                      onClick={() =>
                        resolveCompanyMatch(
                          draft.rawDetectedCompanyName || draft.firma,
                        )
                      }
                    >
                      Firma Eşleştir
                    </button>
                    <span className="status-text">
                      {draft.firmaEslesmeTipi || "KULLANICI_ONAYI"}
                    </span>
                  </div>
                </div>
              )}
              {!isIncomingDispatchMode &&
              draftFlowMeta.belgeYonu === "gelen" &&
              draftFlowMeta.belgeTipi === "irsaliye"  (
                <div className="field">
                  <span>Model Kaydı Durumu</span>
                  <div className="picker-helper-text">
                    {incomingLinkedModelKaydi
                       `Bağlı model kaydı hazır: ${
                          incomingLinkedModelKaydi.modelAdi
                        } | ${
                          Array.isArray(
                            incomingLinkedModelKaydi.musteriIrsaliyeleri,
                          ) &&
                          incomingLinkedModelKaydi.musteriIrsaliyeleri.length >
                            1
                             ? `${incomingLinkedModelKaydi.musteriIrsaliyeleri.length} irsaliye bağlı`
                            : incomingLinkedModelKaydi.musteriIrsaliyeNo
                        ? } | Gelen: ${incomingLinkedModelKaydi.gelenAdet}`
                      : "Bu müşteri irsaliyesi için ana model kaydı henüz açılmadı."}
                  </div>
                  {!incomingLinkedModelKaydi ? (
                    <button
                      className="soft-btn tiny-btn mt-16"
                      type="button"
                      disabled={busy}
                      onClick={createModelKaydiFromDraft}
                    >
                      Model Kaydı Aç
                    </button>
                  ) : null}
                </div>
              ) : null}
              {!isIncomingDispatchMode && selectedModelKaydi ? (
                <div className="field">
                  <span>Model Özet</span>
                  <div className="picker-helper-text">
                    {`Gelen: ${selectedModelKaydi.gelenAdet} | Üretim: ${
                      selectedModelKaydi.imalattanCikanAdet ||
                      selectedModelKaydi.toplamUretim ||
                      0
                    } | Fatura: ${
                      selectedModelKaydi.kesilenFaturaAdedi ||
                      selectedModelKaydi.toplamFatura ||
                      0
                    } | Kalan: ${selectedModelKaydi.kalanAdet} | ${
                      selectedModelKaydi.aktifDurum || selectedModelKaydi.durum
                    }`}
                  </div>
                </div>
              ) : null}
              {!isIncomingDispatchMode && (
                <Select
                  label="Resmi / Gayri Resmi"
                  value={draft.resmiDurum || "RESMI"}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, resmiDurum: e.target.value }))
                  }
                  options={[
                    { value: "RESMI", label: "Resmi" },
                    { value: "GAYRI_RESMI", label: "Gayri Resmi" },
                  ]}
                />
              )}
              {!isIncomingDispatchMode && (
                <MoneyInput
                  label="Ara Toplam"
                  value={draft.subtotal}
                  onValueChange={(v) =>
                    setDraft((p) => ({
                      ...p,
                      subtotal: v,
                      grandTotal: Number((v + Number(p.kdv || 0)).toFixed(2)),
                    }))
                  }
                />
              )}
              {!isIncomingDispatchMode && (
                <MoneyInput
                  label="KDV"
                  value={draft.kdv}
                  onValueChange={(v) =>
                    setDraft((p) => ({
                      ...p,
                      kdv: v,
                      grandTotal: Number(
                        (Number(p.subtotal || 0) + v).toFixed(2),
                      ),
                    }))
                  }
                />
              )}
              {!isIncomingDispatchMode && (
                <MoneyInput
                  label="Genel Toplam"
                  value={draft.grandTotal}
                  onValueChange={(v) =>
                    setDraft((p) => ({ ...p, grandTotal: v }))
                  }
                />
              )}
              <Input
                label={
                  isIncomingDispatchMode ? "Gelen Adet" : "Belge Adedi Toplamı"
                }
                value={draft.belgeAdediToplami || 0}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    belgeAdediToplami: parseMoney(e.target.value),
                  }))
                }
              />
              {!isIncomingDispatchMode && (
                <Input
                  label="Faturalanan Adet"
                  value={draft.faturalananAdet || 0}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      faturalananAdet: parseMoney(e.target.value),
                    }))
                  }
                />
              )}
              {!isIncomingDispatchMode && (
                <Input
                  label="İrsaliye Adedi"
                  value={draft.irsaliyeAdedi || 0}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      irsaliyeAdedi: parseMoney(e.target.value),
                    }))
                  }
                />
              )}
              {!isIncomingDispatchMode && (
                <Input
                  label="Makina Karşılaştırma Key"
                  value={draft.makinaKarsilastirmaKey || ""}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      makinaKarsilastirmaKey: e.target.value,
                    }))
                  }
                />
              )}
              {isIncomingDispatchMode && (
                <Input
                  label="Piyon No (opsiyonel)"
                  value={draft.piyonNo || ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, piyonNo: e.target.value }))
                  }
                />
              )}
              <Textarea
                label="Açıklama"
                value={draft.aciklama}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, aciklama: e.target.value }))
                }
              />
            </div>
          )}

          <div className="belge-inline-helper mt-16">
            {!isIncomingDispatchMode && (
              <button
                className="soft-btn tiny-btn"
                type="button"
                onClick={() => setShowPaymentTypeManager((prev) => !prev)}
              >
                {showPaymentTypeManager
                   ? "Ödeme Türlerini Gizle"
                  : "Ödeme Türü Yardımı"}
              </button>
            )}
            <span className="status-text">
              {draft.documentId
                 ? "Açık taslak üzerinde çalışıyorsunuz."
                : "Manuel giriş öncelikli; belge yükleme isteğe bağlı."}
            </span>
          </div>

          {showPaymentTypeManager ? (
            <div className="panel-block belge-mini-block mt-16">
              <h4>Ödeme Türü Yönetimi</h4>
              <PaymentTypeManager
                rows={paymentTypes}
                busy={paymentTypeBusy}
                onSave={savePaymentType}
              />
            </div>
          ) : null}

          {!isIncomingDispatchMode && (
            <div className="panel-block mt-16">
              <div className="belge-items-toolbar">
                <div>
                  <h4>Belge Kalemleri</h4>
                  <div className="status-text">
                    {isGenelGider
                       ? "Tek satırlı gider de girebilir, isterseniz birden fazla kalem ekleyebilirsiniz."
                      : "Irsaliye / fatura akışında kalem yapısı ve ürün eşleşmesi önde tutulur."}
                  </div>
                </div>
                <button className="soft-btn" type="button" onClick={addLine}>
                  + Kalem Ekle
                </button>
              </div>

              {!!draft.candidateRows.length && !isIncomingDispatchMode ? (
                <div className="table-wrap mt-16">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Okunan Satır</th>
                        <th>Eşleşen Firma</th>
                        <th>Birim</th>
                        <th>Bulunan Değerler</th>
                        <th>Durum</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.candidateRows.map((row) => (
                        <tr key={row?.id}>
                          <td>{row?.rawText || "-"}</td>
                          <td>
                            {draft.matchedCompanyName ||
                              draft.firma ||
                              "Eşleşme bekliyor"}
                          </td>
                          <td>{row?.detectedUnit || "-"}</td>
                          <td>
                            {Array.isArray(row?.detectedNumbers)
                               ? row?.detectedNumbers.join(" / ")
                              : "-"}
                          </td>
                          <td>
                            {row?.rejectReason
                               ? "Kontrol gerekli"
                              : row?.looksLikeItem
                                 ? "Kaleme alınabilir"
                                : "Belirsiz"}
                          </td>
                          <td>
                            <button
                              className="soft-btn tiny-btn"
                              type="button"
                              disabled={Boolean(row?.rejectReason)}
                              onClick={() => addCandidateToItems(row)}
                            >
                              Kaleme Al
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="table-wrap mt-16">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Kalem / Açıklama</th>
                      {!isGenelGider ? <th>Ürün / Eşleşme</th> : null}
                      {!isGenelGider ? <th>Ambalaj</th> : null}
                      {!isGenelGider ? <th>Lot No</th> : null}
                      <th>Miktar</th>
                      <th>Birim</th>
                      <th>Birim Fiyat</th>
                      <th>KDV Oranı</th>
                      <th>KDV Tutarı</th>
                      <th>Satır Toplamı</th>
                      {!isGenelGider ? <th>Model Adayı</th> : null}
                      {!isGenelGider ? <th>Eşleşme Durumu</th> : null}
                      <th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.items.map((item) => (
                      <tr key={item?.id}>
                        <td>
                          <input
                            value={item?.aciklama || ""}
                            onChange={(e) =>
                              updateItem(item?.id, {
                                aciklama: e.target.value,
                                rawDescription:
                                  item?.rawDescription || e.target.value,
                              })
                            }
                          />
                          {item?.rawDescription &&
                          item?.rawDescription !== item?.aciklama ? (
                            <div className="status-text">
                              Okunan metin: {item?.rawDescription}
                            </div>
                          ) : null}
                          {item?.firmaAdi ||
                          draft.matchedCompanyName ||
                          draft.firma ? (
                            <div className="status-text">
                              Eşleşen firma:{" "}
                              {item?.firmaAdi ||
                                draft.matchedCompanyName ||
                                draft.firma}
                            </div>
                          ) : null}
                        </td>
                        {!isGenelGider ? (
                          <td>
                            <select
                              value={item?.matchedProductId || ""}
                              onChange={(e) =>
                                selectMatchedProduct(item?.id, e.target.value)
                              }
                            >
                              <option value="">
                                {item?.matchedProductName
                                   ? "Eşleşmeyi kaldır"
                                  : "Ürün seçin"}
                              </option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.urunAdi || product.ticariAdi}
                                </option>
                              ))}
                            </select>
                            <div className="status-text">
                              {item?.matchedProductName
                                 `${item?.matchedProductName}${
                                    item?.matchedProductCode
                                       ? ` | ${item?.matchedProductCode}`
                                      : ""
                                  ? }`
                                : item?.matchWarning ||
                                  "Ürün eşleşmesi henüz yok"}
                            </div>
                            <div className="status-text">
                              {item?.urunEslesmeTipi ||
                                item?.eslesmeTipi ||
                                "KULLANICI_ONAYI"}
                            </div>
                          </td>
                        ) : null}
                        {!isGenelGider ? (
                          <td>
                            <input
                              value={item?.ambalaj || ""}
                              onChange={(e) =>
                                updateItem(item?.id, { ambalaj: e.target.value })
                              }
                              placeholder="10 KG"
                            />
                          </td>
                        ) : null}
                        {!isGenelGider ? (
                          <td>
                            <input
                              value={item?.lotNo || ""}
                              onChange={(e) =>
                                updateItem(item?.id, { lotNo: e.target.value })
                              }
                              placeholder="Lot no"
                            />
                          </td>
                        ) : null}
                        <td>
                          <input
                            value={item?.miktar || 0}
                            onChange={(e) =>
                              updateItem(item?.id, {
                                miktar: parseMoney(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item?.birim || "ADET"}
                            onChange={(e) =>
                              updateItem(item?.id, { birim: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item?.birimFiyat || 0}
                            onChange={(e) =>
                              updateItem(item?.id, {
                                birimFiyat: parseMoney(e.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item?.kdvOrani || 0}
                            onChange={(e) =>
                              updateItem(item?.id, {
                                kdvOrani: parseMoney(e.target.value),
                                kdvTutari: 0,
                              })
                            }
                          />
                        </td>
                        <td>{formatMoney(item?.kdvTutari || 0)}</td>
                        <td>{formatMoney(item?.tutar || 0)}</td>
                        {!isGenelGider ? (
                          <td>
                            <input
                              value={item?.modelAdayi || ""}
                              onChange={(e) =>
                                updateItem(item?.id, {
                                  modelAdayi: e.target.value,
                                })
                              }
                            />
                          </td>
                        ) : null}
                        {!isGenelGider ? (
                          <td>
                            <div className="status-text">
                              {item?.eslesmeTipi || item?.productStatus || "-"}
                            </div>
                          </td>
                        ) : null}
                        <td>
                          {!isGenelGider ? (
                            <button
                              className="soft-btn tiny-btn"
                              type="button"
                              disabled={!item?.aciklama}
                              onClick={() =>
                                resolveProductMatchForItem(item?.id)
                              }
                            >
                              Ürün Eşleştir
                            </button>
                          ) : null}
                          {!isGenelGider ? (
                            <button
                              className="soft-btn tiny-btn"
                              type="button"
                              disabled={!item?.aciklama}
                              onClick={() => createProductFromItem(item)}
                            >
                              Yeni Ürün
                            </button>
                          ) : null}
                          {!isGenelGider ? (
                            <button
                              className="soft-btn tiny-btn"
                              type="button"
                              disabled={
                                !item?.matchedProductId || !item?.aciklama
                              }
                              onClick={() => createAliasForItem(item)}
                            >
                              Alias Oluştur
                            </button>
                          ) : null}
                          <button
                            className="soft-btn tiny-btn"
                            type="button"
                            onClick={() => removeLine(item?.id)}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!draft.items.length ? (
                      <tr>
                        <td colSpan={isGenelGider ? 8 : 13}>
                          Henüz kalem eklenmedi.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="document-intake-meta mt-16">
                <div className="document-meta-card">
                  <span>Ara Toplam</span>
                  <strong>{formatMoney(totals.subtotal)}</strong>
                </div>
                <div className="document-meta-card">
                  <span>KDV</span>
                  <strong>{formatMoney(totals.kdv)}</strong>
                </div>
                <div className="document-meta-card">
                  <span>Genel Toplam</span>
                  <strong>{formatMoney(totals.grandTotal)}</strong>
                </div>
                <div className="document-meta-card">
                  <span>Kalem</span>
                  <strong>{draft.items.length}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="content-card belge-process-card"
          style={
            isFocusedDocumentFlow
               ? { width: "100%", minWidth: 0, maxWidth: "none" }
              : undefined
          }
        >
          <SectionHeader
            title="PDF / Taslak / Final İşlemleri"
            subtitle="İsterseniz manuel ilerleyin, isterseniz PDF veya görseli taslağa alıp formu doldurun."
          />

          <div className="belge-process-steps">
            <div className="document-meta-card">
              <span>Çalışma Modu</span>
              <strong>{workflowLabel}</strong>
            </div>
            <div className="document-meta-card">
              <span>Durum</span>
              <strong>{draft.status || "TASLAK"}</strong>
            </div>
          </div>

          <div className="panel-block belge-mini-block mt-16">
            <h4>Belge Yükle</h4>
            <div className="status-text">
              Önce manuel bilgi girebilir, isterseniz belgeyi yükleyip taslağı
              otomatik doldurtabilirsiniz.
            </div>
            <div
              className="field mt-16"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragActive(false);
                const file = e.dataTransfer.files?.[0] || null;
                selectUploadFile(file);
              }}
              style={
                isDragActive
                   {
                      border: "1px dashed #1d4ed8",
                      background: "rgba(29, 78, 216, 0.08)",
                      borderRadius: "10px",
                      padding: "10px",
                    ? }
                  : {
                      border: "1px dashed rgba(15, 23, 42, 0.22)",
                      borderRadius: "10px",
                      padding: "10px",
                    }
              }
            >
              <span>PDF / JPG / JPEG / PNG</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/jpg"
                onChange={(e) => selectUploadFile(e.target.files?.[0] || null)}
              />
              <div className="status-text mt-12">
                {isDragActive
                   ? "Dosyayı bırakın"
                  : "Dosyayı buraya sürükleyip bırakabilir veya Dosya Seç ile yükleyebilirsiniz."}
              </div>
            </div>
            {selectedFile ? (
              <div className="status-text mt-12">
                Seçilen dosya: {selectedFile.name}
              </div>
            ) : null}
          </div>

          <ActionBar>
            <button
              className="soft-btn"
              type="button"
              disabled={!selectedFile || busy}
              onClick={intakeDocument}
            >
              Taslağa Al
            </button>
            <button
              className="soft-btn"
              type="button"
              disabled={busy}
              onClick={() => save("TASLAK")}
            >
              {draft.documentId ? "Taslağı Güncelle" : "Taslağı Kaydet"}
            </button>
            <button
              className="primary-btn"
              type="button"
              disabled={busy}
              onClick={() => save("ONAYLANDI")}
            >
              {draft.documentId ? "Finali Güncelle" : "Onayla ve Final Kaydet"}
            </button>
            {draft.documentId ? (
              <button
                className="soft-btn"
                type="button"
                onClick={resetDraftState}
              >
                Yeni Kayıt Aç
              </button>
            ) : null}
          </ActionBar>

          {message ? <div className="notice-box mt-16">{message}</div> : null}

          {(() => {
            const flowMeta = flowTypeMeta(draft.flowType || draft.workflowType);
            const incomingMode =
              flowMeta.belgeYonu === "gelen" &&
              flowMeta.belgeTipi === "irsaliye";

            if (!incomingMode && reviewState.needsAttention) {
              return (
                <div className="warning-box mt-16">
                  <strong>Kontrol Bekleyen Alanlar Var</strong>
                  <div className="firma-kartlari-warning-list">
                    {reviewState.notes.map((note, index) => (
                      <div key={`${note}_${index}`}>{note}</div>
                    ))}
                  </div>
                </div>
              );
            }

            if (!incomingMode) return null;

            const missing = [];
            if (!String(draft.firma || "").trim()) missing.push("Firma");
            if (!String(draft.irsaliyeNo || "").trim())
              missing.push("İrsaliye No");
            if (!String(draft.tarih || "").trim()) missing.push("Tarih");
            if (!String(draft.modelAdi || "").trim()) missing.push("Model Adı");
            if (
              Number(draft.belgeAdediToplami || draft.irsaliyeAdedi || 0) <= 0
            ) {
              missing.push("Gelen Adet");
            }
            if (!missing.length) return null;

            return (
              <div className="warning-box mt-16">
                <strong>Eksik Zorunlu Alanlar Var</strong>
                <div className="firma-kartlari-warning-list">
                  <div>{`Final için doldurulması gereken alanlar: ${missing.join(", ")}`}</div>
                </div>
              </div>
            );
          })()}

          {(draft.originalFileName || draft.fileType || draft.intakeMethod) && (
            <div className="document-intake-meta mt-16">
              <div className="document-meta-card">
                <span>Dosya</span>
                <strong>
                  {draft.originalFileName || draft.pdfFileName || "-"}
                </strong>
              </div>
              <div className="document-meta-card">
                <span>Tür</span>
                <strong>{draft.fileType || "-"}</strong>
              </div>
              <div className="document-meta-card">
                <span>Okuma Kalitesi</span>
                <strong>{reviewState.textQuality || 0}</strong>
              </div>
              <div className="document-meta-card">
                <span>Düşük Güvenli Kalem</span>
                <strong>{reviewState.lowConfidenceCount}</strong>
              </div>
            </div>
          )}

          {(draft.matchedCompanyName || draft.rawDetectedCompanyName) && (
            <div className="info-grid info-grid-2 mt-16">
              <div className="info-box">
                <span>Kayıtlı Firma</span>
                <strong>
                  {draft.matchedCompanyName || "Eşleşme bekliyor"}
                </strong>
              </div>
              <div className="info-box">
                <span>Belgede Okunan Unvan</span>
                <strong>{draft.rawDetectedCompanyName || "-"}</strong>
              </div>
            </div>
          )}

          {(draft.parseMode || draft.detectedProfile) && (
            <div className="info-grid info-grid-2 mt-16">
              <div className="info-box">
                <span>Belge Okuma Durumu</span>
                <strong>{draft.parseMode || "Manuel giriş"}</strong>
              </div>
              <div className="info-box">
                <span>Okunan Kalem / Bekleyen Satır</span>
                <strong>
                  {parsedItemCountDisplay} / {candidateRowCountDisplay}
                </strong>
              </div>
            </div>
          )}

          {draft.previewUrl ? (
            <div className="document-preview-card mt-16">
              <div className="section-header">
                <div>
                  <h3>Belge Önizleme</h3>
                  <p>
                    Belgeyi yeni sekmede açıp form alanlarını
                    karşılaştırabilirsiniz.
                  </p>
                </div>
                <a
                  className="soft-btn document-preview-link"
                  href={`${API_BASE}${draft.previewUrl}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Önizlemeyi Aç
                </a>
              </div>
              {draft.fileType === "image"  (
                <img
                  className="document-preview-image"
                  src={`${API_BASE}${draft.previewUrl}`}
                  alt={draft.originalFileName || "Belge önizleme"}
                />
              ) : (
                <div className="status-text">
                  PDF saklandı. Önizleme bağlantısından belgeyi açabilirsiniz.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {isFocusedDocumentFlow ? (
          <div className="content-card">
            <SectionHeader
              title="Belge Geçmişi"
              subtitle="Taslak ve onaylı kayıtları filtreleyin, açın ve düzenlemeye devam edin."
            />
            <div className="form-grid form-grid-compact mt-16">
              <Input
                label="Firma Ara"
                value={historyFilters.firma}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, firma: e.target.value }))
                }
              />
              <Input
                label="Belge No Ara"
                value={historyFilters.documentNo}
                onChange={(e) =>
                  setHistoryFilters((p) => ({
                    ...p,
                    documentNo: e.target.value,
                  }))
                }
              />
              <Input
                label="Fatura No Ara"
                value={historyFilters.faturaNo}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, faturaNo: e.target.value }))
                }
              />
              <Input
                label="İrsaliye No Ara"
                value={historyFilters.irsaliyeNo}
                onChange={(e) =>
                  setHistoryFilters((p) => ({
                    ...p,
                    irsaliyeNo: e.target.value,
                  }))
                }
              />
              <Input
                label="Model Ara"
                value={historyFilters.modelAdi}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, modelAdi: e.target.value }))
                }
              />
              <Input
                label="Başlangıç"
                type="date"
                value={historyFilters.fromDate}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, fromDate: e.target.value }))
                }
              />
              <Input
                label="Bitiş"
                type="date"
                value={historyFilters.toDate}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, toDate: e.target.value }))
                }
              />
              <Select
                label="Durum"
                value={historyFilters.status}
                onChange={(e) =>
                  setHistoryFilters((p) => ({ ...p, status: e.target.value }))
                }
                options={[
                  { value: "", label: "Tümü" },
                  { value: "TASLAK", label: "Taslak" },
                  { value: "ONAYLANDI", label: "Onaylandı" },
                ]}
              />
            </div>
            <div className="table-wrap mt-16 firma-kartlari-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Müşteri Firma</th>
                    <th>Yön / Tip</th>
                    <th>Belge No</th>
                    <th>Fatura No</th>
                    <th>İrsaliye No</th>
                    <th>Model</th>
                    <th>Müşteri İrsaliye</th>
                    <th>Tarih</th>
                    <th>Genel Toplam</th>
                    <th>Durum</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {(isFocusedDocumentFlow
                     ? finalHistoryRows
                    : filteredRows
                  ).map((doc) => (
                    <tr
                      key={doc.documentId}
                      className={
                        selectedHistoryId === String(doc.documentId)
                           ? "firma-row-selected"
                          : ""
                      }
                    >
                      <td>
                        {doc.matchedCompanyName ||
                          doc.relatedCompanyName ||
                          doc.header.cariFirma ||
                          doc.header.tedarikciFirma ||
                          doc.firma ||
                          "-"}
                      </td>
                      <td>
                        {doc.header.belgeYonu || "-"} /{" "}
                        {doc.header.belgeTipi || "-"}
                      </td>
                      <td>{doc.header.documentNo || "-"}</td>
                      <td>{doc.header.faturaNo || "-"}</td>
                      <td>
                        {doc.header.musteriIrsaliyeNo ||
                          doc.header.irsaliyeNo ||
                          doc.header.dispatchNo ||
                          "-"}
                      </td>
                      <td>{doc.header.modelAdi || "-"}</td>
                      <td>
                        {doc.header.irsaliyeNo ||
                          doc.header.dispatchNo ||
                          "-"}
                      </td>
                      <td>
                        {doc.header.date || doc.updatedAt.slice(0, 10) || "-"}
                      </td>
                      <td>{formatMoney(doc.header.grandTotal || 0)}</td>
                      <td>
                        <span
                          className={`status-chip ${
                            doc.status === "ONAYLANDI" ? "ok-chip" : "warn-chip"
                          }`}
                        >
                          {doc.status === "ONAYLANDI" ? "Onaylandı" : "Taslak"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => loadHistoryToDraft(doc)}
                        >
                          Aç / Düzenle
                        </button>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => deleteHistoryRow(doc)}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!(isFocusedDocumentFlow ? finalHistoryRows : filteredRows)
                    .length ? (
                    <tr>
                      <td colSpan={11}>
                        {isFocusedDocumentFlow
                           ? "Final/geçmiş kaydı bulunamadı. Aktif taslaklar sol havuzdadır."
                          : "Kayıt bulunamadı."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {!isFocusedDocumentFlow ? (
        <div className="content-card">
          <SectionHeader
            title="Belge Geçmişi"
            subtitle="Taslak ve onaylı kayıtları filtreleyin, açın ve düzenlemeye devam edin."
          />
          <div className="form-grid form-grid-compact mt-16">
            <Input
              label="Firma Ara"
              value={historyFilters.firma}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, firma: e.target.value }))
              }
            />
            <Input
              label="Belge No Ara"
              value={historyFilters.documentNo}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, documentNo: e.target.value }))
              }
            />
            <Input
              label="Fatura No Ara"
              value={historyFilters.faturaNo}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, faturaNo: e.target.value }))
              }
            />
            <Input
              label="İrsaliye No Ara"
              value={historyFilters.irsaliyeNo}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, irsaliyeNo: e.target.value }))
              }
            />
            <Input
              label="Model Ara"
              value={historyFilters.modelAdi}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, modelAdi: e.target.value }))
              }
            />
            <Input
              label="Başlangıç"
              type="date"
              value={historyFilters.fromDate}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, fromDate: e.target.value }))
              }
            />
            <Input
              label="Bitiş"
              type="date"
              value={historyFilters.toDate}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, toDate: e.target.value }))
              }
            />
            <Select
              label="Durum"
              value={historyFilters.status}
              onChange={(e) =>
                setHistoryFilters((p) => ({ ...p, status: e.target.value }))
              }
              options={[
                { value: "", label: "Tümü" },
                { value: "TASLAK", label: "Taslak" },
                { value: "ONAYLANDI", label: "Onaylandı" },
              ]}
            />
          </div>
          <div className="table-wrap mt-16">
            <table className="table">
              <thead>
                <tr>
                  <th>Müşteri Firma</th>
                  <th>Yön / Tip</th>
                  <th>Belge No</th>
                  <th>Fatura No</th>
                  <th>İrsaliye No</th>
                  <th>Model</th>
                  <th>Müşteri İrsaliye</th>
                  <th>Tarih</th>
                  <th>Genel Toplam</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {(isFocusedDocumentFlow ? finalHistoryRows : filteredRows).map(
                  (doc) => (
                    <tr
                      key={doc.documentId}
                      className={
                        selectedHistoryId === String(doc.documentId)
                           ? "firma-row-selected"
                          : ""
                      }
                    >
                      <td>
                        {doc.matchedCompanyName ||
                          doc.relatedCompanyName ||
                          doc.header.cariFirma ||
                          doc.header.tedarikciFirma ||
                          doc.firma ||
                          "-"}
                      </td>
                      <td>
                        {doc.header.belgeYonu || "-"} /{" "}
                        {doc.header.belgeTipi || "-"}
                      </td>
                      <td>{doc.header.documentNo || "-"}</td>
                      <td>{doc.header.faturaNo || "-"}</td>
                      <td>
                        {doc.header.musteriIrsaliyeNo ||
                          doc.header.irsaliyeNo ||
                          doc.header.dispatchNo ||
                          "-"}
                      </td>
                      <td>{doc.header.modelAdi || "-"}</td>
                      <td>
                        {doc.header.irsaliyeNo ||
                          doc.header.dispatchNo ||
                          "-"}
                      </td>
                      <td>
                        {doc.header.date || doc.updatedAt.slice(0, 10) || "-"}
                      </td>
                      <td>{formatMoney(doc.header.grandTotal || 0)}</td>
                      <td>
                        <span
                          className={`status-chip ${
                            doc.status === "ONAYLANDI" ? "ok-chip" : "warn-chip"
                          }`}
                        >
                          {doc.status === "ONAYLANDI" ? "Onaylandı" : "Taslak"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => loadHistoryToDraft(doc)}
                        >
                          Aç / Düzenle
                        </button>
                        <button
                          className="soft-btn tiny-btn"
                          type="button"
                          disabled={busy}
                          onClick={() => deleteHistoryRow(doc)}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                {!(isFocusedDocumentFlow ? finalHistoryRows : filteredRows)
                  .length ? (
                  <tr>
                    <td colSpan={11}>
                      {isFocusedDocumentFlow
                         ? "Final/geçmiş kaydı bulunamadı. Aktif taslaklar sol havuzdadır."
                        : "Kayıt bulunamadı."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Minimal sarmalayıcı: 3 ayrı belge akışı ekranları için.
// BelgeEditorTab zaten sectionKey bazlı davranır; bu bileşen sadece başlık kartı + yönlendirme sağlar.
function BelgeAkisTab(props) {
  const { sectionKey, drafts, setSectionDraft, activeMainCompany, ...rest } =
    props;
  const config = DOCUMENT_SECTION_CONFIG[sectionKey];
  if (
    sectionKey === "musteri-irsaliye" ||
    sectionKey === "bizim-belgeler" ||
    sectionKey === "tedarikci-fatura"
  ) {
    const pageSubtitleMap = {
      "musteri-irsaliye":
        "Müşteriden gelen irsaliyeleri havuzdan seçip eksik alanları tamamlayın.",
      "bizim-belgeler":
        "Satış irsaliye ve faturalarını model bağlantısıyla taslaktan finale yönetin.",
      "tedarikci-fatura":
        "Tedarikçi faturalarında ürün eşleşmesi ve kalem kontrolünü tek ekranda tamamlayın.",
    };
    return (
      <div className="content-grid">
        <div className="mgi-page-header">
          <h2>{config.title}</h2>
          <p>{pageSubtitleMap[sectionKey] || config.subtitle}</p>
          <div className="mgi-breadcrumb">
            <span className="mgi-crumb-home" aria-hidden>
              &#8962;
            </span>
            <span className="mgi-crumb-item">Ana Sayfa</span>
            <span className="mgi-crumb-sep">&gt;</span>
            <span className="mgi-crumb-item">Muhasebe</span>
            <span className="mgi-crumb-sep">&gt;</span>
            <span className="mgi-crumb-item is-current">{config.title}</span>
          </div>
        </div>
        <BelgeEditorTab
          sectionKey={sectionKey}
          draft={drafts[sectionKey]}
          setDraft={(updater) => setSectionDraft(sectionKey, updater)}
          activeMainCompany={activeMainCompany}
          {...rest}
        />
      </div>
    );
  }
  return (
    <div className="content-grid">
      <div className="content-card">
        <SectionHeader title={config.title} subtitle={config.subtitle} />
        <div className="belgeler-toolbar">
          <div className="status-text">
            Ana firma: {activeMainCompany?.name || "Seçim yok"}
          </div>
          {config.infoText ? (
            <div className="status-text">{config.infoText}</div>
          ) : null}
        </div>
      </div>
      <BelgeEditorTab
        sectionKey={sectionKey}
        draft={drafts[sectionKey]}
        setDraft={(updater) => setSectionDraft(sectionKey, updater)}
        activeMainCompany={activeMainCompany}
        {...rest}
      />
    </div>
  );
}

function BelgelerTab(props) {
  const [sectionKey, setSectionKey] = useState("alis-gider-belgeleri");

  useEffect(() => {
    if (props.preferredSectionKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectionKey(props.preferredSectionKey);
    }
  }, [props.preferredSectionKey]);

  return (
    <div className="content-grid">
      <div className="content-card">
        <SectionHeader
          title={tr.belgeler}
          subtitle="Belgeleri kısa, net ve mod bazlı bir akışta yönetin."
        />
        <div className="belgeler-toolbar">
          <div className="status-text">
            Ana firma: {props.activeMainCompany.name || "Seçim yok"}
          </div>
          <ActionBar>
            <button
              className={
                sectionKey === "alis-gider-belgeleri"
                   ? "primary-btn"
                  : "soft-btn"
              }
              onClick={() => setSectionKey("alis-gider-belgeleri")}
              type="button"
            >
              Genel Gider / Alış
            </button>
            <button
              className={
                sectionKey === "irsaliye-fatura" ? "primary-btn" : "soft-btn"
              }
              onClick={() => setSectionKey("irsaliye-fatura")}
              type="button"
            >
              İrsaliye / Fatura
            </button>
          </ActionBar>
        </div>
        {props.navigationNotice ? (
          <div className="notice-box mt-16">{props.navigationNotice}</div>
        ) : null}
      </div>

      <BelgeEditorTab
        sectionKey={sectionKey}
        draft={props.drafts[sectionKey]}
        setDraft={(updater) => props.setSectionDraft(sectionKey, updater)}
        activeMainCompany={props.activeMainCompany}
        companies={props.companies}
        activeCompany={props.activeCompany}
        onCompanySelect={props.onCompanySelect}
        recentCompanies={props.recentCompanies}
      />
    </div>
  );
}

