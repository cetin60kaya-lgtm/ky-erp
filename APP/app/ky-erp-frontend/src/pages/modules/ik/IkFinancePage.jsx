import IkAdvancedMonthly from "../IkAdvancedMonthly";

const MODE_BY_TAB = {
  ozet: "ozet",
  "mesai-avans": "mesai",
  "bordro-odeme": "bordro",
  "sgk-evrak-kontrol": "kapanis",
};

export default function IkFinancePage({ activeTab = "ozet", activeMainCompany }) {
  const mode = MODE_BY_TAB[activeTab] || "ozet";
  return (
    <IkAdvancedMonthly
      mode={mode}
      initialControlTab={activeTab === "sgk-evrak-kontrol" ? "kontrol" : undefined}
      activeMainCompany={activeMainCompany}
    />
  );
}
