import { useEffect, useMemo, useState } from "react";
import { getCariHareketler, getCariHareketlerByFirma, prepareCariEkstreMail, sendCari } from "../../services/muhasebeApi";
import { DataTable, Status, asArray, field, formatMoney } from "./_MuhasebeShared";

const emptyCompanies = [];
const emptyMovements = [];

export default function CariHareketPage({ activeMainCompany }) {
  const [companies, setCompanies] = useState(emptyCompanies);
  const [selectedId, setSelectedId] = useState("emptyRows");
  const [movements, setMovements] = useState(emptyMovements);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getCariHareketler(activeMainCompany || {})
      .then((payload) => {
        const rows = asArray(payload);
        if (rows.length) {
          setCompanies(rows);
          setSelectedId(String(rows[0].id || rows[0].firmaId || rows[0].companyId || "emptyRows"));
        }
      })
      .catch(() => setCompanies(emptyCompanies));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    getCariHareketlerByFirma(selectedId, activeMainCompany || {})
      .then((payload) => {
        const rows = asArray(payload);
        setMovements(rows.length ? rows : emptyMovements);
      })
      .catch(() => setMovements(emptyMovements));
  }, [selectedId, activeMainCompany?.slug, activeMainCompany?.id]);

  const selected = useMemo(
    () => companies.find((item) => String(item?.id || item?.firmaId || item?.companyId) === selectedId) || companies[0] || {},
    [companies, selectedId],
  );

  const mailDraft = async (withAttachments = false) => {
    try {
      await prepareCariEkstreMail(selectedId, { withAttachments });
      setMessage("Mail taslağı hazırlandı.");
    } catch {
      setMessage("emptyRows: Ekstre alıcısı eksikse Firma Kartı yetkileri kontrol edilir.");
    }
  };

  const send = async (withAttachments = false) => {
    try {
      await sendCari(selectedId, { withAttachments });
      setMessage(withAttachments ? "Cari ekstre ve fatura ekleri gönderime hazır." : "Cari ekstre gönderime hazır.");
    } catch {
      setMessage("emptyRows: Cari gönderme gerçek mail API bağlanınca otomatik çalışacak.");
    }
  };

  return (
    <div className="mh-layout-3">
      <section className="mh-card">
        <div className="mh-card-head"><h2>Firma Listesi</h2></div>
        <div className="mh-card-body">
          <input placeholder="Firma arama" />
          <div className="mh-list">
            {companies.map((company) => {
              const id = String(company?.id || company?.firmaId || company?.companyId || "emptyRows");
              return (
                <button key={id} type="button" className={id === selectedId ? "active" : ""} onClick={() => setSelectedId(id)}>
                  <strong>{field(company, ["firma", "firmaAdi", "name", "companyName", "firmName"])}</strong>
                  <span>Bakiye {formatMoney(field(company, ["bakiye", "balance", "currentBalance"], 0))}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <section className="mh-card">
        <div className="mh-card-head"><h2>Seçili Firma Cari Hareketleri</h2><Status>{field(selected, ["firma", "firmaAdi", "name", "companyName"], "Firma")}</Status></div>
        <div className="mh-card-body">
          <DataTable rows={movements} columns={[
            { key: "tarih", label: "Tarih", render: (r) => field(r, ["tarih", "date", "movementDate"]) },
            { key: "belge", label: "Belge", render: (r) => field(r, ["belge", "documentNo"]) },
            { key: "resmiGayri", label: "Resmi/Gayri", render: (r) => field(r, ["resmiGayri", "officialType", "workType"], "RESMI") },
            { key: "aciklama", label: "Açıklama", render: (r) => field(r, ["aciklama", "description"]) },
            { key: "borc", label: "Borç", render: (r) => formatMoney(field(r, ["borc", "debit"], 0)) },
            { key: "alacak", label: "Alacak", render: (r) => formatMoney(field(r, ["alacak", "credit"], 0)) },
            { key: "bakiye", label: "Bakiye", render: (r) => formatMoney(field(r, ["bakiye", "balanceAfter"], 0)) },
            { key: "vade", label: "Vade", render: (r) => field(r, ["vade", "dueDate"]) },
            { key: "durum", label: "Durum", render: (r) => <Status tone="green">{field(r, ["durum", "status"], "İşlendi")}</Status> },
          ]} />
        </div>
      </section>
      <aside className="mh-card">
        <div className="mh-card-head"><h2>Hızlı Cari İşlem</h2></div>
        <div className="mh-card-body mh-stack">
          <select><option>Borç</option><option>Alacak</option><option>Ödeme</option><option>Tahsilat</option></select>
          <input placeholder="Tutar" />
          <input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <textarea placeholder="Açıklama" />
          <button className="mh-btn primary">Kaydet</button>
          <button className="mh-btn" onClick={() => mailDraft(false)}>Ekstre Hazırla</button>
          <button className="mh-btn" onClick={() => mailDraft(true)}>Ekstre + Fatura Ekleri</button>
          <button className="mh-btn" onClick={() => send(false)}>Cari Gönder</button>
          <button className="mh-btn" onClick={() => mailDraft(false)}>Mail Taslağı Hazırla</button>
          {message ? <div className="mh-state">{message}</div> : null}
        </div>
      </aside>
    </div>
  );
}
