import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getDailyEmployeeWorkPaymentHistory } from "../../../services/dailyOpsApi";
import "./daily-employee-work-history.css";

function monthsBefore(dateKey, count) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return "1900-01-01";
  const date = new Date(year, month - 1, 1, 12);
  date.setMonth(date.getMonth() - count);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayNumber = Math.min(day, lastDay);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(dayNumber).padStart(2, "0")].join("-");
}

/** Personel kartı: yeni kayıt oluşturmaz, mevcut D1 vardiya ve ödeme defterini okur. */
export default function DailyEmployeeWorkPaymentHistory({ employeeId, companyId, today, money }) {
  const [mode, setMode] = useState("six");
  const [dates, setDates] = useState(() => ({
    start: monthsBefore(today, 6), end: today,
  }));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (quiet = false) => {
    if (!employeeId || !companyId || !dates.start || !dates.end || dates.end < dates.start) return;
    if (!quiet) setLoading(true);
    try {
      const result = await getDailyEmployeeWorkPaymentHistory(employeeId, {
        mainCompanyId: companyId,
        startDate: dates.start, endDate: dates.end,
      }, { forceFresh: true });
      setData(result); setError("");
    } catch (cause) {
      setData(null);
      setError(cause?.message || "Personel geçmişi doğrulanamadı.");
    } finally { if (!quiet) setLoading(false); }
  }, [companyId, dates.end, dates.start, employeeId]);

  useEffect(() => {
    let current = true;
    const run = async () => {
      if (!current) return;
      await load();
    };
    void run();
    const onFocus = () => { if (current) void load(true); };
    const interval = window.setInterval(() => { if (!document.hidden) void load(true); }, 60000);
    window.addEventListener("focus", onFocus);
    const onMutation = (event) => { if (event.data?.type) void load(true); };
    const channel = typeof window.BroadcastChannel === "function"
      ? new window.BroadcastChannel("kyerp.dailyOperations.live.v1") : null;
    channel?.addEventListener("message", onMutation);
    return () => {
      current = false; window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      channel?.removeEventListener("message", onMutation); channel?.close();
    };
  }, [load]);

  const choose = (next) => {
    setMode(next);
    if (next === "six") setDates({start:monthsBefore(today,6),end:today});
    else if (next === "year") setDates({start:monthsBefore(today,12),end:today});
    else if (next === "all") setDates({start:"1900-01-01",end:today});
  };
  return <section className="ky-person-history" aria-label="Personel çalışma ve ödeme geçmişi">
    <div className="ky-person-history-filters">
      <label>Dönem
        <select value={mode} onChange={(e)=>choose(e.target.value)}>
          <option value="six">Son 6 Ay</option>
          <option value="year">Son 12 Ay</option>
          <option value="all">Tüm Geçmiş</option>
          <option value="custom">Özel Aralık</option>
        </select>
      </label>
      <label>Başlangıç<input type="date" value={dates.start} onChange={e=>{setMode("custom");setDates(s=>({...s,start:e.target.value}));}}/></label>
      <label>Bitiş<input type="date" value={dates.end} onChange={e=>{setMode("custom");setDates(s=>({...s,end:e.target.value}));}}/></label>
      <button type="button" onClick={()=>void load()} disabled={loading || !dates.start || dates.end < dates.start}><RefreshCw size={14}/> Yenile</button>
    </div>
    <p className="ky-person-history-description">Çalışma/hakediş çalışma tarihine göre, yapılan ödemeler ödeme tarihine göre gösterilir. Kaydedilmiş personel kimliği esas alınır.</p>
    {error ? <p role="alert" className="ky-person-history-error">{error}</p> : null}
    {loading && !data ? <p role="status">Çalışma ve ödeme geçmişi D1 üzerinden doğrulanıyor…</p> : null}
    {data ? <>
      <div className="ky-person-history-metrics">
        <div><small>Gündüz / Gece</small><strong>{data.dayCount} / {data.nightCount}</strong><span>{data.workedDays} farklı çalışma günü</span></div>
        <div><small>Gündüz / Gece Hakediş</small><strong>{money(data.dayTotal)} / {money(data.nightTotal)}</strong><span>Ödemeden bağımsız çalışma tutarı</span></div>
        <div><small>Net Hakediş</small><strong>{money(data.earnedNet)}</strong><span>Ek ödeme {money(data.additions)} · Kesinti {money(data.deductions)}</span></div>
        <div><small>Teyitli Yapılan Ödeme</small><strong>{money(data.confirmedPaid)}</strong><span>{data.confirmedPaymentCount} aktif ödeme kaydı</span></div>
        <div><small>Ödenmemiş Hakediş</small><strong>{money(data.openNet)}</strong><span>Ödenmemiş vardiya + açık dönem ek/kesintisi</span></div>
        <div><small>Eski Sistemde Ödendi İşaretli</small><strong>{money(data.legacyMarked)}</strong><span>Ödeme defterinde teyit yok; yukarıdaki ödemeye eklenmez</span></div>
      </div>
      <div className="ky-person-history-sections">
        <div>
          <h4>Ödeme Defteri <small>{data.cancelledPaymentCount} iptal ayrıca hariç</small></h4>
          <div className="ky-person-history-scroll">
            {data.payments?.length ? <table><thead><tr><th>Ödeme Tarihi</th><th>Ödeme No / Hakediş Dönemi</th><th>Durum</th><th>Tutar</th></tr></thead>
              <tbody>{data.payments.map(item=><tr key={item.id}>
                <td>{item.paidDate}</td><td>{item.paymentNo}<small>{item.periodStart} – {item.periodEnd}</small></td>
                <td>{item.status === "PAID" ? "ÖDENDİ" : "İPTAL"}{item.cancelReason ? <small>{item.cancelReason}</small> : null}</td>
                <td>{money(item.totalAmount)}</td>
              </tr>)}</tbody></table> : <p>Bu ödeme tarihleri arasında defter kaydı bulunamadı.</p>}
          </div>
          {data.paymentsTruncated ? <small>Son 100 ödeme gösteriliyor; üstteki toplam tüm kayıtları kapsar.</small> : null}
        </div>
        <div>
          <h4>Gün Gün Çalışma <small>{data.workedDays} gün</small></h4>
          <div className="ky-person-history-scroll">
            {data.days?.length ? <table><thead><tr><th>Tarih</th><th>Gündüz</th><th>Gece</th><th>Durum</th></tr></thead>
              <tbody>{data.days.map((item,index)=><tr key={item.date+"-"+index}>
                <td>{item.date}</td>
                <td>{item.day ? money(item.dayAmount) : "—"}</td>
                <td>{item.night ? money(item.nightAmount) : "—"}</td>
                <td>{item.legacyMarked ? "Eski ödenmiş işareti" : item.dayPaid || item.nightPaid ? "Kısmen / tamamen ödendi" : "Açık"}</td>
              </tr>)}</tbody></table> : <p>Bu aralıkta kayıtlı çalışma bulunamadı.</p>}
          </div>
          {data.daysTruncated ? <small>Son 90 çalışma satırı gösteriliyor; üstteki toplam tüm kayıtları kapsar.</small> : null}
        </div>
      </div>
      <p className="ky-person-history-note">Bu ekran yalnız okur. Kayıt değiştirmez, maaş ödemesi yapmaz. Çalışma dönemi ve ödeme tarihi farklı olabileceği için iki tutar doğrudan birbirinden çıkarılmaz.</p>
    </> : null}
  </section>;
}
