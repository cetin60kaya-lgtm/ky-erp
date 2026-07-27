import { useState } from "react";
import { createManuelIs } from "../../services/imalatApi";
import { Field, InfoLine } from "./ImalatShared";

export default function ManuelIsAc({ activeMainCompany }) {
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    firma: "",
    model: "",
    siparisNo: "",
    irsaliyeNo: "",
    baskiBolgesi: "",
    beklenenAdet: 0,
    tarih: "2026-05-25",
    durum: "Havuza Aç",
  });
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    try {
      await createManuelIs(activeMainCompany, form);
      setMessage("İş üretim giriş havuzuna açıldı.");
    } catch (error) {
      setMessage(error?.message || "İş havuza açılamadı.");
    }
  };

  return (
    <div className="iw-grid-3">
      <aside className="iw-card">
        <div className="iw-card-head"><h2>Manuel İş Aç</h2></div>
        <div className="iw-card-body">
          <div className="iw-notice">Muhasebe irsaliyesi olmadan açılan iş de aynı çoklu giriş havuzuna düşer.</div>
        </div>
      </aside>
      <main className="iw-card">
        <div className="iw-card-head"><h2>Manuel İmalat Kartı</h2><button className="iw-btn primary" onClick={save}>İşi Havuza Aç</button></div>
        <div className="iw-card-body">
          <div className="iw-form-grid">
            <Field label="Firma"><input value={form.firma} onChange={(e) => set("firma", e.target.value)} /></Field>
            <Field label="Model"><input value={form.model} onChange={(e) => set("model", e.target.value)} /></Field>
            <Field label="Sipariş no"><input value={form.siparisNo} onChange={(e) => set("siparisNo", e.target.value)} /></Field>
            <Field label="İrsaliye no varsa"><input value={form.irsaliyeNo} onChange={(e) => set("irsaliyeNo", e.target.value)} placeholder="Varsa gir" /></Field>
            <Field label="Baskı bölgesi"><select value={form.baskiBolgesi} onChange={(e) => set("baskiBolgesi", e.target.value)}><option>Ön Baskı</option><option>Arka Baskı</option><option>Sağ Kol</option><option>Sol Kol</option><option>Ense</option></select></Field>
            <Field label="Beklenen adet"><input value={form.beklenenAdet} onChange={(e) => set("beklenenAdet", e.target.value)} /></Field>
            <Field label="Tarih"><input type="date" value={form.tarih} onChange={(e) => set("tarih", e.target.value)} /></Field>
            <Field label="Durum"><select value={form.durum} onChange={(e) => set("durum", e.target.value)}><option>Havuza Aç</option><option>Kontrol Bekliyor</option></select></Field>
          </div>
          {message ? <div className="iw-notice green">{message}</div> : null}
        </div>
      </main>
      <aside className="iw-card">
        <div className="iw-card-head"><h2>Manuel İş Özeti</h2></div>
        <div className="iw-card-body">
          <InfoLine label="Kaynak" value="Manuel" />
          <InfoLine label="Beklenen" value={Number(form.beklenenAdet || 0).toLocaleString("tr-TR")} />
          <InfoLine label="Giriş tipi" value="Çoklu" />
        </div>
      </aside>
    </div>
  );
}
