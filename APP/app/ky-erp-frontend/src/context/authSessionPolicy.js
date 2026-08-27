export function shouldClearStoredAuthForStatus(status) {
  return [401, 403].includes(Number(status || 0));
}
