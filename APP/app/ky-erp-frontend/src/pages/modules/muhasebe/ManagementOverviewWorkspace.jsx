import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../../utils/api";

const money = (value) => Number(value || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const unwrap = (payload) => payload?.data?.data || payload?.data || payload || {};

function Metric({ label, value }) {
  return (
    <div className="management-metric emphasis">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function ManagementOverviewWorkspace({ activeMainCompany, refreshKey }) {
  const [state, setState] = useState({ loading: true, error: "", data: {} });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await apiGet("/muhasebe/yonetim-ozeti", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        _ts: Date.now(),
      });
      setState({ loading: false, error: "", data: unwrap(payload) });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || "Yönetim özeti şu anda alınamadı.",
        data: {},
      });
    }
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (state.loading) {
    return (
      <div className="management-skeleton">
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>
    );
  }

  if (state.error) {
    return (
      <section className="management-controlled-state">
        <strong>Yönetim özeti yüklenemedi.</strong>
        <span>{state.error}</span>
        <button type="button" onClick={load}>Tekrar dene</button>
      </section>
    );
  }

  const data = state.data || {};
  const totals = data.totals || {};
  const receivable = Number(data.toplamAlacak ?? data.tahsilatBekleyen ?? totals.receivable ?? 0);
  const payable = Number(data.toplamBorc ?? data.odemeBekleyen ?? totals.payable ?? 0);
  const incomingMonth = Number(data.buAyGelenFatura ?? data.buAyAlisGider ?? 0);
  const outgoingMonth = Number(data.buAyKesilenFatura ?? data.buAySatis ?? 0);
  const upcomingChecks = Number(data.yaklasanCekToplami ?? data.cekOzet?.yaklasanCekTutari ?? 0);

  return (
    <div className="management-overview">
      <section className="management-primary-metrics">
        <Metric label="Toplam alacak" value={money(receivable)} />
        <Metric label="Toplam borç" value={money(payable)} />
        <Metric label="Bu ay gelen fatura" value={money(incomingMonth)} />
        <Metric label="Bu ay kesilen fatura" value={money(outgoingMonth)} />
        <Metric label="Yaklaşan çek" value={money(upcomingChecks)} />
      </section>
    </div>
  );
}
