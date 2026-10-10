export type UnifiedCommandPayload = Record<string, unknown>;

export function validateUnifiedCommand(
  action: string,
  payload: unknown,
): UnifiedCommandPayload;

export function commandValue(value: unknown): string;

export function commandFold(value: unknown): string;
