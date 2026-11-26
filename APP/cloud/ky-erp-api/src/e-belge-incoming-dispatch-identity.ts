/** Source identity is not mail sender identity. Pure, no DB/network/write. */
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const uuidPattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function normalizedEttn(value:unknown){
 const s=str(value).toUpperCase();return new RegExp("^"+uuidPattern+"$","i").test(s)?s:"";
}
export function extractLabeledEttn(content:unknown){
 const matches=[...str(content).matchAll(new RegExp("(?:^|\\n)\\s*ETTN\\s*[:#]?\\s*("+uuidPattern+")(?![0-9a-f-])","gi"))];
 const ids=[...new Set(matches.map(m=>normalizedEttn(m[1])).filter(Boolean))];
 return ids.length===1?ids[0]!:"";
}
export function normalizedTax(value:unknown){
 const v=str(value).replace(/[ -]/g,"");return /^\d{10,11}$/.test(v)?v:"";
}
export function normalizedIssueDate(value:unknown){
 let s=str(value);const m=s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
 if(m)s=m[3]+"-"+m[2]+"-"+m[1];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+"T00:00:00Z")))return "";
 return new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s?s:"";
}
type Identity={tenant:unknown;issuerTax:unknown;recipientTax:unknown;documentNo:unknown;issueDate:unknown;ettn?:unknown;direction:unknown;kind:unknown};
function identity(v:Identity){
 return {tenant:str(v.tenant).toLowerCase(),issuer:normalizedTax(v.issuerTax),recipient:normalizedTax(v.recipientTax),no:str(v.documentNo).toUpperCase(),date:normalizedIssueDate(v.issueDate),ettn:normalizedEttn(v.ettn),direction:str(v.direction).toUpperCase(),kind:str(v.kind).toUpperCase()};
}
/** Exact, case-normalized identity; matching never proves source authenticity or quantities. */
export function compareIncomingDispatchIdentity(first:Identity,second:Identity){
 const a=identity(first),b=identity(second);
 if(a.tenant!==b.tenant||!a.tenant||a.direction!=="INCOMING"||b.direction!=="INCOMING"||a.kind!=="DISPATCH"||b.kind!=="DISPATCH")return "DIFFERENT_SCOPE";
 const full=Boolean(a.issuer&&b.issuer&&a.recipient&&b.recipient&&a.no&&b.no&&a.date&&b.date);
 const equal=full&&a.issuer===b.issuer&&a.recipient===b.recipient&&a.no===b.no&&a.date===b.date;
 if(a.ettn&&b.ettn){
  if(a.ettn===b.ettn)return equal?"SAME_ETTN":full?"IDENTITY_CONFLICT":"REVIEW_REQUIRED";
  return equal?"IDENTITY_CONFLICT":"DISTINCT";
 }
 if(equal)return "SAME_NUMBER_REVIEW";
 return "REVIEW_REQUIRED";
}
export function dispatchPartyRole(card:unknown,sales:unknown,purchases:unknown){
 const role=str(card).toUpperCase(),sale=Number(sales)>0,buy=Number(purchases)>0;
 // Never silently rewrite explicit roles or classify by incoming dispatch alone.
 if(role==="BOTH"||(sale&&buy)||(role==="SUPPLIER"&&sale)||(role==="CUSTOMER"&&buy))return {group:"BOTH",source:"ROLE_CONFLICT_REVIEW"};
 if(role==="CUSTOMER"||role==="SUPPLIER")return {group:role,source:"COMPANY_CARD"};
 if(sale)return {group:"CUSTOMER",source:"VERIFIED_SALES_HISTORY"};
 if(buy)return {group:"SUPPLIER",source:"VERIFIED_PURCHASE_HISTORY"};
 return {group:"UNCLASSIFIED",source:"INSUFFICIENT_EVIDENCE"};
}
