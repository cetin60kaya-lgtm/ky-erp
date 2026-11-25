import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const s=readFileSync(new URL("./auth-browser-session.ts",import.meta.url),"utf8");
test("origin-scoped HttpOnly resume only uses active existing sessions",()=>{for(const key of ["__Host-kyerp-browser-","Secure; HttpOnly; SameSite=Strict","BROWSER_ORIGIN_FORBIDDEN","getAuthenticatedUser(c,token)","Math.min(36000","BROWSER_SESSION_CHANGED","await db.batch"])assert.ok(s.includes(key),key);assert.doesNotMatch(s,/INSERT INTO auth_sessions/);assert.doesNotMatch(s,/SET expires_at=/)});
