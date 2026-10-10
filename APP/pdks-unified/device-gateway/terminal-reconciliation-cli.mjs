// Operator-invoked offline diagnostic. No cloud, device, FDB or TNF writes.
// Output is aggregated counters only: no names/cards/biometric/QR tokens.
import {readFile,stat,writeFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {readLocalTerminalJournal,reconcileLocalEvents} from "./terminal-reconciliation.mjs";

const input=process.argv.slice(2),args={};
for(let i=0;i<input.length;i+=2){
  if(!input[i]?.startsWith("--")||input[i+1]===undefined||
    !["company","terminal","journal","tnf","year","report"].includes(input[i].slice(2))||
    args[input[i].slice(2)]!==undefined){
    throw Error("TERMINAL_DIAGNOSTIC_ARGS_INVALID");
  }
  args[input[i].slice(2)]=input[i+1];
}
if(!args.company||!args.terminal||!args.journal||!args.tnf||
  !isAbsolute(args.journal)||!isAbsolute(args.tnf)||
  args.report!==undefined&&!isAbsolute(args.report)||
  args.year!==undefined&&!/^\d{4}$/.test(args.year))
  throw Error("TERMINAL_DIAGNOSTIC_ARGS_INVALID");
const yearHint=args.year?Number(args.year):null;
const source=await stat(args.tnf);
if(!source.isFile()||source.size>30_000_000)
  throw Error("TERMINAL_TNF_REFERENCE_SIZE_INVALID");
const events=await readLocalTerminalJournal(args.journal);
const tnfText=await readFile(args.tnf,"utf8");
const journalKey=process.env.KY_PDKS_TERMINAL_JOURNAL_KEY??"";
const result=reconcileLocalEvents({companyId:args.company,
  terminalId:args.terminal,journalKey,events,tnfText,yearHint});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),
  ...result,physicalAttendanceConfirmed:false,
  status:"REQUIRES_APPROVED_SOURCE_RECONCILIATION"};
const json=JSON.stringify(report,null,2)+"\n";
if(args.report){
  // Never rewrite or delete an existing evidence/report file.
  await writeFile(args.report,json,{flag:"wx",mode:0o600});
  process.stdout.write("RESULT=TERMINAL_REFERENCE_REPORT_CREATED\n");
}else process.stdout.write(json);
