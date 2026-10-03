import IkAdvancedMonthly from "./IkAdvancedMonthly";

const MODE_BY_TAB = {
  ozet: "ozet",
  "personel-kartlari": "personel",
  "ucret-odeme-plani": "ucret",
  "mesai-avans": "mesai",
  "yillik-izin": "izin",
  "bordro-odeme": "bordro",
  "sgk-evrak-kontrol": "kapanis",
};

export default function IkFinancePage({ activeTab = "ozet", activeMainCompany, openModule }) {
  const companyReady = Boolean(activeMainCompany?.slug || activeMainCompany?.id);
  if (!companyReady) {
    return (
      <div className="content-card module-error-card">
        <h3>İK aylık işlemleri için firma seçin</h3>
        <p>Maaş, mesai, izin, bordro ve ay sonu kayıtları firma bazında tutulur. Üst menüden aktif firmayı seçmeden aylık veri okunmaz veya yazılmaz.</p>
      </div>
    );
  }

  const mode = MODE_BY_TAB[activeTab] || "ozet";
  return (
    <IkAdvancedMonthly
      mode={mode}
      activeMainCompany={activeMainCompany}
      openModule={openModule}
    />
  );
}
