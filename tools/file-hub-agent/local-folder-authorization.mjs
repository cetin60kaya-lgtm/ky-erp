import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const READ_PURPOSES=new Set(["FILE_HUB","FILE_HUB_WRITE"]);
const WRITE_PURPOSES=new Set(["FILE_HUB_WRITE"]);

const isWithin=(root,target)=>{
  const relative=path.relative(root,target);
  return relative===""||(!relative.startsWith(".."+path.sep)&&relative!==".."&&!path.isAbsolute(relative));
};

export function approvedLocalFileHubRoots(roots, {
  requireGrants=process.env.KYERP_REQUIRE_LOCAL_FOLDER_GRANTS==="1",
  grantsFile=process.env.KYERP_FOLDER_GRANTS||path.join(os.homedir(),"AppData","Local","KY ERP","Desktop","folder-grants.json"),
  company=process.env.KYERP_MAIN_COMPANY_SLUG||"",
  mode="read",
}={}) {
  if(!requireGrants)return roots; // Do not change previously installed agents.
  if(!fs.existsSync(grantsFile))throw Error("KY ERP yerel klasör izin dosyası yok. Masaüstü → Yerel Merkez'den klasör onayı verin.");
  const payload=JSON.parse(fs.readFileSync(grantsFile,"utf8"));
  if(!Array.isArray(payload))throw Error("Yerel klasör onayı biçimi geçersiz.");
  const allowed=payload.filter(g=>g&&typeof g.FullPath==="string" &&
    String(g.Company||"").toLowerCase()===String(company).toLowerCase() &&
    (mode==="write"?WRITE_PURPOSES:READ_PURPOSES).has(String(g.Purpose||"")) &&
    String(g.Permission)===(mode==="write"?"FILE_HUB_WRITE":g.Purpose==="FILE_HUB_WRITE"?"FILE_HUB_WRITE":"READ_ONLY"))
    .flatMap(g=>{
      try {
        const location=fs.realpathSync.native(g.FullPath);
        if(!fs.statSync(location).isDirectory())return [];
        return [location];
      }catch{return []}
    });
  if(!allowed.length)throw Error("Bu firmaya ait açık onaylı File Hub klasörü yok. Yetkisiz disk taraması kapalı.");
  const matching=roots.filter(r=>{
    const input=r.rootPath;
    if(typeof input!=="string"||!input)return false;
    try {
      const location=fs.realpathSync.native(input);
      return allowed.some(root=>isWithin(root,location));
    } catch {return false}
  });
  if(!matching.length)throw Error("ERP File Hub klasör eşlemesi Windows'ta onay verilen klasörlerle uyuşmuyor.");
  return matching;
}
