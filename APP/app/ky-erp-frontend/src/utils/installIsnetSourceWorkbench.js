import {
  assignIsnetSourceIntakeModel,
  createOutgoingDispatchFromSourceIntake,
  getIsnetSourceIntakes,
  linkCustomerDispatchToSourceIntake,
  updateIsnetSourceIntakeQuantities,
} from "../services/isnetSourceIntakeApi";

const STYLE_ID = "ky-isnet-source-workbench-style";
const OVERLAY_ID = "ky-isnet-source-workbench-overlay";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function statusText(row) {
  return {
    MODEL_PENDING: "Model bekliyor",
    READY_FOR_PRODUCTION: "İşleme hazır",
    READY_FOR_INVOICE: "Fatura bekliyor",
    PARTIAL: "Kısmi işlem",
    COMPLETED: "Tamamlandı",
    NON_BILLABLE_SUPPLIER: "Tedarikçi · faturalandırılmaz",
  }[row.workflowStatus] || row.workflowStatus || row.status || "Yeni";
}

function sourceText(value) {
  return {
    PORTAL: "İşNet",
    MANUAL_PDF: "Manuel PDF",
    NO_CUSTOMER_DISPATCH: "İrsaliyesiz",
  }[value] || value;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ky-isnet-pool-launch{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.32);border-radius:8px;padding:9px 13px;background:rgba(255,255,255,.14);color:#fff;font-weight:700;cursor:pointer}
    .ky-isnet-pool-launch:hover{background:rgba(255,255,255,.22)}
    .ky-isnet-pool-overlay{position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}
    .ky-isnet-pool-modal{width:min(1500px,calc(100vw - 32px));height:min(850px,calc(100vh - 32px));display:flex;flex-direction:column;background:#eef4f9;border-radius:15px;overflow:hidden;box-shadow:0 24px 90px rgba(15,23,42,.38)}
    .ky-isnet-pool-head{display:flex;justify-content:space-between;gap:16px;padding:18px 20px;background:linear-gradient(135deg,#102f54,#16669f);color:#fff}.ky-isnet-pool-head h2{margin:2px 0 4px}.ky-isnet-pool-head p{margin:0;opacity:.84}
    .ky-isnet-pool-head-actions{display:flex;gap:8px;align-items:flex-start}.ky-isnet-pool-head button{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.14);color:#fff;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer}
    .ky-isnet-pool-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 210px auto;gap:10px;padding:12px 16px;background:#fff;border-bottom:1px solid #dbe5ee}.ky-isnet-pool-toolbar input,.ky-isnet-pool-toolbar select{border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;background:#fff}.ky-isnet-pool-toolbar button{border:0;border-radius:8px;padding:9px 14px;background:#0d6aa8;color:#fff;font-weight:700;cursor:pointer}
    .ky-isnet-pool-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:10px 16px}.ky-isnet-pool-summary div{background:#fff;border:1px solid #dbe5ee;border-radius:10px;padding:10px}.ky-isnet-pool-summary span{display:block;color:#64748b;font-size:11px}.ky-isnet-pool-summary strong{font-size:18px;color:#0f2742}
    .ky-isnet-pool-table-wrap{flex:1;overflow:auto;padding:0 16px 16px}.ky-isnet-pool-table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #dbe5ee;border-radius:10px;overflow:hidden;font-size:12px}.ky-isnet-pool-table th{position:sticky;top:0;z-index:2;background:#e8f0f7;color:#334155;padding:9px 7px;text-align:left;border-bottom:1px solid #cbd5e1}.ky-isnet-pool-table td{padding:8px 7px;border-bottom:1px solid #edf2f7;vertical-align:top}.ky-isnet-pool-table tr:hover td{background:#f8fbff}.ky-isnet-pool-table small{display:block;color:#64748b;margin-top:2px}.ky-isnet-pool-table input{width:90px;border:1px solid #cbd5e1;border-radius:6px;padding:6px}.ky-isnet-pool-table .wide{width:150px}.ky-isnet-pool-table button{border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:6px 8px;cursor:pointer;font-size:11px;font-weight:700}.ky-isnet-pool-table button.primary{background:#0d6aa8;color:#fff;border-color:#0d6aa8}.ky-isnet-pool-table button.warning{background:#fff7ed;color:#9a3412;border-color:#fdba74}
    .ky-isnet-pool-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;background:#e2e8f0;color:#334155}.ky-isnet-pool-badge.done{background:#dcfce7;color:#166534}.ky-isnet-pool-badge.partial{background:#fef3c7;color:#92400e}.ky-isnet-pool-badge.wait{background:#dbeafe;color:#1d4ed8}.ky-isnet-pool-badge.danger{background:#fee2e2;color:#991b1b}
    .ky-isnet-pool-empty{padding:40px;text-align:center;color:#64748b}.ky-isnet-pool-status{padding:0 16px 10px;color:#475569}.ky-isnet-pool-status.error{color:#b91c1c}.ky-isnet-pool-status.success{color:#15803d}
    @media(max-width:980px){.ky-isnet-pool-summary{grid-template-columns:repeat(3,1fr)}.ky-isnet-pool-toolbar{grid-template-columns:1fr}.ky-isnet-pool-modal{width:calc(100vw - 20px);height:calc(100vh - 20px)}}
  `;
  document.head.appendChild(style);
}

function rowBadge(row) {
  const tone = row.workflowStatus === "COMPLETED" ? "done" : row.workflowStatus === "PARTIAL" ? "partial" : row.workflowStatus === "NON_BILLABLE_SUPPLIER" ? "danger" : "wait";
  return `<span class="ky-isnet-pool-badge ${tone}">${escapeHtml(statusText(row))}</span>`;
}

function renderRows(container, rows) {
  container.innerHTML = rows.length ? rows.map((row) => {
    const c = row.capacity || {};
    return `<tr data-id="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.issueDate || "—")}</strong><small>${escapeHtml(sourceText(row.sourceType))}</small></td>
      <td><strong>${escapeHtml(row.customerDispatchNo || row.internalReference || "—")}</strong><small>${escapeHtml(row.orderNo || "Sipariş yok")}</small></td>
      <td><strong>${escapeHtml(row.companyName || "—")}</strong><small>${escapeHtml(row.modelName || "Model yok")}</small></td>
      <td>${number(row.quantity)}<small>${escapeHtml(row.unit || "ADET")}</small></td>
      <td><input data-field="producedNetQuantity" type="number" min="0" value="${Number(row.producedNetQuantity || 0)}"></td>
      <td><input data-field="outgoingDispatchQuantity" type="number" min="0" value="${Number(row.outgoingDispatchQuantity || 0)}"><small>Kalan ${number(c.outgoingRemaining)}</small></td>
      <td><input data-field="invoicedQuantity" type="number" min="0" value="${Number(row.invoicedQuantity || 0)}"><small>Kalan ${number(c.invoiceRemaining)}</small></td>
      <td><input data-field="nonBillableQuantity" type="number" min="0" value="${Number(row.nonBillableQuantity || 0)}"><small>Test / numune</small></td>
      <td>${rowBadge(row)}<small>Kapanmayan ${number(c.sourceClosingRemaining)}</small></td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button data-action="save">Adetleri Kaydet</button>
          <button data-action="model">Model</button>
          ${row.customerDispatchMissing ? '<button data-action="dispatch-link" class="warning">İrsaliye Bağla</button>' : ''}
          ${row.companyRole !== "SUPPLIER" && Number(c.outgoingRemaining || 0) > 0 ? '<button data-action="outgoing" class="primary">İrsaliye Oluştur</button>' : ''}
        </div>
      </td>
    </tr>`;
  }).join("") : '<tr><td colspan="10"><div class="ky-isnet-pool-empty">Kaynak havuzunda kayıt bulunamadı.</div></td></tr>';
}

async function openWorkbench() {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "ky-isnet-pool-overlay";
  overlay.innerHTML = `<section class="ky-isnet-pool-modal" role="dialog" aria-modal="true">
    <header class="ky-isnet-pool-head"><div><small>İŞNET · ANALİZ VE EŞLEŞTİRME</small><h2>Kaynak Havuzu</h2><p>İşNet, manuel PDF ve irsaliyesiz kayıtları model–imalat–irsaliye–fatura zincirinde takip edin.</p></div><div class="ky-isnet-pool-head-actions"><button class="refresh">Yenile</button><button class="close">Kapat</button></div></header>
    <div class="ky-isnet-pool-toolbar"><input type="search" name="search" placeholder="Firma, model, belge no veya sipariş ara"><select name="status"><option value="">Tüm durumlar</option><option value="MODEL_PENDING">Model bekleyen</option><option value="READY_FOR_PRODUCTION">İşleme hazır</option><option value="PARTIAL">Kısmi</option><option value="READY_FOR_INVOICE">Fatura bekleyen</option><option value="COMPLETED">Tamamlanan</option><option value="NON_BILLABLE_SUPPLIER">Tedarikçi</option></select><button class="apply">Filtrele</button></div>
    <div class="ky-isnet-pool-summary"></div><div class="ky-isnet-pool-status"></div>
    <div class="ky-isnet-pool-table-wrap"><table class="ky-isnet-pool-table"><thead><tr><th>Tarih / kaynak</th><th>Belge / sipariş</th><th>Firma / model</th><th>Kaynak adet</th><th>İmalat net</th><th>Giden irsaliye</th><th>Faturalanan</th><th>Test / ücretsiz</th><th>Durum</th><th>İşlem</th></tr></thead><tbody></tbody></table></div>
  </section>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("tbody");
  const summary = overlay.querySelector(".ky-isnet-pool-summary");
  const status = overlay.querySelector(".ky-isnet-pool-status");
  const search = overlay.querySelector('[name="search"]');
  const statusFilter = overlay.querySelector('[name="status"]');

  const close = () => overlay.remove();
  overlay.querySelector(".close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  async function load() {
    status.className = "ky-isnet-pool-status";
    status.textContent = "Kayıtlar yükleniyor…";
    try {
      const result = await getIsnetSourceIntakes({ search: search.value, status: statusFilter.value });
      const rows = Array.isArray(result) ? result : result?.items || result?.rows || [];
      renderRows(body, rows);
      const count = (key) => rows.filter((row) => row.workflowStatus === key).length;
      summary.innerHTML = [
        ["TOPLAM", rows.length], ["MODEL BEKLEYEN", count("MODEL_PENDING")], ["İŞLEME HAZIR", count("READY_FOR_PRODUCTION")], ["KISMİ", count("PARTIAL")], ["FATURA BEKLEYEN", count("READY_FOR_INVOICE")], ["TAMAMLANAN", count("COMPLETED")],
      ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
      status.textContent = `${rows.length} kayıt gösteriliyor.`;
    } catch (error) {
      status.className = "ky-isnet-pool-status error";
      status.textContent = error?.message || "Kaynak havuzu alınamadı.";
    }
  }

  overlay.querySelector(".refresh").addEventListener("click", load);
  overlay.querySelector(".apply").addEventListener("click", load);
  search.addEventListener("keydown", (event) => { if (event.key === "Enter") load(); });

  body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("tr[data-id]");
    const id = row?.dataset.id;
    if (!id) return;
    status.className = "ky-isnet-pool-status";
    status.textContent = "İşlem kaydediliyor…";
    try {
      if (button.dataset.action === "save") {
        const payload = {};
        row.querySelectorAll("input[data-field]").forEach((input) => { payload[input.dataset.field] = Number(input.value || 0); });
        await updateIsnetSourceIntakeQuantities(id, payload);
      }
      if (button.dataset.action === "model") {
        const modelName = window.prompt("Model adı", row.children[2].querySelector("small")?.textContent || "");
        if (modelName === null) return;
        const modelId = window.prompt("Model ID (varsa)", "") || "";
        await assignIsnetSourceIntakeModel(id, { modelId, modelName });
      }
      if (button.dataset.action === "dispatch-link") {
        const customerDispatchNo = window.prompt("Müşteri irsaliye numarası");
        if (!customerDispatchNo) return;
        const ettn = window.prompt("ETTN (varsa)", "") || "";
        await linkCustomerDispatchToSourceIntake(id, { customerDispatchNo, ettn });
      }
      if (button.dataset.action === "outgoing") {
        const quantity = Number(window.prompt("Bu giden irsaliyede gönderilecek adet", "") || 0);
        if (!(quantity > 0)) return;
        const note = window.prompt("İrsaliye notu", "") || "";
        const result = await createOutgoingDispatchFromSourceIntake(id, { quantity, note });
        window.dispatchEvent(new CustomEvent("kyerp:isnet-outgoing-draft-ready", { detail: result }));
      }
      status.className = "ky-isnet-pool-status success";
      status.textContent = "İşlem kaydedildi.";
      await load();
    } catch (error) {
      status.className = "ky-isnet-pool-status error";
      status.textContent = error?.message || "İşlem kaydedilemedi.";
    }
  });

  await load();
}

function installButton() {
  const page = document.querySelector(".isnet-page");
  if (!page) return;
  const actions = page.querySelector(".isnet-hero__actions");
  if (!actions || actions.querySelector(".ky-isnet-pool-launch")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ky-isnet-pool-launch";
  button.textContent = "Kaynak Havuzu";
  button.addEventListener("click", openWorkbench);
  actions.prepend(button);
}

export function installIsnetSourceWorkbench() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__kyIsnetSourceWorkbenchInstalled) return;
  window.__kyIsnetSourceWorkbenchInstalled = true;
  injectStyle();
  installButton();
  window.addEventListener("kyerp:isnet-source-created", () => {
    if (document.getElementById(OVERLAY_ID)) openWorkbench();
  });
  const observer = new MutationObserver(() => installButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
