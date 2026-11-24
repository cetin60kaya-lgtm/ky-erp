import test from "node:test";
import assert from "node:assert/strict";
import {selectProfile,localSevkTime} from "./isnetWorkflowDefaults.js";
test("cari varsayılanı genel varsayılana üstün, diğer cari karışmaz",()=>{const p=[{id:"g",companyId:"",isDefault:true},{id:"a",companyId:"a",isDefault:true},{id:"b",companyId:"b",isDefault:false}];assert.equal(selectProfile(p,"a").id,"a");assert.equal(selectProfile(p,"b").id,"g");assert.equal(selectProfile([],"a"),null);});
test("sevk zamanı Türkiye gününe göre",()=>{assert.deepEqual(localSevkTime(new Date("2026-11-24T22:30:00Z")),{date:"2026-11-25",time:"01:30"});});
