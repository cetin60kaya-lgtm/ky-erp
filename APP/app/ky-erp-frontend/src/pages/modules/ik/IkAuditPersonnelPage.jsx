import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, IdCard, RefreshCw, Search, UserRound, Users } from "lucide-react";
import { getAuditPeople, getAuditPerson } from "../../../services/ikAuditApi";
import "./ik-audit-personnel.css";

function initials(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr-TR");
}

function dateText(value) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "-";
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}.${month}.${year}` : raw;
}

function Field({ label, value }) {
  return (
    <div className="ika-field">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function IkAuditPersonnelPage() {
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPeople = useCallback(async () => {
    setError("");
    const rows = await getAuditPeople();
    const list = Array.isArray(rows) ? rows : [];
    setPeople(list);
    setSelectedId((current) => list.some((item) => item.id === current) ? current : (list[0]?.id || ""));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPeople()
      .catch((cause) => { if (alive) setError(cause?.message || "Personel kayıtları alınamadı."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadPeople]);

  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setSelected(null);
      return () => { alive = false; };
    }
    getAuditPerson(selectedId)
      .then((row) => { if (alive) setSelected(row || null); })
      .catch((cause) => { if (alive) setError(cause?.message || "Personel kartı alınamadı."); });
    return () => { alive = false; };
  }, [selectedId]);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return people;
    return people.filter((person) =>
      [person.fullName, person.personnelCode, person.department, person.title, person.cardNo]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(needle),
    );
  }, [people, query]);

  async function refresh() {
    try {
      setBusy(true);
      await loadPeople();
      if (selectedId) setSelected(await getAuditPerson(selectedId));
    } catch (cause) {
      setError(cause?.message || "Personel kayıtları yenilenemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="ika-loading">Personel kayıtları yükleniyor...</div>;

  return (
    <div className="ika-page">
      <header className="ika-header">
        <div>
          <span>İK / PERSONEL</span>
          <h1>Personel Kartları</h1>
          <p>Personel kayıtları ve temel çalışma bilgileri.</p>
        </div>
        <button type="button" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} /> Yenile
        </button>
      </header>

      {error ? <div className="ika-error">{error}</div> : null}

      <section className="ika-layout">
        <aside className="ika-directory">
          <label className="ika-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Personel ara" />
          </label>
          <div className="ika-count"><Users size={15} /> {filteredPeople.length} personel</div>
          <div className="ika-list">
            {filteredPeople.map((person) => (
              <button
                type="button"
                key={person.id}
                className={person.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(person.id)}
              >
                <b>{initials(person.fullName)}</b>
                <span>
                  <strong>{person.fullName}</strong>
                  <small>{person.personnelCode || "-"}{person.department ? ` · ${person.department}` : ""}</small>
                </span>
              </button>
            ))}
            {!filteredPeople.length ? <div className="ika-empty">Personel kaydı bulunamadı.</div> : null}
          </div>
        </aside>

        <main className="ika-card">
          {!selected ? (
            <div className="ika-empty-card"><UserRound size={44} /><span>Personel seçin</span></div>
          ) : (
            <>
              <div className="ika-person-head">
                <b>{initials(selected.fullName)}</b>
                <div>
                  <small>{selected.personnelCode || "Personel"}</small>
                  <h2>{selected.fullName}</h2>
                  <p>{[selected.department, selected.title].filter(Boolean).join(" · ") || "-"}</p>
                </div>
                <span className="ika-status"><BadgeCheck size={15} /> {selected.status || "Aktif"}</span>
              </div>

              <div className="ika-section-title"><IdCard size={17} /> Personel Bilgileri</div>
              <div className="ika-grid">
                <Field label="Ad Soyad" value={selected.fullName} />
                <Field label="Personel Kodu" value={selected.personnelCode} />
                <Field label="Departman" value={selected.department} />
                <Field label="Görev" value={selected.title} />
                <Field label="SGK" value={selected.sgkStatus} />
                <Field label="Durum" value={selected.status} />
              </div>

              <div className="ika-section-title"><BriefcaseBusiness size={17} /> Çalışma Bilgileri</div>
              <div className="ika-grid">
                <Field label="İşe Giriş" value={dateText(selected.startDate)} />
                <Field label="İşten Çıkış" value={dateText(selected.exitDate)} />
                <Field label="Kart No" value={selected.cardNo} />
                <Field label="Telefon" value={selected.phone} />
              </div>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
