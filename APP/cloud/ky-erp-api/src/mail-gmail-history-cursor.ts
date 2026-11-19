// Gmail history IDs are opaque monotonic decimal strings. Never coerce to
// JavaScript numbers: they may exceed Number.MAX_SAFE_INTEGER.
export type GmailHistoryCursor = {
  historyId: string;
  pageToken: string;
  pending: string[];
  finalHistoryId: string;
};
const value=(input:unknown)=>input==null?"":String(input).trim();
export function gmailHistoryCursor(input:unknown):GmailHistoryCursor {
  let row:Record<string,unknown>={};
  if(typeof input==="string"){try{row=JSON.parse(input)||{};}catch{}}
  else if(input&&typeof input==="object"&&!Array.isArray(input))row=input as Record<string,unknown>;
  return {
    historyId:/^[0-9]+$/.test(value(row.historyId))?value(row.historyId):"",
    pageToken:value(row.pageToken),
    pending:Array.isArray(row.pending)?[...new Set(row.pending.map(value).filter(Boolean))]:[],
    finalHistoryId:/^[0-9]+$/.test(value(row.finalHistoryId))?value(row.finalHistoryId):""
  };
}
export function gmailHistoryChangedMessageIds(history:unknown):string[]{
  const ids=new Set<string>();
  for(const row of Array.isArray(history)?history:[]){
    for(const key of ["messagesAdded","labelsAdded","labelsRemoved"]){
      for(const change of Array.isArray(row?.[key])?row[key]:[]){
        const id=value(change?.message?.id);
        if(id)ids.add(id);
      }
    }
  }
  return [...ids];
}
export function gmailHistoryQueuePage(cursor:GmailHistoryCursor,payload:any):GmailHistoryCursor {
  const pending=gmailHistoryChangedMessageIds(payload?.history);
  // Store all IDs in the page. Never checkpoint past an unprocessed ID.
  return {...cursor,pending,
    pageToken:value(payload?.nextPageToken),
    finalHistoryId:payload?.nextPageToken?"":value(payload?.historyId)};
}
export function gmailHistoryAdvance(cursor:GmailHistoryCursor,processed:number):GmailHistoryCursor {
  const remainder=cursor.pending.slice(Math.max(0,Math.trunc(processed)||0));
  if(remainder.length)return {...cursor,pending:remainder};
  return cursor.pageToken
    ?{...cursor,pending:[]}
    :{historyId:cursor.finalHistoryId||cursor.historyId,pageToken:"",pending:[],finalHistoryId:""};
}
