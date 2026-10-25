export function isOpenPaymentPlan(row) {
  return !["PAID", "CANCELLED"].includes(String(row?.status || "").toUpperCase());
}

export function overduePaymentPlans(rows, referenceDate) {
  const reference = String(referenceDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reference)) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const dueDate = String(row?.due_date || row?.planned_date || "").slice(0, 10);
    return isOpenPaymentPlan(row) && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate < reference;
  });
}
