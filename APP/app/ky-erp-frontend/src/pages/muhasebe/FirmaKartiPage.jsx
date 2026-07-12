import { useEffect, useMemo, useState } from "react";
import {
  adjustFirmaBalance,
  getFirmaContacts,
  getFirmaKartlari,
} from "../../services/muhasebeApi";
import {
  DataTable,
  MoneyInput,
  Status,
  asArray,
  field,
  formatMoney,
  parseMoney,
} from "./_MuhasebeShared";

const emptyContacts = [];

export default function FirmaKartiPage({ activeMainCompany, openTab }) {
  const [companies, setCompanies] = useState([]);
  const [contacts, setContacts] = useState(emptyContacts);
  const [selectedId, setSelectedId] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [officialType, setOfficialType] = useState("");
  const [balanceDraft, setBalanceDraft] = useState(0);
  const [savingBalance, setSavingBalance] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getFirmaKartlari(activeMainCompany || {})
      .then((payload) => {
        const rows = asArray(payload);
        setCompanies(rows);
        setSelectedId((prev) => prev || String(rows[0].id || ""));
      })
      .catch(() => setCompanies([]));
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    if (!selectedId) return;
    getFirmaContacts(selectedId, activeMainCompany || {})
      .then((payload) => {
        const rows = asArray(payload);
        setContacts(rows.length ? rows : emptyContacts);
      })
      .catch(() => setContacts(emptyContacts));
  }, [selectedId, activeMainCompany?.slug, activeMainCompany?.id]);

  const filtered = companies.filter((company) => {
    const name = String(
      field(company, ["firma", "name", "firmaAdi"], ""),
    ).toLocaleLowerCase("tr-TR");
    const okQ = !q || name.includes(q.toLocaleLowerCase("tr-TR"));
    const okType =
      !type ||
      String(field(company, ["type", "firmaTipi", "firmType"], "")).includes(
        type,
      );
    const okOfficial =
      !officialType ||
      String(
        field(company, ["defaultRecordType", "workType", "officialType"], ""),
      ).includes(officialType);
    return okQ && okType && okOfficial;
  });

  const selected = useMemo(
    () =>
      filtered.find((item) => String(item?.id) === String(selectedId)) ||
      filtered[0] ||
      {},
    [filtered, selectedId],
  );

  const selectedBalance = parseMoney(
    field(selected, ["mevcutBakiye", "currentBalance", "bakiye"], 0),
  );

  useEffect(() => {
    setBalanceDraft(selectedBalance);
    setNotice("");
  }, [selected.id, selectedBalance]);

  const loadCompanies = async (keepId = selectedId) => {
    try {
      const payload = await getFirmaKartlari(activeMainCompany || {});
      const rows = asArray(payload);
      setCompanies(rows);
      setSelectedId(keepId || String(rows[0].id || ""));
    } catch {
      setCompanies([]);
    }
  };

  const saveBalance = async () => {
    if (!selected.id) return;
    setSavingBalance(true);
    setNotice("");
    try {
      await adjustFirmaBalance(activeMainCompany || {}, selected.id, {
        targetBalance: balanceDraft,
        description: "Firma kartindan mevcut bakiye duzeltme",
      });
      await loadCompanies(String(selected.id));
      setNotice("Mevcut bakiye güncellendi.");
    } catch (error) {
      setNotice(error?.message || "Mevcut bakiye kaydedilemedi.");
    } finally {
      setSavingBalance(false);
    }
  };

  const authority = {
    invoice: contacts.some((c) => c.canReceiveInvoice || c.faturaAlir),
    dispatch: contacts.some((c) => c.canReceiveDispatch || c.irsaliyeAlir),
    statement: contacts.some((c) => c.canReceiveStatement || c.ekstreAlir),
    reminder: contacts.some(
      (c) => c.canReceivePaymentReminder || c.odemeHatirlatmaAlir,
    ),
    cc: contacts.some(
      (c) => c.canReceiveGeneralAccounting || c.genelMuhasebeCcAlir,
    ),
    model: contacts.some(
      (c) => c.canBeModelResponsible || c.modelSorumlusuOlabilir,
    ),
  };

  return (
    <div className="mh-layout-3">
      <section className="mh-card">
        <div className="mh-card-head">
          <h2>Firma Listesi</h2>
        </div>
        <div className="mh-card-body">
          <div className="mh-stack">
            <input
              placeholder="Firma arama"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Firma tipi</option>
              <option value="MUSTERI">Müşteri</option>
              <option value="SATICI">Tedarikçi</option>
              <option value="BOTH">İkisi</option>
            </select>
            <select
              value={officialType}
              onChange={(e) => setOfficialType(e.target.value)}
            >
              <option value="">Resmi / gayri</option>
              <option value="RESMI">Resmi</option>
              <option value="GAYRI">Gayri</option>
            </select>
          </div>
          <div className="mh-list">
            {filtered.map((company) => (
              <button
                key={company?.id}
                type="button"
                className={
                  String(company.id) === String(selected.id) ? "active" : ""
                }
                onClick={() => setSelectedId(String(company?.id))}
              >
                <strong>{field(company, ["firma", "name", "firmaAdi"])}</strong>
                <span>
                  {field(company, ["type", "firmaTipi", "firmType"], "Firma")}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mh-card">
        <div className="mh-card-head">
          <h2>Firma Ana Bilgileri</h2>
        </div>
        <div className="mh-card-body">
          <div className="mh-form-grid three">
            <Field
              label="Firma adı"
              value={field(selected, ["firma", "name", "firmaAdi"], "")}
            />
            <Field
              label="Firma tipi"
              value={field(
                selected,
                ["type", "firmaTipi", "firmType"],
                "Müşteri / Tedarikçi",
              )}
            />
            <Field
              label="Resmi / Gayri"
              value={field(
                selected,
                ["defaultRecordType", "workType"],
                "RESMI",
              )}
            />
            <Field
              label="VKN / TCKN"
              value={field(selected, ["taxNo", "vkn", "vergiNo"], "")}
            />
            <Field
              label="Vergi dairesi"
              value={field(selected, ["taxOffice", "vergiDairesi"], "")}
            />
            <Field
              label="Telefon"
              value={field(selected, ["phone", "telefon"], "")}
            />
            <Field
              label="Genel e-posta"
              value={field(selected, ["email", "eposta"], "")}
            />
            <Field
              label="Varsayılan KDV"
              value={field(selected, ["defaultVatRate", "kdvOrani"], "20")}
            />
            <Field
              label="Ekstre takip"
              value={field(selected, ["statementTrackingEnabled"], "Aktif")}
            />
            <MoneyInput
              label="Mevcut Bakiye"
              value={balanceDraft}
              onValueChange={setBalanceDraft}
              disabled={savingBalance}
            />
            <label className="mh-field">
              <span>Bakiye İşlemi</span>
              <button
                className="mh-btn primary"
                type="button"
                disabled={savingBalance || !selected.id}
                onClick={saveBalance}
              >
                {savingBalance ? "Kaydediliyor" : "Mevcut Bakiyeyi Kaydet"}
              </button>
            </label>
            <label className="mh-field wide">
              <span>Adres</span>
              <textarea
                value={field(selected, ["address", "adres"], "")}
                readOnly
              />
            </label>
            <Field label="Kayıtlı Bakiye" value={formatMoney(selectedBalance)} />
            {notice ? <div className="mh-info wide">{notice}</div> : null}
            <label className="mh-field wide">
              <span>Cari notu</span>
              <textarea value={field(selected, ["note", "not"], "")} readOnly />
            </label>
          </div>
          <h3 className="mh-subtitle">Firma Kişileri / Mail Yetkileri</h3>
          <DataTable
            rows={contacts}
            columns={[
              {
                key: "fullName",
                label: "Ad Soyad",
                render: (r) => field(r, ["fullName", "adSoyad", "kisiAdi"]),
              },
              { key: "department", label: "Departman" },
              { key: "title", label: "Görev" },
              { key: "email", label: "E-posta" },
              { key: "phone", label: "Telefon" },
              {
                key: "canReceiveInvoice",
                label: "Fatura alır",
                render: (r) => yes(r.canReceiveInvoice || r.faturaAlir),
              },
              {
                key: "canReceiveDispatch",
                label: "İrsaliye alır",
                render: (r) => yes(r.canReceiveDispatch || r.irsaliyeAlir),
              },
              {
                key: "canReceiveStatement",
                label: "Ekstre alır",
                render: (r) => yes(r.canReceiveStatement || r.ekstreAlir),
              },
              {
                key: "canReceivePaymentReminder",
                label: "Ödeme hatırlatma alır",
                render: (r) =>
                  yes(r.canReceivePaymentReminder || r.odemeHatirlatmaAlir),
              },
              {
                key: "canReceiveGeneralAccounting",
                label: "Genel muhasebe CC alır",
                render: (r) =>
                  yes(r.canReceiveGeneralAccounting || r.genelMuhasebeCcAlir),
              },
              {
                key: "canBeModelResponsible",
                label: "Model sorumlusu olabilir",
                render: (r) =>
                  yes(r.canBeModelResponsible || r.modelSorumlusuOlabilir),
              },
              {
                key: "canAssignModel",
                label: "Model atayan olabilir",
                render: (r) => yes(r.canAssignModel || r.modelAtayanOlabilir),
              },
              {
                key: "canSeePrice",
                label: "Fiyat görebilir",
                render: (r) => yes(r.canSeePrice || r.fiyatGorebilir),
              },
              {
                key: "status",
                label: "Durum",
                render: (r) => (
                  <Status tone="green">
                    {field(r, ["status", "durum"], "Aktif")}
                  </Status>
                ),
              },
              {
                key: "action",
                label: "İşlem",
                render: () => <button className="mh-btn">Düzenle</button>,
              },
            ]}
          />
        </div>
      </section>

      <aside className="mh-card">
        <div className="mh-card-head">
          <h2>Mail Yetki Kontrolü</h2>
        </div>
        <div className="mh-card-body mh-side-lines">
          <Line label="Fatura yetkilisi" ok={authority.invoice} />
          <Line label="İrsaliye yetkilisi" ok={authority.dispatch} />
          <Line label="Ekstre yetkilisi" ok={authority.statement} />
          <Line label="Ödeme hatırlatma yetkilisi" ok={authority.reminder} />
          <Line label="Genel muhasebe CC" ok={authority.cc} />
          <Line label="Model sorumlusu" ok={authority.model} />
          <button className="mh-btn" onClick={() => openTab?.("mail")}>
            Mail ekranına git
          </button>
          <button className="mh-btn" onClick={() => openTab?.("cari")}>
            Cari hareketlere git
          </button>
          <button className="mh-btn">Ekstre hazırla</button>
          <button className="mh-btn primary">Cari gönder</button>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <label className="mh-field">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}
function yes(value) {
  return (
    <Status tone={value ? "green" : "red"}>{value ? "Evet" : "Yok"}</Status>
  );
}
function Line({ label, ok }) {
  return (
    <div className="mh-side-line">
      <span>{label}</span>
      {yes(ok)}
    </div>
  );
}
