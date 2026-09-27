// Wrangler config içindeki Workers AI binding için tip genişletmesi.
// worker-configuration.d.ts yeniden üretildiğinde bu dosya zararsız interface merge olarak kalır.
type KyerpWorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

declare namespace Cloudflare {
  interface Env {
    AI: KyerpWorkersAiBinding;
  }
}
