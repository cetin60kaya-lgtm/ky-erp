import UretimGirisHavuzu from "../imalat/UretimGirisHavuzu";
import ImalatKontrolRapor from "../imalat/ImalatKontrolRapor";

export default function UretimPage({ activeMainCompany, activeTab }) {
  if (["imalat-kontrol-rapor", "imalat-denetim", "uretim-raporu"].includes(activeTab)) {
    return (
      <ImalatKontrolRapor
        activeMainCompany={activeMainCompany}
        initialView={activeTab === "uretim-raporu" ? "report" : "audit"}
      />
    );
  }

  return <UretimGirisHavuzu activeMainCompany={activeMainCompany} />;
}
