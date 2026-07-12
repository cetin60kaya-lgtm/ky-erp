import { useEffect, useMemo, useState } from "react";

import { ErpIcon } from "../../../components/erp/IconMap";
import { StatusBadge } from "../../../components/erp/AccountingUi";
import {
  tr,
  formatMoney,
  MetricBox,
  MuhasebePageHeader,
  Input,
  MoneyInput,
  Textarea,
  apiGet,
  apiPost,
} from "./_muhasebeShared";

function monthStart(month) {
  return `${month || new Date().toISOString().slice(0, 7)}-01`;
}

function monthEnd(month) {
  const [year, rawMonth] = String(month || new Date().toISOString().slice(0, 7))
    .split("-")
    .map(Number);
  return new Date(year, rawMonth, 0).toISOString().slice(0, 10);
}

function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toLocaleDateString("tr-TR");
}

function rowKey(row, index) {
  return String(
    row?.id ||
      row?.sourceId ||
      row?.documentNo ||
      `${row?.companyName || "firma"}-${row?.date || index}-${row?.vatAmount || 0}`,
  );
}

function flowSideOf(row) {
  const side = String(row?.flowSide || row?.direction || "").toUpperCase();
  if (side.includes("SALES") || side.includes("SATIS")) return "SALES";
  return "PURCHASE";
}

function companyKeyOf(row) {
  return String(row?.companyId || row?.taxNo || row?.companyName || "NO_COMPANY");
}

function decisionLabel(value) {
  if (value === "EXCLUDED") return "KDV disi";
  if (value === "HELD") return "Beklet";
  if (value === "CANCELLED") return "Iptal adayi";
  return "KDV'ye dahil";
}

function decisionTone(value) {
  if (value === "EXCLUDED") return "neutral";
  if (value === "HELD") return "warning";
  if (value === "CANCELLED") return "danger";
  return "success";
}

function companyDisplayName(row) {
  return String(row?.firma || row?.companyName || row?.name || "Firma eslesmemis").trim();
}

export function KdvTab({ activeMainCompany }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [rows, setRows] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCompanyKey, setSelectedCompanyKey] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState("");
  const [rowDecisions, setRowDecisions] = useState({});
  const [companyDecisions, setCompanyDecisions] = useState({});
  const [companyAdjustments, setCompanyAdjustments] = useState({});
  const [vatPeriodBusy, setVatPeriodBusy] = useState(false);
  const [vatPeriodNotice, setVatPeriodNotice] = useState("");
  const [filters, setFilters] = useState({
    period: currentMonth,
    fromDate: monthStart(currentMonth),
    toDate: monthEnd(currentMonth),
    documentNo: "",
    query: "",
    side: "ALL",
  });
  const [vatPeriodForm, setVatPeriodForm] = useState({
    carriedVatFromPreviousMonth: 0,
    note: "",
  });

  async function loadCompanyOptions() {
    if (!activeMainCompany?.id && !activeMainCompany?.slug) {
      setCompanyOptions([]);
      return;
    }
    const cards = await apiGet("/muhasebe/firma-kartlari", activeMainCompany);
    setCompanyOptions(
      (Array.isArray(cards) ? cards : []).filter(
        (item) => item?.aktif && !item?.isAliasMerged && !item?.hiddenFromMainList,
      ),
    );
  }

  async function loadKdv() {
    if (!activeMainCompany?.id && !activeMainCompany?.slug) {
      setRows([]);
      setError("Aktif ana firma secilmedi.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.period) params.set("period", filters.period);
      if (filters.fromDate) params.set("fromDate", filters.fromDate);
      if (filters.toDate) params.set("toDate", filters.toDate);
      if (filters.documentNo.trim()) params.set("documentNo", filters.documentNo.trim());
      const query = params.toString();
      const response = await apiGet(
        `/muhasebe/kdv${query ? `?${query}` : ""}`,
        activeMainCompany,
      );
      const nextRows = Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response)
          ? response
          : [];
      const s = response?.summary || {};
      const vp = response?.vatPeriod || null;
      setRows(nextRows);
      setVatPeriodForm({
        carriedVatFromPreviousMonth: Number(
          vp?.carriedVatFromPreviousMonth ?? s?.carriedVatFromPreviousMonth ?? 0,
        ),
        note: String(vp?.note || ""),
      });
      setSelectedRowKey((current) =>
        current && nextRows.some((row, index) => rowKey(row, index) === current)
          ? current
          : rowKey(nextRows[0] || {}, 0),
      );
    } catch (e) {
      setRows([]);
      setError(e?.message || "KDV verileri alinamadi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanyOptions().catch(() => setCompanyOptions([]));
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => {
    loadKdv();
  }, [
    activeMainCompany?.id,
    activeMainCompany?.slug,
    filters.period,
    filters.fromDate,
    filters.toDate,
    filters.documentNo,
  ]);

  const kdvRows = useMemo(
    () =>
      rows.map((row, index) => {
        const key = rowKey(row, index);
        const companyKey = companyKeyOf(row);
        const companyDecision = companyDecisions[companyKey] || "INCLUDED";
        const decision = rowDecisions[key] || companyDecision;
        return {
          raw: row,
          key,
          companyKey,
          companyName: companyDisplayName(row),
          date: row?.date || row?.tarih || "",
          documentNo: row?.documentNo || row?.belgeNo || "-",
          documentType: row?.documentType || "-",
          side: flowSideOf(row),
          subtotal: Number(row?.subtotal || row?.matrah || 0),
          vatRate: Number(row?.vatRate || row?.kdvOrani || 0),
          vatAmount: Number(row?.vatAmount || row?.kdv || 0),
          grandTotal: Number(row?.grandTotal || row?.toplam || 0),
          source: row?.source || "-",
          decision,
        };
      }),
    [rows, rowDecisions, companyDecisions],
  );

  const companyRows = useMemo(() => {
    const map = new Map();
    for (const option of companyOptions) {
      const key = String(option?.id || option?.taxNo || option?.vkn || option?.firma || option?.name);
      if (!key || key === "undefined") continue;
      map.set(key, {
        key,
        name: companyDisplayName(option),
        documentCount: 0,
        purchaseVat: 0,
        salesVat: 0,
        includedVat: 0,
        hasVat: false,
      });
    }
    for (const item of kdvRows) {
      const current =
        map.get(item.companyKey) || {
          key: item.companyKey,
          name: item.companyName,
          documentCount: 0,
          purchaseVat: 0,
          salesVat: 0,
          includedVat: 0,
          hasVat: false,
        };
      current.documentCount += 1;
      current.hasVat = true;
      if (item.side === "SALES") current.salesVat += item.vatAmount;
      else current.purchaseVat += item.vatAmount;
      if (item.decision === "INCLUDED") current.includedVat += item.vatAmount;
      map.set(item.companyKey, current);
    }
    return Array.from(map.values()).sort((left, right) => {
      if (left.hasVat !== right.hasVat) return left.hasVat ? -1 : 1;
      return String(left.name).localeCompare(String(right.name), "tr");
    });
  }, [companyOptions, kdvRows]);

  const visibleRows = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("tr-TR");
    return kdvRows.filter((item) => {
      if (selectedCompanyKey && item.companyKey !== selectedCompanyKey) return false;
      if (filters.side !== "ALL" && item.side !== filters.side) return false;
      if (!query) return true;
      return `${item.companyName} ${item.documentNo} ${item.documentType}`
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    });
  }, [kdvRows, selectedCompanyKey, filters.side, filters.query]);

  useEffect(() => {
    if (selectedCompanyKey && !companyRows.some((row) => row.key === selectedCompanyKey)) {
      setSelectedCompanyKey("");
    }
  }, [companyRows, selectedCompanyKey]);

  const selectedRow =
    kdvRows.find((row) => row.key === selectedRowKey) || visibleRows[0] || kdvRows[0] || null;
  const selectedCompany =
    companyRows.find((row) => row.key === selectedCompanyKey) ||
    companyRows.find((row) => row.key === selectedRow?.companyKey) ||
    null;
  const selectedAdjustment = companyAdjustments[selectedCompany?.key] || {
    amount: 0,
    note: "",
  };

  const totals = useMemo(() => {
    const includedRows = kdvRows.filter((item) => item.decision === "INCLUDED");
    const purchaseVat = includedRows
      .filter((item) => item.side === "PURCHASE")
      .reduce((sum, item) => sum + item.vatAmount, 0);
    const salesVat = includedRows
      .filter((item) => item.side === "SALES")
      .reduce((sum, item) => sum + item.vatAmount, 0);
    const excludedVat = kdvRows
      .filter((item) => item.decision !== "INCLUDED")
      .reduce((sum, item) => sum + item.vatAmount, 0);
    const adjustmentTotal = Object.values(companyAdjustments).reduce(
      (sum, item) => sum + Number(item?.amount || 0),
      0,
    );
    const carried = Number(vatPeriodForm.carriedVatFromPreviousMonth || 0);
    return {
      purchaseVat,
      salesVat,
      excludedVat,
      adjustmentTotal,
      carried,
      netVat: salesVat - purchaseVat - carried + adjustmentTotal,
      documentCount: includedRows.length,
      noVatCompanyCount: companyRows.filter((item) => !item.hasVat).length,
    };
  }, [kdvRows, companyRows, companyAdjustments, vatPeriodForm.carriedVatFromPreviousMonth]);

  function updatePeriod(month) {
    setFilters((current) => ({
      ...current,
      period: month,
      fromDate: monthStart(month),
      toDate: monthEnd(month),
    }));
  }

  function setDecision(key, decision) {
    setRowDecisions((current) => {
      const next = { ...current };
      if (decision === "INCLUDED") delete next[key];
      else next[key] = decision;
      return next;
    });
  }

  function setCompanyDecision(key, decision) {
    setCompanyDecisions((current) => {
      const next = { ...current };
      if (decision === "INCLUDED") delete next[key];
      else next[key] = decision;
      return next;
    });
  }

  function setSelectedAdjustment(patch) {
    if (!selectedCompany?.key) return;
    setCompanyAdjustments((current) => ({
      ...current,
      [selectedCompany.key]: {
        amount: Number(current[selectedCompany.key]?.amount || 0),
        note: current[selectedCompany.key]?.note || "",
        ...patch,
      },
    }));
  }

  async function saveVatPeriod() {
    if (!activeMainCompany?.id && !activeMainCompany?.slug) {
      setError("Ana firma secimi zorunlu.");
      return;
    }
    setVatPeriodBusy(true);
    setVatPeriodNotice("");
    setError("");
    try {
      await apiPost(
        "/muhasebe/vat-periods",
        {
          period: filters.period,
          carriedVatFromPreviousMonth: Number(vatPeriodForm.carriedVatFromPreviousMonth || 0),
          purchaseVatTotal: Number(totals.purchaseVat || 0),
          salesVatTotal: Number(totals.salesVat || 0),
          netVat: Number(totals.netVat || 0),
          carriedVatToNextMonth: totals.netVat < 0 ? Math.abs(totals.netVat) : 0,
          note: vatPeriodForm.note || "",
        },
        activeMainCompany,
      );
      setVatPeriodNotice("Devreden KDV kaydi guncellendi.");
      await loadKdv();
    } catch (e) {
      setError(e?.message || "Devreden KDV kaydi guncellenemedi.");
    } finally {
      setVatPeriodBusy(false);
    }
  }

  const netVatLabel =
    totals.netVat > 0 ? "Odenecek KDV" : totals.netVat < 0 ? "Devreden KDV" : "Net KDV";

  return (
    <div className="content-grid muhasebe-page kdv-redesign">
      <MuhasebePageHeader
        title={tr.kdv}
        subtitle="Tarih araliginda gelen ve giden KDV belgelerini firma bazinda listeleyin, KDV'ye dahil edilmeyecek firmalari ayri tutun."
      />

      <div className="content-card muhasebe-page-body kdv-shell">
        <div className="kdv-control-bar">
          <Input
            label="Ay / Donem"
            type="month"
            value={filters.period}
            onChange={(event) => updatePeriod(event.target.value)}
          />
          <Input
            label="Baslangic"
            type="date"
            value={filters.fromDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, fromDate: event.target.value }))
            }
          />
          <Input
            label="Bitis"
            type="date"
            value={filters.toDate}
            onChange={(event) =>
              setFilters((current) => ({ ...current, toDate: event.target.value }))
            }
          />
          <Input
            label="Belge No"
            value={filters.documentNo}
            onChange={(event) =>
              setFilters((current) => ({ ...current, documentNo: event.target.value }))
            }
          />
          <label className="form-field">
            <span>Liste Tipi</span>
            <select
              value={filters.side}
              onChange={(event) =>
                setFilters((current) => ({ ...current, side: event.target.value }))
              }
            >
              <option value="ALL">Gelen + Giden</option>
              <option value="PURCHASE">Gelen / Alis KDV</option>
              <option value="SALES">Giden / Satis KDV</option>
            </select>
          </label>
          <button className="primary-btn" type="button" onClick={loadKdv} disabled={loading}>
            <ErpIcon name="yenile" size={16} />
            {loading ? "Guncelleniyor..." : "Hemen Guncelle"}
          </button>
        </div>

        {error ? <div className="warning-box">{error}</div> : null}

        <div className="info-grid info-grid-6 kdv-metrics">
          <MetricBox icon="arrow-down" label="Gelen KDV" value={formatMoney(totals.purchaseVat)} subText="Alis / indirilecek" tone="green" />
          <MetricBox icon="arrow-up" label="Giden KDV" value={formatMoney(totals.salesVat)} subText="Satis / hesaplanan" tone="orange" />
          <MetricBox icon="cari-kasa" label="Devreden" value={formatMoney(totals.carried)} subText="Onceki donem" tone="purple" />
          <MetricBox icon="duzenle" label="Firma Duzeltme" value={formatMoney(totals.adjustmentTotal)} subText="Ekran karari" tone="blue" />
          <MetricBox icon="belge" label="Haric / Bekleyen" value={formatMoney(totals.excludedVat)} subText="Toplama dahil degil" tone="red" />
          <MetricBox icon="kdv" label={netVatLabel} value={formatMoney(Math.abs(totals.netVat))} subText={`${totals.documentCount} belge dahil`} tone={totals.netVat > 0 ? "red" : "green"} />
        </div>

        <section className="kdv-workspace">
          <aside className="kdv-panel kdv-firm-list">
            <div className="kdv-panel-head">
              <strong>Firma Listesi</strong>
              <StatusBadge tone="info">{companyRows.length} firma</StatusBadge>
            </div>
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Firma veya belge ara"
            />
            <button
              className={`kdv-firm-row ${!selectedCompanyKey ? "active" : ""}`}
              type="button"
              onClick={() => setSelectedCompanyKey("")}
            >
              <strong>Tum firmalar</strong>
              <span>{kdvRows.length} belge - {formatMoney(totals.purchaseVat + totals.salesVat)}</span>
            </button>
            <div className="kdv-firm-scroll">
              {companyRows.map((firm) => {
                const decision = companyDecisions[firm.key] || "INCLUDED";
                return (
                  <button
                    key={firm.key}
                    className={`kdv-firm-row ${selectedCompanyKey === firm.key ? "active" : ""} ${!firm.hasVat ? "muted" : ""}`}
                    type="button"
                    onClick={() => setSelectedCompanyKey(firm.key)}
                  >
                    <div>
                      <strong>{firm.name}</strong>
                      <span>
                        {firm.documentCount
                          ? `${firm.documentCount} belge - Giden ${formatMoney(firm.salesVat)} / Gelen ${formatMoney(firm.purchaseVat)}`
                          : "Bu ay KDV'ye giren belge yok"}
                      </span>
                    </div>
                    <StatusBadge tone={decisionTone(decision)}>{decisionLabel(decision)}</StatusBadge>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="kdv-panel kdv-document-list">
            <div className="kdv-panel-head">
              <div>
                <strong>Gelen / Giden KDV Belge Listesi</strong>
                <span>{dateText(filters.fromDate)} - {dateText(filters.toDate)}</span>
              </div>
              <StatusBadge tone="info">{visibleRows.length} satir</StatusBadge>
            </div>
            <div className="kdv-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Firma</th>
                    <th>Belge No</th>
                    <th>Tip</th>
                    <th>Matrah</th>
                    <th>KDV %</th>
                    <th>KDV</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                    <th>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="10">Yukleniyor...</td></tr>
                  ) : visibleRows.length ? (
                    visibleRows.map((item) => (
                      <tr
                        key={item.key}
                        className={selectedRow?.key === item.key ? "active" : ""}
                        onClick={() => setSelectedRowKey(item.key)}
                      >
                        <td>{dateText(item.date)}</td>
                        <td>{item.companyName}</td>
                        <td><strong>{item.documentNo}</strong></td>
                        <td>
                          <StatusBadge tone={item.side === "SALES" ? "warning" : "success"}>
                            {item.side === "SALES" ? "Giden" : "Gelen"}
                          </StatusBadge>
                        </td>
                        <td>{formatMoney(item.subtotal)}</td>
                        <td>%{Number(item.vatRate || 0).toFixed(0)}</td>
                        <td><strong>{formatMoney(item.vatAmount)}</strong></td>
                        <td>{formatMoney(item.grandTotal)}</td>
                        <td><StatusBadge tone={decisionTone(item.decision)}>{decisionLabel(item.decision)}</StatusBadge></td>
                        <td>
                          <div className="kdv-row-actions">
                            <button type="button" onClick={(event) => { event.stopPropagation(); setDecision(item.key, "INCLUDED"); }}>Ekle</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setDecision(item.key, "EXCLUDED"); }}>Cikar</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setDecision(item.key, "HELD"); }}>Beklet</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10">Secili tarih araliginda KDV belgesi yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </main>

          <aside className="kdv-panel kdv-decision-panel">
            <div className="kdv-panel-head">
              <strong>KDV Karar Paneli</strong>
              <StatusBadge tone={decisionTone(selectedRow?.decision)}>
                {decisionLabel(selectedRow?.decision)}
              </StatusBadge>
            </div>

            <div className="kdv-side-lines">
              <Line label="Secili firma" value={selectedCompany?.name || selectedRow?.companyName || "-"} />
              <Line label="Belge" value={selectedRow?.documentNo || "-"} />
              <Line label="Yon" value={selectedRow?.side === "SALES" ? "Giden / satis" : "Gelen / alis"} />
              <Line label="Belge KDV" value={formatMoney(selectedRow?.vatAmount || 0)} />
              <Line label="Firma belge sayisi" value={selectedCompany?.documentCount || 0} />
              <Line label="Bu ay KDV'ye girmeyen" value={selectedCompany?.hasVat ? "Hayir" : "Evet"} />
            </div>

            <div className="kdv-action-grid">
              <button className="primary-btn" type="button" disabled={!selectedRow} onClick={() => setDecision(selectedRow.key, "INCLUDED")}>
                Belgeyi KDV'ye Ekle
              </button>
              <button className="soft-btn" type="button" disabled={!selectedRow} onClick={() => setDecision(selectedRow.key, "EXCLUDED")}>
                Belgeyi KDV'den Cikar
              </button>
              <button className="soft-btn" type="button" disabled={!selectedRow} onClick={() => setDecision(selectedRow.key, "HELD")}>
                Sonra Kontrol Et
              </button>
              <button className="soft-btn danger" type="button" disabled={!selectedRow} onClick={() => setDecision(selectedRow.key, "CANCELLED")}>
                Iptal Adayi
              </button>
            </div>

            <div className="kdv-firm-actions">
              <strong>Firma geneli</strong>
              <div className="kdv-action-grid">
                <button className="soft-btn" type="button" disabled={!selectedCompany} onClick={() => setCompanyDecision(selectedCompany.key, "INCLUDED")}>
                  Firmayi Dahil Et
                </button>
                <button className="soft-btn" type="button" disabled={!selectedCompany} onClick={() => setCompanyDecision(selectedCompany.key, "EXCLUDED")}>
                  Firmayi KDV Disi Tut
                </button>
              </div>
            </div>

            <div className="kdv-adjustment">
              <strong>Firma Duzeltme / Ekle-Cikar</strong>
              <MoneyInput
                label="Duzeltme Tutari"
                value={selectedAdjustment.amount}
                onValueChange={(value) => setSelectedAdjustment({ amount: Number(value || 0) })}
              />
              <Textarea
                label="Aciklama"
                value={selectedAdjustment.note}
                onChange={(event) => setSelectedAdjustment({ note: event.target.value })}
                rows={3}
                placeholder="Orn. bu ay KDV'ye girmeyecek, sonraki ay kontrol"
              />
            </div>

            <div className="kdv-adjustment">
              <strong>Devreden KDV</strong>
              <MoneyInput
                label="Onceki Aydan Devreden"
                value={vatPeriodForm.carriedVatFromPreviousMonth}
                onValueChange={(value) =>
                  setVatPeriodForm((current) => ({
                    ...current,
                    carriedVatFromPreviousMonth: Number(value || 0),
                  }))
                }
              />
              <Textarea
                label="Donem Notu"
                value={vatPeriodForm.note}
                onChange={(event) =>
                  setVatPeriodForm((current) => ({ ...current, note: event.target.value }))
                }
                rows={3}
              />
              <button className="primary-btn" type="button" onClick={saveVatPeriod} disabled={vatPeriodBusy || loading}>
                <ErpIcon name="kaydet" size={16} />
                {vatPeriodBusy ? "Kaydediliyor..." : "Devredeni Kaydet"}
              </button>
              {vatPeriodNotice ? <div className="notice-box">{vatPeriodNotice}</div> : null}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="kdv-side-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
