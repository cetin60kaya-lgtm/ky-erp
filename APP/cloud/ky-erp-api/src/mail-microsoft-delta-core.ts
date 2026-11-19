// Microsoft Graph delta paging contract.
// A nextLink is an unfinished traversal, NOT a successful delta checkpoint.
type DeltaResponse = Record<string,unknown>;
const str=(v:unknown)=>v==null?"":String(v).trim();
export function microsoftDeltaPageState(payload:DeltaResponse){
  const next=str(payload["@odata.nextLink"]);
  const delta=str(payload["@odata.deltaLink"]);
  if(Boolean(next)===Boolean(delta))
    throw new Error("MICROSOFT_DELTA_CURSOR_INVALID");
  return {cursor:next||delta,complete:!next};
}
export function microsoftDeltaSafeUrl(url:string,mailboxBase:string,folderId:string){
  const value=new URL(url);
  const base=new URL(mailboxBase);
  if(value.protocol!=="https:"||value.host!=="graph.microsoft.com"||base.protocol!=="https:"||base.host!=="graph.microsoft.com")
    throw new Error("MICROSOFT_DELTA_URL_INVALID");
  // Keep continuation inside this exact mailbox+folder; provider-origin URLs are
  // not permitted to redirect an OAuth bearer token into another mailbox.
  const mailbox=base.pathname.replace(/\/$/,""),folder=encodeURIComponent(folderId);
  const paths=[
    mailbox+"/mailFolders/"+folder+"/messages/delta",
    mailbox+"/mailFolders('"+folder+"')/messages/delta",
    mailbox+"/mailFolders(%27"+folder+"%27)/messages/delta",
  ];
  if(!paths.includes(value.pathname)||!value.searchParams.size)
    throw new Error("MICROSOFT_DELTA_FOLDER_MISMATCH");
  return value.toString();
}
export function microsoftDeltaComplete(results:Array<{ok:boolean;completed?:boolean}>,totalFolders:number,limitHit=false){
  return !limitHit&&results.length===totalFolders&&results.every(row=>row.ok&&row.completed===true);
}
