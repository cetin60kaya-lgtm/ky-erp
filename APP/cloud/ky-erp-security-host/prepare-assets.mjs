import {cp,rm,mkdir,access,rename} from "node:fs/promises";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const source=resolve(here,"../../app/ky-erp-frontend/public");
const out=join(here,".security-assets");
const allowed=["guvenlik","ky-firma","ky-app-shell"];
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of allowed){await access(join(source,name));await cp(join(source,name),join(out,name),{recursive:true,errorOnExist:true,force:false});}
// The unified PRO workspace uses the exact canonical ERP build, not a duplicate module implementation.
const compiled=resolve(here,"../../app/ky-erp-frontend/dist-security-pro");
await access(join(compiled,"pro.html"));
await access(join(compiled,"assets"));
const destination=join(out,"guvenlik","pro");
await mkdir(destination,{recursive:true});
await cp(join(compiled,"assets"),join(destination,"assets"),{recursive:true,errorOnExist:true});
await cp(join(compiled,"pro.html"),join(destination,"index.html"),{errorOnExist:true});
for(const [name,filename] of [["guvenlik","index.html"],["ky-firma","manifest.webmanifest"],["ky-app-shell","app.js"]])await access(join(out,name,filename));
await access(join(destination,"index.html"));
console.log("KY Security assets ready: "+allowed.join(", ")+". Public _redirects excluded.");
