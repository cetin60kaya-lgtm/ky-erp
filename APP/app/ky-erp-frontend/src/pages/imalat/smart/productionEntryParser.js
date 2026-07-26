import { GROUND_NAMES, OPERATOR_ALIASES, REGION_ALIASES, SHIFT_ALIASES } from "./productionAliases.js";

export function normalizeProductionText(value) {
  return String(value || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9çöşüüğ\s]/g, " ").replace(/\s+/g, " ").trim();
}

function compact(value) { return normalizeProductionText(value).replace(/\s/g, ""); }
function levenshtein(a, b) { const m=Array.from({length:a.length+1},(_,i)=>[i]); for(let j=1;j<=b.length;j++)m[0][j]=j; for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return m[a.length][b.length]; }
function similarity(a,b){ a=compact(a); b=compact(b); if(!a||!b)return 0; if(a===b)return 1; if(a.includes(b)||b.includes(a))return Math.min(a.length,b.length)/Math.max(a.length,b.length)+.12; return 1-levenshtein(a,b)/Math.max(a.length,b.length); }

function parseDate(raw, fallback) {
  const full=raw.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{4}))?\b/); const dayOnly=!full&&raw.match(/^\s*(\d{1,2})(?=\s|$)/);
  if(!full&&!dayOnly)return {value:fallback, token:"", error:""};
  const base=new Date(`${fallback}T12:00:00`); const d=Number(full?.[1]||dayOnly?.[1]); const mo=Number(full?.[2]||base.getMonth()+1); const y=Number(full?.[3]||base.getFullYear());
  const value=`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`; const check=new Date(`${value}T12:00:00`);
  return {value,token:full?.[0]||dayOnly?.[0]||"",error:mo<1||mo>12||d<1||check.getMonth()+1!==mo||check.getDate()!==d?"Geçersiz tarih":""};
}

function modelMatch(raw, models) {
  const rawCompact=compact(raw);
  const scored=(models||[]).map(model=>{ const names=[model.modelName,model.modelAdi,model.name,model.productionModelName].filter(Boolean); return {...model,_score:Math.max(0,...names.map(n=>rawCompact.includes(compact(n))?.99:similarity(raw,n))),_name:names[0]||""}; }).filter(x=>x._score>=.5).sort((a,b)=>b._score-a._score);
  const best=scored[0]; const ambiguous=best&&scored[1]&&best._score-scored[1]._score<.08;
  return {best, candidates:scored.slice(0,5), ambiguous};
}

function findAlias(raw, map) { return Object.entries(map).sort((a,b)=>b[0].length-a[0].length).find(([key])=>new RegExp(`(?:^|\\s)${key.replace(/ /g,"\\s+")}(?:$|\\s)`,"i").test(` ${normalizeProductionText(raw)} `)); }

function machineAliases(machine = {}) {
  return [machine.machineNo, machine.no, machine.machineName, machine.makineAdi, machine.ad]
    .map(normalizeProductionText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function findMachine(raw, machines = []) {
  const normalized = normalizeProductionText(raw);
  return machines.find((machine) =>
    machineAliases(machine).some((alias) =>
      new RegExp(`(?:^|\\s)${alias.replace(/ /g, "\\s+")}(?:$|\\s)`, "i")
        .test(` ${normalized} `),
    ),
  );
}

function machineById(machines = [], machineId = "") {
  const wanted = normalizeProductionText(machineId);
  return machines.find((machine) =>
    [machine.id, machine.machineNo, machine.no]
      .map(normalizeProductionText)
      .includes(wanted),
  );
}

export function operatorForMachine(machine, shift) {
  if (!machine) return "";
  const normalizedShift = normalizeProductionText(shift);
  if (normalizedShift.includes("gece")) {
    return machine.nightOperator || machine.geceMakinaci || machine.operator || machine.makinaci || "";
  }
  return machine.dayOperator || machine.gunduzMakinaci || machine.operator || machine.makinaci || "";
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(`${value}T12:00:00`);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

export function validateProductionRows(rows = []) {
  const seen = new Set();
  return rows.map((row) => {
    if (row.status === "context" && !Number(row.quantity || 0)) return row;
    const warnings = [];
    if (!validDate(row.date)) warnings.push("Geçersiz tarih");
    if (!String(row.modelId || "").trim()) warnings.push("Model seçilmelidir");
    if (!String(row.printRegion || "").trim()) warnings.push("Baskı bölgesi seçilmelidir");
    if (!(Number(row.quantity || 0) > 0)) warnings.push("Adet 0'dan büyük olmalıdır");
    if (!String(row.shift || "").trim()) warnings.push("Vardiya seçilmelidir");
    if (!String(row.machineId || row.machineName || "").trim()) warnings.push("Makine seçilmelidir");
    if (!String(row.operatorName || row.operatorId || "").trim()) warnings.push("Makinacı seçilmelidir");
    if ((row.warnings || []).some((warning) => String(warning).includes("Birden fazla güçlü model"))) {
      warnings.push("Birden fazla güçlü model adayı var");
    }
    const duplicateKey = [row.date, row.modelId, row.printRegion, Number(row.quantity || 0), row.shift, row.machineId || row.machineName, row.operatorName || row.operatorId]
      .map(normalizeProductionText)
      .join("|");
    if (seen.has(duplicateKey)) warnings.push("Bu satır fiş içinde yineleniyor");
    seen.add(duplicateKey);
    const hardError = warnings.some((warning) => !warning.includes("Birden fazla güçlü model"));
    return {
      ...row,
      warnings,
      status: hardError ? "error" : warnings.length ? "review" : "ready",
    };
  });
}

export function parseProductionEntries(text, dictionaries={}, defaults={}) {
  const defaultMachine = machineById(dictionaries.machines || [], defaults.machineId);
  const output=[]; let context={date:defaults.date,shift:defaults.shift,machineId:defaults.machineId,machineName:defaults.machineName,operatorName:defaults.operatorName || operatorForMachine(defaultMachine, defaults.shift),model:null,ground:""};
  String(text||"").split(/\r?\n/).forEach((original,lineIndex)=>{
    const raw=original.trim(); if(!raw)return; const normalized=normalizeProductionText(raw); const date=parseDate(raw,context.date||new Date().toISOString().slice(0,10));
    const shiftHit=findAlias(normalized,SHIFT_ALIASES); const regionHits=Object.entries(REGION_ALIASES).filter(([key])=>new RegExp(`(?:^|\\s)${key.replace(/ /g,"\\s+")}(?:$|\\s)`).test(` ${normalized} `));
    const groundKey=GROUND_NAMES.find(x=>new RegExp(`(?:^|\\s)${normalizeProductionText(x)}(?:$|\\s)`).test(` ${normalized} `));
    const operators=[...(dictionaries.operators||[]),...Object.values(OPERATOR_ALIASES).map(name=>({id:name,name}))]; const operator=operators.find(x=>{const keys=[x.name,x.ad,x.fullName,...(x.aliases||[])].filter(Boolean);return keys.some(k=>new RegExp(`(?:^|\\s)${normalizeProductionText(k)}(?:$|\\s)`).test(` ${normalized} `));});
    const match=modelMatch(normalized,dictionaries.models||[]); const model=match.best?match.best:context.model;
    const occupied=new Set(); const dateNumbers=date.token.match(/\d+/g)||[]; dateNumbers.forEach(x=>occupied.add(Number(x))); const quantities=[];
    for(const m of raw.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:adet)?\b/gi)){const value=Number(m[1].replace(/\./g,"")); if(value>=1&&value!==new Date().getFullYear()&&!dateNumbers.includes(String(value))&&value>31)quantities.push(value);}
    if(match.best) context.model=match.best; if(date.value)context.date=date.value; if(shiftHit)context.shift=shiftHit[1]; if(groundKey)context.ground=groundKey.toLocaleUpperCase("tr-TR");
    const machine=findMachine(normalized,dictionaries.machines||[]);
    if(machine){context.machineId=machine.id||machine.machineNo;context.machineName=machine.machineName||machine.makineAdi||machine.ad||machine.machineNo;}
    const activeMachine = machine || machineById(dictionaries.machines || [], context.machineId);
    if(operator) context.operatorName=operator.name||operator.ad||operator.fullName;
    else if(activeMachine) context.operatorName=operatorForMachine(activeMachine, context.shift);
    const regions=regionHits.length?regionHits.map(x=>x[1]):[]; if(!quantities.length){ output.push({id:`${lineIndex}-context`,rawText:raw,status:(model&&!date.error)?"context":"error",date:date.value,modelId:model?.id||"",modelName:model?._name||model?.modelName||"",ground:context.ground,printRegion:"",quantity:0,shift:context.shift||"",machineId:context.machineId||"",machineName:context.machineName||"",operatorName:context.operatorName||"",operatorId:operator?.id||context.operatorName||"",warnings:[date.error||(!model?"Model bulunamadı":"Bağlam satırı")].filter(Boolean),confidence:model?.['_score']||0,candidates:match.candidates}); return; }
    quantities.forEach((quantity,index)=>{const region=regions[index]||regions[0]||((model?.printRegions||model?.baskiBolgeleri||[]).length===1?(model.printRegions||model.baskiBolgeleri)[0]?.regionName:""); const warnings=[date.error,!model&&"Model bulunamadı",match.ambiguous&&"Birden fazla güçlü model adayı var",!region&&"Baskı bölgesi seçilmeli",!context.shift&&"Vardiya seçilmeli",!context.machineId&&"Makine seçilmeli",!context.operatorName&&"Makinacı bulunamadı"].filter(Boolean); const hard=warnings.some(x=>/Geçersiz|bulunamadı|Makine|Makinacı/.test(x)); output.push({id:`${lineIndex}-${index}-${Date.now()}`,rawText:raw,date:date.value,modelId:model?.id||"",modelName:model?._name||model?.modelName||"",ground:context.ground||"",printRegion:region,quantity,shift:context.shift||defaults.shift||"",machineId:context.machineId||defaults.machineId||"",machineName:context.machineName||defaults.machineName||"",operatorId:operator?.id||context.operatorName||"",operatorName:context.operatorName||"",warnings,confidence:Math.max(0,Math.min(1,(model?.['_score']||0)-warnings.length*.08)),status:hard?"error":warnings.length?"review":"ready",candidates:match.candidates});});
  }); return validateProductionRows(output);
}
