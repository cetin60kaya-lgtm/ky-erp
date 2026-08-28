export function shouldClearStoredAuthForStatus(status) {
  // 401 = token/session is no longer valid and local auth must be cleared.
  // 403 = session is valid but this particular operation is forbidden;
  // clearing auth here would force unnecessary MFA and create duplicate sessions.
  return Number(status || 0) === 401;
}
