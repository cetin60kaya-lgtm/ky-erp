(() => {
  const IOS_MARK = "kyerp-ios-security-preflight-v1";

  function isIos() {
    const ua = String(navigator.userAgent || "");
    return /iPhone|iPad|iPod/i.test(ua)
      || (String(navigator.platform || "") === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
  }

  function isStandalone() {
    return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
  }

  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), 5200);
  }

  function showInstallGuide() {
    const panel = document.querySelector("#installPanel");
    const note = document.querySelector("#iosInstallNote");
    const title = document.querySelector("#installTitle");
    const copy = document.querySelector("#installCopy");
    const state = document.querySelector("#installStateText");
    panel?.classList.remove("hidden");
    note?.classList.remove("hidden");
    if (title) title.textContent = "iPhone'da Safari ile KY Güvenlik'i Kur";
    if (copy) copy.textContent = "Safari → Paylaş → Ana Ekrana Ekle → Ekle. Ardından KY Güvenlik ikonundan açın.";
    if (state) state.textContent = "Safari kurulumu bekleniyor";
    try { panel?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
  }

  async function requestIosPermissionAndReplay(button) {
    const previousText = button.textContent;
    button.disabled = true;
    button.textContent = "iPhone bildirim izni bekleniyor...";
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showToast("KY Güvenlik bildirim izni verilmedi. iPhone Ayarlar → Bildirimler → KY Güvenlik bölümünden izin verin.");
        return;
      }
      showToast("iPhone bildirim izni hazır. Güvenlik bağlantısı tamamlanıyor...");
      button.disabled = false;
      button.textContent = previousText;
      button.click();
    } catch (error) {
      showToast(error?.message || "iPhone bildirim izni açılamadı.");
    } finally {
      if (button.disabled) button.disabled = false;
      if (button.textContent === "iPhone bildirim izni bekleniyor...") button.textContent = previousText;
    }
  }

  function preflight(event) {
    const button = event.target?.closest?.("#connectButton,#repairButton");
    if (!button || !isIos()) return;

    if (!isStandalone()) {
      showInstallGuide();
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast("Bu iPhone sürümü KY Güvenlik bildirimlerini desteklemiyor. iOS'u güncelleyin ve uygulamayı Ana Ekrandan açın.");
      return;
    }

    if (Notification.permission !== "default") return;

    // Apple, Web Push izninin doğrudan bir kullanıcı dokunuşundan istenmesini şart koşar.
    // Uygulamanın asenkron kurulum adımları başlamadan önce izin penceresini burada açıyoruz.
    event.preventDefault();
    event.stopImmediatePropagation();
    requestIosPermissionAndReplay(button);
  }

  if (!isIos()) return;
  document.documentElement.dataset.kyerpIosSecurity = isStandalone() ? "standalone" : "safari";
  document.documentElement.dataset.kyerpIosSecurityPreflight = IOS_MARK;
  document.addEventListener("click", preflight, true);
})();
