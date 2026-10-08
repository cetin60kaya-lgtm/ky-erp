import test from "node:test";
import assert from "node:assert/strict";
import { isActivePdksPerson, isPdksPersonInPeriod, visiblePdksPeople, selectedPdksPerson, pdksLiveHealth } from "./pdksPresentation.js";

const now = new Date("2026-10-08T09:30:00Z").getTime();
const people = [
  { id:"b", cardNo:"00010", fullName:"Pasif Personel", status:"Pasif" },
  { id:"a", cardNo:"00002", fullName:"Ahmet Kurt", status:"Aktif" },
  { id:"c", cardNo:"00003", fullName:"Ayrılan", status:"Aktif", exitDate:"20.03.2023" },
  { id:"d", cardNo:"00001", fullName:"Ayşe Öksüz", status:"Aktif", personnelGroupName:"Mesaili Grup" },
];

test("PDKS active, passive and all filters are exclusive and sorted by card", () => {
  assert.deepEqual(visiblePdksPeople(people, "AKTIF", "", now).map(p=>p.id), ["d","a"]);
  assert.deepEqual(visiblePdksPeople(people, "PASIF", "", now).map(p=>p.id), ["c","b"]);
  assert.deepEqual(visiblePdksPeople(people, "TUM", "", now).map(p=>p.id), ["d","a","c","b"]);
  assert.deepEqual(visiblePdksPeople(people, "AKTIF", "mesaili", now).map(p=>p.id), ["d"]);
});

test("PDKS selection never keeps a passive person's detail when active scope is selected", () => {
  assert.equal(selectedPdksPerson(people, "AKTIF", "b", now)?.id, "d");
  assert.equal(selectedPdksPerson(people, "PASIF", "a", now)?.id, "c");
  assert.equal(selectedPdksPerson(people, "TUM", "b", now)?.id, "b");
});

test("Exit dates and status labels mark personnel inactive without guessing punches", () => {
  assert.equal(isActivePdksPerson({ status:"Aktif", exitDate:"2026-10-07" }, now), false);
  assert.equal(isActivePdksPerson({ status:"Aktif", exitDate:"2026-10-25" }, now), true);
  assert.equal(isActivePdksPerson({ activePassive:"İşten Ayrıldı" }, now), false);
  assert.equal(isActivePdksPerson({ status:"Aktif", exitDate:"2026-10-08" }, now), true);
  assert.equal(isActivePdksPerson({ status:"Aktif", exitDate:"08.10.2026" }, now), true);
});

test("PDKS dashboard does not certify attendance from offline or unsynced devices", () => {
  const recentSeen = new Date(now - 60000).toISOString();
  const recentSync = new Date(now - 120000).toISOString();
  const stale = new Date(now - 3600000).toISOString();
  const online = pdksLiveHealth([{ id:"1", active:1, lastSeenAt:recentSeen, lastSyncAt:recentSync }], now);
  assert.equal(online.hasRecentSync,true);
  assert.equal(online.freshness,"fresh");
  assert.equal(online.onlineCount,1);
  const agentWithoutSync = pdksLiveHealth([{ id:"1", active:1, lastSeenAt:recentSeen, lastSyncAt:stale }], now);
  assert.equal(agentWithoutSync.hasRecentSync,false);
  assert.equal(agentWithoutSync.freshness,"warning");
  const disconnected = pdksLiveHealth([{ id:"1", active:1, lastSeenAt:stale, lastSyncAt:recentSync }], now);
  assert.equal(disconnected.hasRecentSync,false);
  assert.equal(disconnected.onlineCount,0);
  assert.equal(disconnected.freshness,"offline");
  assert.equal(pdksLiveHealth([],now).hasRecentSync,false);
});


test("PDKS historical month keeps employees who left inside or after the period", () => {
  const start = new Date(2026, 7, 1).getTime();
  const end = new Date(2026, 8, 0, 23, 59, 59, 999).getTime();
  const history = [
    { id:"aug", cardNo:"00039", status:"Pasif", entryDate:"2025-01-01", exitDate:"2026-08-24" },
    { id:"old", cardNo:"00056", status:"Pasif", exitDate:"2026-07-15" },
    { id:"new", cardNo:"00057", status:"Aktif", entryDate:"2026-09-01" },
    { id:"continuing", cardNo:"00003", status:"Aktif", entryDate:"2026-02-01" }
  ];
  assert.equal(isPdksPersonInPeriod(history[0],start,end), true);
  assert.deepEqual(visiblePdksPeople(history,"AKTIF","",end,start).map(p=>p.id), ["continuing","aug"]);
  assert.equal(selectedPdksPerson(history,"AKTIF","aug",end,start)?.id, "aug");
  assert.deepEqual(visiblePdksPeople(history,"PASIF","",end,start).map(p=>p.id), ["old","new"]);
});
