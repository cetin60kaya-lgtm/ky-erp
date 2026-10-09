// Salt okunur arayüz tanılama: Cloud cihaz heartbeat'i, agent'ın son işi ve senkron kanıtı.
// Bir PC'nin Remote Desktop ile çevrimiçi olması PDKS agent heartbeat'ini doğrulamaz.
export function analyzePdksDevice(device, latestJob = null, latestSync = null, now = Date.now()) {
  if (!device) return { state: "UNKNOWN", title: "Cihaz seçilmedi", detail: "Tanılama için cihaz seçin.", next: "" };
  const seen = Date.parse(String(device.lastSeenAt || ""));
  const sync = Date.parse(String(device.lastSyncAt || ""));
  const hasHeartbeat = Number.isFinite(seen);
  const lastHeartbeatMin = hasHeartbeat ? Math.max(0, Math.floor((now - seen) / 60000)) : null;
  const connected = Number(device.active) !== 0 && hasHeartbeat && lastHeartbeatMin < 5;
  const jobStatus = String(latestJob?.status || "").trim().toUpperCase();
  const syncStatus = String(latestSync?.status || "").trim().toUpperCase();
  const notes = [];
  if (Number(device.active) === 0) {
    return { state: "PASSIVE", title: "Cihaz pasif", detail: "Bu cihaz bulut tarafından pasif durumda. Yeni anahtar üretmeden önce mevcut kaydı kontrol edin.", next: "Cihazı yalnız yetkili yönetici, eski cihaz kaydını doğruladıktan sonra etkinleştirmeli.", lastHeartbeatMin };
  }
  if (!connected) {
    notes.push(hasHeartbeat ? "PDKS Agent son bağlantısı " + lastHeartbeatMin + " dakika önce." : "PDKS Agent bu kimlikle henüz heartbeat göndermedi.");
    if (["PENDING", "RUNNING"].includes(jobStatus)) notes.push("Bekleyen/çalışan senkron işi var; çevrimdışı agent işi alamaz veya sonucu iletemez.");
    if (jobStatus === "ERROR") notes.push("En son uzaktan eşitleme işi hata ile bitti.");
    return {
      state: "OFFLINE",
      title: "PDKS Agent buluta bağlı değil",
      detail: notes.join(" "),
      next: "DESEN bilgisayarında PDKS Agent çalışıyor mu, cihaz kimliği/anahtarı doğru mu, api.kyerp.net erişimi var mı kontrol edin. Yeni cihaz anahtarı oluşturmayın; mevcut log ve ayarı inceleyin.",
      lastHeartbeatMin,
    };
  }
  if (jobStatus === "ERROR") {
    return { state: "JOB_ERROR", title: "Agent bağlı, eşitleme işi başarısız", detail: "Heartbeat güncel; son cihaz işi hata ile tamamlanmış.", next: "Alt taraftaki Uzaktan İş Kuyruğu sonucunu ve Agent logunu kontrol edin.", lastHeartbeatMin };
  }
  if (!Number.isFinite(sync) || now - sync > 24 * 60 * 60000) {
    return {
      state: "SYNC_STALE", title: "Agent bağlı, kart senkronu güncel değil",
      detail: "Agent heartbeat gönderiyor ancak son kart senkronu 24 saatten eski veya hiç yok." + (["ERROR", "REJECTED"].includes(syncStatus) ? " Son senkron logunda hata var." : ""),
      next: "Agent'ın fiziksel kart terminaline bağlantısını ve son senkron loglarını salt okunur inceleyin; geçmiş veriyi otomatik yazmayın.",
      lastHeartbeatMin,
    };
  }
  return {
    state: "ONLINE", title: "Agent buluta bağlı",
    detail: "Heartbeat 5 dakika içinde; son kart senkronu 24 saat içinde. Bu tek başına her personelin kart bastığını doğrulamaz.",
    next: "Gerçek giriş/çıkış hareketlerini, vardiya ve izinlerle karşılaştırın.",
    lastHeartbeatMin,
  };
}
