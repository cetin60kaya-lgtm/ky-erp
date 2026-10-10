import {createConnection} from "node:net";
import {validateTerminalDefinition} from "./terminal-profiles.mjs";

/** This only checks socket/service reachability, not SDK, person or punch.
 * No vendor command, authentication, deletion or device clock change.
 */
async function dial(host,port,timeoutMs=1500){
  return await new Promise(resolve=>{
    const socket=createConnection({host,port});
    let finished=false;
    const done=(reachable)=>{
      if(finished)return;
      finished=true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs,()=>done(false));
    socket.once("connect",()=>done(true));
    socket.once("error",()=>done(false));
  });
}
export async function probeTerminalConnection(definition,{
  qrPort=5197,tcpDial=dial,fetchHealth=globalThis.fetch,
}={}){
  const terminal=validateTerminalDefinition(definition);
  const result={terminalId:terminal.terminalId,connectorId:terminal.connectorId,
    testedAt:new Date().toISOString(),canReadPunches:false,
    canWriteTerminal:false,hardwareModelCertified:false,
    firebirdVerified:false,tnfVerified:false,
    connectionReachable:false,status:"NOT_PROBED"};
  if(terminal.connectorId==="KY_QR_LOCAL"){
    if(!Number.isInteger(qrPort)||qrPort<5197||qrPort>5205)
      throw new Error("LOCAL_QR_PORT_INVALID");
    try{
      const response=await fetchHealth("http://127.0.0.1:"+qrPort+"/health",{
        method:"GET",redirect:"error",signal:AbortSignal.timeout(1500),
      });
      if(response.ok){
        const health=await response.json();
        if(health.ok===true&&health.terminalId===terminal.terminalId&&
           health.productionSourceCertified===false){
          return Object.freeze({...result,status:"LOCAL_QR_HEALTH_RESPONDS_UNCERTIFIED",
            connectionReachable:true});
        }
      }
    }catch{/* Device down; don't turn failed read into a ready state. */}
    return Object.freeze({...result,status:"LOCAL_QR_HEALTH_UNAVAILABLE"});
  }
  if(["LAN_VENDOR","HTTPS_VENDOR","RS485_CONTROLLER","READER_CONTROLLER"]
      .includes(terminal.transport)){
    // Only explicitly private IPv4 endpoints were accepted by
    // validateTerminalDefinition. Reachability is NOT model compatibility.
    let reachable=false;
    try{reachable=await tcpDial(terminal.host,terminal.port,1500)===true;}catch{}
    return Object.freeze({...result,connectionReachable:reachable,
      status:reachable?"LAN_TCP_RESPONDS_DRIVER_UNVERIFIED":"LAN_TCP_UNREACHABLE"});
  }
  return Object.freeze({...result,status:terminal.transport==="FILE_IMPORT"?
    "OFFLINE_FILE_IMPORT_NO_CONNECTION":"VENDOR_API_AUTH_OR_DRIVER_REQUIRED"});
}
