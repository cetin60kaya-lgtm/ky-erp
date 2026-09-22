const FOREGROUND_SYNC_MS=5000;
let foregroundSyncTimer=null;
let foregroundSyncBusy=false;
let lastPendingSignature="";

function securityRuntime(){return window.KYSecurityRuntime||null}
function scheduleForegroundSync(delay=FOREGROUND_SYNC_MS){
  clearTimeout(foregroundSyncTimer);
  foregroundSyncTimer=setTimeout(runForegroundSync,delay);
}
function pendingSignature(items){
  return (Array.isArray(items)?items:[])
    .map((item)=>`${String(item?.kind||"")}:${String(item?.id||"")}:${String(item?.status||"")}`)
    .sort()
    .join("|");
}
async function runForegroundSync(){
  if(foregroundSyncBusy){scheduleForegroundSync();return}
  if(document.visibilityState!=="visible"){scheduleForegroundSync();return}
  if(!document.querySelector("#setupPanel")?.classList.contains("hidden")){scheduleForegroundSync();return}
  const runtime=securityRuntime();
  if(!runtime){scheduleForegroundSync(1000);return}
  foregroundSyncBusy=true;
  try{
    const device=await runtime.readDevice().catch(()=>null);
    if(!device?.deviceId||!device?.deviceToken||!device?.signingPrivateKey)return;
    const payload=await runtime.deviceFetch("/auth/push/device/pending");
    const items=Array.isArray(payload?.data?.items)?payload.data.items:[];
    const signature=pendingSignature(items);
    const shownCount=Number(document.querySelector("#tabCount")?.textContent||0);
    if(signature!==lastPendingSignature||items.length!==shownCount){
      lastPendingSignature=signature;
      await runtime.refreshState({foregroundFallback:true});
    }
  }catch{
    // Push ana kanaldir; bu yalniz uygulama acikken sessiz yedek kontroldur.
  }finally{
    foregroundSyncBusy=false;
    scheduleForegroundSync();
  }
}
function startForegroundSync(){
  scheduleForegroundSync(1200);
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")scheduleForegroundSync(250);
});
window.addEventListener("online",()=>scheduleForegroundSync(250));
if(securityRuntime())startForegroundSync();
else window.addEventListener("kysecurity:runtime-ready",startForegroundSync,{once:true});
