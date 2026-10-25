import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../public/guvenlik/",import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),"utf8");
const html=read("index.html"),app=read("app.js"),css=read("app.css");
const setup=readFileSync(new URL("components/shell/PhoneApprovalDeviceSetup.jsx",import.meta.url),"utf8");

test("single native-style mobile navigation has real screens and accessible menu",()=>{
 const tabs=["home","approvals","sessions","code","activity","computers","logs","notes","chat","device","account"];
 for(const name of tabs)assert.match(html,new RegExp('id="'+name+'Tab"'));
 assert.match(html,/id="securityMenuSheet" class="security-menu-sheet"/);
 assert.match(html,/id="securityMenuOpen" aria-haspopup="dialog"/);
 assert.match(html,/id="securityMenuClose" type="button"/);
 assert.match(html,/data-tab="home"/);
 assert.match(html,/data-tab="account"/);
 assert.match(app,/dialog\.showModal\(\)/);
 assert.match(app,/closeSecurityMenu\(\)/);
 assert.match(app,/window\.dispatchEvent\(new CustomEvent\("kysecurity:tab"/);
 assert.match(app,/MOBILE_TABS=/);
 assert.match(css,/position:fixed;z-index:25;bottom:0/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(html,/securityMoreTabs|security-more-tabs|href="\/ky-sistem\//);
});

test("HTML element IDs are unique and semantic layout sections are balanced",()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,"duplicate IDs break screen actions");
 const tags=["main","header","footer","section","nav","div","dialog"];
 const tokens=[...html.matchAll(/<\/?(main|header|footer|section|nav|div|dialog)\b[^>]*>/g)].map(m=>m[0]);
 const stack=[];
 for(const tag of tokens){
  const name=tag.match(/^<\/?(\w+)/)[1];
  if(tag.startsWith("</"))assert.equal(stack.pop(),name,"closing element "+tag+" must match");
  else stack.push(name);
 }
 assert.deepEqual(stack,[],"no open UI sections may remain");
});

test("server ownership, controls and account scope survive redesign",()=>{
 for(const id of ["superAdminConsole","companyAdminConsole","ownerSummarySessions","ownerSummaryDevices","ownerSummaryLogins","ownerSummaryEvents",
 "pendingPanel","pendingList","emptyPanel","generateCodeButton","loginCodeValue","loginCodeCountdown",
 "controlToolbar","controlCompanyFilter","sessionList","computerList","securityLogList",
 "accountFullName","accountScope","accountSecurityCaps","readyPanel","repairButton","relinkButton","toast"])
 assert.ok(html.includes('id="'+id+'"'),"missing action "+id);
 assert.match(app,/ownerControlAuthorized===true/);
 assert.match(app,/companyApprover!==false/);
 assert.match(app,/await confirmLocalUnlock\(device\)/);
 assert.match(app,/signDecision\(device/);
 assert.match(app,/if\(firstPendingLoad\|\|hasNewPending\|\|!manualTabSelection\)showTab\("approvals"\)/);
 assert.match(app,/showTab\("home"\)/);
});

test("device enrollment and notification repair never erase live phone on an incomplete request",()=>{
 assert.match(app,/DB_NAME="kyerp-security-fresh-v3"/);
 assert.match(app,/CLIENT_VERSION="security-v4\.0"/);
 assert.match(app,/APP_DISPLAY_VERSION="v4\.1\.1"/);
 assert.doesNotMatch(app,/pendingEnrollment:true/);
 assert.match(app,/const previousDevice=await readDevice\(\)/);
 assert.match(app,/replaceDeviceId:previousDevice\?\.deviceId/);
 assert.match(app,/await ensurePushSubscription\(false\)/);
 assert.doesNotMatch(app,/ensurePushSubscription\(true\)/);
 assert.match(app,/const latestDevice=await readDevice\(\)/);
 assert.match(app,/requestSequence!==pendingRefreshSequence/);
 assert.match(app,/if\(!seconds\)\{/);
 assert.match(app,/els\.loginCodeValue\.textContent="— — — — — —"/);
});
test("ERP setup uses only the canonical Security URL for new and existing installations",()=>{
 assert.match(setup,/new URL\("https:\/\/security\.kyerp\.net\/guvenlik\/"\)/);
 assert.doesNotMatch(setup,/sourceEnrollment\?\.appUrl/);
 assert.match(setup,/KY ERP Güvenlik v4\.1\.1/);
});
