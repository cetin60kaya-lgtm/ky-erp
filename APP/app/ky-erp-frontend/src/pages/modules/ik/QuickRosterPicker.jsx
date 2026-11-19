import React, { useMemo, useState } from "react";
import { Check, Plus, Search, UserPlus, Users, X } from "lucide-react";
import "./quick-roster-picker.css";

/**
 * Yalnız mevcut Hızlı Giriş penceresindeki "Listeye Ekle" alanını değiştirir.
 * İşaretleme yerel taslaktır; tek ve silmesiz dönem-havuzu yazımını üst ekran yapar.
 * Havuza eklemek vardiya veya ödeme kaydı OLUŞTURMAZ.
 */
export default function QuickRosterPicker({ people = [], attendance = [], onAdd, onNew, busy = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [onlyFrequent, setOnlyFrequent] = useState(false);
  const [saving, setSaving] = useState(false);

  const frequent = useMemo(() => {
    const counts = new Map();
    const seen = new Set();
    for (const row of attendance) {
      const id = String(row.employeeId || row.personId || row.personelId || row.dailyEmployeeId || "");
      const date = String(row.workDate || row.date || "").slice(0, 10);
      if (!id || !date || !(row.dayShift || row.nightShift || row.day || row.night)) continue;
      const key = id + "|" + date;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [attendance]);

  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return people
      .filter((person) => person?.id && person.active !== false)
      .filter((person) => !onlyFrequent || frequent.has(String(person.id)))
      .filter((person) => !q || [person.name, person.personnelNo, person.role, person.broker]
        .join(" ").toLocaleLowerCase("tr-TR").includes(q))
      .sort((a, b) => (frequent.get(String(b.id)) || 0) - (frequent.get(String(a.id)) || 0)
        || String(a.name || "").localeCompare(String(b.name || ""), "tr"));
  }, [people, frequent, onlyFrequent, query]);

  const validIds = new Set(people.map((p) => String(p.id)));
  const pendingIds = [...selected].filter((id) => validIds.has(id));
  const locked = busy || saving || disabled;

  const addSelected = async () => {
    if (locked || pendingIds.length === 0) return;
    setSaving(true);
    try {
      const success = await onAdd(pendingIds);
      if (success) {
        setSelected(new Set());
        setQuery("");
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return <div className="kyq-roster-picker">
    <button type="button" className="kyq-roster-open" aria-expanded={open}
      aria-controls="kyq-roster-picker-panel" onClick={() => setOpen((previous) => !previous)}
      disabled={locked}><Users size={14}/> Personel Ekle {pendingIds.length ? `(${pendingIds.length} seçili)` : ""}</button>
    <button type="button" className="kyq-roster-new" onClick={onNew} disabled={busy}><UserPlus size={14}/> Yeni Personel</button>
    {open && <div id="kyq-roster-picker-panel" className="kyq-roster-panel">
      <div className="kyq-roster-header">
        <div><strong>Dönem Listesine Personel Ekle</strong><small>Birden fazla kişi seçin, tek seferde ekleyin. Vardiya seçimi ayrı kalır.</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Personel ekleme alanını kapat"><X size={16}/></button>
      </div>
      <div className="kyq-roster-search"><Search size={16}/>
        <input type="search" value={query} placeholder="İsim, HKN kodu veya vasıf ara"
          onChange={(event) => setQuery(event.target.value)} aria-label="Eklenecek personeli ara"/>
      </div>
      <div className="kyq-roster-filters">
        <button type="button" className={!onlyFrequent ? "active" : ""} onClick={() => setOnlyFrequent(false)}>Tüm Personeller</button>
        <button type="button" className={onlyFrequent ? "active" : ""} onClick={() => setOnlyFrequent(true)}>Sık Kullanılanlar</button>
        <button type="button" disabled={locked || !candidates.length} onClick={() => setSelected((previous) => {
          const next = new Set(previous);
          candidates.forEach((person) => next.add(String(person.id)));
          return next;
        })}>Görünenleri Seç</button>
        <button type="button" disabled={locked || !pendingIds.length} onClick={() => setSelected(new Set())}>Seçimi Temizle</button>
      </div>
      <div className="kyq-roster-list" role="group" aria-label="Eklenecek personeller">
        {candidates.length ? candidates.map((person) => {
          const id = String(person.id);
          const checked = selected.has(id);
          const count = frequent.get(id) || 0;
          return <label key={id} className={checked ? "selected" : ""}>
            <input type="checkbox" checked={checked} disabled={locked} onChange={() => setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            })}/>
            <span><strong>{person.name}</strong><small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}{count ? ` · ${count} gün çalıştı` : ""}</small></span>
            {checked ? <Check size={14}/> : null}
          </label>;
        }) : <p className="kyq-roster-empty">Bu filtrede eklenecek personel bulunamadı.</p>}
      </div>
      <div className="kyq-roster-actions"><span>{pendingIds.length} kişi seçildi</span>
        <button type="button" className="kyq-roster-submit" onClick={() => void addSelected()}
          disabled={locked || !pendingIds.length}><Plus size={14}/>{saving ? "Kaydediliyor…" : `${pendingIds.length} Personeli Ekle`}</button>
      </div>
    </div>}
  </div>;
}
