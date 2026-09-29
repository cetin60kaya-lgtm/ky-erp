import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiPost } from "../../../utils/api";

const emptyForm = () => ({
  companyName: "",
  companyType: "SUPPLIER",
  defaultRecordType: "RESMI",
  paymentMode: "CASH",
  taxNo: "",
  taxOffice: "",
  phone: "",
  email: "",
});

const unwrap = (value) => value?.data?.data || value?.data || value || {};
const validEmail = (value) => !String(value || "").trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

export default function QuickCompanyCreateDialog({
  open,
  onClose,
  onCreated,
  activeMainCompany,
  initialName = "",
  initialTaxNo = "",
  initialType = "SUPPLIER",
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      ...emptyForm(),
      companyName: initialName || "",
      taxNo: initialTaxNo || "",
      companyType: initialType || "SUPPLIER",
    });
  }, [initialName, initialTaxNo, initialType, open]);

  if (!open) return null;

  const save = async (event) => {
    event.preventDefault();
    if (!form.companyName.trim()) return setError("Firma adı zorunludur.");
    if (!validEmail(form.email)) return setError("Geçerli bir e-posta adresi girin.");
    setBusy(true);
    setError("");
    try {
      const payload = await apiPost("/muhasebe/firmalar", {
        mainCompanySlug: activeMainCompany?.slug,
        mainCompanyId: activeMainCompany?.id,
        ...form,
        supplierDebtTracking: form.companyType !== "CUSTOMER" && form.paymentMode === "CREDIT",
        customerReceivableTracking: form.companyType !== "SUPPLIER" && form.paymentMode === "CREDIT",
        vatTrackingEnabled: form.defaultRecordType === "RESMI",
      });
      const created = unwrap(payload);
      onCreated?.(created);
      onClose?.();
    } catch (requestError) {
      setError(requestError?.message || "Firma kartı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="accounting-modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose?.()}>
      <section className="accounting-center-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="accounting-center-modal-head">
          <div><strong>Yeni Cari / Firma</strong><small>Günlük işlem için gerekli temel bilgiler; ayrıntılar firma kartından tamamlanabilir.</small></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat"><X size={18} /></button>
        </header>
        <form className="accounting-quick-company-form" onSubmit={save}>
          <label className="wide">Firma adı<input autoFocus value={form.companyName} onChange={update("companyName")} /></label>
          <label>Tür<select value={form.companyType} onChange={update("companyType")}><option value="SUPPLIER">Tedarikçi</option><option value="CUSTOMER">Müşteri</option><option value="BOTH">Müşteri + Tedarikçi</option></select></label>
          <label>Kayıt<select value={form.defaultRecordType} onChange={update("defaultRecordType")}><option value="RESMI">Resmî</option><option value="GAYRI_RESMI">İç / Gayri resmî</option></select></label>
          <label>Çalışma<select value={form.paymentMode} onChange={update("paymentMode")}><option value="CASH">Peşin</option><option value="CREDIT">Vadeli / Cari</option></select></label>
          <label>Vergi no<input value={form.taxNo} onChange={update("taxNo")} /></label>
          <label>Vergi dairesi<input value={form.taxOffice} onChange={update("taxOffice")} /></label>
          <label>Telefon<input value={form.phone} onChange={update("phone")} /></label>
          <label className="wide">E-posta<input value={form.email} onChange={update("email")} /></label>
          {error ? <div className="accounting-workspace-error wide">{error}</div> : null}
          <div className="accounting-modal-actions wide"><button type="button" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="accounting-primary" disabled={busy}>{busy ? "Kaydediliyor…" : "Cariyi Aç"}</button></div>
        </form>
      </section>
    </div>
  );
}
