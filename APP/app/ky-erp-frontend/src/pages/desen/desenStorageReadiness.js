/** Ayrı kaynakların bağlanma durumu: AGENT eksikliği çalışan CLOUD_API'yi bozmaz. */
export function analyzeDesenStorageTargets(targets = []) {
  const connected = targets.filter((row) => row?.ok && row.exact !== false && row.syncEnabled !== false);
  const cloud = (row) => ["GOOGLE_DRIVE", "ONEDRIVE", "SHAREPOINT"].includes(row?.provider);
  const directReady = connected.some((row) =>
    cloud(row) && row.syncMode === "CLOUD_API" &&
    row.connectionStatus === "CONNECTED" && Boolean(row.remoteRootId));
  const cloudPending = connected.filter((row) =>
    cloud(row) && row.syncMode !== "AGENT" &&
    (row.syncMode !== "CLOUD_API" || row.connectionStatus !== "CONNECTED" || !row.remoteRootId));
  const agentRows = connected.filter((row) => row.syncMode === "AGENT");
  const agentPending = agentRows.filter((row) => row.connectionStatus !== "CONNECTED");
  return { connected, directReady, cloudPending, agentRows, agentPending };
}

/** Mevcut Google hesabına bağlı MODELLER klasörü doğrulanmadan yerleşim atama düğmesi açılmaz. */
export function canOfferPlacementBinding(targets = []) {
  const placement = targets.find((row) => row?.purposeCode === "PLACEMENT");
  const source = targets.find((row) => row?.purposeCode === "MODEL_SOURCE");
  return Boolean(placement?.ok && placement.exact === false
    && source?.ok && source.exact === true && source.syncEnabled !== false
    && source.provider === "GOOGLE_DRIVE"
    && source.syncMode === "CLOUD_API"
    && source.connectionStatus === "CONNECTED"
    && source.remoteRootId
    && String(source.rootPath || "").trim().toLocaleLowerCase("tr-TR") === "modeller"
    && source.connectionId && source.connectionId === placement.connectionId);
}
