import { readFileSync, writeFileSync } from "node:fs";

const path = "APP/app/ky-erp-frontend/src/pages/boyahane/workflow/KayitliRenklerWorkspace.jsx";
let source = readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`UI patch noktası bulunamadı: ${label}`);
  source = source.replace(from, to);
}

if (!source.includes("function catalogFormulaOf(row)")) {
  replaceOnce(
`function displayCode(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return row.referenceCode || row.referenceName || row.basePantone || row.pantone || "REFERANS";
  if (sourceType === "VISUAL") return row.colorHex || row.colorName || "RGB";
  return row.pantone || "Pantone yok";
}
`,
`function displayCode(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return row.referenceCode || row.referenceName || row.basePantone || row.pantone || "REFERANS";
  if (sourceType === "VISUAL") return row.colorHex || row.colorName || "RGB";
  return row.pantone || "Pantone yok";
}

function catalogFormulaOf(row) {
  const formula = row?.catalogFormula;
  return formula && safeArray(formula.lines).length ? formula : null;
}

function gramText(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(number < 10 ? 2 : 1).replace(/\.0+$/, "");
}
`,
    "formula helpers",
  );
}

if (!source.includes("...safeArray(row.catalogFormula?.lines)")) {
  replaceOnce(
`      row.sourceLabel,
      row.cardPaintType,
    ].join(" ").toLocaleLowerCase("tr-TR");`,
`      row.sourceLabel,
      row.cardPaintType,
      ...safeArray(row.catalogFormula?.lines).map((line) => line.productName),
    ].join(" ").toLocaleLowerCase("tr-TR");`,
    "formula search",
  );
}

if (!source.includes("<b>Bileşenler:</b>")) {
  replaceOnce(
`                <div className="bh-color-card-meta">
                  <span>Boya türü <b>{row.cardPaintType || "-"}</b></span>
                  <span>Son versiyon <b>{row.activeVersion || "V1"}</b></span>
                  <span>Son model <b>{row.lastModelName || row.lastUsedModel || "-"}</b></span>
                  <span>Reçete <b>{row.recipeCount || 0}</b></span>
                </div>`,
`                <div className="bh-color-card-meta">
                  <span>Boya türü <b>{row.cardPaintType || "-"}</b></span>
                  <span>Son versiyon <b>{row.activeVersion || "V1"}</b></span>
                  <span>Son model <b>{row.lastModelName || row.lastUsedModel || "-"}</b></span>
                  <span>Reçete <b>{row.recipeCount || 0}</b></span>
                </div>
                {catalogFormulaOf(row) ? (
                  <small><b>Bileşenler:</b> {safeArray(row.catalogFormula.lines).slice(0, 5).map((line) => (line.productName || "-") + " " + gramText(line.referenceGram) + " gr").join(" · ")}{safeArray(row.catalogFormula.lines).length > 5 ? " · +" + (safeArray(row.catalogFormula.lines).length - 5) : ""}</small>
                ) : <small>Bileşen kaydı yok.</small>}`,
    "formula card preview",
  );
}

if (!source.includes("const catalogFormula = catalogFormulaOf(selected)")) {
  replaceOnce(
`  const activeRecipe = recipes.find((row) => row.status === "ACTIVE") || recipes[0];
  const selectedSource = sourceTypeOf(selected);`,
`  const activeRecipe = recipes.find((row) => row.status === "ACTIVE") || recipes[0];
  const catalogFormula = catalogFormulaOf(selected);
  const selectedSource = sourceTypeOf(selected);`,
    "selected formula",
  );
}

if (!source.includes("Arşiv Bileşen Formülü")) {
  replaceOnce(
`          <section className="bh-card"><div className="bh-card-head"><div><h2>Onaylı Reçete</h2><small>{SOURCE_LABELS[selectedSource]} · ürünler ve gramajlar aynen kullanılır.</small></div></div><div className="bh-card-body">`,
`          <section className="bh-card"><div className="bh-card-head"><div><h2>Arşiv Bileşen Formülü</h2><small>Eski PANTONE FORMUL kaydından temizlenmiştir; üretimde gerçek ürün ve lot tekrar doğrulanır.</small></div></div><div className="bh-card-body">{catalogFormula ? <div className="bh-table-wrap"><table><thead><tr><th>Bileşen</th><th>GR</th><th>Oran</th></tr></thead><tbody>{safeArray(catalogFormula.lines).map((line) => <tr key={line.id || line.productName}><td><strong>{line.productName || "-"}</strong></td><td>{gramText(line.referenceGram)}</td><td>{Number(line.percentage || (Number(catalogFormula.totalGr || 0) ? Number(line.referenceGram || 0) / Number(catalogFormula.totalGr) * 100 : 0)).toFixed(2)}%</td></tr>)}</tbody><tfoot><tr><th>Toplam</th><th>{gramText(catalogFormula.totalGr)} gr</th><th>100%</th></tr></tfoot></table></div> : <div className="bh-empty">Bu temiz renk kartında arşiv bileşen kaydı bulunmuyor.</div>}</div></section>

          <section className="bh-card"><div className="bh-card-head"><div><h2>Onaylı Reçete</h2><small>{SOURCE_LABELS[selectedSource]} · ürünler ve gramajlar aynen kullanılır.</small></div></div><div className="bh-card-body">`,
    "formula detail table",
  );
}

writeFileSync(path, source, "utf8");
console.log("KayitliRenklerWorkspace.jsx formula UI patch tamamlandı.");
