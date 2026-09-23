import { useState } from "react";
import { BadgeCheck, FileText, X } from "lucide-react";
import MailTemplatesWorkspace from "./MailTemplatesWorkspace";
import MailTrackingWorkspace from "./MailTrackingWorkspace";
import ReconciliationPanel from "./ReconciliationPanel";

export default function MailAccountingWorkspace(props) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);

  return (
    <section className="accounting-composite-workspace">
      <div className="accounting-inline-actions">
        <span>Ekstre, alıcı, mutabakat ve gönderim takibi ana çalışma alanıdır.</span>
        <div>
          <button type="button" onClick={() => setReconciliationOpen(true)}><BadgeCheck size={15} /> Cari Mutabakat</button>
          <button type="button" onClick={() => setTemplatesOpen(true)}><FileText size={15} /> Mail Şablonları</button>
        </div>
      </div>
      <MailTrackingWorkspace {...props} />

      {reconciliationOpen ? (
        <div className="accounting-modal-backdrop" role="presentation" onMouseDown={() => setReconciliationOpen(false)}>
          <section className="accounting-center-modal large" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="accounting-center-modal-head"><div><strong>Cari Mutabakat</strong><small>Ekstre bakiyesi ile karşı taraf teyidini dönem bazında kaydedin.</small></div><button type="button" onClick={() => setReconciliationOpen(false)} aria-label="Kapat"><X size={18} /></button></header>
            <div className="accounting-center-modal-body"><ReconciliationPanel activeMainCompany={props.activeMainCompany} refreshKey={props.refreshKey} /></div>
          </section>
        </div>
      ) : null}

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
