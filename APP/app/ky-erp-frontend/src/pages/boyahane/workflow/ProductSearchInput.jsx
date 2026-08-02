import { useEffect, useId, useMemo, useState } from "react";

function normalize(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function searchText(row) {
  return [
    row?.productName,
    row?.tradeName,
    row?.code,
    row?.supplierName,
    row?.companyName,
    row?.dyeType,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ProductSearchInput({
  products = [],
  value = "",
  onChange,
  placeholder = "Ürün adı veya kodu yazın",
  disabled = false,
  allowUnapproved = true,
}) {
  const reactId = useId();
  const listId = `boyahane-product-${reactId.replace(/:/g, "")}`;
  const selected = useMemo(
    () => products.find((row) => String(row.id) === String(value)) || null,
    [products, value],
  );
  const [query, setQuery] = useState(selected?.productName || "");

  useEffect(() => {
    setQuery(selected?.productName || "");
  }, [selected?.id, selected?.productName]);

  const visibleProducts = useMemo(
    () => products.filter((row) => allowUnapproved || row.approvalStatus === "APPROVED"),
    [products, allowUnapproved],
  );

  function resolve(input, choosePartial = false) {
    const key = normalize(input);
    if (!key) {
      onChange?.("");
      return;
    }
    const exact = visibleProducts.find((row) =>
      [row.productName, row.tradeName, row.code]
        .filter(Boolean)
        .some((item) => normalize(item) === key),
    );
    const partial = choosePartial
      ? visibleProducts.filter((row) => normalize(searchText(row)).includes(key))
      : [];
    const match = exact || (partial.length === 1 ? partial[0] : null);
    if (match) {
      setQuery(match.productName || "");
      onChange?.(match.id);
    }
  }

  return (
    <div className="bh-product-search">
      <input
        type="search"
        list={listId}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          resolve(next, false);
        }}
        onBlur={() => {
          if (!query.trim()) {
            onChange?.("");
            return;
          }
          resolve(query, true);
          if (selected && normalize(query) !== normalize(selected.productName)) {
            const hasMatch = visibleProducts.some((row) =>
              normalize(searchText(row)).includes(normalize(query)),
            );
            if (!hasMatch) setQuery(selected.productName || "");
          }
        }}
      />
      <datalist id={listId}>
        {visibleProducts.map((row) => (
          <option key={row.id} value={row.productName}>
            {searchText(row)}{row.approvalStatus !== "APPROVED" ? " · Onay bekliyor" : ""}
          </option>
        ))}
      </datalist>
      {selected ? (
        <small title={searchText(selected)}>
          {[selected.code, selected.tradeName, selected.supplierName || selected.companyName]
            .filter(Boolean)
            .join(" · ")}
        </small>
      ) : null}
    </div>
  );
}
