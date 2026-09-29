export type CanonicalRouteGuard = {
  code: "CANONICAL_ROUTE_REQUIRED";
  message: string;
  replacement: string;
};

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function canonicalAccountingRouteGuard(
  pathname: string,
  method: string,
): CanonicalRouteGuard | null {
  const verb = String(method || "GET").toUpperCase();
  if (!WRITE.has(verb)) return null;

  if (/^\/api\/muhasebe\/belge-import\/[^/]+\/approve\/?$/.test(pathname)) {
    return {
      code: "CANONICAL_ROUTE_REQUIRED",
      message:
        "Eski fatura onay yolu kapatıldı. Belge canonical e-Belge akışında ürün/LOT/irsaliye kontrolünden sonra işlenmelidir.",
      replacement: "/api/e-belge/documents/:id/finalize",
    };
  }

  if (
    /^\/api\/muhasebe\/belge-import\/[^/]+\/boyahane-transfer(?:-v2)?\/?$/.test(
      pathname,
    )
  ) {
    return {
      code: "CANONICAL_ROUTE_REQUIRED",
      message:
        "Faturadan doğrudan Boyahane LOT/stok girişi kapatıldı. Fiziksel stok irsaliye/mal kabulü üzerinden, maliyet ise fatura üzerinden canonical olarak uzlaştırılır.",
      replacement: "/api/e-belge/documents/:id/finalize",
    };
  }

  if (/^\/api\/boyahane\/lots\/[^/]+\/consume\/?$/.test(pathname)) {
    return {
      code: "CANONICAL_ROUTE_REQUIRED",
      message:
        "Eski LOT sarf yolu kapatıldı. Üretim, numune, fire, iade ve düzeltmeler denetlenebilir V2 stok hareketi olarak kaydedilmelidir.",
      replacement: "/api/boyahane/workflow/lots/:id/movements-v2",
    };
  }

  if (/^\/api\/boyahane\/workflow\/lots\/[^/]+\/movements\/?$/.test(pathname)) {
    return {
      code: "CANONICAL_ROUTE_REQUIRED",
      message:
        "Eski stok hareketi yolu kapatıldı. Hareket nedeni, maliyet ve ters kayıt bağlantısı V2 hareketinde tutulur.",
      replacement: "/api/boyahane/workflow/lots/:id/movements-v2",
    };
  }

  return null;
}
