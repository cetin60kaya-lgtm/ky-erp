/** Existing Hedef/previous KY PDKS terminal: reference only.
 * No connection, device mutation, network scan, or credentials embedded.
 * Second profile must be imported from local old app; never fabricate it.
 */
export const CONFIRMED_LEGACY_TERMINAL=Object.freeze({
 profileName:"Cihaz1",machineId:1,connection:"ETHERNET",
 ip:"192.168.1.224",port:5005,direction:"IN",
 baudRate:38400,serialPort:"COM1",
 adapter:"FP_CLOCK_ACTIVE_X86",ocx:"FP_CLOCK.ocx",
 dependencies:Object.freeze(["TMPCCOMM.dll"]),
 source:"HEDEF_LEGACY_TERMINAL_TRANSFER",
 readOnly:true,writeToDevice:false,deleteTerminalLogs:false,
});
export function inspectImportedLegacyProfiles(profiles){
 if(!Array.isArray(profiles)||profiles.length>32)
  throw Error("LEGACY_PROFILES_INVALID");
 const seen=new Set();
 return Object.freeze(profiles.map((p,index)=>{
  const host=String(p?.ip??"").trim();
  const port=Number(p?.port);
  const name=String(p?.profileName??"").trim();
  const machineId=Number(p?.machineId);
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||
    host.split(".").some(x=>Number(x)>255)||
    !Number.isInteger(port)||port<1||port>65535||
    !Number.isInteger(machineId)||machineId<1||machineId>255||
    !name||name.length>80||seen.has(name+"|"+machineId))
   throw Error("LEGACY_PROFILE_INVALID_AT_"+index);
  seen.add(name+"|"+machineId);
  // Imported second device remains read-only and unverified until bridge test.
  return Object.freeze({profileName:name,machineId,ip:host,port,
   adapter:"FP_CLOCK_ACTIVE_X86",readOnly:true,certified:false});
 }));
}
