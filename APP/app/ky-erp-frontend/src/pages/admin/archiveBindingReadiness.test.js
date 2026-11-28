import test from "node:test";import assert from "node:assert/strict";
import {archiveBindingReadiness} from "./archiveBindingReadiness.js";
test("Arşiv durumu bilinmeyen veriyi hazır göstermez",()=>{assert.equal(archiveBindingReadiness(false).checks[0].value,"—");});
test("Eski okuma izni ile canlı yazma ayrıdır",()=>{const a={module_code:"E_BELGE",purpose_code:"E_DOCUMENT",storage_connection_id:"a",readEnabled:true,writeEnabled:false,syncEnabled:true};const c={id:"a",isActive:true,provider_type:"GOOGLE_DRIVE",sync_mode:"CLOUD_API",connection_status:"CONNECTED"};assert.match(archiveBindingReadiness(true,[a],[c]).message,/üç izin/);assert.match(archiveBindingReadiness(true,[a,a],[c]).message,/Birden fazla/);});
