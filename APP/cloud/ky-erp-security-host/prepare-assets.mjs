import {cp,rm,mkdir,access} from "node:fs/promises";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const source=resolve(here,"../../app/ky-erp-frontend/public");
const out=join(here,".security-assets");
const allowed=["guvenlik","ky-sistem","ky-firma","ky-app-shell"];
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of allowed){await access(join(source,name));await cp(join(source,name),join(out,name),{recursive:true,errorOnExist:true,force:false});}
for(const [name,filename] of [["guvenlik","index.html"],["ky-sistem","manifest.webmanifest"],["ky-firma","manifest.webmanifest"],["ky-app-shell","app.js"]])await access(join(out,name,filename));
console.log("KY Security assets ready: "+allowed.join(", ")+". Public _redirects excluded.");
