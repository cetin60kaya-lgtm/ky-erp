import "./integrationFlowSteps.css";

export const INTEGRATION_CONNECTION_STEPS = Object.freeze({
  ISNET: ["Hesap ve giriş", "Sağlayıcı doğrulama / firma", "Firmayı kaydet"],
  MAIL: ["Posta hesabı tanımla", "Microsoft / Google onayı", "Bağlı hesabı doğrula"],
  STORAGE: ["Dosya sağlayıcısını seç", "Hesap yetkisi", "Klasör seç ve kaydet"],
});

/** Shared visual workflow only. The provider alone proves authentication;
 * frontend step position must never be treated as an API/Graph/Drive connection proof. */
export default function IntegrationFlowSteps({ kind, stage = 1 }) {
  const steps = INTEGRATION_CONNECTION_STEPS[kind] || INTEGRATION_CONNECTION_STEPS.ISNET;
  const current = Number.isFinite(Number(stage)) ? Math.min(3, Math.max(1, Number(stage))) : 1;
  return (
    <ol className="ky-integration-steps" aria-label="Entegrasyon bağlantı adımları">
      {steps.map((title, index) => {
        const step = index + 1;
        return <li key={title} className={step < current ? "done" : step === current ? "active" : ""} aria-current={step === current ? "step" : undefined}>
          <span>{step}</span>{title}
        </li>;
      })}
    </ol>
  );
}
