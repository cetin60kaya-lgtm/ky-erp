import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const api=readFileSync(new URL("../../../services/eBelgeApi.js",import.meta.url),"utf8");
const page=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
const auth=readFileSync(new URL("../../../context/AuthContext.jsx",import.meta.url),"utf8");
const commonApi=readFileSync(new URL("../../../utils/api.js",import.meta.url),"utf8");
test("document PDF and XML are fetched as original bytes, never image-preview thumbnails",()=>{
 assert.match(api,/getEBelgeOriginalDocumentFile/);
 assert.match(api,/\/e-belge\/documents\/\$\{encodeURIComponent\(documentId\)\}\/files\/\$\{encodeURIComponent\(fileId\)\}\/original/);
 assert.match(page,/getEBelgeOriginalDocumentFile\(id,file\.id\)/);
 assert.match(page,/getEBelgeOriginalDocumentFile\(id,pdfFile\.id\)/);
 assert.match(page,/getEBelgeOriginalDocumentFile\(id,xmlFile\.id\)/);
});
test("business 401 must be verified with current /auth/me before clearing the session",()=>{
 assert.match(commonApi,/onUnauthorized\?\.\(\{ requestedToken: token, requestPath, code: responseCode \}\)/);
 assert.match(auth,/const verifyUnauthorized = useCallback/);
 assert.match(auth,/await directAuthRequest\("\/auth\/me",\{method:"GET",token:checkedToken,timeoutMs:12000\}\)/);
 assert.match(auth,/tokenRef\.current===checkedToken\)clearAuth\(\)/);
 assert.match(auth,/shouldClearStoredAuthForStatus\(status,code,"\/api\/auth\/me"\)/);
});
