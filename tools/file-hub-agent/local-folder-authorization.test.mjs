import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { approvedLocalFileHubRoots } from "./local-folder-authorization.mjs";

function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"kyerp-folder-grant-test-"));
  const approved=path.join(root,"approved");const inside=path.join(approved,"files");
  const unauthorized=path.join(root,"other");
  fs.mkdirSync(inside,{recursive:true});fs.mkdirSync(unauthorized,{recursive:true});
  const grantsFile=path.join(root,"folder-grants.json");
  return {
    approved,inside,unauthorized,grantsFile,
    write(grants){fs.writeFileSync(grantsFile,JSON.stringify(grants));},
    end(){fs.rmSync(root,{recursive:true,force:true});},
  };
}

test("only selected File Hub source and its children are eligible",t=>{
  const f=fixture();t.after(()=>f.end());
  f.write([{Id:"1",FullPath:f.approved,Company:"mecit-hakan",Purpose:"FILE_HUB",Permission:"READ_ONLY"}]);
  const rows=approvedLocalFileHubRoots([
    {storageConnectionId:"yes",rootPath:f.inside},
    {storageConnectionId:"no",rootPath:f.unauthorized},
  ],{requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan"});
  assert.deepEqual(rows.map(x=>x.storageConnectionId),["yes"]);
});

test("code read-only grant does not silently authorize cloud index or write",t=>{
  const f=fixture();t.after(()=>f.end());
  f.write([{Id:"1",FullPath:f.approved,Company:"mecit-hakan",Purpose:"CODE_READONLY",Permission:"READ_ONLY"}]);
  assert.throws(()=>approvedLocalFileHubRoots([{rootPath:f.approved}],{
    requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan",
  }),/onaylı File Hub/);
});

test("write requires a separate FILE_HUB_WRITE consent",t=>{
  const f=fixture();t.after(()=>f.end());
  f.write([{Id:"1",FullPath:f.approved,Company:"mecit-hakan",Purpose:"FILE_HUB",Permission:"READ_ONLY"}]);
  assert.throws(()=>approvedLocalFileHubRoots([{rootPath:f.approved}],{
    requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan",mode:"write",
  }),/onaylı File Hub/);
  f.write([{Id:"2",FullPath:f.approved,Company:"mecit-hakan",Purpose:"FILE_HUB_WRITE",Permission:"FILE_HUB_WRITE"}]);
  assert.equal(approvedLocalFileHubRoots([{rootPath:f.approved}],{
    requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan",mode:"write",
  }).length,1);
});

test("tenant isolation rejects another company grant",t=>{
  const f=fixture();t.after(()=>f.end());
  f.write([{Id:"1",FullPath:f.approved,Company:"another-company",Purpose:"FILE_HUB",Permission:"READ_ONLY"}]);
  assert.throws(()=>approvedLocalFileHubRoots([{rootPath:f.approved}],{
    requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan",
  }),/onaylı File Hub/);
});

test("empty approval list fails closed without scanning filesystem",t=>{
  const f=fixture();t.after(()=>f.end());
  f.write([]);
  assert.throws(()=>approvedLocalFileHubRoots([{rootPath:f.approved}],{
    requireGrants:true,grantsFile:f.grantsFile,company:"mecit-hakan",
  }),/onaylı File Hub/);
});
