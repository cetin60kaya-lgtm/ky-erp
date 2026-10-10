// Read-only on-demand connection diagnostic. Never logs keys or card data.
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {probeTerminalConnection} from "./terminal-network-probe.mjs";
const a=process.argv.slice(2);
if(a.length!==4||a[0]!=="--profile"||a[2]!=="--qr-port"||
   !isAbsolute(a[1])||!/^\d{4}$/.test(a[3]))
  throw Error("TERMINAL_NETWORK_DIAGNOSTIC_ARGS_INVALID");
const profile=JSON.parse(await readFile(a[1],"utf8"));
const result=await probeTerminalConnection(profile,{qrPort:Number(a[3])});
process.stdout.write(JSON.stringify(result,null,2)+"\n");
process.stdout.write("RESULT=TERMINAL_CONNECTION_DIAGNOSTIC_ONLY_NO_WRITE\n");
