---
applyTo: "APP/app/ky-erp-frontend/**/*.{js,jsx,ts,tsx,css,json}"
---

# KY ERP Frontend Instructions

- Treat `APP/app/ky-erp-frontend` as the production web frontend.
- Production API base must resolve to `https://api.kyerp.net/api`.
- Preserve the current shell, module navigation and approved full-screen workspaces unless the user asks for a redesign.
- Use shared API utilities in `src/utils/api.js`; do not add ad-hoc fetch wrappers unless there is a demonstrated exception.
- Mutation requests must never be auto-retried.
- GET retry/cache must not turn an error into a permanent empty list.
- A helper endpoint failure must not erase a successfully loaded main list. Prefer isolated loaders or `Promise.allSettled` where sources are independent.
- Distinguish loading, empty, unauthorized and transient error states.
- Use canonical company identity helpers instead of comparing raw `mecit-hakan` / `main-mecit-hakan` strings manually.
- Keep valid auth session data through transient 5xx/network failures; clear only for the established auth policy.
- Do not reintroduce Pages API proxy as the normal transport path.
- Never show demo data in production merely because an API returned no data.
- Keep responsive desktop/tablet/mobile behavior and avoid removing working actions to simplify a screen.
- After changes run `npm run lint`, `npm test`, and `npm run build` when the task permits.
