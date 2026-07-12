import { useEffect, useMemo, useState } from "react";
import {
  getModelMuhasebePackage,
  listModelMuhasebePackages,
  saveModelMuhasebePackage,
  searchModelMuhasebeModels,
  softDeleteBelgeHavuzu,
} from "../../services/muhasebeApi";

const PRINT_STRUCTURE_OPTIONS = [
  "Ön Baskı",
  "Arka Baskı",
  "Ön + Arka",
  "Sağ Kol",
  "Sol Kol",
  "İki Kol",
  "Ön + 2 Kol",
  "Ön + Arka + 2 Kol",
  "Ense",
  "Cep",
  "Diğer",
];

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value) {
  return toNumber(value).toLocaleString("tr-TR");
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

function diffBadges(summary) {
  if (!summary) return [];
  const items = [];
  if (toNumber(summary.waitingCount) > 0) {
    items.push({
      tone: "bad",
      text: `${formatQty(summary.waitingCount)} kalem eşleşme bekliyor`,
    });
  }
  if (toNumber(summary.dispatchDiff) !== 0) {
    items.push({
      tone: toNumber(summary.dispatchDiff) > 0 ? "warn" : "bad",
      text: `Bizim irsaliye farkı: ${formatQty(summary.dispatchDiff)}`,
    });
  }
  if (toNumber(summary.invoiceDiff) !== 0) {
    items.push({
      tone: toNumber(summary.invoiceDiff) > 0 ? "warn" : "bad",
      text: `Fatura farkı: ${formatQty(summary.invoiceDiff)}`,
    });
  }
  if (!items.length)
    items.push({ tone: "ok", text: "Belge ve adetler uyumlu" });
  return items;
}

function Badge({ tone = "blue", children }) {
  return <span className={`mh-badge ${tone}`}>{children}</span>;
}

export default function ModelMuhasebePage({ activeMainCompany }) {
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [modelResults, setModelResults] = useState([]);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const summary = selectedPackage.summary || null;
  const badges = useMemo(() => diffBadges(summary), [summary]);
  const selectedModelCount = useMemo(
    () => rows.filter((row) => row?.modelId).length,
    [rows],
  );
  const hasMissingModel = useMemo(
    () =>
      rows.some(
        (row) =>
          (toNumber(row?.incomingQty) ||
            toNumber(row?.ourDispatchQty) ||
            toNumber(row?.invoiceQty)) &&
          !row?.modelId,
      ),
    [rows],
  );

  const loadPackages = async (nextSelectedPackageId = selectedPackageId) => {
    setPackagesLoading(true);
    try {
      const data = await listModelMuhasebePackages(activeMainCompany);
      const nextPackages = Array.isArray(data) ? data : [];
      setPackages(nextPackages);
      if (
        nextSelectedPackageId &&
        !nextPackages.some((item) => item.packageId === nextSelectedPackageId)
      ) {
        setSelectedPackageId("");
      }
    } catch (error) {
      setPackages([]);
      setMessage(error?.message || "Belge paketleri yüklenemedi.");
    } finally {
      setPackagesLoading(false);
    }
  };

  const loadPackage = async (packageId) => {
    setPackageLoading(true);
    setMessage("");
    try {
      const data = await getModelMuhasebePackage(activeMainCompany, packageId);
      setSelectedPackageId(packageId);
      setSelectedPackage(data);
      setRows(Array.isArray(data?.rows) ? data?.rows : []);
    } catch (error) {
      setSelectedPackage(null);
      setRows([]);
      setMessage(error?.message || "Belge paketi okunamadı.");
    } finally {
      setPackageLoading(false);
    }
  };

  useEffect(() => {
    loadPackages("");
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    let cancelled = false;
    searchModelMuhasebeModels(activeMainCompany, searchText)
      .then((data) => {
        if (cancelled) return;
        setModelResults(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setModelResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMainCompany?.slug, activeMainCompany?.id, searchText]);

  const updateRow = (rowId, patch) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
           {
              ...row,
              ...patch,
            ? }
          : row,
      ),
    );
  };

  const handleModelChange = (rowId, value) => {
    const next = modelResults.find((item) => String(item?.id) === String(value));
    updateRow(rowId, {
      modelId: value,
      modelName: next.modelName || next.modelAdi || next.name || "",
    });
  };

  const save = async () => {
    if (!selectedPackageId) {
      setMessage("Önce soldan belge paketi seçin.");
      return;
    }
    if (hasMissingModel) {
      setMessage("Her kalem için model seçimi zorunludur.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const data = await saveModelMuhasebePackage(activeMainCompany, {
        packageId: selectedPackageId,
        rows,
      });
      setSelectedPackage((prev) =>
        prev
           {
              ...prev,
              summary: data?.summary || prev?.summary,
            ? }
          : prev,
      );
      if (Array.isArray(data?.rows)) setRows(data?.rows);
      setMessage(data?.message || "Belge model eşleştirmesi kaydedildi.");
      await loadPackages(selectedPackageId);
    } catch (error) {
      setMessage(error?.message || "Kayıt sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const removeSelectedPackage = async () => {
    const documentIds = Array.isArray(summary.documents)
       ? summary.documents.map((item) => item?.id).filter(Boolean)
      : [];
    if (!selectedPackageId || !documentIds.length) return;
    if (
      !window.confirm(
        "Seçili belge paketi yanlış yüklendiyse paketteki belgeler pasife alınacak. Devam edilsin mi",
      )
    ) {
      return;
    }
    try {
      await Promise.all(
        documentIds.map((id) =>
          softDeleteBelgeHavuzu(activeMainCompany || {}, id),
        ),
      );
      setSelectedPackageId("");
      setSelectedPackage(null);
      setRows([]);
      setMessage("Belge paketi pasife alındı.");
      await loadPackages("");
    } catch (error) {
      setMessage(error?.message || "Belge paketi silinemedi.");
    }
  };

  return (
    <div className="mh-layout-3 mh-model-page">
      <section className="mh-card">
        <div className="mh-card-head">
          <div>
            <h2>Bekleyen Belge Paketleri</h2>
            <small>Belge - model eşleştirmesi bekleyen paketler.</small>
          </div>
          <Badge tone="blue">{packages.length}</Badge>
        </div>
        <div className="mh-card-body">
          <button
            className="mh-btn"
            type="button"
            onClick={() => loadPackages()}
          >
            Listeyi Yenile
          </button>
          {packagesLoading ? (
            <p className="mh-state" style={{ marginTop: 10 }}>
              Yükleniyor...
            </p>
          ) : null}
          <div className="mh-list mh-package-list">
            {packages.map((item) => (
              <button
                key={item?.packageId}
                type="button"
                className={item.packageId === selectedPackageId ? "active" : ""}
                onClick={() => loadPackage(item?.packageId)}
              >
                <strong>{safeText(item?.companyName)}</strong>
                <span>{safeText(item?.belgeNo) || "Belge no yok"}</span>
                <span>
                  {item?.modelName
                     ? `Model: ${item?.modelName}`
                    : `${formatQty(item?.incomingQty)} adet / ${item?.lineCount ? `${item?.lineCount} kalem` : "Kalem yok"}`}
                </span>
              </button>
            ))}
            {!packagesLoading && !packages.length ? (
              <div className="mh-state">Bekleyen belge paketi yok.</div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mh-card">
        <div className="mh-card-head">
          <div>
            <h2>Belge Model Eşleştirme</h2>
            <small>
              Belge Yükle / Kontrol sonrası yalnız model bağlanacak müşteri
              irsaliyeleri için kullanılır.
            </small>
          </div>
          <div className="mh-card-actions">
            <button
              className="mh-btn primary"
              type="button"
              disabled={
                saving || !selectedPackageId || !rows.length || hasMissingModel
              }
              onClick={save}
            >
              Kaydet
            </button>
            <button
              className="mh-btn danger"
              type="button"
              disabled={!selectedPackageId || packageLoading}
              onClick={removeSelectedPackage}
            >
              Paketi Sil
            </button>
          </div>
        </div>
        <div className="mh-card-body">
          {!selectedPackageId ? (
            <div className="mh-state mh-empty-state">
              Soldan belge paketi seçin.
            </div>
          ) : packageLoading ? (
            <div className="mh-state mh-empty-state">
              Belge paketi yükleniyor...
            </div>
          ) : (
            <>
              <div className="mh-kpi-grid four">
                <div className="mh-kpi dark">
                  <span>Gelen Adet</span>
                  <strong>{formatQty(summary.incomingQty)}</strong>
                </div>
                <div className="mh-kpi">
                  <span>Bizim İrsaliye</span>
                  <strong>{formatQty(summary.ourDispatchQty)}</strong>
                </div>
                <div className="mh-kpi green">
                  <span>Fatura Adedi</span>
                  <strong>{formatQty(summary.invoiceQty)}</strong>
                </div>
                <div className="mh-kpi orange">
                  <span>Toplam Fark</span>
                  <strong>
                    İrs {formatQty(summary.dispatchDiff)} / Fat{" "}
                    {formatQty(summary.invoiceDiff)}
                  </strong>
                </div>
              </div>

              <div className="mh-management-grid">
                <div className="mh-side-lines">
                  <div className="mh-side-line">
                    <span>Firma</span>
                    <b>{safeText(summary.companyName)}</b>
                  </div>
                  <div className="mh-side-line">
                    <span>Belge No</span>
                    <b>{safeText(summary.belgeNo)}</b>
                  </div>
                  <div className="mh-side-line">
                    <span>Belge Türü</span>
                    <b>{safeText(summary.documentTypes.join(" / "))}</b>
                  </div>
                  <div className="mh-side-line">
                    <span>Kalem Sayısı</span>
                    <b>{formatQty(summary.lineCount)}</b>
                  </div>
                </div>

                <div className="mh-form-grid">
                  <label className="mh-field">
                    <span>Model Ara</span>
                    <input
                      value={searchText}
                      onChange={(event) => setSearchText(event?.target.value)}
                      placeholder="Model adı yazın"
                    />
                  </label>
                </div>
              </div>

              <div className="mh-table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Sipariş No</th>
                      <th>Malzeme No</th>
                      <th>Açıklama / Kalem</th>
                      <th>Model Adı / Adayı</th>
                      <th>Belge Türü</th>
                      <th>Gelen</th>
                      <th>Bizim İrs</th>
                      <th>Fatura</th>
                      <th>Fark</th>
                      <th>Model Seçimi</th>
                      <th>Baskı Yapısı</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row?.id}>
                        <td>{safeText(row?.orderNo)}</td>
                        <td>{safeText(row?.materialNo)}</td>
                        <td>{safeText(row?.description)}</td>
                        <td>
                          {safeText(row?.modelName || row?.candidateModelName)}
                        </td>
                        <td>
                          {safeText((row?.documentTypeLabels || []).join(" / "))}
                        </td>
                        <td>{formatQty(row?.incomingQty)}</td>
                        <td>{formatQty(row?.ourDispatchQty)}</td>
                        <td>{formatQty(row?.invoiceQty)}</td>
                        <td>
                          İrs{" "}
                          {formatQty(
                            toNumber(row?.incomingQty) -
                              toNumber(row?.ourDispatchQty),
                          )}{" "}
                          / Fat{" "}
                          {formatQty(
                            toNumber(row?.incomingQty) -
                              toNumber(row?.invoiceQty),
                          )}
                        </td>
                        <td>
                          <select
                            value={row?.modelId || ""}
                            onChange={(event) =>
                              handleModelChange(row?.id, event?.target.value)
                            }
                          >
                            <option value="">Model seçin</option>
                            {modelResults.map((item) => (
                              <option key={item?.id} value={item?.id}>
                                {safeText(
                                  item?.modelName || item?.modelAdi || item?.name,
                                )}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={row?.printStructure || "Diğer"}
                            onChange={(event) =>
                              updateRow(row?.id, {
                                printStructure: event?.target.value,
                              })
                            }
                          >
                            {PRINT_STRUCTURE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{safeText(row?.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mh-card">
        <div className="mh-card-head">
          <div>
            <h2>Kontrol Özeti</h2>
            <small>Belge, model ve adet farkları burada görünür.</small>
          </div>
        </div>
        <div className="mh-card-body mh-side-lines">
          {!selectedPackageId ? (
            <div className="mh-state mh-empty-state">
              Bu alan seçilen belge paketi için dolar.
            </div>
          ) : (
            <>
              <div className="mh-side-line">
                <span>Bağlanan Kalem</span>
                <b>
                  {formatQty(selectedModelCount)} / {formatQty(rows.length)}
                </b>
              </div>
              <div className="mh-side-line">
                <span>İmalat Taslağı</span>
                <b>
                  {hasMissingModel
                     ? "Eksik model seçimi var"
                    : "Kaydet ile hazırlanır"}
                </b>
              </div>
              <div className="mh-package-badges">
                {badges.map((item) => (
                  <Badge key={item?.text} tone={item?.tone}>
                    {item?.text}
                  </Badge>
                ))}
                {hasMissingModel ? (
                  <Badge tone="bad">Bazı kalemlerde model boş</Badge>
                ) : null}
              </div>
            </>
          )}
          {message ? <div className="mh-state">{message}</div> : null}
        </div>
      </section>
    </div>
  );
}
