import { createHash } from "node:crypto";

/**
 * Canonical five-field TNF reference import.
 * A TNF row is an existing approved-record representation, NOT a raw
 * physical machine reading. Never relabel it as PHYSICAL_TERMINAL_RAW.
 */
export function parseTnfReferenceLine(line, yearHint=null) {
  const original=String(line??"").trim();
  const parts=original.split(",");
  if(parts.length!==5)throw new Error("TNF_EXPECTS_FIVE_FIELDS");
  const [cardNo,time,shortDate,kind,site]=parts.map((part)=>part.trim());
  if(!/^[0-9]{1,16}$/.test(cardNo)||
    !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)||
    !/^[0-3][0-9][01][0-9][0-9]{2}$/.test(shortDate)||
    kind!=="1"||site!=="001")throw new Error("TNF_INVALID_FIELDS");
  const d=Number(shortDate.slice(0,2)),m=Number(shortDate.slice(2,4)),
        y=2000+Number(shortDate.slice(4,6));
  const check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==m||check.getUTCDate()!==d)
    throw new Error("TNF_INVALID_CALENDAR");
  if(yearHint!==null && yearHint!==y)throw new Error("TNF_YEAR_MISMATCH");
  return Object.freeze({
    cardNo,time,shortDate,workDate:`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,
    kind,site,originalLine:original,source:"TNF_REFERENCE_ONLY",isPhysicalRaw:false,
    sourceHash:createHash("sha256").update(original).digest("hex"),
  });
}

export function parseTnfReferenceFile(contents, yearHint=null) {
  const text=String(contents??"");
  const rows=text.split(/\r?\n/);
  const accepted=[],rejected=[];
  const keys=new Set();
  for(let index=0;index<rows.length;index++) {
    if(!rows[index].trim()) continue;
    try {
      const parsed=parseTnfReferenceLine(rows[index],yearHint);
      const key=parsed.cardNo+"|"+parsed.workDate+"|"+parsed.time;
      if(keys.has(key))throw new Error("TNF_DUPLICATE_ROW");
      keys.add(key);
      accepted.push(parsed);
    }catch(error){rejected.push(Object.freeze({lineNumber:index+1,reason:error.message}));}
  }
  return Object.freeze({accepted:Object.freeze(accepted),rejected:Object.freeze(rejected),
    isSafeToApply:false,requiresAuthorizedReview:true});
}
