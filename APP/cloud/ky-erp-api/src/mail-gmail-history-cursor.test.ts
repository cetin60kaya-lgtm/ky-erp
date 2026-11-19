import test from "node:test";
import assert from "node:assert/strict";
import {gmailHistoryCursor,gmailHistoryChangedMessageIds,gmailHistoryQueuePage,gmailHistoryAdvance} from "./mail-gmail-history-cursor.ts";

test("Gmail historyId remains a string, even above JS safe integer",()=>{
  const state=gmailHistoryCursor({historyId:"111999888777666555"});
  assert.equal(state.historyId,"111999888777666555");
});
test("History captures added messages and label changes without duplicates",()=>{
  const ids=gmailHistoryChangedMessageIds([{messagesAdded:[{message:{id:"a"}},{message:{id:"b"}}],
    labelsAdded:[{message:{id:"a"}}],labelsRemoved:[{message:{id:"c"}}]}]);
  assert.deepEqual(ids,["a","b","c"]);
});
test("History page token must be preserved until every pending message is handled",()=>{
  const first=gmailHistoryCursor({historyId:"100"});
  const page=gmailHistoryQueuePage(first,{historyId:"110",nextPageToken:"page-two",history:[{messagesAdded:[{message:{id:"a"}},{message:{id:"b"}},{message:{id:"c"}}]}]});
  assert.equal(page.historyId,"100");assert.equal(page.pageToken,"page-two");
  assert.deepEqual(gmailHistoryAdvance(page,2).pending,["c"]);
  const done=gmailHistoryAdvance(page,3);
  assert.equal(done.historyId,"100");assert.equal(done.pageToken,"page-two");
});
test("Last history page commits provider checkpoint only after pending is empty",()=>{
  const page=gmailHistoryQueuePage(gmailHistoryCursor({historyId:"100"}),{historyId:"190",history:[{messagesAdded:[{message:{id:"a"}}]}]});
  assert.equal(gmailHistoryAdvance(page,0).historyId,"100");
  assert.equal(gmailHistoryAdvance(page,1).historyId,"190");
});
test("Unreadable cursor fails closed without treating an invalid id as complete",()=>{
  assert.equal(gmailHistoryCursor("{invalid").historyId,"");
  assert.deepEqual(gmailHistoryCursor({historyId:"111",pending:["a","a","b"]}).pending,["a","b"]);
});
