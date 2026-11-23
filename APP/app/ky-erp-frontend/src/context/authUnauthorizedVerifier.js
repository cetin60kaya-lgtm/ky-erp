// A business request may report a session error even while the browser token is valid.
// Confirm with the canonical auth endpoint before clearing a user session.
export function createUnauthorizedSessionVerifier({ readToken, verify, invalidate, pause = () => Promise.resolve() }) {
  let inFlight = null;
  return () => {
    if (inFlight) return inFlight;
    const candidate = String(readToken() || "");
    if (!candidate) return Promise.resolve(false);
    inFlight = (async () => {
      try {
        await verify(candidate);
        return false;
      } catch (error) {
        // A network error, 403 or a temporary 5xx never proves revocation.
        if (Number(error?.status || 0) !== 401) return false;
      }
      await pause();
      // A concurrent approved login/refresh may already have changed the token.
      if (String(readToken() || "") !== candidate) return false;
      invalidate();
      return true;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
