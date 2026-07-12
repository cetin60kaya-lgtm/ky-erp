const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export function parsePageLimit(query: { page?: unknown; limit?: unknown } = {}) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const requestedLimit = Number(query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function makePaginatedResponse<T>(data: T[], page: number, limit: number, total: number) {
  return {
    ok: true,
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
