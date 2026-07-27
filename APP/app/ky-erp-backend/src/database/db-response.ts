export function dbSuccess<T>(data: T, message?: string) {
  return { ok: true, data, ...(message ? { message } : {}) };
}

export function dbError(message: string, errors: any[] = []) {
  return { ok: false, message, errors };
}
