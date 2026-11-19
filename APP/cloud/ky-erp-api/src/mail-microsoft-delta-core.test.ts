import test from "node:test";
import assert from "node:assert/strict";
import {microsoftDeltaPageState,microsoftDeltaSafeUrl,microsoftDeltaComplete} from "./mail-microsoft-delta-core.ts";

const base="https://graph.microsoft.com/v1.0/me";
const url=base+"/mailFolders/A%2FB/messages/delta?$skiptoken=page2";
test("first four pages do not become a completed delta checkpoint",()=>{
 const p=microsoftDeltaPageState({"@odata.nextLink":url,value:[{id:"1"}]});
 assert.equal(p.complete,false);
 assert.equal(p.cursor,url);
 assert.equal(microsoftDeltaComplete([{ok:true,completed:false}],1),false);
});
test("deltaLink is persisted only at the end of the traversal",()=>{
 const p=microsoftDeltaPageState({"@odata.deltaLink":base+"/mailFolders/A%2FB/messages/delta?$deltatoken=done",value:[]});
 assert.equal(p.complete,true);
 assert.match(p.cursor,/deltatoken/);
 assert.equal(microsoftDeltaComplete([{ok:true,completed:true}],1),true);
});
test("stale or missing graph continuation cannot accidentally succeed",()=>{
 assert.throws(()=>microsoftDeltaPageState({value:[]}),/CURSOR_INVALID/);
 assert.throws(()=>microsoftDeltaPageState({"@odata.nextLink":"one","@odata.deltaLink":"two"}),/CURSOR_INVALID/);
});
test("continuation cursor stays in the same Microsoft mailbox and folder",()=>{
 assert.equal(microsoftDeltaSafeUrl(url,base,"A/B"),url);
 const quoted=base+"/mailFolders('A%2FB')/messages/delta?$skiptoken=second";
 assert.equal(microsoftDeltaSafeUrl(quoted,base,"A/B"),quoted);
 assert.throws(()=>microsoftDeltaSafeUrl("https://evil.example/delta?token=1",base,"A/B"),/URL_INVALID/);
 assert.throws(()=>microsoftDeltaSafeUrl(base+"/mailFolders/OTHER/messages/delta?$skiptoken=3",base,"A/B"),/FOLDER_MISMATCH/);
 assert.throws(()=>microsoftDeltaSafeUrl(base+"/messages?$skiptoken=3",base,"A/B"),/FOLDER_MISMATCH/);
});
test("unvisited folders and account-level cap must be reported as partial",()=>{
 assert.equal(microsoftDeltaComplete([{ok:true,completed:true}],2),false);
 assert.equal(microsoftDeltaComplete([{ok:true,completed:true}],1,true),false);
 assert.equal(microsoftDeltaComplete([{ok:false,completed:false}],1),false);
});
