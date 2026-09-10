import { useState } from "react";
import { Settings2, ShieldCheck, Smartphone, X } from "lucide-react";
import SecurityCenterPanel from "../../pages/admin/SecurityCenterPanel";
import PhoneApprovalDeviceSetup from "./PhoneApprovalDeviceSetup";
import "./phone-approval-setup.css";

export default function PhoneApprovalSetup({ onClose }) {
  const [mode, setMode] = useState("center");

  if (mode === "device") return <PhoneApprovalDeviceSetup onClose={onClose} />;

  return (
    <div className="phone-approval-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="phone-approval-modal" role="dialog" aria-modal="true" aria-label="KY ERP Güvenlik Merkezi">
        <header>
          <div className="phone-approval-title">
            <span><ShieldCheck size={22} /></span>
            <div>
              <small>KY ERP GÜVENLİK</small>
              <h2>Güvenlik Merkezi</h2>
              <p>Kendi girişlerinizi, oturumlarınızı, güvenlik geçmişinizi ve telefon bağlantınızı yönetin.</p>
            </div>
          </div>
          <button type="button" className="phone-approval-close" onClick={onClose} aria-label="Kapat"><X size={18}/></button>
        </header>

        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 14 }}>
            <button type="button" onClick={() => setMode("device")} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Smartphone size={16}/> Telefon / Cihaz Kurulumu
            </button>
            <button type="button" onClick={onClose} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Settings2 size={16}/> Kapat
            </button>
          </div>
          <SecurityCenterPanel />
        </div>
      </section>
    </div>
  );
}
