const intValue = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
};

export const AI_CONFIG = {
  get model() { return String(process.env.OPENAI_MODEL || "gpt-5.6-terra").trim(); },
  get maxOutputTokens() { return intValue(process.env.OPENAI_MAX_OUTPUT_TOKENS, 1800, 256, 8000); },
  get developerMaxOutputTokens() { return intValue(process.env.OPENAI_DEVELOPER_MAX_OUTPUT_TOKENS, 8000, 1024, 16000); },
  get timeoutMs() { return intValue(process.env.OPENAI_TIMEOUT_MS, 45_000, 5_000, 120_000); },
  maxMessageLength: 4_000,
  maxHistoryMessages: 20,
  maxToolCalls: 5,
  rateLimitPerMinute: 20,
  actionTtlMs: 10 * 60_000,
};

export const isAiConfigured = () => Boolean(String(process.env.OPENAI_API_KEY || "").trim());
