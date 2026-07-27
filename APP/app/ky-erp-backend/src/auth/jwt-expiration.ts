const DEFAULT_EXPIRES_SECONDS = 43200;

export function getJwtExpiresInSeconds() {
  const parsed = Number(
    process.env.JWT_EXPIRES_IN_SECONDS || DEFAULT_EXPIRES_SECONDS,
  );
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_EXPIRES_SECONDS;
}
