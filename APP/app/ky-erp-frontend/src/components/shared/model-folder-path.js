// A folder is a package of model sources: keep technical sheets, artwork and extras together.
// Never derive a new model card or change the original file name from a technical sheet name.
export function folderSubpath(relativePath) {
  const parts=String(relativePath||"").replace(/\\/g,"/").split("/").filter(Boolean);
  // Browsers supply ROOT_FOLDER/[optional nested dirs]/FILE.ext.
  // ROOT_FOLDER always corresponds to the model selected on the card.
  return parts.length>2?parts.slice(1,-1).join("/"):"";
}
export function modelSourceFileType(name) {
  const s=String(name||"").toLocaleUpperCase("tr-TR");
  if(/(?:^|[ _.-])(FT|TEKNİK|TEKNIK|ÖLÇÜ|OLCU|TECH|SPEC)(?:[ _.-]|$)/i.test(s))return "TECHNICAL_SHEET";
  if(/\.\s*(PSD|PSB|AI|EPS|SVG)$/i.test(s))return "SOURCE_ARTWORK";
  if(/\.\s*(PDF)$/i.test(s))return "MODEL_PDF";
  if(/\.\s*(JPG|JPEG|PNG|WEBP|TIF|TIFF)$/i.test(s))return "MODEL_VISUAL";
  return "SOURCE_OTHER";
}
export function modelFileCategory(name,folder=false) {
  if(folder)return "MODEL_SOURCE";
  const value=String(name||"");
  const ext=value.split(".").pop().toLowerCase();
  if(/^DDM\s*\d{8,}/i.test(value))return "DELIVERY_NOTE";
  if(/^HKN\s*\d{8,}/i.test(value))return "INVOICE";
  if(["jpg","jpeg","png","webp"].includes(ext))return "MODEL_IMAGE";
  if(["psd","psb"].includes(ext))return "OUTGOING_DESIGN";
  return "MODEL_SOURCE";
}
