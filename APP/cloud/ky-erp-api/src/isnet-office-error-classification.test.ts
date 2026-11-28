import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./isnet-office-routes.ts",import.meta.url),"utf8");
test("Native heartbeat keeps device and IP gate but separates storage failures from 403",()=>{
 const h=s.slice(s.indexOf("app.post(OFFICE_HEARTBEAT_PATH"),s.indexOf('app.get("/api/isnet/office/archive-job"'));
 assert.match(h,/authorizeOfficeDevice\(officeRegistry\(/);
 assert.match(h,/trustedEdgeIp:c\.req\.header\("CF-Connecting-IP"\)/);
 assert.match(h,/catch\{return c\.json\(error\("OFFICE_DEVICE_DENIED"\),403\)\}\s*try\{/);
 assert.match(h,/await heartbeatOfficeDevice/);
 assert.match(h,/code:"OFFICE_STORAGE_UNAVAILABLE"[\s\S]*503/);
 assert.match(h,/sendEnabled:false/);
 assert.doesNotMatch(h,/OFFICE_DEVICE_OR_STORAGE_DENIED/);
});
test("Archive business preconditions remain 409; unexpected storage failure is 503, not success",()=>{
 const h=s.slice(s.indexOf('app.post("/api/isnet/office/archive-job"'),s.indexOf("app.post(OFFICE_ARCHIVE_PATH"));
 assert.match(h,/DRIVE_WRITE_REQUIRED/);assert.match(h,/DRIVE_INDEX_NOT_READY/);
 assert.match(h,/ARCHIVE_STORAGE_UNAVAILABLE/);assert.match(h,/known\?409:503/);
});
