(() => {
  const VERSION = '20260919-1245-server-truth-v3';
  const LEGACY_FAST_CHECK_KEY = 'ikDailyFastCheck';
  try { localStorage.removeItem(LEGACY_FAST_CHECK_KEY); } catch {}

  const style = document.createElement('style');
  style.id = 'kyerp-daily-device-consistency-style';
  style.textContent = `
    .kyik-safe-row-check,.kyik-quick-check,.quick-check,.kyik-quick-legend .checked{display:none!important}
  `;
  document.head.appendChild(style);

  function cleanLocalOnlyControls() {
    document.querySelectorAll('.kyik-quick-stats > div').forEach((card) => {
      const label = String(card.querySelector('span')?.textContent || '').trim();
      if (label === 'Kontrol Edildi' || label === 'Kontrol Bekleyen') card.style.display = 'none';
    });
    document.querySelectorAll('.kyik-quick-footer span').forEach((node) => {
      const value = String(node.textContent || '');
      if (value.includes('yeşil') || value.includes('Kontrol edildi')) {
        node.textContent = 'Kayıt doğrulaması cihazdan bağımsız Günlük İşlem Geçmişi üzerinden yapılır.';
      }
    });
    document.documentElement.dataset.kyerpDailyServerTruth = VERSION;
  }

  const observer = new MutationObserver(cleanLocalOnlyControls);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  cleanLocalOnlyControls();
})();
