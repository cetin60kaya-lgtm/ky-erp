import { useState } from "react";
import { Archive, Mail, Printer } from "lucide-react";
import IsnetPage from "../IsnetPage";
import "./IsnetArchiveDeliveryPage.css";

const SECTIONS = [
  ["kesilen-belgeler", "Belge Arşivi", Archive],
  ["cikti-kuyrugu", "Yazdırma", Printer],
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
      <IsnetPage {...props} activeTab={section} />
    </div>
  );
}
