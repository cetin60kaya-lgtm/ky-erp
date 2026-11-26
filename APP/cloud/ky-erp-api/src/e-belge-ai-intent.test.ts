import {test} from "node:test";
import assert from "node:assert/strict";
import {validateInterpretation} from "./e-belge-ai-intent.ts";
const raw="Model A, Test Cari için 100 adet, 10 TL birim fiyatla fatura hazırla";
const command="Test Cari için Model A 100 adet 10 TL’den doğrudan fatura oluştur";
test("AI may reorder literal fields; it cannot introduce parties or values",()=>{assert.equal(validateInterpretation(raw,{command}).command,command);for(const c of [command.replace("Test Cari","Başka Cari"),command.replace("100 adet","200 adet"),command.replace("10 TL","11 TL")])assert.throws(()=>validateInterpretation(raw,{command:c}))});
test("AI suggestions never bypass unsupported source or extra actions",()=>{for(const suffix of [" ve gönder"," irsaliyeden"," iskonto %5"])assert.throws(()=>validateInterpretation(raw+suffix,{command}));assert.throws(()=>validateInterpretation(raw,{command,send:true}));assert.equal(validateInterpretation(raw,{question:"Modeli belirtin"}).command,"")});
