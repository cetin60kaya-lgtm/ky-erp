import fs from "node:fs";

const file = "APP/app/ky-erp-frontend/src/pages/muhasebe/CekOdemeMerkeziPage.jsx";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
source = source.replace("  CalendarDays,\n", "");

const oldBlock = `  const saveFirm = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const created = await createOdemeFirma({ ...baseParams, ...modal.form });
      const firmId = created?.id || created?.firmaId || "";
      setModal(null);
      setNotice({ tone: "ok", text: "Firma/cari kaydedildi." });
      await loadBase();
      if (firmId) setSelectedFirmId(firmId);
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Firma kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };
`;
const newBlock = `  const saveFirm = async () => {
    const returnToCheck = modal?.returnToCheck === true;
    const previousCheckForm = modal?.checkForm || null;
    setBusy(true);
    setNotice(null);
    try {
      const created = await createOdemeFirma({ ...baseParams, ...modal.form });
      const firmId = created?.id || created?.firmaId || "";
      setNotice({ tone: "ok", text: "Firma/cari kaydedildi." });
      await loadBase();
      if (firmId) setSelectedFirmId(firmId);
      if (returnToCheck && previousCheckForm && firmId) {
        setModal({
          type: "check",
          form: { ...previousCheckForm, firmId },
        });
      } else {
        setModal(null);
      }
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Firma kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  };
`;
if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
if (!source.includes("const returnToCheck = modal?.returnToCheck === true")) {
  throw new Error("Hızlı cari dönüş bloğu uygulanamadı");
}
fs.writeFileSync(file, source, "utf8");
console.log("Çek UI son düzeltmesi uygulandı.");
