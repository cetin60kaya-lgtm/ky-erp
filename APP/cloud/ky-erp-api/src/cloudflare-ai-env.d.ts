// Wrangler config içindeki Workers AI binding için tip genişletmesi.
// worker-configuration.d.ts yeniden üretildiğinde bu dosya zararsız interface merge olarak kalır.
declare namespace Cloudflare {
  interface Env {
    AI: Ai;
  }
}
