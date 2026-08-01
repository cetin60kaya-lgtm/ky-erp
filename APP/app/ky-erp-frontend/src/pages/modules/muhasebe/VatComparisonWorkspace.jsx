import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, CircleAlert, RefreshCcw, X } from "lucide-react";
import { apiGet } from "../../../utils/api";
import "./vatComparisonWorkspace.css";

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

const unwrap = (payload) => payload?.data?.data ?? payload?.data ?? payload ?? {};

function invoiceRows(source) {
  return Array.isArray(source) ? source : [];
}

function FirmSide({ title, subtitle, rows, direction, onSelect }) {
  const incoming = direction === "incoming";
  const totalBase = rows.reduce(
    (sum, row) => sum + Number(incoming ? row.gelenMatrah : row.gidenMatrah || 0),
    0,
  );
  const totalVat = rows.reduce(
    (sum, row) => sum + Number(incoming ? row.gelenKdv : row.gidenKdv || 0),
    0,
  );
  return (
    <section className="vcw-side">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <strong>{money(totalVat)}</strong>
      </header>
      <div className="vcw-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Firma</th>
              <th>Matrah</th>
              <th>KDV</th>
              <th>Belge</th>
              <th aria-label="Detay" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${direction}-${row.firmId || row.firma}`}
                onClick={() => onSelect(row, direction)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(row, direction);
                }}
              >
                <td><strong>{row.firma || "Firma eşleşmesi bekliyor"}</strong></td>
                <td>{money(incoming ? row.gelenMatrah : row.gidenMatrah)}</td>
                <td><strong>{money(incoming ? row.gelenKdv : row.gidenKdv)}</strong></td>
                <td>{Number(row.belgeSayisi || 0)}</td>
                <td><ChevronRight size={16} /></td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan="5">
                  <div className="vcw-empty">Bu dönem için firma kaydı bulunamadı.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <td>Toplam</td>
              <td>{money(totalBase)}</td>
              <td>{money(totalVat)}</td>
              <td colSpan="2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function VatComparisonWorkspace({ activeMainCompany, refreshKey }) {
  const current = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(current);
  const [state, setState] = useState({ loading: true, error: "", data: {} });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState({ loading: false, error: "", data: {} });

  const params = useMemo(
    () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
      year: Number(month.slice(0, 4)),
      month: Number(month.slice(5, 7)),
    }),
    [activeMainCompany?.id, activeMainCompany?.slug, month],
  );

  const load = useCallback(async () => {
    setState((old) => ({ ...old, loading: true, error: "" }));
    try {
      const response = await apiGet("/vat/summary", { ...params, _ts: Date.now() });
      setState({ loading: false, error: "", data: unwrap(response) });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "KDV verileri alınamadı.",
        data: {},
      });
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rows = Array.isArray(state.data?.liste) ? state.data.liste : [];
  const incomingRows = rows
    .filter((row) => Number(row.gelenKdv || 0) !== 0 || Number(row.gelenMatrah || 0) !== 0)
    .sort((a, b) => Number(b.gelenKdv || 0) - Number(a.gelenKdv || 0));
  const outgoingRows = rows
    .filter((row) => Number(row.gidenKdv || 0) !== 0 || Number(row.gidenMatrah || 0) !== 0)
    .sort((a, b) => Number(b.gidenKdv || 0) - Number(a.gidenKdv || 0));

  const incomingVat = Number(state.data?.incomingVat || 0);
  const outgoingVat = Number(state.data?.outgoingVat || 0);
  const previousCarryVat = Number(state.data?.previousCarryVat || 0);
  const payableVat = Number(state.data?.payableVat || 0);
  const carryForwardVat = Number(state.data?.carryForwardVat || 0);
  const neededPurchaseBase = payableVat > 0 ? payableVat / 0.2 : 0;
  const neededPurchaseWithVat = neededPurchaseBase * 1.2;

  const openFirm = async (row, direction) => {
    if (!row.firmId) return;
    setSelected({ ...row, direction });
    setDetail({ loading: true, error: "", data: {} });
    try {
      const response = await apiGet(`/vat/firms/${encodeURIComponent(row.firmId)}/detail`, {
        ...params,
        _ts: Date.now(),
      });
      setDetail({ loading: false, error: "", data: unwrap(response) });
    } catch (error) {
      setDetail({
        loading: false,
        error: error?.message || "Firma KDV detayı alınamadı.",
        data: {},
      });
    }
  };

  if (state.loading) {
    return <div className="accounting-list-skeleton"><span /><span /><span /><span /></div>;
  }

  if (state.error) {
    return (
      <section className="accounting-controlled-state">
        <strong>KDV görünümü yüklenemedi.</strong>
        <span>{state.error}</span>
        <button type="button" onClick={load}>Tekrar dene</button>
      </section>
    );
  }

  return (
    <div className="vcw-root">
      <div className="vcw-toolbar">
        <label>
          Dönem
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
        <button type="button" onClick={load}><RefreshCcw size={16} /> Güncelle</button>
        <span>{Number(state.data?.recordCount || 0)} KDV kaydı</span>
      </div>

      <section className="vcw-summary">
        <div><span>İndirilecek KDV</span><strong>{money(incomingVat)}</strong></div>
        <div><span>Hesaplanan KDV</span><strong>{money(outgoingVat)}</strong></div>
        <div><span>Önceki devreden</span><strong>{money(previousCarryVat)}</strong></div>
        <div className={payableVat > 0 ? "attention" : "success"}>
          <span>Ödenecek KDV</span><strong>{money(payableVat)}</strong>
        </div>
        <div className={carryForwardVat > 0 ? "success" : ""}>
          <span>Sonraki döneme devreden</span><strong>{money(carryForwardVat)}</strong>
        </div>
      </section>

      {payableVat > 0 ? (
        <section className="vcw-purchase-note">
          <CircleAlert size={19} />
          <div>
            <strong>Yüzde 20 KDV oranında gereken alım</strong>
            <span>
              Matrah {money(neededPurchaseBase)} · KDV dahil yaklaşık {money(neededPurchaseWithVat)}
            </span>
          </div>
        </section>
      ) : null}

      <div className="vcw-sides">
        <FirmSide
          title="Gelen faturalar"
          subtitle="İndirilecek KDV"
          rows={incomingRows}
          direction="incoming"
          onSelect={openFirm}
        />
        <FirmSide
          title="Kesilen faturalar"
          subtitle="Hesaplanan KDV"
          rows={outgoingRows}
          direction="outgoing"
          onSelect={openFirm}
        />
      </div>

      <footer className="vcw-formula">
        <span>Hesaplanan KDV</span>
        <b>{money(outgoingVat)}</b>
        <i>−</i>
        <span>İndirilecek KDV</span>
        <b>{money(incomingVat)}</b>
        <i>−</i>
        <span>Önceki devreden</span>
        <b>{money(previousCarryVat)}</b>
        <i>=</i>
        <strong>{payableVat > 0 ? `Ödenecek ${money(payableVat)}` : `Devreden ${money(carryForwardVat)}`}</strong>
      </footer>

      {selected ? (
        <div className="vcw-drawer-layer" role="presentation" onMouseDown={() => setSelected(null)}>
          <aside className="vcw-drawer" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{selected.firma || "Firma KDV Detayı"}</h2>
                <p>{month} dönemi · {selected.direction === "incoming" ? "Gelen faturalar" : "Kesilen faturalar"}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Kapat"><X size={20} /></button>
            </header>
            <div className="vcw-drawer-body">
              {detail.loading ? <div className="vcw-empty">Firma detayları yükleniyor…</div> : null}
              {detail.error ? <div className="vcw-error">{detail.error}</div> : null}
              {!detail.loading && !detail.error ? (
                <>
                  <section className="vcw-detail-summary">
                    <div><span>Hesaplanan KDV</span><strong>{money(detail.data?.hesaplananKdv)}</strong></div>
                    <div><span>İndirilecek KDV</span><strong>{money(detail.data?.indirilecekKdv)}</strong></div>
                    <div><span>Önceki devreden</span><strong>{money(detail.data?.oncekiDevredenKdv)}</strong></div>
                    <div><span>Ödenecek</span><strong>{money(detail.data?.odenecekKdv)}</strong></div>
                    <div><span>Devreden</span><strong>{money(detail.data?.devredenKdv)}</strong></div>
                  </section>
                  <section className="vcw-detail-section">
                    <h3>Faturalar</h3>
                    <div className="vcw-table-wrap">
                      <table>
                        <thead><tr><th>Tarih</th><th>Fatura No</th><th>Matrah</th><th>KDV</th><th>Toplam</th><th>Kaynak</th></tr></thead>
                        <tbody>
                          {invoiceRows(selected.direction === "incoming" ? detail.data?.gelenBelgeler : detail.data?.gidenBelgeler).map((row) => (
                            <tr key={row.id}>
                              <td>{dateText(row.issueDate || row.date)}</td>
                              <td>{row.documentNo || row.invoiceNo || "-"}</td>
                              <td>{money(row.subtotal)}</td>
                              <td>{money(row.vatTotal)}</td>
                              <td><strong>{money(row.grandTotal)}</strong></td>
                              <td>{/ISNET/i.test(String(row.sourceType || "")) ? "İşNet" : "Manuel"}</td>
                            </tr>
                          ))}
                          {!invoiceRows(selected.direction === "incoming" ? detail.data?.gelenBelgeler : detail.data?.gidenBelgeler).length ? (
                            <tr><td colSpan="6"><div className="vcw-empty">Bu firma için döneme ait fatura bulunamadı.</div></td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
