(() => {
  const VERSION = '20260919-0920-weekly-defaults';
  const nativeFetch = window.fetch.bind(window);
  const pad = (value) => String(value).padStart(2, '0');
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const weekBounds = () => {
    const now = new Date();
    const weekday = now.getDay() || 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday + 1);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { startDate: iso(monday), endDate: iso(sunday) };
  };
  window.fetch = function kyWeeklyDefaultGuard(input, init) {
    const rawUrl = input instanceof Request ? input.url : String(input || '');
    let url;
    try { url = new URL(rawUrl, location.href); } catch { return nativeFetch(input, init); }
    const path = url.pathname;
    const target = /\/ik\/daily-attendance\/(weekly-summary|payment-slips)$/.test(path);
    if (!target || url.searchParams.has('startDate') || url.searchParams.has('start') || url.searchParams.has('endDate') || url.searchParams.has('end')) {
      return nativeFetch(input, init);
    }
    const bounds = weekBounds();
    url.searchParams.set('startDate', bounds.startDate);
    url.searchParams.set('endDate', bounds.endDate);
    if (input instanceof Request) return nativeFetch(new Request(url.toString(), input), init);
    return nativeFetch(url.toString(), init);
  };
  document.documentElement.dataset.kyerpWeeklyDefaultGuard = VERSION;
})();
