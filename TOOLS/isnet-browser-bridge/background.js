/* Only current portal list rows, never credentials or cookies. */
const routes={
 "/incominginvoice/incominginvoicelist":{id:"IdFaturaGelen",no:"FaturaNo",date:"FaturaTarihiFormated"},
 "/outgoinginvoice/outgoinginvoicelist":{id:"IdFatura",no:"FaturaNo",date:"FaturaTarihiFormated"},
 "/incomingdespatchadvice/incomingdespatchadvicelist":{id:"IdIrsaliyeGelen",no:"IrsaliyeNo",date:"IrsaliyeTarihiFormated"},
 "/outgoingdespatch/outgoingdespatchlist":{id:"IdIrsaliye",no:"IrsaliyeNo",date:"IrsaliyeTarihiFormated"}
};
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
 if(msg?.type!=="KY_ISNET_READ_VISIBLE_ROWS"||sender.frameId!==0||!sender.tab?.id)return false;
 let u;try{u=new URL(sender.url||"")}catch{return false}
 const path=u.pathname.replace(/\/+$/,"").toLowerCase(),fields=routes[path];
 if(u.origin!=="https://nettefatura.isnet.net.tr"||!fields)return false;
 (async()=>{
  const out=await chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:"MAIN",func:(expectedPath,fields)=>{
   if(location.origin!=="https://nettefatura.isnet.net.tr"||location.pathname.replace(/\/+$/,"").toLowerCase()!==expectedPath)return {ok:false,code:"PAGE_CHANGED"};
   const jq=window.jQuery;if(!jq?.fn?.dataTable?.isDataTable)return {ok:false,code:"DATATABLE_UNAVAILABLE"};
   const rows=[],ids=new Set();
   for(const table of document.querySelectorAll("table")){
    if(!table.getClientRects().length||!jq.fn.dataTable.isDataTable(table))continue;
    const list=jq(table).DataTable().rows({page:"current",search:"applied"}).data().toArray();
    for(const r of list){
     const id=String(r?.[fields.id]??"").trim(),number=String(r?.[fields.no]??"").trim();
     if(!/^\d{1,24}$/.test(id)||!number||number.length>100||ids.has(id))continue;
     ids.add(id);rows.push({[fields.id]:id,[fields.no]:number,[fields.date]:String(r[fields.date]??"").slice(0,40),FirmaAdi:String(r.FirmaAdi??r.AliciAdi??"").slice(0,160)});
     if(rows.length>=300)break;
    }
    if(rows.length>=300)break;
   }
   return {ok:true,rows};
  },args:[path,fields]});
  respond(out?.[0]?.result||{ok:false,code:"LIST_UNVERIFIED"});
 })().catch(()=>respond({ok:false,code:"LIST_UNVERIFIED"}));
 return true;
});
chrome.action.onClicked.addListener(tab=>{
 if(!tab.id||!tab.url?.startsWith("https://nettefatura.isnet.net.tr/"))return;
 chrome.tabs.sendMessage(tab.id,{type:"KY_ISNET_SHOW_PANEL"}).catch(()=>{});
});

// ERP-origin bridge. Keep one actual portal tab; user signs in on the official page.
const ERP_ORIGINS=new Set(["https://kyerp.net","https://app.kyerp.net"]);
const PORTAL="https://nettefatura.isnet.net.tr/";
const links=new Map();
async function portalTab(erpTab,create){
 let tab=null,id=links.get(erpTab);
 if(id)try{tab=await chrome.tabs.get(id)}catch{}
 if(!tab?.url?.startsWith(PORTAL)){
  const tabs=await chrome.tabs.query({url:PORTAL+"*"});
  if(tabs.length>1&&!create)throw Error("MULTIPLE_PORTAL_TABS");
  tab=tabs.find(t=>t.active)||tabs[0]||null;
 }
 if(!tab&&create)tab=await chrome.tabs.create({url:PORTAL,active:true});
 if(!tab)throw Error("PORTAL_TAB_REQUIRED");
 links.set(erpTab,tab.id);
 return tab;
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(m?.type!=="KY_ERP_CENTER"||s.frameId!==0||!s.tab?.id)return false;
 let u;try{u=new URL(s.url)}catch{return false}
 if(!ERP_ORIGINS.has(u.origin)||!u.pathname.startsWith("/e-belge/"))return false;
 (async()=>{
  if(!["status","connect","list","file"].includes(m.op))throw Error("UNSUPPORTED");
  const tab=await portalTab(s.tab.id,m.op==="connect");
  if(m.op==="connect"){await chrome.tabs.update(tab.id,{active:true});return{ok:true,data:{opened:true}}}
  const result=await chrome.tabs.sendMessage(tab.id,{type:"KY_PORTAL_AGENT",op:m.op,payload:m.payload});
  return result||{ok:false,error:"PORTAL_NOT_READY"};
 })().then(reply,e=>reply({ok:false,error:String(e.message||"PORTAL_NOT_READY").slice(0,160)}));
 return true;
});
chrome.tabs.onRemoved.addListener(id=>{links.delete(id);for(const [k,v] of links)if(v===id)links.delete(k)});
