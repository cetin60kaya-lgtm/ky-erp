import { useEffect, useState } from "react";
import { Archive, Mail, Printer } from "lucide-react";
import IsnetPage from "../IsnetPage";
import IsnetSelectedPrintPage from "./IsnetSelectedPrintPage";
import "./IsnetArchiveDeliveryPage.css";

const SECTIONS = [
  ["kesilen-belgeler", "Belge Arşivi", Archive],
  ["selected-print", "Yazdırma", Printer],
  ["mail-merkezi", "Mail Gönderimi", Mail],
];

function normalizeSection(value) {
  return SECTIONS.some(([key]) => key === value)
    ? value
    : "kesilen-belgeler";
}

export default function IsnetArchiveDeliveryPage({
  initialSection = "kesilen-belgeler",
  ...props
}) {
  const [section, setSection] = useState(() =>
    normalizeSection(initialSection),
  );

  useEffect(() => {
    setSection(normalizeSection(initialSection));
  }, [initialSection]);

  return (
    <div className="isnet-archive-center">
      <div
        className="isnet-archive-center__switch"
        role="tablist"
        aria-label="Arşiv ve gönderim bölümleri"
      >
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
