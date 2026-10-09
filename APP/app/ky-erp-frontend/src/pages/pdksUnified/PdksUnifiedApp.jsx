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
import {
  PRODUCT_NAME, PRODUCT_PERSON_TABS,
  configuredProductSections, isSensitiveProductTab,
} from "./productModel";
import {
  csvForTable, safeFileNameSegment, toAttendanceRows,
} from "./productData";
import {sourceForTab,rowsForTab} from "./tabBindings.js";
import {useUnifiedPdksData} from "./useUnifiedPdksData.js";
import UnifiedOperationPanel from "./UnifiedOperationPanel.jsx";
import LiveAttendancePanel from "./LiveAttendancePanel.jsx";
import CardEventsPanel from "./CardEventsPanel.jsx";
import TerminalSetupPanel from "./TerminalSetupPanel.jsx";
import "./pdksUnified.css";

const ICONS = {
  LayoutDashboard, ScanLine, UsersRound, CalendarRange, TableProperties,
  WalletCards, ChartNoAxesCombined, ServerCog, Settings2,
};
const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
  "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

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

function PersonDetails({person,active,onChange,isAuditAccount,detail}) {
  const rows=(value,keys=[])=>{
    if(Array.isArray(value))return value;
    for(const key of keys)if(Array.isArray(value?.[key]))return value[key];
    return null;
  };
  const money=(value)=>value===null||value===undefined||value===""?"—":
    Number.isFinite(Number(value))?new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(Number(value)):"—";
  const smallTable=(columns,records)=>
    <UnifiedTable columns={columns} rows={records}/>;
  const view=()=>{
    if(!person)return <EmptyState title="Personel seçilmedi"
      description="Önce doğrulanmış personel listesinden bir çalışan seçin."/>;
    if(active==="identity")return <dl className="pdk-u-definition">
      {[
        ["Personel",person.fullName],["Kart numarası",person.cardNo],
        ["Departman",person.department],["Görev",person.role],
        ["Çalışma grubu",person.group],["İşe giriş",person.startDate],
        ["İşten çıkış",person.exitDate],["Dönem durumu",person.status],
      ].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value||"—"}</dd></div>)}
    </dl>;
    if(active==="card")return <dl className="pdk-u-definition">
      <div><dt>Atanmış kart</dt><dd>{person.cardNo}</dd></div>
      <div><dt>Kart durumu</dt><dd>{person.cardState}</dd></div>
      <div><dt>Personel kaynağı</dt><dd>KY ERP PDKS</dd></div>
      <div><dt>Son fiziksel geçiş</dt><dd>Doğrulanmadı</dd></div>
    </dl>;
    if(active==="documents")return <EmptyState title="Personel evrak servisi bağlı değil"
      description="Yetkili doküman servisi olmadan kişisel belge veya imza görüntülenmez."
      IconComponent={LockKeyhole}/>;
    if(isAuditAccount && ["shift","leave","payroll","history"].includes(active))
      return <EmptyState title="Bu ayrıntıya erişim kapalı"
        description="Denetim hesabı PDKS FULL işlemlerine veya ücret alanlarına erişemez."
        IconComponent={LockKeyhole}/>;
    if(detail?.status==="loading")return <EmptyState title="Kaynak okunuyor"
      description="Seçili personelin doğrulanmış kaydı bekleniyor." IconComponent={Clock3}/>;
    if(detail?.status==="error")return <EmptyState title="Kaynak hatası"
      description={detail.error||"Veri okunamadı."} IconComponent={AlertTriangle}/>;
    if(detail?.status!=="ready")return <EmptyState title="Bu bilgi kaynağı henüz bağlı değil"
      description="Veri veya izin doğrulanmadan ekran sahte personel hareketi oluşturmaz."
      IconComponent={Database}/>;
    const payload=detail.payload;
    if(active==="attendance"){
      const days=rows(payload,["days"]);
      if(!days)return <EmptyState title="Devam kaynağı doğrulanamadı" description="Beklenen gün dizisi gelmedi."/>;
      return smallTable(["Tarih","Giriş","Çıkış","Kaynak","E","Durum"],
        toAttendanceRows(days,person));
    }
    if(active==="shift"){
      const groups=rows(payload?.groups)||[];
      const assignments=rows(payload?.groupAssignments)||[];
      const assigned=assignments.find((record)=>String(record.employeeId)===String(person.id));
      const group=groups.find((record)=>String(record.id)===String(assigned?.groupId));
      if(!group)return <EmptyState title="Atanmış vardiya görünmüyor"
        description="Kaynakta seçili personele ait aktif vardiya eşleşmesi bulunamadı."/>;
      return <dl className="pdk-u-definition">
        <div><dt>Vardiya adı</dt><dd>{group.name||"—"}</dd></div>
        <div><dt>Giriş referansı</dt><dd>{group.entryTime||"—"}</dd></div>
        <div><dt>Çıkış referansı</dt><dd>{group.exitTime||"—"}</dd></div>
        <div><dt>Geç tolerans (dk)</dt><dd>{group.lateTolerance??"—"}</dd></div>
        <div><dt>Erken tolerans (dk)</dt><dd>{group.earlyTolerance??"—"}</dd></div>
        <div><dt>Atama kaynağı</dt><dd>PDKS D1 vardiya tanımı</dd></div>
      </dl>;
    }
    if(active==="leave"){
      const plans=rows(payload,["plans"]);
      if(!plans)return <EmptyState title="İzin yanıt biçimi doğrulanamadı"
        description="Sunucunun izin listesi bekleniyor."/>;
      return smallTable(["Başlangıç","Bitiş","İzin Türü","Gün","Durum"],
        plans.filter((p)=>String(p.employeeId)===String(person.id)).map((p,i)=>({
          _id:String(p.id??i),"Başlangıç":p.startDate||"—",
          "Bitiş":p.endDate||"—","İzin Türü":p.recordType||"—",
          "Gün":p.dayCount??"—","Durum":p.status||"—",
        })));
    }
    if(active==="timesheet"){
      const summary=payload?.summary;
      if(!summary)return <EmptyState title="Aylık puantaj özeti bulunamadı"
        description="Eksik gün ve mesai değerleri tahmin edilmez."/>;
      return <dl className="pdk-u-definition">
        <div><dt>Çalışılan gün</dt><dd>{summary.workedDays??"—"}</dd></div>
        <div><dt>Yıllık izin</dt><dd>{summary.annualLeaveDays??"—"}</dd></div>
        <div><dt>Eksik basım</dt><dd>{summary.missingPunchDays??"—"}</dd></div>
        <div><dt>Mesai (dk)</dt><dd>{summary.overtimeMinutes??"—"}</dd></div>
      </dl>;
    }
    if(active==="payroll"){
      const lines=rows(payload,["lines"]);
      if(!lines)return <EmptyState title="Bordro yanıtı doğrulanamadı"
        description="Yalnız yetkili bordro verisi görüntülenebilir."/>;
      const line=lines.find((p)=>String(p.employeeId)===String(person.id));
      if(!line)return <EmptyState title="Personel bordro satırı bulunamadı"
        description="Seçili ayda bu personel için doğrulanmış D1 bordro satırı yok."/>;
      return <dl className="pdk-u-definition">
        {[
          ["Maaş",line.salary],["Mesai",line.overtimeAmount],
          ["Avans",line.advanceAmount],["Kesinti",line.deductionAmount],
          ["Banka",line.bankAmount],["Elden",line.cashAmount],
          ["Toplam",line.totalAmount],
        ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
      </dl>;
    }
    if(active==="history"){
      const changes=rows(payload,["rows","corrections"]);
      if(!changes)return <EmptyState title="Düzeltme geçmişi biçimi doğrulanamadı"
        description="Değişiklik geçmişi gelmeden işlem tamamlandı kabul edilmez."/>;
      return smallTable(["Tarih","Alan","Gerekçe","Durum"],changes.map((p,i)=>({
        _id:String(p.id??i),"Tarih":p.workDate||p.date||"—",
        "Alan":p.field||p.type||"—","Gerekçe":p.reason||p.note||"—",
        "Durum":p.status||"—",
      })));
    }
    return <EmptyState title="Bu detay için bağlantı yok" description="Kaynak bekleniyor."/>;
  };
  return <section className="pdk-u-person-detail" aria-label="Personel 360 derece">
    <div className="pdk-u-detail-head"><span className="pdk-u-detail-avatar"><UserRound size={25}/></span>
      <div><span className="pdk-u-eyebrow">PERSONEL 360°</span>
        <h3>{person?.fullName||"Personel seçilmedi"}</h3>
        <span className="pdk-u-dim">Kart: {person?.cardNo||"—"} · {person?.status||"Durum bilinmiyor"}</span>
      </div><span className="pdk-u-chip">{person?.group||"Grup bekleniyor"}</span>
    </div>
    <div className="pdk-u-detail-tabs" role="tablist" aria-label="Personel detay sekmeleri">
      {PRODUCT_PERSON_TABS.map(([id,label])=><button type="button" role="tab"
        aria-selected={active===id} className={active===id?"active":""} key={id}
        onClick={()=>onChange(id)}>{label}</button>)}
    </div>
    <div className="pdk-u-detail-body">{view()}</div>
    <div className="pdk-u-detail-foot"><ShieldCheck size={15}/>
      Gerçek kaynak · Yetkili erişim · Tüm düzeltmeler onay ve denetim gerektirir.
    </div>
  </section>;
}

function UnifiedDashboard({ onOpen, peopleStatus, attendanceStatus, hasData, live }) {
  const items = [
    { label:"Kartlı Personel", value: live?.metrics?.total??peopleStatus?.count, icon:UsersRound, target:["people","people"] },
    { label:"Giriş Kaydı Var", value:live?.metrics?.arrived??null, icon:CheckCircle2, target:["attendance","live"] },
    { label:"Kart Kaydı Yok", value:live?.metrics?.noRecord??null, icon:CircleAlert, target:["attendance","live"] },
    { label:"Geç Giriş", value:live?.metrics?.late??null, icon:Clock3, target:["attendance","exceptions"] },
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

const currentPeriod = () => {
  const values=new Intl.DateTimeFormat("en-US",{
    timeZone:"Europe/Istanbul",year:"numeric",month:"numeric",
  }).formatToParts(new Date());
  return {
    year:Number(values.find((p)=>p.type==="year")?.value),
    month:Number(values.find((p)=>p.type==="month")?.value),
  };
};

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
  const [reloadToken, setReloadToken] = useState(0);
  const [monthlyRequestKey,setMonthlyRequestKey]=useState("");
  const [notice, setNotice] = useState("");
  const searchInput = useRef(null);

  const company = activeMainCompany?.slug || activeMainCompany?.id || "";
  // UI visibility is never a substitute for the API's own payroll authorization.
  const [profileAudit,setProfileAudit] = useState(Boolean(isAuditAccount));
  const sections = useMemo(() => configuredProductSections(
    activeMainCompany?.pdksUiPreferences || {},{audit:profileAudit}),
    [activeMainCompany?.pdksUiPreferences,profileAudit]);
  const section=sections.find((item)=>item.id===navigation.section)||sections[0];
  const tab=section.tabs.find((item)=>item.id===navigation.tab)||section.tabs[0];
  const requirement=sourceForTab(tab.id,{audit:profileAudit});
  const needsPeople=requirement==="people" ||
    requirement==="attendance" || requirement==="corrections" ||
    ["departments","routes","leave","advances","overtime","deductions"].includes(tab.id);
  // Personnel 360 reads only while its own detail panel is actually visible.
  const detailVisible=section.id==="people" &&
    ["people","cards","employment"].includes(tab.id);
  const monthKey=[company,period.year,period.month,requirement].join("|");
  const allowHeavy=requirement==="monthly-attendance" && monthlyRequestKey===monthKey;
  const data=useUnifiedPdksData({
    company,year:period.year,month:period.month,personId:selectedId,requirement,
    previewOnly,auditHint:isAuditAccount,reloadToken,needsPeople,allowHeavy,
    detailTab:detailVisible?personTab:"identity",
  });
  const selectedPerson=data.people.find((person)=>person.id===selectedId)||data.people[0]||null;
  const realAttendance=requirement==="attendance";
  const go = useCallback((sectionId,tabId) => {
    const allowed = sections.find((item)=>item.id===sectionId);
    if (!allowed) return; // A hidden section cannot be opened through a quick action.
    const target = allowed.tabs.find((item)=>item.id===tabId) || allowed.tabs[0];
    setNavigation({section:allowed.id,tab:target.id});
    setMobileMenuOpen(false);
    setNotice("");
  },[sections]);

  useEffect(() => {
    const listener = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown",listener);
    return () => window.removeEventListener("keydown",listener);
  },[]);

  // Changes in trusted profile can only narrow what the user sees.
  useEffect(()=>{
    setProfileAudit(Boolean(isAuditAccount || data.audit));
  },[isAuditAccount,data.audit]);
  useEffect(()=>{
    setSelectedId((previous)=>
      data.people.some((person)=>person.id===previous) ? previous : data.people[0]?.id||"");
  },[data.people]);

  const isPeopleTab=section.id==="people" && ["people","cards","employment"].includes(tab.id);
  // One projection for every screen. API success is not record-schema success.
  const projection=useMemo(()=>{
    if(requirement==="people")return rowsForTab(tab.id,null,{people:data.people});
    if(realAttendance)return rowsForTab(tab.id,{days:data.days},{selectedPerson});
    if(data.resourceReady)return rowsForTab(tab.id,data.resource,{
      people:data.people,selectedPerson,year:period.year,month:period.month});
    return {rows:[],supported:false};
  },[requirement,tab.id,data.people,realAttendance,data.days,selectedPerson,
    data.resourceReady,data.resource,period.year,period.month]);
  const sourceRows=projection.rows;
  const filteredRows = useMemo(()=> {
    const q=search.toLocaleLowerCase("tr-TR").trim();
    if (!q) return sourceRows;
    return sourceRows.filter((row)=>Object.values(row).some((value)=>
      String(value).toLocaleLowerCase("tr-TR").includes(q)));
  },[search,sourceRows]);

  const dataConnected = !previewOnly && data.sourceReady && projection.supported &&
    (!data.audit || !isSensitiveProductTab(tab.id));
  const canExport = dataConnected && !tab.sensitive && !isSensitiveProductTab(tab.id) &&
    filteredRows.length > 0;
  const pageUnavailable = previewOnly || requirement==="unconnected" ||
    requirement==="forbidden" || !data.sourceReady;
  const sourceText = previewOnly ? "Tasarım incelemesi" :
    requirement==="forbidden" || data.audit && isSensitiveProductTab(tab.id) ? "Erişim kapalı" :
    requirement==="unconnected" ? "Entegrasyon bekliyor" :
    requirement==="card-events" ? "D1 kart hareketleri · FDB/TNF doğrulanmadı" :
    data.sourceReady && !projection.supported ? "API veri sözleşmesi uyuşmuyor" :
    dataConnected ? "KY ERP API / D1 • Yerel mutabakat bekliyor" :
    data.error ? "Bağlantı hatası" : "Kaynak doğrulanıyor";

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
        {sections.map((item)=>{
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
              disabled={previewOnly || data.peopleLoading || data.resourceLoading}><RefreshCw size={16}/> Yenile</button>
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
          peopleStatus={data.profileReady && data.peopleStatus==="ready" ? {count:data.people.length}:null}
          attendanceStatus={data.peopleStatus} hasData={data.sourceReady}
          live={!previewOnly&&data.resourceReady?data.resource:null}/>}
        {tab.id==="today"&&<LiveAttendancePanel
          snapshot={!previewOnly&&data.resourceReady?data.resource:null}
          loading={data.resourceLoading} previewOnly={previewOnly} search={search}
          compact onRefresh={()=>setReloadToken(value=>value+1)}/>}
        {tab.view!=="dashboard"&&<section className="pdk-u-panel pdk-u-record-panel">
          <div className="pdk-u-record-head">
            <div><h2>{tab.label}</h2><p>{tab.description}</p></div>
            <span className="pdk-u-label"><ShieldCheck size={15}/> {previewOnly?"Görsel İnceleme":"Yazma kontrollü"}</span>
          </div>
          {requirement!=="card-events"&&<div className="pdk-u-filters">
            {requirement==="monthly-attendance" && !previewOnly &&
              <button type="button" className="pdk-u-btn"
                disabled={!company || !data.profileReady || data.resourceLoading}
                onClick={()=>setMonthlyRequestKey(monthKey)}>
                <TableProperties size={16}/> {allowHeavy?"Aylık puantaj yenileniyor":"Aylık puantajı hazırla"}
              </button>}
            <label><CalendarDays size={15}/><span>Ay</span>
              <select aria-label="Ay" value={period.month}
                onChange={(e)=>setPeriod((prev)=>({...prev,month:Number(e.target.value)}))}>
                {MONTHS.map((name,i)=><option key={name} value={i+1}>{name}</option>)}
              </select></label>
            <label><span>Yıl</span><select aria-label="Yıl" value={period.year}
              onChange={(e)=>setPeriod((prev)=>({...prev,year:Number(e.target.value)}))}>
              {Array.from({length:10},(_,i)=>currentPeriod().year-6+i).map((year)=><option key={year} value={year}>{year}</option>)}
            </select></label>
            {(realAttendance || requirement==="corrections") && data.people.length>0 && <label><span>Personel</span>
              <select aria-label="Hareket personeli" value={selectedPerson?.id||""}
                onChange={(e)=>setSelectedId(e.target.value)}>
                {data.people.map((person)=><option key={person.id} value={person.id}>{person.cardNo} · {person.fullName}</option>)}
              </select></label>}
            <span className="pdk-u-spacer"/>
            <span className="pdk-u-counter"><Filter size={15}/> {filteredRows.length} kayıt</span>
            <button type="button" className="pdk-u-btn" disabled={!canExport} onClick={exportTable}>
              <Download size={16}/> CSV</button>
          </div>}
          {tab.id==="terminals" ? <TerminalSetupPanel
            company={company} previewOnly={previewOnly}/> :
          requirement==="card-events" ? <CardEventsPanel
            key={[company,tab.id].join(":")}
            company={company} profileReady={data.profileReady}
            previewOnly={previewOnly} history={tab.id==="history"} search={search}/> :
          ["live","exceptions","attention"].includes(tab.id) ?
            <LiveAttendancePanel snapshot={!previewOnly&&data.resourceReady?data.resource:null}
              loading={data.resourceLoading} previewOnly={previewOnly} search={search}
              onRefresh={()=>setReloadToken(value=>value+1)}/> :
          isPeopleTab ? <div className="pdk-u-person-layout">
            <div className="pdk-u-list-side">
              {data.peopleLoading?<EmptyState title="Veri yükleniyor" description="Yetkili sunucu yanıtı bekleniyor."/>:
                dataConnected?<UnifiedTable columns={tab.columns} rows={filteredRows} selectedId={selectedPerson?.id}
                  onSelect={setSelectedId}/>:<EmptyState title="Personel kaynağı bağlı değil"
                  description={previewOnly?"Tasarım önizlemesinde gerçek personel verisi bulunmaz.":"Bu görünüm için yetkili KY ERP bağlantısını doğrulayın."}/>}
            </div><PersonDetails person={dataConnected?selectedPerson:null}
              active={personTab} onChange={setPersonTab} isAuditAccount={data.audit}
              detail={data.detail}/>
          </div> : (
            requirement==="unconnected" ? <EmptyState title="Ekran hazır · İşlem sözleşmesi bağlanacak"
              description="Sekme ve tablo yerleşimi tamamlandı; gerçek kaynak/senkron yetkisi doğrulanmadan işlem açılmaz. Bu ekranda sahte veri üretilmez."
              IconComponent={LockKeyhole}/> :
            (data.peopleLoading || data.resourceLoading || data.attendanceLoading) ? <EmptyState title="Doğrulanmış kayıtlar okunuyor"
              description="Kaynak veritabanı sorgusu sürüyor." IconComponent={Clock3}/> :
            data.sourceReady && !projection.supported ? <EmptyState
              title="Kaynak verinin biçimi doğrulanamadı"
              description="API yanıtı bu ekranın veri sözleşmesiyle uyuşmuyor. Eksik alanları sıfır veya tamamlandı olarak göstermiyoruz."
              IconComponent={AlertTriangle}/> :
            pageUnavailable ? <EmptyState
              title={requirement==="monthly-attendance" && !allowHeavy ?
                "Ay raporu henüz hazırlanmadı":"Kaynak doğrulanamadı"}
              description={requirement==="monthly-attendance" && !allowHeavy ?
                "Tam ay için tüm kartlı personel tek tek kontrol edilir. Aylık puantajı hazırla düğmesine basın. Eksik cevap varsa kısmi rapor oluşturulmaz." :
                "Bu görünüm yalnız yetkili KY ERP kaynağından okunur. Firebird/TNF mutabakatı ayrıca doğrulanır."}
              IconComponent={Database}/> :
            <UnifiedTable columns={tab.columns} rows={filteredRows}
              masked={isAuditAccount && isSensitiveProductTab(tab.id)}/>
          )}
          <UnifiedOperationPanel key={[company,tab.id,period.year,period.month].join(":")}
            tabId={tab.id} previewOnly={previewOnly}
            profile={data.profile} people={data.people}
            company={company} year={period.year} month={period.month}
            onChanged={()=>setReloadToken((value)=>value+1)}/>
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
