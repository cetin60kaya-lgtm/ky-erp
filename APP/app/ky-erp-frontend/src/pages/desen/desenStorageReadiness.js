/** Ayrı kaynakların bağlanma durumu: AGENT eksikliği çalışan CLOUD_API'yi bozmaz. */
export function analyzeDesenStorageTargets(targets = []) {
  const connected = targets.filter((row) => row?.ok);
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
