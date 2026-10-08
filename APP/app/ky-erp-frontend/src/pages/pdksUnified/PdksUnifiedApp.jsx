import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, ScanLine, UsersRound, CalendarRange, TableProperties,
  WalletCards, ChartNoAxesCombined, ServerCog, Settings2, Search,
  Command, Bell, ChevronRight, ChevronDown, ChevronLeft, PanelLeftClose,
  PanelLeftOpen, RefreshCw, ShieldCheck, WifiOff, Database,
  CircleAlert, CheckCircle2, Filter, Download, UserRound, CalendarDays,
  Sun, Moon, Info, LockKeyhole, Menu, X, ArrowRight, Clock3,
  FileCheck2, Fingerprint, Cloud, Monitor, Smartphone, AlertTriangle,
} from "lucide-react";
import { getPdksAttendance, getPdksPeople, getPdksProfile } from "../../services/pdksApi";
import {
  PRODUCT_NAME, PRODUCT_SECTIONS, PRODUCT_PERSON_TABS,
  resolveProductRoute, isSensitiveProductTab,
} from "./productModel";
import {
  normalizePerson, toPersonRows, toAttendanceRows,
  getDataRequirement, csvForTable, safeFileNameSegment,
} from "./productData";
import "./pdksUnified.css";

const ICONS = {
  LayoutDashboard, ScanLine, UsersRound, CalendarRange, TableProperties,
  WalletCards, ChartNoAxesCombined, ServerCog, Settings2,
};
const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const PEOPLE_SECTIONS = new Set(["people","attendance","timesheet"]);
const statusLabel = (error) => String(error?.message || "Veri alınamadı.");
const isoMonth = (year,month) => String(year) + "-" + String(month).padStart(2,"0");

function Icon({ name, size = 19, ...props }) {
  const Component = ICONS[name] || LayoutDashboard;
  return <Component size={size} aria-hidden="true" strokeWidth={1.8} {...props}/>;
}

function Cell({ children, detail }) {
  return <div className="pdk-u-metric"><span>{children}</span><strong>{detail ?? "—"}</strong></div>;
}

function EmptyState({ title, description, IconComponent = Database }) {
  return <div className="pdk-u-empty">
    <div className="pdk-u-empty-icon"><IconComponent size={27}/></div>
    <b>{title}</b><p>{description}</p>
  </div>;
}

function UnifiedTable({ columns, rows, onSelect, selectedId, masked = false }) {
  if (!rows?.length) return <EmptyState
    title="Doğrulanmış kayıt bulunmuyor"
    description="Bu ekran gerçek kaynak verisi geldiğinde doldurulur; örnek personel, saat veya ödeme kaydı üretilmez."
  />;
  return <div className="pdk-u-table-scroll" role="region" aria-label="Kayıt tablosu" tabIndex={0}>
    <table className="pdk-u-table"><thead><tr>{columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row._id || String(index)}
        className={selectedId && row._id === selectedId ? "is-selected" : ""}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? () => onSelect(row._id) : undefined}
        onKeyDown={onSelect ? (e) => { if (e.key === "Enter") onSelect(row._id); } : undefined}>
        {columns.map((column) => <td key={column}>{masked ? "Gizli" : row[column] ?? "—"}</td>)}
      </tr>)}</tbody></table>
  </div>;
}

function PersonDetails({ person, active, onChange, isAuditAccount }) {
  return <section className="pdk-u-person-detail" aria-label="Personel 360 derece">
    <div className="pdk-u-detail-head"><span className="pdk-u-detail-avatar"><UserRound size={25}/></span>
      <div><span className="pdk-u-eyebrow">PERSONEL 360°</span>
        <h3>{person?.fullName || "Personel seçilmedi"}</h3>
        <span className="pdk-u-dim">Kart: {person?.cardNo || "—"} · {person?.status || "Durum bilinmiyor"}</span>
      </div><span className="pdk-u-chip">{person?.group || "Grup bekleniyor"}</span>
    </div>
    <div className="pdk-u-detail-tabs" role="tablist" aria-label="Personel detay sekmeleri">
      {PRODUCT_PERSON_TABS.map(([id,label]) => <button type="button" role="tab" aria-selected={active === id}
        className={active === id ? "active" : ""} key={id} onClick={() => onChange(id)}>{label}</button>)}
    </div>
    <div className="pdk-u-detail-body">
      {active === "identity" && <dl className="pdk-u-definition">
        <div><dt>Personel</dt><dd>{person?.fullName || "—"}</dd></div>
        <div><dt>Kart numarası</dt><dd>{person?.cardNo || "—"}</dd></div>
        <div><dt>Departman</dt><dd>{person?.department || "—"}</dd></div>
        <div><dt>Görev</dt><dd>{person?.role || "—"}</dd></div>
        <div><dt>Çalışma grubu</dt><dd>{person?.group || "—"}</dd></div>
        <div><dt>İşe giriş</dt><dd>{person?.startDate || "—"}</dd></div>
        <div><dt>İşten çıkış</dt><dd>{person?.exitDate || "—"}</dd></div>
        <div><dt>Durum</dt><dd>{person?.status || "—"}</dd></div>
      </dl>}
      {active !== "identity" && <EmptyState
        title={PRODUCT_PERSON_TABS.find(([id])=>id===active)?.[1] || "Personel"}
        description={isAuditAccount || active === "payroll"
          ? "Bu ayrıntı yetki ve kaynak doğrulaması yapıldıktan sonra açılır. Maaş bilgileri herkese gösterilmez."
          : "Bu sekmenin gerçek işlem sözleşmesi ayrıca bağlanacaktır. Canlı veriye izinsiz işlem yapılmaz."}
        IconComponent={active === "card" ? Fingerprint : FileCheck2}
      />}
    </div>
    <div className="pdk-u-detail-foot"><ShieldCheck size={15}/> Her değişiklik için gerekçe, onay ve işlem geçmişi gerekir.</div>
  </section>;
}

function UnifiedDashboard({ onOpen, peopleStatus, attendanceStatus, hasData }) {
  const items = [
    { label:"Toplam Personel", value: peopleStatus?.count, icon:UsersRound, target:["people","people"] },
    { label:"Bugün Doğrulanan", value:null, icon:CheckCircle2, target:["attendance","live"] },
    { label:"Eksik / Geç", value:null, icon:CircleAlert, target:["attendance","exceptions"] },
    { label:"Bekleyen Onay", value:null, icon:Clock3, target:["overview","approvals"] },
  ];
  return <div className="pdk-u-dashboard">
    <div className="pdk-u-kpis">{items.map(({ label,value,icon:Symbol,target }) => <button className="pdk-u-kpi"
      key={label} type="button" onClick={() => onOpen(...target)}><span className="pdk-u-kpi-symbol"><Symbol size={20}/></span>
      <span>{label}</span><strong>{value ?? "—"}</strong><small>{value === null || value === undefined ? "Doğrulama bekleniyor" : "Kaynak: PDKS API"}</small>
    </button>)}</div>
    <div className="pdk-u-two-col">
      <section className="pdk-u-panel"><div className="pdk-u-panel-heading"><h3>Günlük Operasyon</h3><span>Öncelikli işler</span></div>
        {[
          {title:"Gerçek kart hareketleri",detail:"Cihazdan doğrulanmış giriş/çıkışları incele",target:["attendance","punches"], icon:ScanLine},
          {title:"Eksik / geç kart kontrolü",detail:"İhlal, E ve izin eşleşmelerini incele",target:["attendance","exceptions"], icon:CircleAlert},
          {title:"Puantaj kontrolü",detail:"Ay, yıl ve çalışma grubu bazında mutabakat",target:["timesheet","validation"], icon:TableProperties},
          {title:"Cloud & FDB senkronu",detail:"Son onayı ve kaynaklar arası farkı doğrula",target:["devices","reconciliation"], icon:Cloud},
        ].map((action) => <button type="button" className="pdk-u-action-row" key={action.title} onClick={()=>onOpen(...action.target)}>
          <action.icon size={19}/><span><b>{action.title}</b><small>{action.detail}</small></span><ChevronRight size={17}/></button>)}
      </section>
      <section className="pdk-u-panel"><div className="pdk-u-panel-heading"><h3>Kaynak Sağlığı</h3><span>Doğrulanmış durum</span></div>
        <div className="pdk-u-health"><div><Monitor size={19}/> Windows Agent <span>—</span></div>
          <div><Database size={19}/> Firebird / FDB <span>—</span></div>
          <div><FileCheck2 size={19}/> Yıllık TNF <span>—</span></div>
          <div><Cloud size={19}/> D1 / Cloud <span>—</span></div>
          <div><Smartphone size={19}/> Android / iOS <span>—</span></div></div>
        <p className="pdk-u-small-note">{hasData ? "Personel bilgileri mevcut API'den okundu. Diğer kaynakların senkronu henüz kanıtlanmadı."
          : attendanceStatus === "offline" ? "Bağlantı kesildi. Görülen hiçbir saat fiziksel geçiş olarak varsayılmaz."
          : "Senkron onayı olmadan yeşil başarı göstergesi kullanılmaz."}</p>
      </section>
    </div>
  </div>;
}

const currentPeriod = () => ({ month: new Date().getMonth()+1, year:new Date().getFullYear() });

export default function PdksUnifiedApp({
  activeMainCompany, isAuditAccount = false, previewOnly = false,
}) {
  const [navigation, setNavigation] = useState({ section:"overview", tab:"today" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [period, setPeriod] = useState(currentPeriod);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [personTab, setPersonTab] = useState("identity");
  const [data, setData] = useState({ people:[], days:[], profile:null, loading:false, status:"idle", error:"" });
  const [reloadToken, setReloadToken] = useState(0);
  const [notice, setNotice] = useState("");
  const searchInput = useRef(null);

  const company = activeMainCompany?.slug || activeMainCompany?.id || "";
  const { section, tab } = useMemo(() => resolveProductRoute(navigation.section,navigation.tab),[navigation]);
  const requirement = getDataRequirement({ ...tab, section:section.id });
  const peopleNeeded = PEOPLE_SECTIONS.has(section.id) || tab.view === "dashboard";
  const selectedPerson = data.people.find((p)=>p.id === selectedId) || data.people[0] || null;
  const realAttendance = requirement === "attendance";

  const go = useCallback((sectionId,tabId) => {
    const resolved = resolveProductRoute(sectionId,tabId);
    setNavigation({section:resolved.section.id,tab:resolved.tab.id});
    setMobileMenuOpen(false);
    setNotice("");
  },[]);

  useEffect(() => {
    const listener = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown",listener);
    return () => window.removeEventListener("keydown",listener);
  },[]);

  // Real API read only. No demo punches, invented attendance, or read-side effects.
  useEffect(() => {
    if (previewOnly) {
      setData({ people:[], days:[], profile:null, loading:false, status:"preview", error:"" });
      return undefined;
    }
    if (!company || !peopleNeeded) {
      setData((prev)=>({ ...prev,loading:false,status:company ? "idle" : "not-configured", error:"" }));
      return undefined;
    }
    const controller = new AbortController();
    setData((prev)=>({ ...prev, loading:true,status:"loading",error:"" }));
    Promise.all([
      getPdksPeople({mainCompanyId:company,year:period.year,month:period.month}),
      getPdksProfile({mainCompanyId:company}),
    ]).then(([rows,profile]) => {
      if (controller.signal.aborted) return;
      const people = (Array.isArray(rows)?rows:[]).map(normalizePerson);
      setData((prev)=>({ ...prev,people,profile,days:[],status:"ready",error:"",loading:false }));
      setSelectedId((old)=>people.some((p)=>p.id===old)?old:people[0]?.id||"");
    }).catch((error)=>{
      if (!controller.signal.aborted) setData((prev)=>({ ...prev,people:[],days:[],profile:null,loading:false,
        status:"offline",error:statusLabel(error) }));
    });
    return () => controller.abort();
  },[company,peopleNeeded,period.year,period.month,previewOnly,reloadToken]);

  useEffect(()=>{
    if (previewOnly || !realAttendance || !company || !selectedPerson?.id || data.status !== "ready") {
      setData((prev)=>prev.days.length ? { ...prev,days:[] }:prev);
      return undefined;
    }
    const controller = new AbortController();
    getPdksAttendance(selectedPerson.id,period.year,period.month,{mainCompanyId:company})
      .then((response)=>{if (!controller.signal.aborted) setData((prev)=>({...prev,days:Array.isArray(response?.days)?response.days:[]}));})
      .catch((error)=>{if (!controller.signal.aborted) {
        setData((prev)=>({...prev,days:[],error:statusLabel(error)}));
      }});
    return ()=>controller.abort();
  },[company,data.status,period.year,period.month,previewOnly,realAttendance,selectedPerson?.id,reloadToken]);

  const isPeopleTab = section.id === "people" && ["people","cards","employment"].includes(tab.id);
  const allPeople = useMemo(()=>toPersonRows(data.people,tab.id),[data.people,tab.id]);
  const attendanceRows = useMemo(()=>toAttendanceRows(data.days,selectedPerson || {}),[data.days,selectedPerson]);
  const sourceRows = isPeopleTab ? allPeople : realAttendance ? attendanceRows : [];
  const filteredRows = useMemo(()=> {
    const q=search.toLocaleLowerCase("tr-TR").trim();
    if (!q) return sourceRows;
    return sourceRows.filter((row)=>Object.values(row).some((value)=>
      String(value).toLocaleLowerCase("tr-TR").includes(q)));
  },[search,sourceRows]);

  const dataConnected = !previewOnly && requirement !== "unconnected" && data.status === "ready";
  const canExport = dataConnected && !tab.sensitive && !isSensitiveProductTab(tab.id) && filteredRows.length > 0;
  const pageUnavailable = previewOnly || requirement === "unconnected" || data.status === "offline" ||
    data.status === "not-configured" || (!peopleNeeded && !realAttendance);
  const sourceText = previewOnly ? "Tasarım incelemesi" :
    requirement === "unconnected" ? "Entegrasyon bekliyor" :
    data.status === "ready" ? (realAttendance ? "PDKS API · Kişi bazlı" : "PDKS API") :
    data.status === "offline" ? "Bağlantı hatası" : "Kaynak doğrulanıyor";

  const exportTable = () => {
    if (!canExport) return;
    const csv=csvForTable(tab.columns,filteredRows);
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="KY_PDKS_"+safeFileNameSegment(tab.id)+"_"+isoMonth(period.year,period.month)+".csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className={["pdk-unified",theme==="dark"?"theme-dark":"",
    sidebarCollapsed?"sidebar-collapsed":""].join(" ")} aria-label="KY PDKS çalışma alanı">
    <aside className={["pdk-u-sidebar",mobileMenuOpen?"is-mobile-open":""].join(" ")}>
      <div className="pdk-u-brand">
        <div className="pdk-u-brand-mark">KY</div>
        {!sidebarCollapsed && <div><strong>KY PDKS</strong><span>Kurumsal Personel Yönetimi</span></div>}
        <button type="button" aria-label="Menüyü daralt" className="pdk-u-icon-btn pdk-u-collapse"
          onClick={()=>setSidebarCollapsed((v)=>!v)}>{sidebarCollapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</button>
        <button type="button" aria-label="Mobil menüyü kapat" className="pdk-u-icon-btn pdk-u-mobile-close"
          onClick={()=>setMobileMenuOpen(false)}><X size={19}/></button>
      </div>
      <div className="pdk-u-brand-subtitle">{!sidebarCollapsed && <span>ÇALIŞMA ALANI</span>}</div>
      <nav aria-label="KY PDKS ana menü" className="pdk-u-primary-nav">
        {PRODUCT_SECTIONS.map((item)=>{
          const chosen=section.id === item.id;
          return <button type="button" key={item.id} aria-current={chosen?"page":undefined}
            className={chosen?"active":""} title={item.label} onClick={()=>go(item.id,item.tabs[0].id)}>
            <Icon name={item.icon}/>{!sidebarCollapsed&&<><span>{item.label}</span><ChevronRight size={15}/></>}
          </button>;
        })}
      </nav>
      <div className="pdk-u-sidebar-end">
        <div className="pdk-u-divider"/>
        {!sidebarCollapsed && <div className="pdk-u-install-status"><span className="pdk-u-dot"/><span>{previewOnly?"İnceleme Modu":"Bağlantı doğrulanacak"}</span></div>}
        <div className="pdk-u-small-foot"><ShieldCheck size={18}/>{!sidebarCollapsed&&<span>Yetkili işlem · Denetlenebilir kayıt</span>}</div>
      </div>
    </aside>
    {mobileMenuOpen&&<button type="button" aria-label="Menüyü kapat" className="pdk-u-mobile-backdrop" onClick={()=>setMobileMenuOpen(false)}/>}
    <main className="pdk-u-main">
      <header className="pdk-u-topbar">
        <button className="pdk-u-icon-btn pdk-u-hamburger" type="button" aria-label="Menüyü aç"
          onClick={()=>setMobileMenuOpen(true)}><Menu size={21}/></button>
        <div className="pdk-u-breadcrumb">KY PDKS <ChevronRight size={14}/><strong>{section.label}</strong></div>
        <div className="pdk-u-top-right">
          <div className="pdk-u-global-search"><Search size={17}/><input ref={searchInput} aria-label="Personel veya kayıt ara"
            placeholder="Personel, kart veya kayıt ara…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
            <kbd><Command size={11}/> K</kbd></div>
          <button type="button" className="pdk-u-icon-btn" title="Görünümü değiştir"
            onClick={()=>setTheme((old)=>old==="light"?"dark":"light")}>{theme==="light"?<Moon size={18}/>:<Sun size={18}/>}</button>
          <button type="button" className="pdk-u-icon-btn" title="Bildirimler (canlı kaynak bağlanmadı)" disabled><Bell size={18}/></button>
          <span className="pdk-u-user"><UserRound size={19}/><span>{previewOnly?"Tasarım":isAuditAccount?"Denetim":"Oturum"}</span></span>
        </div>
      </header>
      <div className="pdk-u-body">
        <div className="pdk-u-page-head">
          <div><span className="pdk-u-eyebrow">KY PDKS / {section.label.toLocaleUpperCase("tr-TR")}</span>
            <h1>{section.label}</h1><p>{section.description}</p></div>
          <div className="pdk-u-head-actions">
            <span className={["pdk-u-source-status",dataConnected?"connected":""].join(" ")}>
              {dataConnected?<CheckCircle2 size={15}/>:<WifiOff size={15}/>} {sourceText}
            </span>
            <button type="button" className="pdk-u-btn" onClick={()=>setReloadToken((v)=>v+1)}
              disabled={previewOnly || data.loading}><RefreshCw size={16}/> Yenile</button>
          </div>
        </div>
        {notice && <div className="pdk-u-notice"><Info size={15}/>{notice}
          <button type="button" onClick={()=>setNotice("")} aria-label="Bildirimi kapat"><X size={13}/></button></div>}
        {data.error && <div className="pdk-u-notice is-error"><AlertTriangle size={16}/>
          Veri kaynağı okunamadı: {data.error}</div>}
        <div className="pdk-u-tabs" role="tablist" aria-label={section.label+" alt sekmeleri"}>
          {section.tabs.map((item)=><button type="button" role="tab" key={item.id}
            aria-selected={tab.id===item.id}
            className={tab.id===item.id?"active":""} onClick={()=>go(section.id,item.id)}>{item.label}</button>)}
        </div>
        {tab.view==="dashboard" && <UnifiedDashboard onOpen={go}
          peopleStatus={dataConnected?{count:data.people.length}:null}
          attendanceStatus={data.status} hasData={dataConnected}/>}
        {tab.view!=="dashboard"&&<section className="pdk-u-panel pdk-u-record-panel">
          <div className="pdk-u-record-head">
            <div><h2>{tab.label}</h2><p>{tab.description}</p></div>
            <span className="pdk-u-label"><ShieldCheck size={15}/> {previewOnly?"Görsel İnceleme":"Yazma kontrollü"}</span>
          </div>
          <div className="pdk-u-filters">
            <label><CalendarDays size={15}/><span>Ay</span>
              <select aria-label="Ay" value={period.month}
                onChange={(e)=>setPeriod((prev)=>({...prev,month:Number(e.target.value)}))}>
                {MONTHS.map((name,i)=><option key={name} value={i+1}>{name}</option>)}
              </select></label>
            <label><span>Yıl</span><select aria-label="Yıl" value={period.year}
              onChange={(e)=>setPeriod((prev)=>({...prev,year:Number(e.target.value)}))}>
              {Array.from({length:10},(_,i)=>new Date().getFullYear()-6+i).map((year)=><option key={year} value={year}>{year}</option>)}
            </select></label>
            {realAttendance && data.people.length>0 && <label><span>Personel</span>
              <select aria-label="Hareket personeli" value={selectedPerson?.id||""}
                onChange={(e)=>setSelectedId(e.target.value)}>
                {data.people.map((person)=><option key={person.id} value={person.id}>{person.cardNo} · {person.fullName}</option>)}
              </select></label>}
            <span className="pdk-u-spacer"/>
            <span className="pdk-u-counter"><Filter size={15}/> {filteredRows.length} kayıt</span>
            <button type="button" className="pdk-u-btn" disabled={!canExport} onClick={exportTable}>
              <Download size={16}/> CSV</button>
          </div>
          {isPeopleTab ? <div className="pdk-u-person-layout">
            <div className="pdk-u-list-side">
              {data.loading?<EmptyState title="Veri yükleniyor" description="Yetkili sunucu yanıtı bekleniyor."/>:
                dataConnected?<UnifiedTable columns={tab.columns} rows={filteredRows} selectedId={selectedPerson?.id}
                  onSelect={setSelectedId}/>:<EmptyState title="Personel kaynağı bağlı değil"
                  description={previewOnly?"Tasarım önizlemesinde gerçek personel verisi bulunmaz.":"Bu görünüm için yetkili KY ERP bağlantısını doğrulayın."}/>}
            </div><PersonDetails person={dataConnected?selectedPerson:null}
              active={personTab} onChange={setPersonTab} isAuditAccount={isAuditAccount}/>
          </div> : (
            requirement==="unconnected" ? <EmptyState title="Ekran hazır · İşlem sözleşmesi bağlanacak"
              description="Sekme ve tablo yerleşimi tamamlandı; gerçek kaynak/senkron yetkisi doğrulanmadan işlem açılmaz. Bu ekranda sahte veri üretilmez."
              IconComponent={LockKeyhole}/> :
            pageUnavailable ? <EmptyState title="Canlı veri bağlantısı kapalı"
              description="Bu ekranda yalnız onaylı veri görüntülenir. Cihazdan fiziksel kart kanıtı henüz doğrulanmadı."
              IconComponent={Database}/> :
            data.loading ? <EmptyState title="Doğrulanmış kayıtlar okunuyor"
              description="Kaynak veritabanı sorgusu sürüyor." IconComponent={Clock3}/> :
            <UnifiedTable columns={tab.columns} rows={filteredRows}
              masked={isAuditAccount && isSensitiveProductTab(tab.id)}/>
          )}
          {realAttendance && dataConnected && <p className="pdk-u-source-foot">
            <Info size={15}/> Listede yalnız seçili personelin {MONTHS[period.month-1]} {period.year} kayıtları gösterilir.
            Firebird/TNF ile gerçek mutabakat ayrıca doğrulanır.
          </p>}
        </section>}
      </div>
      <footer className="pdk-u-statusbar">
        <span><span className="pdk-u-dot"/> {previewOnly?"İnceleme · Canlı sistem kapalı":"İşlemler onay gerektirir"}</span>
        <span><Database size={14}/> FDB: doğrulanmadı</span>
        <span><FileCheck2 size={14}/> TNF: doğrulanmadı</span>
        <span><Cloud size={14}/> Cloud: {dataConnected?"API okunuyor":"bekliyor"}</span>
        <span className="pdk-u-status-end">KY PDKS · Unified</span>
      </footer>
    </main>
  </div>;
}
