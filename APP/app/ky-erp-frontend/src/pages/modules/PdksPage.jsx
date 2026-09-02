import { useEffect, useState } from "react";
import "../../app/pdksModuleRegistryPatch";
import { executePdksAssistantCommand, PDKS_ASSISTANT_EXAMPLES } from "../../services/pdksAssistant";
import PdksDeviceCenter from "../pdks/PdksDeviceCenter";
import PdksPageV2 from "./PdksPageV2";
import "./pdks-shell.css";

function QuickAssistant({ disabled, mainCompanyId }) {
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const execute = async () => {
    if (disabled || busy || !command.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await executePdksAssistantCommand(command, { mainCompanyId });
      setMessage(result?.message || "İşlem tamamlandı.");
      setCommand("");
    } catch (cause) {
      setError(cause?.message || "Asistan işlemi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pdks-quick-assistant">
      <div className="pdks-quick-assistant-title">
        <div><strong>PDKS Hızlı Asistan</strong><span>Personel adı + işlem yaz; kayıt aynı İK/PDKS D1 verisine gider.</span></div>
        {disabled ? <em>Denetim: salt okunur</em> : null}
      </div>
      <div className="pdks-assistant-row">
        <input
          value={command}
          disabled={disabled || busy}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") execute(); }}
          placeholder="Örn: Ali Akkaya bugün gelmedi, yok yaz"
        />
        <button type="button" onClick={execute} disabled={disabled || busy || !command.trim()}>{busy ? "İşleniyor..." : "Uygula"}</button>
      </div>
      <div className="pdks-assistant-examples">
        {PDKS_ASSISTANT_EXAMPLES.slice(0, 4).map((example) => (
          <button type="button" key={example} disabled={disabled || busy} onClick={() => setCommand(example)}>{example}</button>
        ))}
      </div>
      {message ? <div className="pdks-assistant-success">{message}</div> : null}
      {error ? <div className="pdks-assistant-error">{error}</div> : null}
    </section>
  );
}

export default function PdksPage(props) {
  const { activeTab = "ana-ekran", isAuditAccount = false, activeMainCompany } = props;
  const mainCompanyId = activeMainCompany?.slug || activeMainCompany?.id || "mecit-hakan";
  const isDeviceScreen = activeTab === "cihaz-baglantilari" || activeTab === "senkron";

  useEffect(() => {
    document.body.classList.add("pdks-compact-active");
    return () => document.body.classList.remove("pdks-compact-active");
  }, []);

  return (
    <div className="pdks-module-shell">
      <main className="pdks-module-content">
        <QuickAssistant disabled={isAuditAccount} mainCompanyId={mainCompanyId} />
        {isDeviceScreen
          ? <PdksDeviceCenter activeTab={activeTab} activeMainCompany={activeMainCompany} isAuditAccount={isAuditAccount} />
          : <PdksPageV2 {...props} />}
      </main>
    </div>
  );
}
