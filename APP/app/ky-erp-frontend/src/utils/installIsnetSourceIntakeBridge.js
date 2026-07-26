import {
  createIsnetManualPdfSourceIntake,
  createIsnetNoDispatchSourceIntake,
  createIsnetPortalSourceIntake,
} from "../services/isnetSourceIntakeApi";
import { getIsnetLocalDocuments } from "../services/isnetApi";

const STYLE_ID = "ky-isnet-source-intake-style";
const OVERLAY_ID = "ky-isnet-source-intake-overlay";

function fiveMonthsAgo() {
  const date = new Date();
  date.setMonth(date.getMonth() - 5);
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ky-isnet-source-launch{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:8px;padding:9px 13px;background:#f97316;color:#fff;font-weight:700;cursor:pointer}
    .ky-isnet-source-launch:hover{background:#ea580c}
    .ky-isnet-source-overlay{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.56);display:grid;place-items:center;padding:18px}
    .ky-isnet-source-modal{width:min(1040px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:auto;background:#f8fafc;border-radius:16px;box-shadow:0 24px 80px rgba(15,23,42,.35)}
    .ky-isnet-source-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px;background:linear-gradient(135deg,#12345b,#145da0);color:#fff;border-radius:16px 16px 0 0}
    .ky-isnet-source-head h2{margin:2px 0 5px;font-size:22px}.ky-isnet-source-head p{margin:0;opacity:.86}
    .ky-isnet-source-close{border:0;background:rgba(255,255,255,.16);color:#fff;width:34px;height:34px;border-radius:8px;font-size:20px;cursor:pointer}
    .ky-isnet-source-body{padding:18px 22px 22px}
    .ky-isnet-source-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}
    .ky-isnet-source-type{border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:14px;text-align:left;cursor:pointer}.ky-isnet-source-type strong{display:block;color:#0f172a;margin-bottom:4px}.ky-isnet-source-type span{font-size:12px;color:#64748b}.ky-isnet-source-type.active{border-color:#0d6aa8;box-shadow:0 0 0 2px rgba(13,106,168,.12);background:#eff8ff}
    .ky-isnet-source-portal{display:none;border:1px solid #dbe4ee;border-radius:12px;background:#fff;padding:12px;margin-bottom:14px}.ky-isnet-source-portal.active{display:block}
    .ky-isnet-source-portal-list{max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px}.ky-isnet-source-portal-row{display:grid;grid-template-columns:170px 1fr 110px;gap:8px;width:100%;border:0;border-bottom:1px solid #edf2f7;background:#fff;padding:9px;text-align:left;cursor:pointer}.ky-isnet-source-portal-row:hover{background:#eff8ff}.ky-isnet-source-portal-row.selected{background:#dff2ff}
    .ky-isnet-source-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ky-isnet-source-grid label,.ky-isnet-source-note{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#334155}.ky-isnet-source-grid input,.ky-isnet-source-grid select,.ky-isnet-source-note textarea,.ky-isnet-source-portal input{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:9px 10px;font:inherit;color:#0f172a}
    .ky-isnet-source-file{grid-column:span 2}.ky-isnet-source-note{margin-top:12px}.ky-isnet-source-warning{margin:0 0 12px;padding:10px 12px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:9px;font-size:13px;display:none}.ky-isnet-source-warning.active{display:block}
    .ky-isnet-source-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:16px}.ky-isnet-source-status{margin-right:auto;font-size:13px;color:#475569}.ky-isnet-source-status.error{color:#b91c1c}.ky-isnet-source-status.success{color:#15803d}.ky-isnet-source-actions button{border:1px solid #cbd5e1;border-radius:8px;padding:9px 14px;background:#fff;cursor:pointer;font-weight:700}.ky-isnet-source-actions .primary{border-color:#0d6aa8;background:#0d6aa8;color:#fff}
    @media(max-width:850px){.ky-isnet-source-types{grid-template-columns:1fr}.ky-isnet-source-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ky-isnet-source-portal-row{grid-template-columns:1fr}.ky-isnet-source-file{grid-column:span 2}}
    @media(max-width:520px){.ky-isnet-source-grid{grid-template-columns:1fr}.ky-isnet-source-file{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

async function loadPortalRows(container, state) {
  container.innerHTML = '<div style="padding:12px">Yerel İşNet kayıtları okunuyor…</div>';
  try {
    const result = await getIsnetLocalDocuments({
      startDate: fiveMonthsAgo(),
      endDate: today(),
      page: 1,
      pageSize: 100,
    });
    state.portalRows = (result?.documents || []).filter(
      (row) => row.kind === "dispatch" && row.direction === "incoming",
    );
    renderPortalRows(container, state, "");
  } catch (error) {
    container.innerHTML = `<div style="padding:12px;color:#b91c1c">${escapeHtml(error?.message || "İşNet kayıtları okunamadı.")}</div>`;
  }
}

function renderPortalRows(container, state, search) {
  const query = String(search || "").trim().toLocaleLowerCase("tr-TR");
  const rows = state.portalRows
    .filter((row) => !query || [row.documentNo, row.partnerName, row.modelName, row.orderNo]
      .join(" ")
      .toLocaleLowerCase("tr-TR")
      .includes(query))
    .slice(0, 50);
  container.innerHTML = rows.length
    ? rows.map((row, index) => `
      <button type="button" class="ky-isnet-source-portal-row${state.selectedPortalIndex === index ? " selected" : ""}" data-index="${index}">
        <strong>${escapeHtml(row.documentNo || "Belge no yok")}</strong>
        <span>${escapeHtml(row.partnerName || "Firma yok")}</span>
        <small>${escapeHtml(row.dateText || row.issueDate || "")}</small>
      </button>`).join("")
    : '<div style="padding:12px">Uygun gelen irsaliye bulunamadı.</div>';
  container.querySelectorAll("[data-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const visibleRow = rows[Number(button.dataset.index)];
      if (!visibleRow) return;
      state.selectedPortal = visibleRow;
      state.selectedPortalIndex = Number(button.dataset.index);
      const modal = container.closest(".ky-isnet-source-modal");
      modal.querySelector('[name="companyName"]').value = visibleRow.partnerName || "";
      modal.querySelector('[name="customerDispatchNo"]').value = visibleRow.documentNo || "";
      modal.querySelector('[name="issueDate"]').value = visibleRow.dateIso || visibleRow.issueDate || today();
      modal.querySelector('[name="orderNo"]').value = visibleRow.orderNo || "";
      modal.querySelector('[name="modelName"]').value = visibleRow.modelName || visibleRow.modelGuess || "";
      modal.querySelector('[name="quantity"]').value = visibleRow.quantity || "";
      renderPortalRows(container, state, search);
    });
  });
}

function openModal() {
  document.getElementById(OVERLAY_ID)?.remove();
  const state = { sourceType: "portal", portalRows: [], selectedPortal: null, selectedPortalIndex: -1 };
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "ky-isnet-source-overlay";
  overlay.innerHTML = `
    <section class="ky-isnet-source-modal" role="dialog" aria-modal="true" aria-label="İşNet yeni iş akışı">
      <header class="ky-isnet-source-head"><div><small>İŞNET · YENİ KAYNAK KAYDI</small><h2>İrsaliye / model iş akışı</h2><p>İşNet belgesi, manuel PDF veya irsaliyesiz müşteri talimatını aynı zincire alın.</p></div><button type="button" class="ky-isnet-source-close">×</button></header>
      <form class="ky-isnet-source-body">
        <div class="ky-isnet-source-types">
          <button type="button" class="ky-isnet-source-type active" data-source="portal"><strong>İşNet Belgesi</strong><span>İşNet'ten gelen müşteri irsaliyesini seç.</span></button>
          <button type="button" class="ky-isnet-source-type" data-source="manual-pdf"><strong>Manuel PDF</strong><span>E-posta veya WhatsApp ile gelen irsaliyeyi yükle.</span></button>
          <button type="button" class="ky-isnet-source-type" data-source="no-dispatch"><strong>İrsaliyesiz Talimat</strong><span>“Şu model adına kes” talimatını kaydet.</span></button>
        </div>
        <div class="ky-isnet-source-portal active"><input type="search" name="portalSearch" placeholder="Belge no, firma veya model ara"><div class="ky-isnet-source-portal-list"></div></div>
        <p class="ky-isnet-source-warning">Müşteri irsaliyesi olmadan yalnız KY ERP iç referansı oluşturulur; sahte müşteri irsaliye numarası üretilmez.</p>
        <div class="ky-isnet-source-grid">
          <label>Firma<input name="companyName" required placeholder="Müşteri firma"></label>
          <label>Tarih<input type="date" name="issueDate" required value="${today()}"></label>
          <label>Müşteri irsaliye no<input name="customerDispatchNo" placeholder="Belge numarası"></label>
          <label>Sipariş / piyon<input name="orderNo"></label>
          <label>Model adı<input name="modelName" required placeholder="Mevcut veya yeni model"></label>
          <label>Model ID<input name="modelId" placeholder="Seçili model varsa"></label>
          <label>Adet<input type="number" min="1" step="1" name="quantity" required></label>
          <label>Birim<select name="unit"><option value="ADET">Adet</option><option value="KILOGRAM">Kilogram</option><option value="METRE">Metre</option></select></label>
          <label class="ky-isnet-source-file" style="display:none">PDF<input type="file" name="pdf" accept="application/pdf,.pdf"></label>
        </div>
        <label class="ky-isnet-source-note">Talimat / açıklama<textarea name="note" rows="3" placeholder="Renk, baskı bölgesi, özel talimat veya not"></textarea></label>
        <footer class="ky-isnet-source-actions"><span class="ky-isnet-source-status"></span><button type="button" class="cancel">Vazgeç</button><button type="submit" class="primary">İş Akışını Oluştur</button></footer>
      </form>
    </section>`;
  document.body.appendChild(overlay);

  const modal = overlay.querySelector(".ky-isnet-source-modal");
  const form = overlay.querySelector("form");
  const status = overlay.querySelector(".ky-isnet-source-status");
  const portalBox = overlay.querySelector(".ky-isnet-source-portal");
  const portalList = overlay.querySelector(".ky-isnet-source-portal-list");
  const warning = overlay.querySelector(".ky-isnet-source-warning");
  const pdfLabel = overlay.querySelector(".ky-isnet-source-file");
  const dispatchInput = overlay.querySelector('[name="customerDispatchNo"]');

  const close = () => overlay.remove();
  overlay.querySelector(".ky-isnet-source-close").addEventListener("click", close);
  overlay.querySelector(".cancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('[name="portalSearch"]').addEventListener("input", (event) => renderPortalRows(portalList, state, event.target.value));

  overlay.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sourceType = button.dataset.source;
      overlay.querySelectorAll("[data-source]").forEach((item) => item.classList.toggle("active", item === button));
      portalBox.classList.toggle("active", state.sourceType === "portal");
      warning.classList.toggle("active", state.sourceType === "no-dispatch");
      pdfLabel.style.display = state.sourceType === "manual-pdf" ? "flex" : "none";
      dispatchInput.disabled = state.sourceType === "no-dispatch";
      if (state.sourceType === "no-dispatch") dispatchInput.value = "";
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.className = "ky-isnet-source-status";
    status.textContent = "Kaydediliyor…";
    const data = new FormData(form);
    const payload = {
      companyName: String(data.get("companyName") || "").trim(),
      companyRole: "CUSTOMER",
      modelId: String(data.get("modelId") || "").trim(),
      modelName: String(data.get("modelName") || "").trim(),
      orderNo: String(data.get("orderNo") || "").trim(),
      customerDispatchNo: String(data.get("customerDispatchNo") || "").trim(),
      issueDate: String(data.get("issueDate") || ""),
      quantity: Number(data.get("quantity") || 0),
      unit: String(data.get("unit") || "ADET"),
      note: String(data.get("note") || "").trim(),
    };
    try {
      let result;
      if (state.sourceType === "portal") {
        if (!state.selectedPortal) throw new Error("Önce İşNet gelen irsaliyesini seçin.");
        result = await createIsnetPortalSourceIntake({
          ...payload,
          portalDocumentId: state.selectedPortal.id,
          ettn: state.selectedPortal.ettn || state.selectedPortal.uuid || "",
        });
      } else if (state.sourceType === "manual-pdf") {
        const pdfFile = data.get("pdf");
        if (!(pdfFile instanceof File) || !pdfFile.size) throw new Error("PDF dosyasını seçin.");
        result = await createIsnetManualPdfSourceIntake({ ...payload, pdfFile });
      } else {
        result = await createIsnetNoDispatchSourceIntake(payload);
      }
      status.className = "ky-isnet-source-status success";
      status.textContent = `${result.internalReference || "Kayıt"} oluşturuldu.`;
      window.dispatchEvent(new CustomEvent("kyerp:isnet-source-created", { detail: result }));
      window.setTimeout(close, 900);
    } catch (error) {
      status.className = "ky-isnet-source-status error";
      status.textContent = error?.message || "Kayıt oluşturulamadı.";
    }
  });

  loadPortalRows(portalList, state);
  modal.querySelector('[name="companyName"]').focus();
}

function installButton() {
  const page = document.querySelector(".isnet-page");
  if (!page) return;
  const actions = page.querySelector(".isnet-hero__actions");
  if (!actions || actions.querySelector(".ky-isnet-source-launch")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ky-isnet-source-launch";
  button.textContent = "+ Yeni İş Akışı";
  button.addEventListener("click", openModal);
  actions.prepend(button);
}

export function installIsnetSourceIntakeBridge() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__kyIsnetSourceIntakeBridgeInstalled) return;
  window.__kyIsnetSourceIntakeBridgeInstalled = true;
  injectStyle();
  installButton();
  const observer = new MutationObserver(() => installButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
