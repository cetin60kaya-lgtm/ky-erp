import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../../../utils/api";
import { currentAccountingMonth, managementOverviewValues, validAccountingMonth } from "./managementOverviewPeriod";

const money = (value) => value === null ? "Kaynak yok" : Number(value).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};

function Metric({ label, value }) {
  return <div className="management-metric emphasis"><span>{label}</span><strong>{value}</strong></div>;
}

export default function ManagementOverviewWorkspace({ activeMainCompany, refreshKey }) {
  const [period, setPeriod] = useState(currentAccountingMonth);
  const [state, setState] = useState({ loading: true, error: "", data: {}, denied: false });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++seq.current;
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setState({ loading: false, error: "Yönetim özetini görmek için ana firma seçin.", data: {}, denied: false });
      return;
    }
    if (!validAccountingMonth(period)) {
      setState({ loading: false, error: "Geçerli bir dönem seçin.", data: {}, denied: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await apiGet("/muhasebe/yonetim-ozeti", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        period,
        year: Number(period.slice(0, 4)),
        month: Number(period.slice(5, 7)),
        _ts: Date.now(),
      });
      if (ticket !== seq.current) return;
      const data = unwrap(payload);
      if (data.invoicePeriod && data.invoicePeriod !== period) throw new Error("Sunucunun döndürdüğü dönem seçilen dönemle eşleşmiyor.");
      if (data.vatPeriod && data.vatPeriod !== period) throw new Error("KDV dönemi seçili dönemle eşleşmiyor.");
      setState({ loading: false, error: "", data, denied: false });
    } catch (error) {
      if (ticket !== seq.current) return;
      setState({
        loading: false,
        error: error?.message || "Yönetim özeti şu anda alınamadı.",
        data: {},
        denied: [401, 403].includes(Number(error?.status || error?.statusCode || 0)),
      });
    }
  }, [activeMainCompany?.id, activeMainCompany?.slug, period]);

  useEffect(() => {
    void load();
    return () => { seq.current += 1; };
  }, [load, refreshKey]);

  if (state.loading) {
    return <div className="management-skeleton" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>;
  }

  return (
    <div className="management-overview">
      <div className="management-overview-period">
        <label>Dönem <input type="month" aria-label="Yönetim özeti dönemi" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
        <button type="button" disabled={state.loading} onClick={() => void load()}>Yenile</button>
        {state.data?.generatedAt ? <small>Son veri: {new Date(state.data.generatedAt).toLocaleString("tr-TR")}</small> : null}
      </div>
      {state.error ? (
        <section className="management-controlled-state" role="alert">
          <strong>{state.denied ? "Bu hesabın finansal yönetim özetine erişim yetkisi bulunmuyor." : "Yönetim özeti yüklenemedi."}</strong>
          <span>{state.denied ? "Sunucu bu firmaya ilişkin yönetim özetine erişimi reddetti." : state.error}</span>
          {!state.denied ? <button type="button" onClick={() => void load()}>Tekrar dene</button> : null}
        </section>
      ) : (
        <>
          <p className="management-period-note">{period} belge ve KDV dönemi. Cari ve yaklaşan çek toplamları güncel bakiyelerdir, dönemsel toplam değildir.</p>
          <section className="management-primary-metrics">
            {(() => {
              const values = managementOverviewValues(state.data);
              return <>
                <Metric label="Güncel toplam alacak" value={money(values.receivable)} />
                <Metric label="Güncel toplam borç" value={money(values.payable)} />
                <Metric label="Seçili ay gelen fatura" value={money(values.incoming)} />
                <Metric label="Seçili ay kesilen fatura" value={money(values.outgoing)} />
                <Metric label="Güncel yaklaşan çek" value={money(values.upcomingChecks)} />
                <Metric label="Seçili dönem gelen KDV" value={money(values.incomingVat)} />
                <Metric label="Seçili dönem giden KDV" value={money(values.outgoingVat)} />
              </>;
            })()}
          </section>
        </>
      )}
    </div>
  );
}
