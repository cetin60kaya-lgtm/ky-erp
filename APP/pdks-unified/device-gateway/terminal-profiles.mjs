/**
 * KY PDKS v2 terminal definitions: installer capability plan, not automatic
 * vendor-SDK certification. All writes to devices/legacy FDB/TNF are closed.
 */
export const INPUT_METHODS=Object.freeze([
  {id:"RFID_125KHZ",label:"125 kHz RFID kart",requires:["READER","CARD_MAPPING"]},
  {id:"RFID_13_56MHZ",label:"13.56 MHz NFC/MIFARE kart",requires:["READER","CARD_MAPPING"]},
  {id:"NFC_SECURE",label:"Güvenli NFC kart",requires:["OSDP_SC_OR_VENDOR_SDK"]},
  {id:"QR_SIGNED",label:"İmzalı QR personel kartı",requires:["KY_QR_GATEWAY","SIGNING_KEY"]},
  {id:"QR_VENDOR",label:"Üretici QR/2D barkod",requires:["VENDOR_SDK","MODEL_PROOF"]},
  {id:"BARCODE_WEDGE",label:"USB HID barkod/kart okuyucu",requires:["LOCAL_KIOSK","TRUSTED_CREDENTIAL"]},
  {id:"FINGERPRINT",label:"Parmak izi",requires:["VENDOR_MATCH_ONLY","NO_BIOMETRIC_TEMPLATES"]},
  {id:"FACE",label:"Yüz tanıma",requires:["VENDOR_MATCH_ONLY","NO_BIOMETRIC_TEMPLATES"]},
  {id:"PIN",label:"Şifre/PIN",requires:["VENDOR_MATCH_ONLY"]},
  {id:"MOBILE_NFC",label:"Mobil NFC",requires:["SDK_OR_OSDP_CONTROLLER"]},
]);
export const CONNECTORS=Object.freeze([
  {id:"KY_QR_LOCAL",label:"KY QR / USB okuyucu kiosk",transport:"LOCALHOST",status:"REFERENCE_IMPLEMENTED",requiresSdk:false},
  {id:"HEDEF_FP_CLOCK",label:"Eski Hedef FP_CLOCK x86 (Ethernet/5005)",transport:"LAN_VENDOR",status:"LEGACY_X86_BRIDGE_REQUIRED",requiresSdk:true},
  {id:"ZK_PULL",label:"ZKTeco Standalone / ZK SDK",transport:"LAN_VENDOR",status:"SDK_REQUIRED",requiresSdk:true},
  {id:"ZK_PUSH",label:"ZKTeco Push / ADMS",transport:"LAN_VENDOR",status:"MODEL_PROTOCOL_REQUIRED",requiresSdk:true},
  {id:"BIOSTAR_2",label:"Suprema BioStar 2 API",transport:"HTTPS_SERVER",status:"LICENSE_AND_SERVER_REQUIRED",requiresSdk:false},
  {id:"BIOSTAR_X",label:"Suprema BioStar X",transport:"HTTPS_SERVER",status:"LICENSE_AND_MODEL_REQUIRED",requiresSdk:false},
  {id:"HIKVISION_ISAPI",label:"Hikvision ISAPI",transport:"HTTPS_VENDOR",status:"MODEL_PROTOCOL_REQUIRED",requiresSdk:true},
  {id:"ANVIZ_CROSSCHEX",label:"Anviz CrossChex",transport:"VENDOR_CLOUD",status:"VENDOR_ACCOUNT_REQUIRED",requiresSdk:true},
  {id:"DAHUA_SDK",label:"Dahua Access / SDK",transport:"LAN_VENDOR",status:"SDK_REQUIRED",requiresSdk:true},
  {id:"OSDP_CONTROLLER",label:"OSDP Secure Channel (kontrol paneli üzerinden)",transport:"RS485_CONTROLLER",status:"CERTIFIED_CONTROLLER_REQUIRED",requiresSdk:true},
  {id:"WIEGAND_CONTROLLER",label:"Wiegand (kontrol paneli üzerinden)",transport:"READER_CONTROLLER",status:"LEGACY_CONTROLLER_REQUIRED",requiresSdk:true},
  {id:"GENERIC_HTTPS_WEBHOOK",label:"Açık HTTPS olay API'si",transport:"HTTPS_API",status:"SIGNED_SCHEMA_REQUIRED",requiresSdk:false},
  {id:"CSV_TNF_FILE",label:"CSV / TNF dosya okuyucu",transport:"FILE_IMPORT",status:"REFERENCE_IMPORT_ONLY",requiresSdk:false},
]);
const byId=new Map(CONNECTORS.map(x=>[x.id,x]));
const byModality=new Map(INPUT_METHODS.map(x=>[x.id,x]));
const str=(v)=>String(v??"").trim();
const privateIpv4=(ip)=>{
  const parts=str(ip).split(".");
  if(parts.length!==4||parts.some(x=>!/^(0|[1-9]\d{0,2})$/.test(x)||Number(x)>255))return false;
  const [a,b]=parts.map(Number);
  return a===10||a===192&&b===168||a===172&&b>=16&&b<=31;
};
export function validateTerminalDefinition(definition){
  if(!definition||typeof definition!=="object")throw new Error("TERMINAL_DEFINITION_REQUIRED");
  const id=str(definition.terminalId),company=str(definition.companyId);
  const vendor=str(definition.vendor),model=str(definition.model);
  const connector=byId.get(str(definition.connectorId));
  if(!/^[a-zA-Z0-9._:-]{3,64}$/.test(id)||!/^[a-zA-Z0-9._:-]{3,100}$/.test(company))
    throw new Error("TERMINAL_IDENTITY_INVALID");
  if(!connector||!vendor||vendor.length>80||!model||model.length>100||
    /[\x00-\x1f<>]/.test(vendor+model))throw new Error("TERMINAL_CATALOG_INVALID");
  let timezone=str(definition.timezone);
  try{new Intl.DateTimeFormat("en",{timeZone:timezone});}
  catch{throw new Error("TERMINAL_TIMEZONE_INVALID");}
  if(!timezone.includes("/"))throw new Error("TERMINAL_TIMEZONE_INVALID");
  const modalities=Array.isArray(definition.inputMethods)?
    [...new Set(definition.inputMethods.map(str))]:[];
  if(!modalities.length||modalities.some(m=>!byModality.has(m)))
    throw new Error("TERMINAL_METHOD_UNSUPPORTED");
  const direction=str(definition.directionMode);
  if(!["EXPLICIT_IN_OUT","EXPLICIT_IN","EXPLICIT_OUT","UNKNOWN"].includes(direction))
    throw new Error("TERMINAL_DIRECTION_REQUIRED");
  let host="",port=null;
  if(["LAN_VENDOR","HTTPS_VENDOR","RS485_CONTROLLER","READER_CONTROLLER"].includes(connector.transport)){
    host=str(definition.host);
    if(!privateIpv4(host))throw new Error("TERMINAL_PRIVATE_IP_REQUIRED");
    port=Number(definition.port);
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error("TERMINAL_PORT_INVALID");
  }
  if(["HTTPS_SERVER","VENDOR_CLOUD","HTTPS_API"].includes(connector.transport)){
    const url=str(definition.baseUrl);
    let parsed;
    try{parsed=new URL(url);}catch{throw new Error("TERMINAL_HTTPS_URL_INVALID");}
    if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||
       parsed.hostname==="localhost"||parsed.hostname==="127.0.0.1")
      throw new Error("TERMINAL_HTTPS_URL_INVALID");
    host=parsed.origin;
  }
  const approval=str(definition.approvalState)||"DRAFT";
  if(!["DRAFT","READY_FOR_DRIVER_TEST","CERTIFIED"].includes(approval))
    throw new Error("TERMINAL_APPROVAL_INVALID");
  // Nothing in a JSON definition constitutes actual vendor certification.
  // Even the KY QR implementation is not automatically production-approved.
  // Certification must come from a separately signed physical acceptance,
  // never from an operator-edited JSON field.
  if(approval==="CERTIFIED")
    throw new Error("TERMINAL_DRIVER_PROOF_REQUIRED");
  for(const key of ["password","apiKey","accessToken","secret","biometricTemplate","faceTemplate"]){
    if(Object.prototype.hasOwnProperty.call(definition,key))
      throw new Error("TERMINAL_SECRET_IN_DEFINITION_FORBIDDEN");
  }
  return Object.freeze({
    schemaVersion:1,terminalId:id,companyId:company,vendor,model,
    connectorId:connector.id,transport:connector.transport,host,port,
    timezone,inputMethods:Object.freeze(modalities),directionMode:direction,
    approvalState:approval,driverStatus:connector.status,
    readOnly:true,deleteDeviceLogs:false,writeFirebird:false,
    writeAnnualTnf:false,collectBiometricTemplates:false,
  });
}
export function installationPlan(definition){
  const device=validateTerminalDefinition(definition);
  const connector=byId.get(device.connectorId);
  const checks=[
    {id:"identity",title:"Firma / seri no / model eşleştirme",verified:Boolean(device.vendor&&device.model)},
    {id:"network",title:connector.transport==="LOCALHOST"?"Yerel okuyucu ve kiosk izinleri":"Ağ/SDK/lisans erişimini cihaz üzerinde doğrula",verified:false},
    {id:"clock",title:"Cihaz saat dilimi ve saat farkını doğrula",verified:false},
    {id:"card",title:"5 haneli kart no eşleşmesini yalnız yetkili kaynaktan doğrula",verified:false},
    {id:"direction",title:"Giriş/çıkış yön kodu ve çift vardiya denemesi",verified:false},
    {id:"events",title:"Salt okunur gerçek cihaz RAW okuma / imza doğrulama",verified:false},
    {id:"reconcile",title:"Firebird / TNF ile doğrulanmış mutabakat",verified:false},
  ];
  if(connector.requiresSdk)checks.splice(1,0,{id:"sdk",title:"Üretici SDK / lisans / model uyumluluk kanıtı",verified:false});
  return Object.freeze({
    device,checks,readyForProduction:false,physicalDeviceCertified:false,
    requiresVendorDriver:connector.status!=="REFERENCE_IMPLEMENTED",
    nextStep:checks.find(x=>!x.verified).title,
  });
}
