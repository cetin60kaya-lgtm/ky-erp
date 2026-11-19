import React, { useMemo, useState } from "react";
import { Check, CheckCircle2, ClipboardCheck, Clock3, RotateCcw, Search, Save, Users, UserPlus } from "lucide-react";
import { rankDailyFrequentEmployees } from "../../../services/dailyEntryFrequent";
import "./daily-entry-smart.css";

/**
 * Düz sayfada tek günlük seçim yüzeyi.
 * Kartlar sadece taslak değiştirir; D1 yazımı mevcut saveFocused üzerinden
 * tek toplu kayıtta ve sunucu doğrulamasında gerçekleşir.
 */
export default function DailyEntrySmartSelector({
  employees, attendance, rosterIds, selectedIds, checkedIds, savedIds,
  date, shift, busy, blocked, dirty, rangeReady, wageAtDate, formatMoney,
  onToggle, onToggleChecked, onSelectMany, onRestore, onSave, onEdit,
  onNewPerson,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [role, setRole] = useState("all");

  const activePeople = useMemo(() => (Array.isArray(employees) ? employees : [])
    .filter((person) => person.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr")), [employees]);
  const frequent = useMemo(() => rankDailyFrequentEmployees(activePeople, attendance, date, shift, 10),
    [activePeople, attendance, date, shift]);
  const frequentIds = useMemo(() => new Set(frequent.map((item) => item.person.id)), [frequent]);
  const roles = useMemo(() => [...new Set(activePeople.map((p) => p.role || "Vasıfsız"))].sort((a, b) => a.localeCompare(b, "tr")),
    [activePeople]);

  const list = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return activePeople.filter((person) => {
      if (role !== "all" && (person.role || "Vasıfsız") !== role) return false;
      if (filter === "roster" && !rosterIds.has(person.id)) return false;
      if (filter === "frequent" && !frequentIds.has(person.id)) return false;
      if (filter === "selected" && !selectedIds.has(person.id)) return false;
      return !q || [person.name, person.personnelNo, person.role, person.broker]
        .join(" ").toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [activePeople, filter, frequentIds, role, rosterIds, search, selectedIds]);
  const validList = list.filter((person) => shift === "day" || wageAtDate(person, date).night > 0);
  const selectedPeople = activePeople.filter((p) => selectedIds.has(p.id));
  const reviewedCount = selectedPeople.filter((p) => checkedIds.has(p.id)).length;
  const previewCents = selectedPeople.reduce((sum, person) => {
    const wages = wageAtDate(person, date);
    return sum + Math.round((shift === "night" ? wages.night : wages.day) * 100);
  }, 0);
  const pendingCount = selectedPeople.filter((person) => !savedIds.has(person.id)).length;
  const canEdit = !busy && !blocked && rangeReady;

  return (
    <section className="ky-smart" aria-label="Akıllı günlük personel giriş ekranı">
      <header className="ky-smart-heading">
        <div><span className="ky-smart-eyebrow">HIZLI PERSONEL GİRİŞİ · TEK EKRAN</span>
          <h2>Personeli seç, topluca kaydet</h2>
          <p>Kartlara dokunmak sadece seçim yapar. Vardiya kaydı tek Kaydet işleminde D1 üzerinde doğrulanır.</p>
        </div>
        <div className={["ky-smart-shift", shift].join(" ")}>{shift === "night" ? "GECE" : "GÜNDÜZ"}</div>
      </header>

      <div className="ky-smart-metrics">
        <div><small>Havuzda</small><strong>{rosterIds.size}</strong></div>
        <div><small>Bu vardiya seçili</small><strong>{selectedIds.size}</strong></div>
        <div><small>Kontrol edildi</small><strong>{reviewedCount}/{selectedIds.size}</strong></div>
        <div><small>Yeni seçim</small><strong>{pendingCount}</strong></div>
      </div>

      <section className="ky-smart-frequent" aria-label="Sık kullanılan personeller">
        <div className="ky-smart-section-title">
          <div><strong><Clock3 size={16}/> Sık Kullanılanlar</strong>
            <span>Son 30 günün aynı vardiyadaki gerçek çalışmaları</span></div>
          <button type="button" disabled={!canEdit || !frequent.length}
            onClick={() => onSelectMany(frequent.map((x) => x.person.id))}>
            <Check size={14}/> Sık kullanılanları seç
          </button>
        </div>
        <div className="ky-smart-frequent-list">
          {frequent.length ? frequent.map(({ person, count }) => {
            const selected = selectedIds.has(person.id);
            const unavailable = shift === "night" && wageAtDate(person, date).night <= 0;
            return <button type="button" key={person.id} disabled={!canEdit || unavailable}
              className={["ky-smart-frequent-person", selected ? "selected" : ""].join(" ")}
              aria-pressed={selected} onClick={() => onToggle(person.id)}>
              <span className="ky-smart-frequent-name">{person.name}</span>
              <small>{person.personnelNo || "Kod yok"} · {count} vardiya</small>
              <b>{selected ? "✓ Seçili" : "Seç"}</b>
            </button>;
          }) : <span className="ky-smart-empty-tip">Bu vardiyaya ait geçmiş çalışma bulunamadı. Aşağıdaki personel listesinden seçim yapabilirsiniz.</span>}
        </div>
      </section>

      <div className="ky-smart-content">
        <div className="ky-smart-catalog">
          <div className="ky-smart-section-title"><div><strong><Users size={16}/> Personel listesi</strong><span>{list.length} kişi görüntüleniyor</span></div>
            <button type="button" onClick={onNewPerson}><UserPlus size={14}/> Yeni Personel</button>
          </div>
          <div className="ky-smart-filters">
            <label className="ky-smart-search"><Search size={17}/>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad, HKN kodu, vasıf veya aracı ara" aria-label="Personel ara"/>
            </label>
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vasıf filtrele">
              <option value="all">Tüm vasıflar</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="ky-smart-tabs" role="group" aria-label="Personel filtreleri">
            {[["all","Tümü"],["roster","Havuzdakiler"],["frequent","Sık Kullanılan"],["selected","Seçilenler"]].map(([key,label]) =>
              <button type="button" key={key} className={filter === key ? "active" : ""}
                aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
            <button type="button" className="ky-smart-select-results" disabled={!canEdit || !validList.length}
              onClick={() => onSelectMany(validList.map((person) => person.id))}>Görünenleri Seç</button>
          </div>
          <div className="ky-smart-grid" role="list">
            {list.length ? list.map((person) => {
              const selected = selectedIds.has(person.id);
              const checked = checkedIds.has(person.id);
              const saved = savedIds.has(person.id);
              const wage = wageAtDate(person, date);
              const unavailable = shift === "night" && wage.night <= 0;
              return <article role="listitem" key={person.id}
                className={["ky-smart-person",selected ? "selected" : "",checked ? "checked" : "",unavailable ? "unavailable" : ""].join(" ")}>
                <button type="button" className="ky-smart-person-select" disabled={!canEdit || unavailable}
                  onClick={() => onToggle(person.id)} aria-pressed={selected}
                  aria-label={person.name + (selected ? " seçimini kaldır" : " seç")}>
                  <span className="ky-smart-check">{selected ? "✓" : "+"}</span>
                  <span className="ky-smart-identity"><strong title={person.name}>{person.name}</strong>
                    <small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small>
                  </span>
                  <span className="ky-smart-wage">{unavailable ? "Gece ücreti yok" : formatMoney(shift === "night" ? wage.night : wage.day)}</span>
                </button>
                <div className="ky-smart-person-footer">
                  <span>{saved ? "Kayıtlı vardiya" : rosterIds.has(person.id) ? "Dönem havuzunda" : "Yeni personel seçimi"}</span>
                  {selected ? <button type="button" disabled={!canEdit} className={checked ? "checked" : ""}
                    onClick={() => onToggleChecked(person.id)}
                    aria-pressed={checked}><CheckCircle2 size={13}/>{checked ? "Kontrol ✓" : "Kontrol et"}</button> : null}
                  <button type="button" onClick={() => onEdit(person)} aria-label={person.name + " kartını düzenle"}>Kart</button>
                </div>
              </article>;
            }) : <p className="ky-smart-empty-tip">Aramanıza uygun personel yok. Filtreyi değiştirebilirsiniz.</p>}
          </div>
        </div>
        <aside className="ky-smart-basket" aria-label="Seçilen personel listesi">
          <div className="ky-smart-basket-head"><strong><ClipboardCheck size={16}/> Seçilenler</strong><b>{selectedPeople.length} kişi</b></div>
          <div className="ky-smart-basket-list">
            {selectedPeople.length ? selectedPeople.map((person) => <div className="ky-smart-basket-row" key={person.id}>
              <span><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {checkedIds.has(person.id) ? "Kontrol edildi" : savedIds.has(person.id) ? "Kayıtlı" : "Yeni seçim"}</small></span>
              <button type="button" disabled={!canEdit} aria-label={person.name + " seçimini kaldır"} onClick={() => onToggle(person.id)}>×</button>
            </div>) : <p>Henüz personel seçilmedi. Soldan birden fazla kişi seçebilirsiniz.</p>}
          </div>
          <div className="ky-smart-basket-total"><span>Vardiya ücret önizlemesi</span>
            <strong>{formatMoney(previewCents / 100)}</strong><small>Kesin hakediş, ek ödeme ve kesintiler D1'den hesaplanır.</small></div>
          <div className={["ky-smart-save-state", dirty ? "dirty" : ""].join(" ")}>
            {busy ? "İşlem sürüyor…" : dirty ? "Kaydedilmemiş seçim veya not var" : "Kayıtlı vardiya seçimi görüntüleniyor"}</div>
          <button type="button" className="ky-smart-primary" disabled={!canEdit || !dirty}
            onClick={onSave}><Save size={16}/>{busy ? "Kaydediliyor…" : "Seçilileri Kaydet"}</button>
          <button type="button" className="ky-smart-reset" disabled={!canEdit || !dirty}
            onClick={onRestore}><RotateCcw size={14}/> Taslağı Geri Al</button>
          <small className="ky-smart-safety-note">Günlük kaydetme, diğer günleri veya havuzdaki personelleri silmez. Kontrol onayı ayrıca seçilir.</small>
        </aside>
      </div>
    </section>
  );
}
