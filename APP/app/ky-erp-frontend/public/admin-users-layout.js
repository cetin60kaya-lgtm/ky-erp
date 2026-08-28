(() => {
  const ROOT_SELECTOR = ".admin-users-page";
  const TAB_ID = "kyerp-admin-users-tabs";
  const STYLE_HOOK = "kyerp-admin-users-layout-ready";
  const AUTH_TOKEN_KEY = "kyerp_auth_token";
  const API_ORIGIN = "https://api.kyerp.net";

  const state = {
    tab: "users",
    editorOpen: false,
    recoveryContactOpen: false,
    recoveryQuestionsOpen: false,
    sessionHistoryLoading: false,
    sessionHistoryLoadedAt: 0,
  };

  function byText(root, selector, text) {
    return [...root.querySelectorAll(selector)].find((el) =>
      String(el.textContent || "").toLocaleLowerCase("tr-TR").includes(text.toLocaleLowerCase("tr-TR")),
    );
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("kyerp-section-hidden", !visible);
  }

  function sessionPanel(root) {
    return [...root.querySelectorAll(":scope > .security-panel")].find((panel) =>
      byText(panel, "h3", "Aktif Oturumlar"),
    );
  }

  function setTab(root, tab) {
    state.tab = tab;
    const workspace = root.querySelector(".admin-users-workspace");
    const recovery = root.querySelector(".owner-recovery-panel");
    const permissions = root.querySelector(".permissions-panel");
    const sessions = sessionPanel(root);
    const history = root.querySelector("[data-kyerp-session-history]");

    setVisible(workspace, tab === "users");
    setVisible(recovery, tab === "security");
    setVisible(permissions, tab === "permissions");
    setVisible(sessions, tab === "sessions");
    setVisible(history, tab === "sessions");

    const tabs = root.querySelector(`#${TAB_ID}`);
    tabs?.querySelectorAll("button[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (tab === "sessions") loadSessionHistory(root, Date.now() - state.sessionHistoryLoadedAt > 15000);
  }

  function ensureTabs(root) {
    if (root.querySelector(`#${TAB_ID}`)) return;
    const summary = root.querySelector(":scope > .security-summary");
    const tabs = document.createElement("nav");
    tabs.id = TAB_ID;
    tabs.className = "kyerp-admin-tabs";
    tabs.setAttribute("aria-label", "Kullanıcı yönetimi bölümleri");

    [
      ["users", "Kullanıcılar"],
      ["security", "Güvenlik & Kurtarma"],
      ["permissions", "Modül Yetkileri"],
      ["sessions", "Aktif Oturumlar & Log"],
    ].forEach(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = key;
      button.textContent = label;
      button.addEventListener("click", () => setTab(root, key));
      tabs.appendChild(button);
    });

    if (summary?.nextSibling) root.insertBefore(tabs, summary.nextSibling);
    else root.appendChild(tabs);
  }

  function ensureEditorAccordion(root) {
    const editor = root.querySelector(".user-editor");
    const head = editor?.querySelector(":scope > .editor-head");
    const form = editor?.querySelector(":scope > .user-form");
    if (!editor || !head || !form) return;

    let toggle = head.querySelector(".kyerp-editor-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "kyerp-editor-toggle";
      toggle.addEventListener("click", () => {
        state.editorOpen = !state.editorOpen;
        applyEditorState(editor, toggle);
      });
      head.appendChild(toggle);
    }
    applyEditorState(editor, toggle);

    if (editor.dataset.kyerpBound !== "1") {
      editor.dataset.kyerpBound = "1";
      const directory = root.querySelector(".users-directory");
      directory?.addEventListener("click", (event) => {
        if (event.target.closest(".list-row") || event.target.closest(".compact")) {
          state.editorOpen = true;
          window.setTimeout(() => {
            const nextEditor = root.querySelector(".user-editor");
            const nextToggle = nextEditor?.querySelector(".kyerp-editor-toggle");
            if (nextEditor && nextToggle) applyEditorState(nextEditor, nextToggle);
          }, 0);
        }
      });

      const headerNew = byText(root, ".admin-header-actions button", "Yeni Kullanıcı");
      headerNew?.addEventListener("click", () => {
        state.tab = "users";
        state.editorOpen = true;
        window.setTimeout(() => enhance(), 0);
      });
    }
  }

  function applyEditorState(editor, toggle) {
    editor.classList.toggle("kyerp-editor-collapsed", !state.editorOpen);
    toggle.textContent = state.editorOpen ? "Formu Kapat" : "Formu Aç";
    toggle.setAttribute("aria-expanded", state.editorOpen ? "true" : "false");
  }

  function ensureRecoveryAccordions(root) {
    const panel = root.querySelector(".owner-recovery-panel");
    if (!panel) return;
    const head = panel.querySelector(":scope > .panel-head");
    if (!head) return;

    let actions = head.querySelector(".kyerp-recovery-accordion-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "kyerp-recovery-accordion-actions";

      const contactButton = document.createElement("button");
      contactButton.type = "button";
      contactButton.dataset.group = "contact";
      contactButton.addEventListener("click", () => {
        state.recoveryContactOpen = !state.recoveryContactOpen;
        applyRecoveryState(panel);
      });

      const questionButton = document.createElement("button");
      questionButton.type = "button";
      questionButton.dataset.group = "questions";
      questionButton.addEventListener("click", () => {
        state.recoveryQuestionsOpen = !state.recoveryQuestionsOpen;
        applyRecoveryState(panel);
      });

      actions.append(contactButton, questionButton);
      head.appendChild(actions);
    }
    applyRecoveryState(panel);
  }

  function applyRecoveryState(panel) {
    const contactParts = [
      panel.querySelector(".owner-recovery-stepup"),
      panel.querySelector(".owner-contact-grid"),
      panel.querySelector(".owner-contact-verify"),
    ];
    contactParts.forEach((part) => setVisible(part, state.recoveryContactOpen));

    const questions = panel.querySelector(".owner-questions-grid");
    setVisible(questions, state.recoveryQuestionsOpen);
    if (questions) {
      const next = questions.nextElementSibling;
      if (next?.classList.contains("form-actions")) setVisible(next, state.recoveryQuestionsOpen);
    }

    const actions = panel.querySelector(".kyerp-recovery-accordion-actions");
    const contactButton = actions?.querySelector('[data-group="contact"]');
    const questionButton = actions?.querySelector('[data-group="questions"]');
    if (contactButton) {
      contactButton.textContent = state.recoveryContactOpen ? "İletişim Doğrulama ▲" : "İletişim Doğrulama ▼";
      contactButton.classList.toggle("active", state.recoveryContactOpen);
    }
    if (questionButton) {
      questionButton.textContent = state.recoveryQuestionsOpen ? "3 Güvenlik Sorusu ▲" : "3 Güvenlik Sorusu ▼";
      questionButton.classList.toggle("active", state.recoveryQuestionsOpen);
    }
  }

  function dateText(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
  }

  function durationText(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    if (total < 60) return `${total} sn`;
    if (total < 3600) return `${Math.floor(total / 60)} dk`;
    return `${Math.floor(total / 3600)} sa ${Math.floor((total % 3600) / 60)} dk`;
  }

  function cell(row, value, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    if (value instanceof Node) td.appendChild(value);
    else td.textContent = value == null || value === "" ? "-" : String(value);
    row.appendChild(td);
    return td;
  }

  function renderSessionHistory(root, rows) {
    const panel = ensureSessionHistoryPanel(root);
    if (!panel) return;
    const body = panel.querySelector("[data-history-body]");
    const count = panel.querySelector("[data-history-count]");
    if (!body) return;
    body.replaceChildren();
    if (count) count.textContent = `${rows.length} kayıt`;

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 9;
      td.className = "kyerp-history-empty";
      td.textContent = "Henüz oturum geçmişi bulunmuyor.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    rows.forEach((item) => {
      const tr = document.createElement("tr");
      tr.className = item.active ? "kyerp-session-active-row" : "";

      const status = document.createElement("span");
      status.className = `kyerp-session-status ${item.active ? "active" : "closed"}`;
      status.textContent = item.active ? "AKTİF" : "KAPALI";
      cell(tr, status);

      const user = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = item.fullName || item.username || "Kullanıcı";
      const small = document.createElement("small");
      small.textContent = item.email || `@${item.username || "-"}`;
      user.append(strong, small);
      cell(tr, user, "kyerp-history-user");

      cell(tr, item.verificationMethod || item.policy || "-");
      cell(tr, dateText(item.createdAt));
      cell(tr, dateText(item.lastSeenAt));
      cell(tr, item.active ? "-" : dateText(item.endedAt));
      cell(tr, durationText(item.durationSeconds));

      const device = document.createElement("div");
      const d1 = document.createElement("span");
      d1.textContent = item.deviceLabel || "Bilinmeyen cihaz";
      const d2 = document.createElement("small");
      d2.textContent = item.ipAddress || "IP yok";
      device.append(d1, d2);
      cell(tr, device, "kyerp-history-device");

      cell(tr, item.closeReason || (item.active ? "Aktif" : "Kapandı"));
      body.appendChild(tr);
    });
  }

  function ensureSessionHistoryPanel(root) {
    let history = root.querySelector("[data-kyerp-session-history]");
    const active = sessionPanel(root);
    if (!active) return null;
    if (history) return history;

    history = document.createElement("section");
    history.className = "admin-panel security-panel kyerp-session-history-panel";
    history.dataset.kyerpSessionHistory = "1";
    history.innerHTML = `
      <div class="panel-head">
        <div><h3>Oturum Geçmişi / Güvenlik Logu</h3><p>Aktif, kapatılmış ve süresi dolmuş oturumlar; giriş yöntemi, zaman, cihaz ve kapanış nedeni ile saklanır.</p></div>
        <div class="kyerp-history-actions"><span data-history-count>-</span><button type="button" data-history-refresh>Logu Yenile</button></div>
      </div>
      <div class="security-table-wrap kyerp-history-wrap">
        <table class="kyerp-history-table">
          <thead><tr><th>Durum</th><th>Kullanıcı</th><th>Doğrulama</th><th>Giriş</th><th>Son Hareket</th><th>Çıkış</th><th>Süre</th><th>Cihaz / IP</th><th>Kapanış / Neden</th></tr></thead>
          <tbody data-history-body><tr><td colspan="9" class="kyerp-history-empty">Log yükleniyor...</td></tr></tbody>
        </table>
      </div>`;
    active.insertAdjacentElement("afterend", history);
    history.querySelector("[data-history-refresh]")?.addEventListener("click", () => loadSessionHistory(root, true));
    return history;
  }

  async function loadSessionHistory(root, force = false) {
    const panel = ensureSessionHistoryPanel(root);
    if (!panel || state.sessionHistoryLoading) return;
    if (!force && state.sessionHistoryLoadedAt && Date.now() - state.sessionHistoryLoadedAt < 15000) return;

    const token = String(localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    if (!token) return;
    state.sessionHistoryLoading = true;
    const refresh = panel.querySelector("[data-history-refresh]");
    if (refresh) refresh.disabled = true;
    try {
      const response = await fetch(`${API_ORIGIN}/api/admin/security/session-history?limit=250&_ts=${Date.now()}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
        mode: "cors",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      renderSessionHistory(root, rows);
      state.sessionHistoryLoadedAt = Date.now();
    } catch (error) {
      const body = panel.querySelector("[data-history-body]");
      if (body) body.innerHTML = `<tr><td colspan="9" class="kyerp-history-empty">Oturum logu alınamadı: ${String(error?.message || "Hata").replace(/[<>]/g, "")}</td></tr>`;
    } finally {
      state.sessionHistoryLoading = false;
      if (refresh) refresh.disabled = false;
    }
  }

  function enhance() {
    if (!location.pathname.includes("/admin/kullanicilar")) return;
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;

    root.classList.add(STYLE_HOOK);
    ensureTabs(root);
    ensureEditorAccordion(root);
    ensureRecoveryAccordions(root);
    ensureSessionHistoryPanel(root);
    setTab(root, state.tab);
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(enhance));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", enhance);
  window.addEventListener("pageshow", enhance);
  enhance();
})();
