import {execFile} from "node:child_process";
const script="Get-Printer -ErrorAction Stop | Select-Object Name,DriverName,PrinterStatus | ConvertTo-Json -Compress";
export async function listWindowsCardPrinters({run=execFile,platform=process.platform}={}){
 if(platform!=="win32")return Object.freeze({available:false,status:"WINDOWS_REQUIRED",printers:[]});
 const response=await new Promise((resolve,reject)=>{
   run("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],
     {windowsHide:true,timeout:5000,maxBuffer:100_000},(error,stdout)=>{
       if(error)return reject(Error("PRINTER_DISCOVERY_FAILED"));
       resolve(stdout);
     });
 });
 let parsed;
 try{parsed=JSON.parse(String(response||"null"));}catch{throw Error("PRINTER_DISCOVERY_JSON_INVALID");}
 const rows=parsed==null?[]:Array.isArray(parsed)?parsed:[parsed];
 if(rows.length>100)throw Error("PRINTER_COUNT_UNEXPECTED");
 return Object.freeze({available:true,status:rows.length?"DRIVERS_DISCOVERED":"NO_PRINTERS",
   printers:Object.freeze(rows.map(p=>Object.freeze({
     name:String(p.Name||"").slice(0,120),driver:String(p.DriverName||"").slice(0,120),
     status:String(p.PrinterStatus??"UNKNOWN").slice(0,50),
     hardwareTested:false,cardStockCalibrated:false,printed:false,
   })))});
}
