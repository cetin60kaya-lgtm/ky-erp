import { createHash } from "node:crypto";

/**
 * Vendor-neutral raw reader contract. This module is server/Windows-Agent only;
 * never bundle native device SDKs or raw biometric templates into the web UI.
 */
export const DEVICE_FAMILIES = Object.freeze([
  { id:"ky-pdks-existing", name:"KY PDKS mevcut terminal", transport:"existing-sdk", availability:"existing-device-needs-regression" },
  { id:"zkteco-standalone", name:"ZKTeco Standalone", transport:"windows-sdk", availability:"adapter-required" },
  { id:"suprema-biostar", name:"Suprema BioStar 2", transport:"https-api-or-device-sdk", availability:"adapter-required" },
  { id:"anviz-crosschex", name:"Anviz CrossChex", transport:"cloud-api-or-local-sdk", availability:"model-dependent" },
  { id:"hikvision-isapi", name:"Hikvision", transport:"isapi-model-dependent", availability:"adapter-required" },
  { id:"file-tnf", name:"PDKS TNF dosyası", transport:"verified-file-import", availability:"adapter-required" },
  { id:"vendor-open-api", name:"Bağımsız açık API", transport:"https-webhook-poll", availability:"adapter-required" },
]);

const text = (s) => String(s ?? "").trim();
const validCalendarDay = (year,month,day) => {
  const d = new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year && d.getUTCMonth()+1===month && d.getUTCDate()===day;
};

export function parseLocalPunchTimestamp(value) {
  const raw = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!m) throw new Error("INVALID_LOCAL_DEVICE_TIMESTAMP");
  const [year,month,day,hour,minute,second]=m.slice(1).map(Number);
  if (!validCalendarDay(year,month,day)||hour>23||minute>59||second>59)
    throw new Error("INVALID_LOCAL_DEVICE_TIMESTAMP");
  // No timezone inference. Source device and company timezone are mandatory metadata.
  return raw.replace(" ","T");
}

export function normalizeDeviceEvidence(raw) {
  const deviceId=text(raw?.deviceId);
  const sourceRecordId=text(raw?.sourceRecordId);
  const cardNo=text(raw?.cardNo);
  const timestamp=parseLocalPunchTimestamp(raw?.localTimestamp);
  const timezone=text(raw?.timezone);
  const rawSha256=text(raw?.rawSha256).toLowerCase();
  const companyId=text(raw?.companyId);
  if (!companyId || !deviceId || !sourceRecordId || !/^[0-9]{1,16}$/.test(cardNo) ||
    !/^\p{Script=Latin}*[A-Za-z]+\/[A-Za-z_]+$/u.test(timezone) ||
    !/^[a-f0-9]{64}$/.test(rawSha256)) throw new Error("INVALID_DEVICE_EVIDENCE");
  const sourceKey=createHash("sha256")
    .update(JSON.stringify([companyId,deviceId,sourceRecordId,rawSha256]))
    .digest("hex");
  return Object.freeze({
    companyId, deviceId, sourceRecordId,cardNo,localTimestamp:timestamp,
    timezone,rawSha256,sourceKey,kind:"PHYSICAL_TERMINAL_RAW",readonly:true,
  });
}

export function ensureCertifiedAdapter(adapter) {
  if (!adapter || adapter.certified !== true || typeof adapter.readRawBatch !== "function" ||
      typeof adapter.healthCheck !== "function" || typeof adapter.getCapabilities !== "function") {
    throw new Error("UNVERIFIED_DEVICE_ADAPTER");
  }
  const caps=adapter.getCapabilities();
  if (!caps || caps.readRaw!==true || caps.deleteDeviceLogs===true)
    throw new Error("UNSAFE_DEVICE_CAPABILITIES");
  return adapter;
}

export function createDeviceRegistry() {
  const providers=new Map();
  return Object.freeze({
    register(adapter) {
      ensureCertifiedAdapter(adapter);
      const key=text(adapter.id);
      if (!key || providers.has(key)) throw new Error("DEVICE_ADAPTER_COLLISION");
      providers.set(key,adapter);
    },
    list() {return [...providers.values()].map((a)=>({id:a.id,certified:a.certified,caps:a.getCapabilities()}));},
    async readBatch(id, options={}) {
      const adapter=providers.get(text(id));
      if (!adapter) throw new Error("DEVICE_ADAPTER_NOT_CERTIFIED");
      if(options.deleteAfterRead) throw new Error("RAW_DELETE_FORBIDDEN");
      const batch=await adapter.readRawBatch({...options,deleteAfterRead:false});
      if(!Array.isArray(batch)) throw new Error("DEVICE_BATCH_INVALID");
      const events=batch.map(normalizeDeviceEvidence);
      const keys=new Set();
      for(const event of events) {
        if(keys.has(event.sourceKey)) throw new Error("DUPLICATE_RAW_EVENT_IN_BATCH");
        keys.add(event.sourceKey);
      }
      // Evidence is not imported into FDB/TNF here. The authorized engine
      // must validate, preview, apply atomically, reconcile and acknowledge.
      return Object.freeze(events);
    },
  });
}
