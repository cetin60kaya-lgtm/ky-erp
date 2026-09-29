import DailyHrWorkspace from "../DailyHrWorkspace";
import IkAdvancedMonthly from "./IkAdvancedMonthly";

const MODE_BY_TAB = {
  ozet: "ozet",
  "ucret-odeme-plani": "ucret",
  "mesai-avans": "mesai",
  "yillik-izin": "izin",
  "bordro-odeme": "bordro",
  "sgk-evrak-kontrol": "kapanis",
};

const DAILY_TABS = new Set([
  "gunluk-personel",
  "ik-raporlari",
  "gunluk-personel-kartlari",
  "gunluk-odeme-fisleri",
]);

export default function IkFinancePage({ activeTab = "ozet", activeMainCompany }) {
  const companyReady = Boolean(activeMainCompany?.slug || activeMainCompany?.id);
  if (!companyReady) {
    return (
      <div className="content-card module-error-card">
        <h3>İK işlemleri için firma seçin</h3>
        <p>Aylık ve günlük personel kayıtları firma bazında tutulur. Üst menüden aktif firmayı seçmeden veri okunmaz veya yazılmaz.</p>
      </div>
    );
  }

  if (DAILY_TABS.has(activeTab)) return <DailyHrWorkspace />;

  const mode = MODE_BY_TAB[activeTab] || "ozet";
  return (
    <IkAdvancedMonthly
      mode={mode}
      initialControlTab={activeTab === "sgk-evrak-kontrol" ? "kontrol" : undefined}
      activeMainCompany={activeMainCompany}
    />
  );
}
