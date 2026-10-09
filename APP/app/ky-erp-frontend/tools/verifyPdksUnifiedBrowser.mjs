// Browser acceptance for every KY PDKS screen using Chrome DevTools protocol.
// Runs against localhost-only /pdks-studio. No database writes, no sample punches.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { PRODUCT_SECTIONS } from "../src/pages/pdksUnified/productModel.js";
import {operationsForTab} from "../src/pages/pdksUnified/operationCatalog.js";

const port=Number(process.env.KY_PDKS_BROWSER_PORT||"5186");
if(!Number.isInteger(port)||port<5186||port>5196)throw new Error("LOCAL_BROWSER_PORT_OUTSIDE_ALLOWLIST");
const url = "http://127.0.0.1:"+port+"/pdks-studio";
const executable = process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(join(tmpdir(),"ky-pdks-browser-test-"));
let processHandle;
let websocket;

async function connect(wsUrl) {
  return await new Promise((resolve,reject)=>{
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open",()=>resolve(ws),{once:true});
    ws.addEventListener("error",()=>reject(new Error("Chrome CDP WebSocket failed")),{once:true});
  });
}

const pending = new Map();
let nextId = 0;
const send = (method, params={}) => new Promise((resolve,reject)=>{
  const id = ++nextId;
  pending.set(id,{resolve,reject});
  websocket.send(JSON.stringify({id,method,params}));
});

async function evaluate(expression) {
  const response = await send("Runtime.evaluate",{
    expression,returnByValue:true,awaitPromise:true,userGesture:true,
  });
  if(response.exceptionDetails)throw new Error("Browser evaluate exception: "+JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}

const assertBrowser = (value,message) => {if(!value)throw new Error("BROWSER_ASSERT: "+message);};
async function waitForEval(expr,timeoutMs=12000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
    const actual=await evaluate(expr);
    if(actual)return actual;
    await wait(70);
  }
  throw new Error("UI_NOT_READY: "+expr);
}

try {
  processHandle=spawn(executable,[
    "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
    "--remote-debugging-port=0","--remote-allow-origins=*",
    "--window-size=1500,950","--user-data-dir="+profile,"about:blank",
  ],{stdio:"ignore"});
  const portPath=join(profile,"DevToolsActivePort");
  let port;
  for(let i=0;i<100;i++) {
    try {port=Number((await readFile(portPath,"utf8")).split("\n")[0]);if(port)break;}catch{}
    await wait(100);
  }
  if(!port)throw new Error("Chrome debugger failed to start");
  const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  const page=targets.find(x=>x.type==="page" && x.webSocketDebuggerUrl);
  if(!page)throw new Error("Chrome page target unavailable");
  websocket=await connect(page.webSocketDebuggerUrl);
  websocket.addEventListener("message",(event)=>{
    const data=JSON.parse(String(event.data));
    if(!data.id)return;
    const promise=pending.get(data.id);
    if(!promise)return;
    pending.delete(data.id);
    if(data.error)promise.reject(new Error(data.error.message));
    else promise.resolve(data.result);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate",{url});
  await waitForEval('Boolean(document.querySelector(".pdk-u-primary-nav"))');
  const sectionCount=await evaluate('document.querySelectorAll(".pdk-u-primary-nav button").length');
  assertBrowser(sectionCount===PRODUCT_SECTIONS.length,
    "Expected "+PRODUCT_SECTIONS.length+" main sections, got "+sectionCount);
  let tabClicks=0,slowest=0;
  for(let sectionIndex=0;sectionIndex<PRODUCT_SECTIONS.length;sectionIndex++) {
    const section=PRODUCT_SECTIONS[sectionIndex];
    await evaluate('document.querySelectorAll(".pdk-u-primary-nav button")['+sectionIndex+'].click()');
    await waitForEval('document.querySelector(".pdk-u-page-head h1")?.textContent==='+JSON.stringify(section.label));
    const tabs=await evaluate('document.querySelectorAll(".pdk-u-tabs button").length');
    assertBrowser(tabs===section.tabs.length,
      section.label+" tabs: expected "+section.tabs.length+" got "+tabs);
    for(let i=0;i<section.tabs.length;i++){
      const started=Date.now();
      const tab=section.tabs[i];
      await evaluate('document.querySelectorAll(".pdk-u-tabs button")['+i+'].click()');
      await waitForEval('document.querySelector(".pdk-u-tabs button[aria-selected=true]")?.textContent==='+JSON.stringify(tab.label));
      const content=tab.view==="dashboard"
        ? await evaluate('Boolean(document.querySelector(".pdk-u-dashboard"))')
        : await evaluate('document.querySelector(".pdk-u-record-head h2")?.textContent==='+JSON.stringify(tab.label));
      assertBrowser(content,"Unrendered section "+section.id+"/"+tab.id);
      assertBrowser(await evaluate('!document.querySelector(".pdk-unified .module-error-card")'),"Unhandled error UI on "+tab.id);
      if(tab.id==="punches"||tab.id==="history") {
        const pickerCount=await evaluate('document.querySelectorAll(".pdk-u-card-events input[type=date]").length');
        assertBrowser(pickerCount===2,tab.id+" date-range picker missing");
        assertBrowser(await evaluate('Array.from(document.querySelectorAll(".pdk-u-card-events input[type=date]")).every(x=>x.disabled)'),
          tab.id+" preview unexpectedly allows querying protected personnel data");
        assertBrowser(await evaluate('document.querySelector(".pdk-u-card-events")?.textContent?.includes("Tasarım önizlemesinde gerçek kart hareketleri gösterilmez.")'),
          tab.id+" must not fabricate real historical card events in Studio");
      }

      const ops=operationsForTab(tab.id);
      if(ops.length) {
        assertBrowser(await evaluate('document.querySelectorAll(".pdk-u-operation-toggle").length===1'),
          tab.id+" is missing its operation panel");
        await evaluate('document.querySelector(".pdk-u-operation-toggle").click()');
        await waitForEval('Boolean(document.querySelector(".pdk-u-operation-body"))');
        const found=await evaluate('document.querySelector(".pdk-u-operation-body > label > select")?.options.length');
        assertBrowser(found===ops.length+1,tab.id+" operation choices missing");
        for(const op of ops) {
          await evaluate('(function(){const s=document.querySelector(".pdk-u-operation-body > label > select");s.value='+
            JSON.stringify(op.id)+';s.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
          await waitForEval('document.querySelectorAll(".pdk-u-operation-fields .pdk-u-operation-label").length==='+op.fields.length);
          const canWrite=await evaluate('Boolean(document.querySelector(".pdk-u-operation-preview button, .pdk-u-operation-commit"))');
          assertBrowser(!canWrite,"Studio preview must never expose a live commit for "+op.id);
        }
      }
      tabClicks++;
      slowest=Math.max(slowest,Date.now()-started);
    }
  }
  await evaluate('document.querySelector(".pdk-u-top-right > button").click()');
  await waitForEval('document.querySelector(".pdk-unified")?.classList.contains("theme-dark")');
  const safePreview=await evaluate('document.querySelector(".pdk-u-statusbar")?.textContent?.includes("İnceleme")');
  assertBrowser(safePreview,"Studio must stay in read-only mode");
  const width=await evaluate('document.documentElement.scrollWidth<=window.innerWidth+2');
  assertBrowser(width,"Viewport has unexpected horizontal scrollbar");
  if(process.argv[2]) {
    await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false}).then(
      async(result)=>writeFile(process.argv[2],Buffer.from(result.data,"base64")));
  }
  console.log("KY_PDKS_BROWSER PASS sections="+PRODUCT_SECTIONS.length+
    " tabs="+tabClicks+" maxTabMs="+slowest+" darkMode=true previewReadOnly=true");
}finally{
  try{websocket?.close();}catch{}
  try{processHandle?.kill();}catch{}
  await rm(profile,{recursive:true,force:true,maxRetries:2,retryDelay:100}).catch(()=>{});
}
