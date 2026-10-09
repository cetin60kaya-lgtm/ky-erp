/**
 * Safe device onboarding. Support is per MODEL and certified adapter, never
 * implied by vendor name or by QR/RFID/fingerprint marketing claims.
 * No credentials, fingerprint templates, faces or QR payloads are persisted.
 */
export const TERMINAL_CONNECTIONS=Object.freeze([
  {id:"tcp-sdk",label:"LAN / TCP ve üretici SDK",needs:["host","port"],approval:"SDK_MODEL_CERTIFICATION"},
  {id:"https-api",label:"HTTPS API / üretici Cloud",needs:["baseUrl"],approval:"API_MODEL_CERTIFICATION"},
  {id:"push-webhook",label:"Cihaz push / webhook",needs:["baseUrl"],approval:"SIGNED_WEBHOOK_CERTIFICATION"},
  {id:"serial",label:"RS232 / RS485",needs:["comPort"],approval:"DRIVER_MODEL_CERTIFICATION"},
  {id:"usb-file",label:"USB ile dosya aktarımı",needs:["importFormat"],approval:"FILE_FORMAT_CERTIFICATION"},
  {id:"tnf-reference",label:"TNF arşiv içe aktarımı",needs:["importFormat"],approval:"REFERENCE_ONLY"},
  {id:"qr-reader",label:"QR / barkod okuma",needs:["readerMode"],approval:"PUNCH_ORIGIN_CERTIFICATION"},
]);
export const TERMINAL_CREDENTIALS=Object.freeze([
  {id:"rfid",label:"RFID / Proximity / MIFARE kart"},
  {id:"nfc",label:"NFC kart / telefon"},
  {id:"qr",label:"QR / barkod"},
  {id:"pin",label:"PIN"},
  {id:"fingerprint",label:"Parmak izi (şablon depolanmaz)"},
  {id:"face",label:"Yüz tanıma (biyometrik veri depolanmaz)"},
  {id:"palm",label:"Avuç içi (biyometrik veri depolanmaz)"},
]);
export const TERMINAL_FAMILIES=Object.freeze([
  {id:"existing",label:"Mevcut Hedef/KY terminali",connection:"tcp-sdk"},
  {id:"zkteco",label:"ZKTeco",connection:"tcp-sdk"},
  {id:"suprema",label:"Suprema BioStar",connection:"https-api"},
  {id:"anviz",label:"Anviz CrossChex",connection:"https-api"},
  {id:"hikvision",label:"Hikvision ISAPI",connection:"https-api"},
  {id:"dahua",label:"Dahua",connection:"https-api"},
  {id:"honeywell",label:"Honeywell",connection:"tcp-sdk"},
  {id:"rosslare",label:"Rosslare",connection:"tcp-sdk"},
  {id:"generic-qr",label:"Bağımsız QR / barkod terminali",connection:"qr-reader"},
  {id:"generic-open-api",label:"Diğer üretici / açık API",connection:"https-api"},
  {id:"legacy-serial",label:"Eski seri port PDKS",connection:"serial"},
  {id:"generic-usb",label:"Dosya aktarımlı PDKS",connection:"usb-file"},
]);
const safe=(v)=>String(v??"").trim();
const ids=(items)=>new Set(items.map(x=>x.id));
const fam=ids(TERMINAL_FAMILIES),connections=ids(TERMINAL_CONNECTIONS),credentials=ids(TERMINAL_CREDENTIALS);
const clean=(x)=>safe(x).replace(/[\u0000-\u001f]/g,"");
export function buildTerminalDefinition(input){
  if(!input||typeof input!=="object")throw Error("TERMINAL_INVALID_DEFINITION");
  const family=clean(input.family),transport=clean(input.transport),name=clean(input.name);
  const model=clean(input.model),serial=clean(input.serial);
  const selected=[...new Set(Array.isArray(input.credentials)?input.credentials.map(clean):[])];
  if(!fam.has(family)||!connections.has(transport)||!name||name.length>80||
    !model||model.length>100||serial.length>100||selected.some(x=>!credentials.has(x)))
    throw Error("TERMINAL_INVALID_DEFINITION");
  const host=clean(input.host),url=clean(input.baseUrl),comPort=clean(input.comPort);
  const port=Number(input.port);
  if(transport==="tcp-sdk"&&(!/^(?:[A-Za-z0-9][A-Za-z0-9.-]{0,250})$/.test(host)||
    !Number.isInteger(port)||port<1||port>65535))
    throw Error("TERMINAL_INVALID_ENDPOINT");
  if(["https-api","push-webhook"].includes(transport)&&
    (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{2,5})?(?:\/[A-Za-z0-9._~\/-]*)?$/.test(url)||
      /(?:^|[./-])(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?:[/:.-]|$)/i.test(url)))
    throw Error("TERMINAL_HTTPS_REQUIRED");
  if(transport==="serial"&&!/^COM(?:[1-9]|[1-9][0-9])$/i.test(comPort))
    throw Error("TERMINAL_INVALID_SERIAL_PORT");
  if(["usb-file","tnf-reference"].includes(transport)&&
    !["TNF","CSV","VENDOR_SPECIFIC"].includes(safe(input.importFormat)))
    throw Error("TERMINAL_IMPORT_FORMAT_REQUIRED");
  if(transport==="qr-reader"&&!["HID_KEYBOARD","SERIAL","HTTPS_SIGNED"].includes(safe(input.readerMode)))
    throw Error("TERMINAL_READER_MODE_REQUIRED");
  return Object.freeze({
    version:1,family,name,model,serial,transport,
    endpoint:transport==="tcp-sdk"?{host,port}:["https-api","push-webhook"].includes(transport)?
      {baseUrl:url}:transport==="serial"?{comPort}:transport==="qr-reader"?
      {readerMode:clean(input.readerMode)}:{importFormat:clean(input.importFormat)},
    credentials:Object.freeze(selected),timezone:"Europe/Istanbul",
    certification:"NOT_CERTIFIED",connectionStatus:"NOT_TESTED",
    canReadPunches:false,canWriteTerminal:false,
    requiresDriverCertification:true,biometricTemplatesStored:false,
  });
}
export function approvalForTerminal({definition,driverProof}){
  if(definition?.certification!=="NOT_CERTIFIED"||
    !driverProof||driverProof.model!==definition.model||
    driverProof.transport!==definition.transport||
    driverProof.approved!==true||driverProof.readRawTestPassed!==true||
    driverProof.duplicateTestPassed!==true||
    driverProof.timezoneTestPassed!==true||
    driverProof.rollbackTestPassed!==true||
    !/^[a-f0-9]{64}$/.test(safe(driverProof.testArtifactSha256)))
    throw Error("TERMINAL_DRIVER_UNVERIFIED");
  return Object.freeze({...definition,certification:"MODEL_READONLY_CERTIFIED",
    canReadPunches:true,requiresDriverCertification:false});
}
