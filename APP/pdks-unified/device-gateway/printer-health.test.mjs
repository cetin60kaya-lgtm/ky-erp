import test from "node:test";
import assert from "node:assert/strict";
import {listWindowsCardPrinters} from "./printer-health.mjs";

test("read-only Windows printer discovery returns driver state without printing",async()=>{
  let executable,argv,options;
  const result=await listWindowsCardPrinters({platform:"win32",
    run:(exe,args,opts,callback)=>{
      executable=exe;argv=args;options=opts;
      callback(null,JSON.stringify([
        {Name:"Card Printer",DriverName:"Test Driver",PrinterStatus:"Idle"},
      ]));
    },
  });
  assert.equal(executable,"powershell.exe");
  assert.ok(argv.join(" ").includes("Get-Printer"));
  assert.ok(!argv.join(" ").includes("Start-PrintJob"));
  assert.equal(options.windowsHide,true);
  assert.equal(result.printers[0].name,"Card Printer");
  assert.equal(result.printers[0].printed,false);
  assert.equal(result.printers[0].hardwareTested,false);
});
test("non-Windows printer probe is unavailable not fake online",async()=>{
 const result=await listWindowsCardPrinters({platform:"linux",
   run:()=>{throw Error("MUST_NOT_EXECUTE");}});
 assert.equal(result.available,false);
 assert.equal(result.status,"WINDOWS_REQUIRED");
});
