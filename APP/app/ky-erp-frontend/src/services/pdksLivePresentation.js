// PDKS API readiness is not terminal readiness or confirmed employee absence.
export function pdksLivePresentation(metrics = {}, error = "", lastRefresh = null) {
  const fresh = Boolean(lastRefresh) && !error;
  const total = Math.max(0, Number(metrics.deviceCount || 0));
  const online = Math.max(0, Number(metrics.onlineDevices || 0));
  const terminalsOffline = fresh && total > 0 && online === 0;
  const provisionalAbsence = terminalsOffline && Number(metrics.activePersonnel || 0) > 0 && Number(metrics.absent || 0) > 0;
  return {
    fresh,
    terminalsOffline,
    provisionalAbsence,
    badge: error ? "API hatası" : !lastRefresh ? "Bağlanıyor" : terminalsOffline ? "API güncel · terminal çevrimdışı" : "API güncel",
    absenceLabel: provisionalAbsence ? "Devamsızlık · teyitsiz" : "Bugün Devamsız",
    absenceValue: !fresh || provisionalAbsence ? "—" : Number(metrics.absent || 0),
    absenceDetail: provisionalAbsence
      ? "Terminal çevrimdışı. Sunucudaki " + Number(metrics.absent || 0) + " devamsızlık adayı henüz kart kayıtlarıyla doğrulanmadı; resmi puantaj sayılmamalı."
      : "",
  };
}
