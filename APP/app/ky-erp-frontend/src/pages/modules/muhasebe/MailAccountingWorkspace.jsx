import { useState } from "react";
import { FileText, X } from "lucide-react";
import MailTemplatesWorkspace from "./MailTemplatesWorkspace";
import MailTrackingWorkspace from "./MailTrackingWorkspace";

export default function MailAccountingWorkspace(props) {
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-inline-actions">
        <span>Ekstre, alıcı ve gönderim takibi ana çalışma alanıdır.</span>
        <button type="button" onClick={() => setTemplatesOpen(true)}>
          <FileText size={15} /> Mail Şablonları
        </button>
      </div>
      <MailTrackingWorkspace {...props} />

      {templatesOpen ? (
        <div className="accounting-modal-backdrop" role="presentation" onMouseDown={() => setTemplatesOpen(false)}>
          <section className="accounting-center-modal large" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="accounting-center-modal-head">
              <div><strong>Mail Şablonları</strong><small>Yalnız gerektiğinde açılır; günlük ekstre ekranını kalabalıklaştırmaz.</small></div>
              <button type="button" onClick={() => setTemplatesOpen(false)} aria-label="Kapat"><X size={18} /></button>
            </header>
            <div className="accounting-center-modal-body">
              <MailTemplatesWorkspace activeMainCompany={props.activeMainCompany} refreshKey={props.refreshKey} />
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
