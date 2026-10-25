import { useEffect, useMemo, useState } from "react";
import { PRODUCT_SECTIONS, ALL_PRODUCT_TABS } from "./desktopProductModel";
import "./PdksDesktopNavigation.css";

/* Shared visual contract with the PC PDKS 9-section/49-tab desktop.
 * Routes are enabled ONLY where the existing KY ERP web screen exists.
 * A matching menu does not certify native devices, FDB/TNF or Cloud ACK. */
export const DESKTOP_WEB_ROUTES = Object.freeze({
  "overview/today":"ana-ekran",
  "attendance/live":"ana-ekran",
  "attendance/punches":"giris-cikislar",
  "attendance/history":"giris-cikislar",
  "attendance/transfers":"bilgi-aktar",
  "people/people":"personel-bilgileri",
  "people/employment":"personel-bilgileri",
  "planning/shift":"gruplar-vardiyalar",
  "planning/leave":"izinler",
  "planning/holidays":"tatiller",
  "planning/routes":"servisler",
  "timesheet/daily":"puantaj",
  "timesheet/monthly":"puantaj-sonuclari",
  "timesheet/corrections":"puantaj",
  "timesheet/closing":"donemler",
  "reports/attendance":"raporlar",
  "reports/violations":"raporlar",
  "reports/timesheets":"puantaj-sonuclari",
  "devices/terminals":"saat-terminal",
  "devices/transfer":"bilgi-aktar",
  "devices/cloud":"senkron",
  "admin/rules":"puantaj-kurallari",
});
const AUDIT_ROUTES = new Set(["ana-ekran","giris-cikislar","puantaj","puantaj-sonuclari","raporlar"]);

export default function PdksDesktopNavigation({activeTab,onNavigate,isAuditAccount}) {
  const permittedSections = useMemo(() =>
    PRODUCT_SECTIONS.filter((group) => !isAuditAccount || !["payroll","admin"].includes(group.id)),[isAuditAccount]);
  const [selectedSectionId,setSelectedSectionId] = useState("overview");
  const selected = permittedSections.find((group) => group.id === selectedSectionId) || permittedSections[0];
  useEffect(() => {
    if (selected?.tabs?.some((tab)=>DESKTOP_WEB_ROUTES[selected.id+"/"+tab.id]===activeTab)) return;
    const current = permittedSections.find((group)=>group.tabs.some((tab)=>
      DESKTOP_WEB_ROUTES[group.id+"/"+tab.id]===activeTab));
    if (current) setSelectedSectionId(current.id);
  },[activeTab,permittedSections]);
  return (
    <section className="pdks-desktop-nav" aria-label="PC PDKS masaüstüyle uyumlu menü">
      <div className="pdks-desktop-nav-heading">
        <div><strong>PC PDKS çalışma alanı</strong><small>9 bölüm · {ALL_PRODUCT_TABS.length} sekme · masaüstüyle ortak adlandırma</small></div>
        <span>İK ana kaynak / SGK'lı kartlı çalışanlar</span>
      </div>
      <nav className="pdks-desktop-nav-sections" aria-label="PC PDKS ana bölümleri">
        {permittedSections.map((group)=>(
          <button type="button" key={group.id}
            className={selected?.id===group.id?"active":""}
            aria-current={selected?.id===group.id?"page":undefined}
            onClick={()=>setSelectedSectionId(group.id)}>{group.label}</button>
        ))}
      </nav>
      <nav className="pdks-desktop-nav-tabs" aria-label={selected.label+" işlemleri"}>
        {selected.tabs.map((tab)=>{
          const route=DESKTOP_WEB_ROUTES[selected.id+"/"+tab.id];
          const allowed=Boolean(route)&&(!isAuditAccount||AUDIT_ROUTES.has(route));
          return (
            <button type="button" key={tab.id} disabled={!allowed}
              className={allowed&&activeTab===route?"active":""}
              title={allowed?tab.description:"Masaüstü sekmesi: doğrulanmış web işlemi henüz bağlı değil"}
              onClick={()=>{if(allowed)onNavigate?.(route);}}>
              {tab.label}{!allowed?<small>Bekliyor</small>:null}
            </button>
          );
        })}
      </nav>
      <p className="pdks-desktop-nav-note">Bağlı olmayan işlemler pasiftir. Terminal onayı, yerel FDB/TNF ve Cloud kabulü ayrı yapılır.</p>
    </section>
  );
}
