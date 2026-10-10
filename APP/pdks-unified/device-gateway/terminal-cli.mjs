#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {resolve,isAbsolute} from "node:path";
import {startQrKiosk} from "./terminal-kiosk.mjs";
import {validateTerminalDefinition} from "./terminal-profiles.mjs";
import {issueQrCredential} from "./qr-terminal-core.mjs";
import {inspectTerminalCsv} from "./terminal-csv-import.mjs";
const command=process.argv[2];
const readConfig=async()=>{
  const path=process.env.KY_PDKS_TERMINAL_CONFIG||"";
  if(!isAbsolute(path))throw new Error("TERMINAL_ABSOLUTE_CONFIG_PATH_REQUIRED");
  return validateTerminalDefinition(JSON.parse(await readFile(resolve(path),"utf8")));
};
try{
  if(command==="--serve"){
    if(process.env.KY_PDKS_TERMINAL_ENABLE!=="1")
      throw new Error("TERMINAL_SERVER_EXPLICIT_OPT_IN_REQUIRED");
    const terminal=await readConfig();
    const secret=process.env.KY_PDKS_QR_HMAC_SECRET||"";
    const operatorKey=process.env.KY_PDKS_TERMINAL_OPERATOR_KEY||"";
    const journalRoot=process.env.KY_PDKS_TERMINAL_JOURNAL||"";
    const port=Number(process.env.KY_PDKS_TERMINAL_PORT||"5197");
    const server=await startQrKiosk({terminal,secret,operatorKey,journalRoot,bindPort:port});
    console.log("KY_PDKS_TERMINAL_READY http://127.0.0.1:"+port);
    console.log("DEVICE="+terminal.terminalId+" SOURCE=LOCAL_QR_PENDING_RECONCILIATION");
    const stop=()=>server.close(()=>process.exit(0));
    process.on("SIGINT",stop);process.on("SIGTERM",stop);
  }else if(command==="--inspect-csv"){
    const filePath=process.env.KY_PDKS_CSV_PATH||"";
    if(!isAbsolute(filePath)||!filePath.toLowerCase().endsWith(".csv"))
      throw new Error("CSV_ABSOLUTE_PATH_REQUIRED");
    const terminal=await readConfig();
    const result=inspectTerminalCsv(await readFile(resolve(filePath),"utf8"),{
      terminalId:terminal.terminalId,companyId:terminal.companyId,
    });
    // Console output is anonymous; no card/person/event identifiers escape.
    console.log(JSON.stringify(result,null,2));
  }else if(command==="--issue-qr"){
    if(process.env.KY_PDKS_QR_ISSUANCE_APPROVED!=="1"||
       process.env.KY_PDKS_CARD_MAPPING_VERIFIED!=="1")
      throw new Error("QR_ISSUANCE_REQUIRES_VERIFIED_CARD_MAPPING_AND_ADMIN_APPROVAL");
    const terminal=await readConfig();
    const employeeId=process.env.KY_PDKS_EMPLOYEE_ID;
    const cardNo=process.env.KY_PDKS_PERSON_CARD_NO;
    const secret=process.env.KY_PDKS_QR_HMAC_SECRET;
    const token=issueQrCredential({
      companyId:terminal.companyId,employeeId,cardNo,
      issuer:terminal.terminalId,secret,
    });
    // Credential is secret-bearing. Do not copy this to logs/Cloud.
    process.stdout.write(token+"\n");
  }else{
    console.error("Usage: node terminal-cli.mjs --serve | --issue-qr | --inspect-csv");
    process.exitCode=2;
  }
}catch(error){
  console.error("KY_PDKS_TERMINAL_ERROR="+(error?.message||"UNKNOWN"));
  process.exitCode=2;
}
