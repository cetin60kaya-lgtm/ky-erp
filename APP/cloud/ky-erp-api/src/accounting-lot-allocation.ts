import {
  normalizeLotNo,
  reconcileLotEvidence,
  type LotPolicy,
} from "./accounting-lot-reconciliation-core";

type Allocation = {
  dispatchId?: string | null;
  dispatchNo?: string | null;
  dispatchLineId?: string | null;
  quantity?: number | string | null;
  lotNo?: string | null;
};

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function resolveAllocatedLotEvidence(args: {
  policy: LotPolicy;
  invoiceLotNo?: unknown;
  invoicedQuantity?: unknown;
  allocations?: Allocation[] | null;
}) {
  const invoiceLotNo = text(args.invoiceLotNo);
  const allocations = (Array.isArray(args.allocations) ? args.allocations : [])
    .filter((row) => numberValue(row?.quantity) > 0)
    .map((row) => ({
      dispatchId: text(row.dispatchId),
      dispatchNo: text(row.dispatchNo),
      dispatchLineId: text(row.dispatchLineId),
      quantity: numberValue(row.quantity),
      // Fatura LOT'u, yalnız irsaliye satırının kendi LOT'u boşsa kanıtı tamamlar.
      // İrsaliyede farklı LOT varsa aşağıdaki conflict kontrolü devreye girer.
      lotNo: text(row.lotNo) || invoiceLotNo,
      lotSource: text(row.lotNo) ? "DISPATCH" : invoiceLotNo ? "INVOICE" : "NONE",
    }));
  const targetQuantity = Math.max(0, numberValue(args.invoicedQuantity));
  const allocatedQuantity = allocations.reduce((sum, row) => sum + row.quantity, 0);
  const completePhysicalAllocation = Math.abs(targetQuantity - allocatedQuantity) <= 0.0005;
  const lots = [...new Map(
    allocations
      .filter((row) => normalizeLotNo(row.lotNo))
      .map((row) => [normalizeLotNo(row.lotNo), row.lotNo]),
  ).values()];
  const missingLotQuantity = allocations
    .filter((row) => !normalizeLotNo(row.lotNo))
    .reduce((sum, row) => sum + row.quantity, 0);

  if (!allocations.length) {
    const single = reconcileLotEvidence({
      policy: args.policy,
      invoiceLotNo,
      dispatchLotNo: "",
    });
    return {
      ...single,
      lotAllocations: [],
      allocatedQuantity: 0,
      targetQuantity,
      completePhysicalAllocation: false,
      multiLot: false,
    };
  }

  const dispatchLots = [...new Set(
    allocations
      .filter((row) => row.lotSource === "DISPATCH")
      .map((row) => normalizeLotNo(row.lotNo))
      .filter(Boolean),
  )];
  if (invoiceLotNo && dispatchLots.some((lot) => lot !== normalizeLotNo(invoiceLotNo))) {
    return {
      policy: args.policy,
      status: "CONFLICT" as const,
      resolvedLotNo: "",
      dispatchLotNo: lots.join(" + "),
      invoiceLotNo,
      canPostStock: false,
      requiresReview: true,
      message: "Fatura LOT'u ile bağlı irsaliye LOT'u farklı.",
      lotAllocations: allocations,
      allocatedQuantity,
      targetQuantity,
      completePhysicalAllocation,
      multiLot: lots.length > 1,
    };
  }

  if (lots.length > 1) {
    if (args.policy === "REQUIRED" && missingLotQuantity > 0.0005) {
      return {
        policy: args.policy,
        status: "MISSING_REQUIRED" as const,
        resolvedLotNo: "",
        dispatchLotNo: lots.join(" + "),
        invoiceLotNo,
        canPostStock: false,
        requiresReview: true,
        message: "Bağlı irsaliye miktarının bir bölümünde LOT eksik.",
        lotAllocations: allocations,
        allocatedQuantity,
        targetQuantity,
        completePhysicalAllocation: false,
        multiLot: true,
      };
    }
    return {
      policy: args.policy,
      status: "FROM_DISPATCH_MULTI" as const,
      resolvedLotNo: "",
      dispatchLotNo: lots.join(" + "),
      invoiceLotNo,
      canPostStock: true,
      requiresReview: false,
      message: completePhysicalAllocation
        ? "Fatura kalemi bağlı irsaliyelerde birden fazla LOT'a dağıtıldı."
        : "Fatura kaleminin yalnız bir bölümü bağlı irsaliyelerde LOT'lara dağıtıldı.",
      lotAllocations: allocations,
      allocatedQuantity,
      targetQuantity,
      completePhysicalAllocation,
      multiLot: true,
    };
  }

  const dispatchLotNo = dispatchLots.length ? lots[0] || "" : "";
  const single = reconcileLotEvidence({
    policy: args.policy,
    invoiceLotNo,
    dispatchLotNo,
  });
  const requiredAllocationMissing =
    args.policy === "REQUIRED" && missingLotQuantity > 0.0005;
  if (requiredAllocationMissing) {
    return {
      ...single,
      status: "MISSING_REQUIRED" as const,
      resolvedLotNo: "",
      canPostStock: false,
      requiresReview: true,
      message: "Bağlı irsaliye miktarının bir bölümünde LOT eksik.",
      lotAllocations: allocations,
      allocatedQuantity,
      targetQuantity,
      completePhysicalAllocation: false,
      multiLot: false,
    };
  }

  return {
    ...single,
    resolvedLotNo: lots[0] || single.resolvedLotNo,
    lotAllocations: allocations,
    allocatedQuantity,
    targetQuantity,
    completePhysicalAllocation,
    multiLot: false,
  };
}

export function requiredLotCoverageComplete(args: {
  policy: LotPolicy;
  quantity?: unknown;
  lotNo?: unknown;
  lotAllocations?: Allocation[] | null;
}) {
  if (args.policy !== "REQUIRED") return true;
  const allocations = Array.isArray(args.lotAllocations) ? args.lotAllocations : [];
  const target = Math.max(0, numberValue(args.quantity));

  // Once dispatch allocations exist, they are the physical truth. A single
  // invoice LOT must not make an unallocated quantity appear physically received.
  if (allocations.length) {
    if (target <= 0) return false;
    const covered = allocations
      .filter((row) => normalizeLotNo(row?.lotNo))
      .reduce((sum, row) => sum + Math.max(0, numberValue(row?.quantity)), 0);
    return covered + 0.0005 >= target;
  }

  return Boolean(normalizeLotNo(args.lotNo));
}
