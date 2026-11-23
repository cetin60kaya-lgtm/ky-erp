// The audit is read-only: never silently rewrite a historical financial balance.
const number = (value: unknown): number => {
  const v = Number(value ?? 0);
  return Number.isFinite(v) ? v : 0;
};
export const money2 = (value: unknown) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

export function auditCompanyBalance(row: Record<string, unknown>) {
  const openingBalance = money2(row.opening_balance);
  const movementNet = money2(row.movement_net);
  const debitCreditNet = money2(row.debit_credit_net);
  const storedBalance = money2(row.current_balance);
  const expectedBalance = money2(openingBalance + movementNet);
  const discrepancy = money2(storedBalance - expectedBalance);
  return {
    companyId: String(row.id || ""),
    companyName: String(row.name || ""),
    openingBalance,
    movementNet,
    debitCreditNet,
    movementCount: Math.max(0, number(row.movement_count)),
    storedBalance,
    expectedBalance,
    discrepancy,
    hasDiscrepancy: Math.abs(discrepancy) >= 0.01,
    movementEncodingDiscrepancy: Math.abs(money2(movementNet - debitCreditNet)) >= 0.01,
  };
}

export function summarizeCompanyBalanceAudit(rows: ReturnType<typeof auditCompanyBalance>[]) {
  return {
    companyCount: rows.length,
    storedReceivable: money2(rows.filter((r) => r.storedBalance > 0).reduce((sum, r) => sum + r.storedBalance, 0)),
    storedPayable: money2(rows.filter((r) => r.storedBalance < 0).reduce((sum, r) => sum + Math.abs(r.storedBalance), 0)),
    discrepancyCount: rows.filter((r) => r.hasDiscrepancy).length,
    movementEncodingDiscrepancyCount: rows.filter((r) => r.movementEncodingDiscrepancy).length,
  };
}
