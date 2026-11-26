import {test} from "node:test";
import assert from "node:assert/strict";
import {parseDirectCommand,resolveDirectFields} from "./e-belge-command-core.ts";
const command="Test Cari için Model A 100 adet 10 TL’den doğrudan fatura oluştur";
const item={partyId:"fixture",description:"Model A",catalogId:"MODEL:fixture",unit:"C62"};
test("strict Turkish direct command",()=>{const a=parseDirectCommand(command);assert.equal(a.price,"10");assert.equal(a.quantity,"100");assert.equal(a.item,"Model A");assert.equal(a.kind,"INVOICE")});
test("no ambiguous or linked commands",()=>{for(const s of ["bu irsaliyeden 400 adet kes",command+" ve gönder",command.replace("100","-100"),command.replace("100","0")])assert.throws(()=>parseDirectCommand(s))});
test("only missing fields requested, no guessed VAT or currency",()=>{const r=resolveDirectFields(parseDirectCommand(command),item,{},{},"2026-11-26");assert.deepEqual(r.missing.map(x=>x.field),["vatRate","scenario","currency"]);assert.equal(r.payload.lines[0].price,"10")});
test("approved defaults, explicit price provenance and unit mismatch",()=>{const defaults={price:"11",vatRate:"20",scenario:"TICARIFATURA",currency:"TRY"};const r=resolveDirectFields(parseDirectCommand(command),item,defaults,{},"2026-11-26");assert.equal(r.missing.length,0);assert.equal(r.provenance.price,"Komut");assert.equal(r.provenance.vatRate,"Onaylı firma/cari/model varsayılanı");assert.ok(resolveDirectFields(parseDirectCommand(command),{...item,unit:"KGM"},defaults,{},"2026-11-26").missing.some(x=>x.field==="unit"))});
