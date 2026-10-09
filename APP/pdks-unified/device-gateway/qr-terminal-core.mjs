import {createHmac,randomBytes,timingSafeEqual,createHash} from "node:crypto";
/**
 * HMAC QR credential is a one-time attendance credential, NOT a biometric
 * template, payroll approval, FDB/TNF mutation or verified hardware punch.
 * Issue ONLY to an already verified employee+card association.
 */
const good=(s,max=128)=>typeof s==="string"&&s.length>0&&s.length<=max&&
  /^[A-Za-z0-9._:-]+$/.test(s);
const secretOk=(secret)=>typeof secret==="string"&&Buffer.byteLength(secret,"utf8")>=32;
const digest=(secret,message)=>createHmac("sha256",secret).update(message).digest();
const b64=(bytes)=>Buffer.from(bytes).toString("base64url");
const hash=(bytes)=>createHash("sha256").update(bytes).digest("hex");
export function issueQrCredential({companyId,employeeId,cardNo,issuer,secret,
  now=Date.now(),ttlSeconds=90,nonce=b64(randomBytes(18))}={}){
  if(!secretOk(secret))throw new Error("QR_SIGNING_SECRET_TOO_SHORT");
  if(!good(companyId,100)||!good(employeeId)||!good(issuer,100)||
    !/^\d{5}$/.test(cardNo)||!good(nonce,64)||
    !Number.isInteger(now)||!Number.isInteger(ttlSeconds)||
    ttlSeconds<15||ttlSeconds>300)
    throw new Error("QR_ISSUANCE_INVALID");
  const claims={v:1,companyId,employeeId,cardNo,issuer,
    nonce,nbf:Math.floor(now/1000)-5,exp:Math.floor(now/1000)+ttlSeconds};
  const payload=b64(Buffer.from(JSON.stringify(claims),"utf8"));
  const unsigned="KYQR1."+payload;
  return unsigned+"."+b64(digest(secret,unsigned));
}
export function verifyQrCredential(token,{secret,companyId,now=Date.now(),
  expectedIssuer=null}={}){
  if(!secretOk(secret))throw new Error("QR_SIGNING_SECRET_TOO_SHORT");
  if(typeof token!=="string"||token.length>1200||
    !/^KYQR1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error("QR_FORMAT_INVALID");
  const parts=token.split(".");
  const supplied=Buffer.from(parts[2],"base64url");
  const actual=digest(secret,parts.slice(0,2).join("."));
  if(supplied.length!==actual.length||!timingSafeEqual(actual,supplied))
    throw new Error("QR_SIGNATURE_INVALID");
  let c;
  try{c=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8"));}
  catch{throw new Error("QR_PAYLOAD_INVALID");}
  if(!c||c.v!==1||!good(c.companyId,100)||!good(c.employeeId)||
    !good(c.issuer,100)||!good(c.nonce,64)||!/^\d{5}$/.test(c.cardNo)||
    c.companyId!==companyId||
    expectedIssuer!==null&&c.issuer!==expectedIssuer||
    !Number.isInteger(c.nbf)||!Number.isInteger(c.exp)||
    c.exp-c.nbf>306||c.exp-c.nbf<20)
    throw new Error("QR_CLAIMS_INVALID");
  const second=Math.floor(now/1000);
  if(!Number.isSafeInteger(now)||second<c.nbf||second>c.exp)
    throw new Error("QR_EXPIRED_OR_NOT_YET_VALID");
  return Object.freeze({
    employeeId:c.employeeId,cardNo:c.cardNo,companyId:c.companyId,
    issuer:c.issuer,nonce:c.nonce,expiresAt:c.exp,
    credentialHash:hash(token),verifiedBy:"KYQR1_HMAC_SHA256",
    biometricDataStored:false,
  });
}
export function normalizedKioskEvent({terminal,credential,direction,
  now=Date.now()}={}){
  if(!terminal||terminal.connectorId!=="KY_QR_LOCAL"||
    terminal.companyId!==credential?.companyId||
    !["EXPLICIT_IN_OUT","EXPLICIT_IN","EXPLICIT_OUT"].includes(terminal.directionMode)||
    !["IN","OUT"].includes(direction)||
    terminal.directionMode==="EXPLICIT_IN"&&direction!=="IN"||
    terminal.directionMode==="EXPLICIT_OUT"&&direction!=="OUT")
    throw new Error("QR_TERMINAL_DIRECTION_OR_TENANT_INVALID");
  const stamp=new Date(now);
  if(Number.isNaN(stamp.getTime()))throw new Error("QR_EVENT_TIME_INVALID");
  // ISO with local offset based on configured timezone. Istanbul today only
  // is not guessed for other timezone devices.
  const date=new Intl.DateTimeFormat("en-CA",{
    timeZone:terminal.timezone,year:"numeric",month:"2-digit",day:"2-digit",
  }).format(stamp);
  const hour=new Intl.DateTimeFormat("en-GB",{
    timeZone:terminal.timezone,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  }).format(stamp);
  const evidence={
    schemaVersion:1,companyId:terminal.companyId,terminalId:terminal.terminalId,
    employeeId:credential.employeeId,cardNo:credential.cardNo,
    credentialHash:credential.credentialHash,nonce:credential.nonce,
    direction,workDate:date,localTime:hour,timezone:terminal.timezone,
    receivedAt:stamp.toISOString(),source:"KY_LOCAL_SIGNED_QR_KIOSK",
    physicalHardwareProven:false,firebirdReconciled:false,tnfReconciled:false,
    cloudAcked:false,status:"PENDING_RECONCILIATION",
  };
  const sourceKey=hash(JSON.stringify([evidence.companyId,evidence.terminalId,
    evidence.credentialHash,evidence.nonce]));
  return Object.freeze({...evidence,sourceKey});
}


/**
 * Unsigned USB HID RFID/barkod reader: stores an unverified card scan only.
 * This CANNOT be used as a verified employee punch until an approved person
 * mapping and physical-reader provenance is reconciled separately.
 */
export function normalizedWedgeCardEvent({terminal,cardNo,direction,now=Date.now()}={}){
  if(!terminal||terminal.connectorId!=="KY_QR_LOCAL"||
    !Array.isArray(terminal.inputMethods)||!terminal.inputMethods.includes("BARCODE_WEDGE")||
    !/^\d{5}$/.test(cardNo)||!["IN","OUT"].includes(direction)||
    terminal.directionMode==="EXPLICIT_IN"&&direction!=="IN"||
    terminal.directionMode==="EXPLICIT_OUT"&&direction!=="OUT"||
    terminal.directionMode==="UNKNOWN")
    throw new Error("WEDGE_CARD_INPUT_INVALID");
  if(!Number.isSafeInteger(now))throw new Error("WEDGE_CARD_TIME_INVALID");
  const stamp=new Date(now);
  const workDate=new Intl.DateTimeFormat("en-CA",{
    timeZone:terminal.timezone,year:"numeric",month:"2-digit",day:"2-digit",
  }).format(stamp);
  const localTime=new Intl.DateTimeFormat("en-GB",{
    timeZone:terminal.timezone,hour:"2-digit",minute:"2-digit",
    second:"2-digit",hourCycle:"h23",
  }).format(stamp);
  const sourceKey=hash(JSON.stringify(["UNVERIFIED_WEDGE",terminal.companyId,
    terminal.terminalId,cardNo,direction,Math.floor(now/10000)]));
  return Object.freeze({
    schemaVersion:1,companyId:terminal.companyId,terminalId:terminal.terminalId,
    cardNo,direction,workDate,localTime,timezone:terminal.timezone,
    receivedAt:stamp.toISOString(),source:"USB_HID_CARD_WEDGE_UNVERIFIED",
    identityVerified:false,physicalHardwareProven:false,
    firebirdReconciled:false,tnfReconciled:false,cloudAcked:false,
    status:"PENDING_IDENTITY_AND_RECONCILIATION",sourceKey,
  });
}
