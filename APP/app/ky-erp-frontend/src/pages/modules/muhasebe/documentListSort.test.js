import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_DOCUMENT_SORT,nextDocumentSort} from "./documentListSort.js";

test("document date and amount sort defaults newest/largest first",()=>{
 assert.deepEqual(nextDocumentSort(DEFAULT_DOCUMENT_SORT,"TOTAL"),{sortBy:"TOTAL",sortDirection:"DESC"});
 assert.deepEqual(nextDocumentSort(DEFAULT_DOCUMENT_SORT,"DATE"),{sortBy:"DATE",sortDirection:"ASC"});
});
test("server ordering toggles on same column and rejects unsupported values",()=>{
 const name=nextDocumentSort(DEFAULT_DOCUMENT_SORT,"PARTY");
 assert.deepEqual(name,{sortBy:"PARTY",sortDirection:"ASC"});
 assert.deepEqual(nextDocumentSort(name,"PARTY"),{sortBy:"PARTY",sortDirection:"DESC"});
 assert.deepEqual(nextDocumentSort(name,"DROP TABLE"),DEFAULT_DOCUMENT_SORT);
});
