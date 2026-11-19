import React, { useMemo, useState } from "react";
import { Check, ChevronRight, Plus, Search, UserPlus, Users, X } from "lucide-react";
import { rankQuickRosterCandidates } from "../../../services/quickRosterHistory";
import "./quick-roster-picker.css";

/** Yalnız mevcut Hızlı Giriş'teki Personel Ekle: seç -> tek D1 merge. */
export default function QuickRosterPicker({
  people = [], attendance = [], date, shift = "day", onAdd, onNew,
  busy = false, disabled = false, historyLoading = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [width, setWidth] = useState(630);
  const [saving, setSaving] = useState(false);
  const locked = busy || saving || disabled;
  const ranked = useMemo(() => rankQuickRosterCandidates(people, attendance, date, shift),
    [people, attendance, date, shift]);
  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return ranked.filter(({person,last7,last14}) => {
      if (filter === "week" && !last7) return false;
      if (filter === "fortnight" && !last14) return false;
      return !normalized || [person.name,person.personnelNo,person.role,person.broker]
        .join(" ").toLocaleLowerCase("tr-TR").includes(normalized);
    });
  }, [ranked, query, filter]);
  const allowed = new Set((Array.isArray(people) ? people : []).filter(p => p.active !== false).map(p => String(p.id)));
  const pending = [...selected].filter(id => allowed.has(id));
  const frequent = ranked.filter(item=>item.last14>0).length;

  const addSelected = async () => {
    if (locked || !pending.length) return;
    setSaving(true);
    try {
      if (await onAdd(pending)) {
        setSelected(new Set());
        setQuery(""); setFilter("all"); setOpen(false);
      }
    } finally { setSaving(false); }
  };

  return <div className="kyq-roster-picker">
    <button type="button" className="kyq-roster-open" aria-expanded={open}
      onClick={() => setOpen(prev => !prev)} disabled={locked}>
      <Users size={15}/> Personel Ekle {pending.length ? `· ${pending.length} seçili` : ""}
      <ChevronRight size={14}/>
    </button>
    {open ? <section className="kyq-roster-panel" aria-label="Hızlı giriş personel ekleme paneli"
      style={{"--kyq-panel-width":`${width}px`}}>
      <div className="kyq-roster-header">
        <div><small>HIZLI GİRİŞ · SAĞ PERSONEL PANELİ</small><strong>Dönem Listesine Personel Ekle</strong>
          <span>Havuzda olmayanları seç. Vardiya veya ücret otomatik değişmez.</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Personel ekleme panelini kapat"><X size={20}/></button>
      </div>
      <div className="kyq-roster-width">
        <label>Panel genişliği
          <input type="range" min="450" max="860" step="10" value={width}
            onChange={event => setWidth(Number(event.target.value))}/>
          <b>{width}px</b>
        </label>
        <button type="button" onClick={() => { setOpen(false); onNew(); }} disabled={locked}>
          <UserPlus size={15}/> Yeni Personel
        </button>
      </div>
      <div className="kyq-roster-search"><Search size={16}/><input
        type="search" autoFocus value={query} placeholder="İsim, HKN kodu veya vasıf ara"
        onChange={event=>setQuery(event.target.value)} aria-label="Personel ara"/></div>
      <div className="kyq-roster-filters" role="group" aria-label="Personel sıklığı">
        <button type="button" className={filter === "all" ? "active" : ""}
          onClick={()=>setFilter("all")}>Tümü ({ranked.length})</button>
        <button type="button" className={filter === "week" ? "active" : ""}
          onClick={()=>setFilter("week")}>Son 7 gün</button>
        <button type="button" className={filter === "fortnight" ? "active" : ""}
          onClick={()=>setFilter("fortnight")}>Son 14 gün</button>
        <button type="button" disabled={locked || !candidates.length} onClick={()=>setSelected(prev=>{
          const next=new Set(prev);candidates.forEach(item=>next.add(String(item.person.id)));return next;
        })}>Görünenleri Seç</button>
        <button type="button" disabled={locked || !pending.length} onClick={()=>setSelected(new Set())}>Seçimi Temizle</button>
      </div>
      <p className="kyq-roster-help">{historyLoading ? "Geçmiş vardiyalar yükleniyor…" :
        `Havuz dışında ${frequent} kişi son 14 günde çalışmış. Öneriler gerçek vardiya kayıtlarından hesaplanır.`}</p>
      <div className="kyq-roster-list" role="group" aria-label="Havuzda bulunmayan personeller">
        {candidates.length ? candidates.map(({person,last7,last14}) => {
          const id=String(person.id), checked=selected.has(id);
          return <label key={id} className={checked?"selected":""}>
            <input type="checkbox" disabled={locked} checked={checked} onChange={()=>setSelected(prev=>{
              const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next;
            })}/>
            <span><strong>{person.name}</strong>
              <small>{person.personnelNo || "Kod yok"} · {person.role || "Vasıfsız"}</small>
              {last14 ? <em>{last7 ? `7 gün: ${last7} · ` : ""}14 gün: {last14} vardiya günü</em> : null}
            </span>
            {checked ? <Check size={16}/> : null}
          </label>;
        }) : <p className="kyq-roster-empty">Bu filtreye uygun havuz dışı personel bulunamadı. Tümü sekmesinden arayabilirsiniz.</p>}
      </div>
      <div className="kyq-roster-actions"><b>{pending.length} kişi seçildi</b>
        <button type="button" className="kyq-roster-submit" onClick={()=>void addSelected()}
          disabled={locked || !pending.length}><Plus size={16}/>{saving?"Kaydediliyor…":`${pending.length} Personeli Havuza Ekle`}</button>
      </div>
    </section> : null}
  </div>;
}
