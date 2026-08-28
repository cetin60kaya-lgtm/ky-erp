(() => {
  const ROOT_SELECTOR = ".admin-users-page";
  const TAB_ID = "kyerp-admin-users-tabs";
  const STYLE_HOOK = "kyerp-admin-users-layout-ready";

  const state = {
    tab: "users",
    editorOpen: false,
    recoveryContactOpen: false,
    recoveryQuestionsOpen: false,
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

  function setTab(root, tab) {
    state.tab = tab;
    const workspace = root.querySelector(".admin-users-workspace");
    const recovery = root.querySelector(".owner-recovery-panel");
    const permissions = root.querySelector(".permissions-panel");
    const sessions = [...root.querySelectorAll(":scope > .security-panel")].find((panel) =>
      byText(panel, "h3", "Aktif Oturumlar"),
    );

    setVisible(workspace, tab === "users");
    setVisible(recovery, tab === "security");
    setVisible(permissions, tab === "permissions");
    setVisible(sessions, tab === "sessions");

    const tabs = root.querySelector(`#${TAB_ID}`);
    tabs?.querySelectorAll("button[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
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
      ["sessions", "Aktif Oturumlar"],
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
      let next = questions.nextElementSibling;
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

  function enhance() {
    if (!location.pathname.includes("/admin/kullanicilar")) return;
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;

    root.classList.add(STYLE_HOOK);
    ensureTabs(root);
    ensureEditorAccordion(root);
    ensureRecoveryAccordions(root);
    setTab(root, state.tab);
  }

  const observer = new MutationObserver(() => window.requestAnimationFrame(enhance));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", enhance);
  window.addEventListener("pageshow", enhance);
  enhance();
})();
