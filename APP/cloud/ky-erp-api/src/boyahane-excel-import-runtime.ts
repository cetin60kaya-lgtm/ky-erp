import type { Hono } from "hono";
import { registerBoyahaneExcelImportRoutes as registerBaseRoutes } from "./boyahane-excel-import";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };

// Eski JSON kayıtlarında paintTypes alanı her zaman dizi olmayabilir.
// Aktarım rotasının çalışma anında güvenli dizi yardımcısını ortak alana kurar.
(globalThis as typeof globalThis & {
  safeArray?: (value: unknown) => unknown[];
}).safeArray = (value: unknown) => (Array.isArray(value) ? value : []);

export function registerBoyahaneExcelImportRoutes(app: Hono<AppEnv>) {
  return registerBaseRoutes(app);
}
