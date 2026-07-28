import { useState } from "react";
import { Archive, Mail, Printer } from "lucide-react";
import IsnetPage from "../IsnetPage";
import IsnetSelectedPrintPage from "./IsnetSelectedPrintPage";
import "./IsnetArchiveDeliveryPage.css";

const SECTIONS = [
  ["kesilen-belgeler", "Belge Arşivi", Archive],
  ["selected-print", "Yazdırma", Printer],
  ["mail-merkezi", "Mail Gönderimi", Mail],
];

export default function IsnetArchiveDeliveryPage(props) {
  const [section, setSection] = useState("kesilen-belgeler");

  return (
    <div className="isnet-archive-center">
      <div className="isnet-archive-center__switch" role="tablist" aria-label="Arşiv ve gönderim bölümleri">
        {SECTIONS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={section === key ? "active" : ""}
            onClick={() => setSection(key)}
            role="tab"
            aria-selected={section === key}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {section === "selected-print" ? (
        <IsnetSelectedPrintPage />
      ) : (
        <IsnetPage {...props} activeTab={section} />
      )}
    </div>
  );
}
