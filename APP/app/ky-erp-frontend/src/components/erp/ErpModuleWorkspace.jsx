import { useMemo, useState } from "react";
import { ERP_MODULE_WORKFLOWS } from "../../data/erpModuleWorkflows";
import {
  calculateDashboardStats,
  createDraftRecord,
  detectMissingFields,
  getAiContextForRecord,
  getAiSuggestedActions,
  getNextAction,
  getRecordStatus,
  runCurrentAction,
} from "../../utils/erpWorkflow";
import ErpActionQueue from "./ErpActionQueue";
import ErpDashboardCards from "./ErpDashboardCards";
import ErpDataTable from "./ErpDataTable";
import ErpDetailPanel from "./ErpDetailPanel";
import ErpQuickEntryPanel from "./ErpQuickEntryPanel";
import ErpReportPanel from "./ErpReportPanel";

function hydrateRows(config) {
  return (config.rows || []).map((row) => {
    const missingFields = detectMissingFields(row, config.requiredFields);
    const status = getRecordStatus(row, missingFields);
    const nextAction = getNextAction(row, config.actionRules || [], missingFields);
    return { ...row, missingFields, status, nextAction };
  });
}

function getColumns(config) {
  const fieldColumns = (config.requiredFields || []).slice(0, 3).map((field) => ({
    key: field.key,
    label: field.label.replace(" eksik", "").replace(" yok", ""),
  }));
  return [
    { key: "title", label: "Kayıt" },
    ...fieldColumns,
    { key: "status", label: "Durum", render: (row) => <span className="erp-status-badge">{row?.status}</span> },
    { key: "nextAction", label: "Sıradaki Tek Aksiyon" },
  ];
}

export default function ErpModuleWorkspace({ moduleKey, activeView = "workflow" }) {
  const config = ERP_MODULE_WORKFLOWS[moduleKey] || ERP_MODULE_WORKFLOWS.model;
  const [rows, setRows] = useState(() => hydrateRows(config));
  const [selectedId, setSelectedId] = useState(() => rows[0].id || "");
  const selected = rows.find((row) => String(row?.id) === String(selectedId)) || rows[0] || null;

  const cards = useMemo(
    () => calculateDashboardStats(rows, config.dashboardCards),
    [config.dashboardCards, rows],
  );
  const queue = rows.filter((row) => row?.status !== "Kapalı");
  const detailFields = [
    { key: "title", label: "Başlık" },
    ...(config.requiredFields || []).slice(0, 5).map((field) => ({
      key: field.key,
      label: field.label.replace(" eksik", "").replace(" yok", ""),
    })),
  ];

  function handleCreateDraft() {
    const draft = createDraftRecord({
      title: `${config.title} taslak`,
      nextAction: "Bilgiyi tamamla",
      missingFields: (config.requiredFields || []).map((field) => field.label),
    });
    setRows((current) => [draft, ...current]);
    setSelectedId(draft.id);
  }

  function handleRunAction(record) {
    const aiContext = getAiContextForRecord(record, moduleKey);
    const aiSuggestions = getAiSuggestedActions(record);
    setRows((current) =>
      current.map((row) =>
        row.id === record.id
          ? runCurrentAction(
              {
                ...row,
                aiContext,
                aiSuggestions,
              },
              row?.nextAction,
            )
          : row,
      ),
    );
  }

  if (activeView === "dashboard") {
    return (
      <div className="content-grid erp-module-workspace">
        <section className="content-card">
          <div className="section-header">
            <div>
              <h3>{config.dashboardTitle}</h3>
              <p>Yönetim özeti, eksik veri durumu ve rapor çıktısı aynı mantıkla hazırlanır.</p>
            </div>
          </div>
          <ErpDashboardCards cards={cards} />
          <ErpReportPanel title={`${config.title} kontrol özeti`} rows={rows} summary={cards.slice(0, 4)} />
        </section>
      </div>
    );
  }

  if (activeView === "quick") {
    return (
      <div className="content-grid erp-module-workspace">
        <ErpQuickEntryPanel title={config.quickTitle} fields={config.quickFields} onCreateDraft={handleCreateDraft} />
        <div className="erp-workflow-layout">
          <ErpActionQueue items={queue} selectedId={selected.id} onSelect={(row) => setSelectedId(row?.id)} />
          <section className="content-card erp-main-table-card">
            <ErpDataTable columns={getColumns(config)} rows={rows} selectedId={selected.id} onSelect={(row) => setSelectedId(row?.id)} />
          </section>
          <ErpDetailPanel record={selected} fields={detailFields} onRunAction={handleRunAction} />
        </div>
      </div>
    );
  }

  if (activeView === "report") {
    return (
      <div className="content-grid erp-module-workspace">
        <ErpReportPanel title={config.reportTitle} rows={rows} summary={cards} />
      </div>
    );
  }

  return (
    <div className="content-grid erp-module-workspace">
      <ErpDashboardCards cards={cards.slice(0, 5)} />
      <div className="erp-workflow-layout">
        <ErpActionQueue items={queue} selectedId={selected.id} onSelect={(row) => setSelectedId(row?.id)} />
        <section className="content-card erp-main-table-card">
          <div className="section-header">
            <div>
              <h3>{config.title} İş Akışı</h3>
              <p>Sol kuyruk, orta tablo ve sağ detay paneliyle sıradaki tek aksiyon izlenir.</p>
            </div>
          </div>
          <ErpDataTable columns={getColumns(config)} rows={rows} selectedId={selected.id} onSelect={(row) => setSelectedId(row?.id)} />
        </section>
        <ErpDetailPanel record={selected} fields={detailFields} onRunAction={handleRunAction} />
      </div>
    </div>
  );
}
