import fs from "node:fs";

const file = "APP/app/ky-erp-frontend/src/pages/modules/MuhasebePage.jsx";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const componentAnchor = `export default function MuhasebePage({`;
const component = `function FirmCardExtras({ activeMainCompany, refreshKey, reloadAll, goTab }) {
  const [openPanel, setOpenPanel] = useState("");
  return (
    <section
      style={{
        marginTop: 12,
        border: "1px solid #dfe7f2",
        borderRadius: 14,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          background: "#f8fbff",
          borderBottom: openPanel ? "1px solid #e7edf5" : 0,
        }}
      >
        <div>
          <strong style={{ color: "#17365f" }}>Firma Kartı Ek Ayarları</strong>
          <p style={{ margin: "3px 0 0", color: "#748297", fontSize: 12 }}>
            Gider kuralı ve mail/yetkili bilgileri yalnız gerektiğinde açılır.
          </p>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button
            className={openPanel === "expense" ? "mh-btn primary" : "mh-btn"}
            type="button"
            onClick={() => setOpenPanel((value) => (value === "expense" ? "" : "expense"))}
          >
            Firma / Gider Kuralları
          </button>
          <button
            className={openPanel === "contacts" ? "mh-btn primary" : "mh-btn"}
            type="button"
            onClick={() => setOpenPanel((value) => (value === "contacts" ? "" : "contacts"))}
          >
            Yetkililer ve E-posta
          </button>
        </div>
      </header>
      {openPanel === "expense" ? (
        <div style={{ padding: 12 }}>
          <ExpenseCategories
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
          />
        </div>
      ) : null}
      {openPanel === "contacts" ? (
        <div style={{ padding: 12 }}>
          <FirmContacts
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
            goTab={goTab}
          />
        </div>
      ) : null}
    </section>
  );
}

`;
if (!source.includes("function FirmCardExtras")) {
  if (!source.includes(componentAnchor)) throw new Error("Muhasebe ana component anchor bulunamadı");
  source = source.replace(componentAnchor, `${component}${componentAnchor}`);
}

const aliasBlock = `          <CompanyAliasPanel
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
          />`;
const extrasBlock = `${aliasBlock}
          <FirmCardExtras
            activeMainCompany={activeMainCompany}
            refreshKey={refreshKey}
            reloadAll={reloadAll}
            goTab={goTab}
          />`;
if (!source.includes("<FirmCardExtras")) {
  if (!source.includes(aliasBlock)) throw new Error("Firma alias render anchor bulunamadı");
  source = source.replace(aliasBlock, extrasBlock);
}

const stateAnchor = `  const [form, setForm] = useState(emptyCompanyForm());`;
const quickEffect = `${stateAnchor}
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quick") !== "cari") return;
    setIsNewFirm(true);
    setSelectedId("");
    setFeedback("Hızlı cari: firma bilgilerini girip Firma Kaydet düğmesine basın.");
    params.delete("quick");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);`;
if (!source.includes("Hızlı cari: firma bilgilerini girip")) {
  if (!source.includes(stateAnchor)) throw new Error("CompanyCards form state anchor bulunamadı");
  source = source.replace(stateAnchor, quickEffect);
}

fs.writeFileSync(file, source, "utf8");
console.log("Firma kartı hızlı cari ve açılır panellerle tamamlandı.");
