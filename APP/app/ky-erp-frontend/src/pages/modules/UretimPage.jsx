import ImalatPage from "../imalat/ImalatPage";
import UretimDenetim from "../imalat/UretimDenetim";
import UretimGirisHavuzu from "../imalat/UretimGirisHavuzu";
import UretimRaporlari from "../imalat/UretimRaporlari";

export default function UretimPage({ activeMainCompany, activeTab, openModule }) {
  if (activeTab === "uretim-girisi") {
    return <UretimGirisHavuzu activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "imalat-denetim") {
    return <UretimDenetim activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "uretim-raporu") {
    return <UretimRaporlari activeMainCompany={activeMainCompany} />;
  }

  return (
    <ImalatPage
      activeMainCompany={activeMainCompany}
      activeTab={activeTab}
      openModule={openModule}
    />
  );
}
