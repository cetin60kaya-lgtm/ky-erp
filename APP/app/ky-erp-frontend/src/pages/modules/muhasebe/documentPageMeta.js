// e-Belge havuzunun mevcut Worker sayfalama sözleşmesiyle ortak görünüm hesabı.
export const DOCUMENT_PAGE_SIZE = 50;

export function documentPageMeta(payload = {}, requestedPage = 1) {
  const pageSize = Math.max(1, Math.floor(Number(payload.pageSize) || DOCUMENT_PAGE_SIZE));
  const total = Math.max(0, Math.floor(Number(payload.total) || 0));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const candidatePage = Math.floor(Number(payload.page) || Number(requestedPage) || 1);
  const page = Math.min(pageCount, Math.max(1, candidatePage));
  return {
    page,
    pageSize,
    total,
    pageCount,
    start: total === 0 ? 0 : (page - 1) * pageSize + 1,
    end: Math.min(total, page * pageSize),
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}
