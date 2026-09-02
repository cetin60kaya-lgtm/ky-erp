import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CircleAlert,
  IdCard,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
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
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}.${month}.${year}` : raw || "-";
}

function normalized(value) {
  return String(value || "").trim().toLocaleUpperCase("tr-TR");
}

function Stat({ label, value, detail, toneName = "" }) {
  return (
    <article className={`ika-stat ${toneName}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function IkAuditPersonnelPage() {
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPeople = useCallback(async () => {
    const result = await getAuditPeople();
    const safe = Array.isArray(result)
      ? result.filter((person) => normalized(person?.sgkStatus) === "VAR")
      : [];
    setPeople(safe);
    setSelectedId((current) =>
      safe.some((person) => person.id === current) ? current : safe[0]?.id || "",
    );
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    loadPeople()
      .catch((cause) => {
        if (alive) setError(cause?.message || "İK personel verileri alınamadı.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadPeople]);

  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setDetail(null);
      return () => {
        alive = false;
      };
    }
    getAuditPerson(selectedId)
      .then((result) => {
        if (alive && normalized(result?.sgkStatus) === "VAR") setDetail(result);
      })
      .catch((cause) => {
        if (alive) setError(cause?.message || "Personel detayı alınamadı.");
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  async function refresh() {
    try {
      setBusy(true);
      setError("");
      await loadPeople();
      if (selectedId) {
        const result = await getAuditPerson(selectedId);
        if (normalized(result?.sgkStatus) === "VAR") setDetail(result);
      }
    } catch (cause) {
      setError(cause?.message || "İK personel verileri yenilenemedi.");
    } finally {
      setBusy(false);
    }
  }

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return people;
    return people.filter((person) =>
      [
        person.fullName,
        person.personnelCode,
        person.department,
        person.title,
        person.cardNo,
        person.status,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(needle),
    );
  }, [people, query]);

  const selected = detail || people.find((person) => person.id === selectedId) || null;
  const withCard = people.filter((person) => String(person.cardNo || "").trim()).length;
  const withoutCard = people.length - withCard;
  const activeCount = people.filter((person) => {
    const status = normalized(person.status);
    return !status || ["AKTIF", "AKTİF", "ACTIVE"].includes(status);
  }).length;

  if (loading) return <div className="ika-loading">İK denetim ekranı yükleniyor...</div>;

  return (
    <div className="ika-page">
      <header className="ika-header">
        <div>
          <span>İK / DENETİM</span>
          <h1>Personel Denetim Merkezi</h1>
          <p>
            SGK durumu VAR olan aylık personel gösterilir. Kart numarası İK görünümü için şart değildir;
            ücret ve finans bilgileri bu ekranda yer almaz.
          </p>
        </div>
        <div className="ika-header-actions">
          <span className="ika-readonly"><ShieldCheck size={16} /> Salt okunur</span>
          <button type="button" onClick={refresh} disabled={busy}>
            <RefreshCw size={16} /> {busy ? "Yenileniyor" : "Yenile"}
          </button>
        </div>
      </header>

      {error ? <div className="ika-error"><CircleAlert size={16} /> {error}</div> : null}

      <section className="ika-stats">
        <Stat label="SGK Personel" value={people.length} detail="SGK durumu VAR" toneName="ok" />
        <Stat label="Aktif" value={activeCount} detail="Personel durumu aktif" />
        <Stat label="Kartlı" value={withCard} detail="PDKS kapsamına girebilir" />
        <Stat label="Kartsız" value={withoutCard} detail="İK'da görünür, PDKS'de görünmez" toneName={withoutCard ? "warn" : ""} />
      </section>

      <section className="ika-split">
        <aside className="ika-directory">
          <div className="ika-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Personel, kod, bölüm ara..."
            />
          </div>
          <div className="ika-count"><Users size={15} /> {filteredPeople.length} personel</div>
          <div className="ika-list">
            {filteredPeople.map((person) => (
              <button
                key={person.id}
                type="button"
                className={person.id === selectedId ? "active" : ""}
                onClick={() => {
                  setDetail(null);
                  setSelectedId(person.id);
                }}
              >
                <b>{initials(person.fullName) || <UserRound size={17} />}</b>
                <span>
                  <strong>{person.fullName || "İsimsiz personel"}</strong>
                  <small>
                    {person.personnelCode || "Kod yok"} • {person.department || "Bölüm yok"}
                    {person.cardNo ? ` • Kart ${person.cardNo}` : " • Kart yok"}
                  </small>
                </span>
              </button>
            ))}
            {!filteredPeople.length ? <div className="ika-empty">Aramaya uygun personel bulunamadı.</div> : null}
          </div>
        </aside>

        <article className="ika-panel">
          {selected ? (
            <>
              <div className="ika-person-head">
                <b>{initials(selected.fullName) || <UserRound size={22} />}</b>
                <div>
                  <small>{selected.personnelCode || "Personel kodu yok"}</small>
                  <h2>{selected.fullName || "İsimsiz personel"}</h2>
                  <p>{selected.department || "Bölüm yok"} • {selected.title || "Görev yok"}</p>
                </div>
                <span className="ika-person-status"><BadgeCheck size={15} /> SGK {selected.sgkStatus || "VAR"}</span>
              </div>

              <div className="ika-mini-grid">
                <Field label="Personel Kodu" value={selected.personnelCode} />
                <Field label="Durum" value={selected.status || "Aktif"} />
                <Field label="Bölüm" value={selected.department} />
                <Field label="Görev" value={selected.title} />
                <Field label="İşe Giriş" value={dateText(selected.startDate)} />
                <Field label="İşten Çıkış" value={selected.exitDate ? dateText(selected.exitDate) : "-"} />
                <Field label="Kart No" value={selected.cardNo || "Kart yok"} />
                <Field label="Telefon" value={selected.phone} />
              </div>

              <div className="ika-panel-head">
                <div>
                  <small>DENETİM KAPSAMI</small>
                  <h2>İK kayıt görünümü</h2>
                  <p>
                    Bu kart yalnız personel/SGK bilgilerini gösterir. PDKS kart hareketleri PDKS modülünde,
                    yalnız kart numarası bulunan SGK personeli için görüntülenir.
                  </p>
                </div>
                <span className="ika-scope"><IdCard size={15} /> {selected.cardNo ? "PDKS kartı mevcut" : "PDKS kartı yok"}</span>
              </div>
            </>
          ) : (
            <div className="ika-empty">Görüntülenecek personel seçin.</div>
          )}
        </article>
      </section>
    </div>
  );
}
