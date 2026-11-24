// Only exact ERP origins and the real NetteFatura origin. No cookie/password API.
const ERP_ORIGINS=new Set(["https://kyerp.net","https://app.kyerp.net"]);
const PORTAL="https://nettefatura.isnet.net.tr/";
const links=new Map();
async function portalTab(erpTab,mode){
 let tab=null,id=links.get(erpTab);
 if(id)try{tab=await chrome.tabs.get(id)}catch{}
 if(!tab?.url?.startsWith(PORTAL)){
  const tabs=await chrome.tabs.query({url:PORTAL+"*"});
  if(tabs.length>1&&mode!=="connect")throw Error("MULTIPLE_PORTAL_TABS");
  tab=tabs.find(t=>t.active)||tabs[0]||null;
 }
 if(!tab&&(mode==="connect"||mode==="status")){
  tab=await chrome.tabs.create({url:PORTAL,active:mode==="connect"});
  // A normal first-party tab loads the provider's own login or current session.
  for(let i=0;i<40;i++){
   tab=await chrome.tabs.get(tab.id);
   if(tab.status==="complete")break;
   await new Promise(r=>setTimeout(r,250));
  }
 }
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
  const tab=await portalTab(s.tab.id,m.op);
  if(m.op==="connect"){await chrome.tabs.update(tab.id,{active:true});return{ok:true,data:{opened:true}}}
  const result=await chrome.tabs.sendMessage(tab.id,{type:"KY_PORTAL_AGENT",op:m.op,payload:m.payload});
  return result||{ok:false,error:"PORTAL_NOT_READY"};
 })().then(reply,e=>reply({ok:false,error:String(e.message||"PORTAL_NOT_READY").slice(0,160)}));
 return true;
});
chrome.tabs.onRemoved.addListener(id=>{links.delete(id);for(const [k,v] of links)if(v===id)links.delete(k)});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:"https://kyerp.net/e-belge/entegrasyonlar"}));
