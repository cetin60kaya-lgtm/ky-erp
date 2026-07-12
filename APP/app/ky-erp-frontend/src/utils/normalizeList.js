export function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.models)) return value.models;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}
