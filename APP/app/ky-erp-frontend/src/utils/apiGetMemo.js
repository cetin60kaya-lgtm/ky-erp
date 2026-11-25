// GET memoization is scoped to the current session and company. Invalidation
// never lets an already-running request repopulate a cleared cache.
export function createApiGetMemo(ttlMs, now = Date.now) {
  const cache = new Map();
  const inFlight = new Map();
  const latest = new Map();
  let generation = 0;
  let scope = null;
  const sameScope = (a,b) => Boolean(a && b && a.length === b.length && a.every((value,index) => value === b[index]));
  function clear() {
    generation += 1;
    cache.clear();
    inFlight.clear();
    latest.clear();
  }
  function get({ key, forceFresh = false, readScope, load }) {
    const captured = readScope();
    if (!sameScope(scope,captured)) {
      clear();
      scope = captured;
    }
    const assertScope = () => {
      if (!sameScope(captured,readScope())) {
        throw Object.assign(new Error("Oturum veya firma değişti. Güncel ekrandan tekrar deneyin."), { code: "API_SCOPE_CHANGED", status: 409 });
      }
    };
    const flightKey = forceFresh ? `${key}::force-fresh` : key;
    const cached = cache.get(key);
    if (!forceFresh && cached && now() - cached.timestamp < ttlMs) return Promise.resolve(cached.payload);
    if (inFlight.has(flightKey)) return inFlight.get(flightKey);
    const epoch = generation;
    const marker = {};
    latest.set(key,marker);
    const promise = Promise.resolve().then(() => {
      assertScope();
      return load(assertScope);
    }).then(payload => {
      assertScope();
      if (epoch === generation && latest.get(key) === marker) {
        cache.set(key,{ timestamp: now(), payload });
      }
      return payload;
    }).finally(() => {
      if (inFlight.get(flightKey) === promise) inFlight.delete(flightKey);
      if (latest.get(key) === marker) latest.delete(key);
    });
    inFlight.set(flightKey,promise);
    return promise;
  }
  return { get, clear };
}
