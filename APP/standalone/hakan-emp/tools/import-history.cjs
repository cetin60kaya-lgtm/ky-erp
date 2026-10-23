#!/usr/bin/env node
'use strict';
// HAKAN EMP historical production importer. No business data is committed to Git.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const args=process.argv.slice(2);
const value=(k)=>args.find(x=>x.startsWith(k+'='))?.slice(k.length+1);
const apply=args.includes('--apply');
const jsonPath=value('--input');
const dbPath=path.resolve(value('--db')||path.join(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'),'HAKAN EMP','data','IMALAT.db'));
const reportFile=value('--report');
const forceCompany='TAHA GİYİM';
const s=v=>String(v??'').trim();
const n=v=>s(v).replace(/\s+/g,' ').toLocaleUpperCase('tr-TR');
const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function assert(v,message){if(!v)throw Error(message)}
assert(jsonPath,'--input=<yerel imalat_tum_yillar.json> zorunlu');
assert(fs.existsSync(jsonPath),'Veri dosyası yok');
assert(fs.existsSync(dbPath),'Veritabanı bulunamadı: '+dbPath);
const src=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
assert(Array.isArray(src.rows),'rows dizisi bulunamadı');
assert(n(src.company||forceCompany)===n(forceCompany),'Firma TAHA GİYİM olmalı');
const db=new DatabaseSync(dbPath);
function writeReport(r){const out=JSON.stringify(r,null,2);if(reportFile)fs.writeFileSync(reportFile,out,'utf8');console.log(out)}
function cols(t){return db.prepare('PRAGMA table_info('+t+')').all().map(x=>x.name)}
function canonical(r){return [s(r.date),n(r.model),s(r.machine_no).replace(/[^0-9]/g,''),n(r.shift),n(r.operator),numeric(r.qty),numeric(r.fabric_defect),numeric(r.print_defect),n(r.ground),n(r.region)].join('|')}
try{
 assert(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','DB integrity_check başarısız');
 for(const t of ['companies','models','batches','entries','machines'])assert(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t),'Eksik tablo: '+t);
 assert(cols('models').includes('company_id')&&cols('batches').includes('production_done'),'Uygulama DB şeması uyumsuz');
 const existing=new Map();
 for(const r of db.prepare('SELECT e.date,m.name model,e.machine_no,e.shift,e.operator,e.qty,e.fabric_defect,e.print_defect,b.ground,b.region FROM entries e JOIN batches b ON b.id=e.batch_id JOIN models m ON m.id=b.model_id').all()){
  const k=canonical(r);existing.set(k,(existing.get(k)||0)+1);
 }
 const years={},toInsert=[],excluded=[],seenRows=new Map();
 for(const r of src.rows){
  const y=s(r.date).slice(0,4)||'TARİHSİZ';years[y]??={source:0,existing:0,insert:0,excluded:0};years[y].source++;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s(r.date))||!s(r.model)||numeric(r.qty)<=0){excluded.push({source_row:r.source_row,reason:'Tarih/model/adet eksik'});years[y].excluded++;continue}
  const k=canonical(r),prior=seenRows.get(k)||0;
  seenRows.set(k,prior+1);
  if(prior<(existing.get(k)||0)){years[y].existing++;continue}
  toInsert.push(r);years[y].insert++;
 }
 const report={mode:apply?'APPLY':'DRY_RUN',company:forceCompany,sourceRows:src.rows.length,toInsert:toInsert.length,excluded:excluded.length,excludedRows:excluded,years,dbPath,dbIntegrity:'ok'};
 if(!apply){writeReport(report);process.exit(0)}
 const backupDir=path.join(path.dirname(dbPath),'backup','HAKAN_EMP_XLSM_IMPORT');fs.mkdirSync(backupDir,{recursive:true});
 const backupFile=path.join(backupDir,'before-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
 db.exec("VACUUM INTO '"+backupFile.replace(/'/g,"''")+"'");
 report.backupFile=backupFile;
 const getCompany=db.prepare('SELECT id FROM companies WHERE norm=?');
 const addCompany=db.prepare('INSERT INTO companies(name,norm,active,opening_balance) VALUES(?,?,1,0)');
 const getModel=db.prepare('SELECT id,company_id FROM models WHERE norm=?');
 const addModel=db.prepare('INSERT INTO models(name,norm,company_id) VALUES(?,?,?)');
 const getBatch=db.prepare("SELECT id FROM batches WHERE model_id=? AND order_no=? AND batch_no=? LIMIT 1");
 const addBatch=db.prepare("INSERT INTO batches(model_id,batch_no,is_repeat,order_no,ground,region,status,first_date,last_date,expected_qty,production_done) VALUES(?,?,?,?,?,?,'TAMAM',?,?,0,1)");
 const addEntry=db.prepare('INSERT INTO entries(batch_id,date,machine_no,shift,machine_name,operator,assistant,qty,fabric_defect,print_defect) VALUES(?,?,?,?,?,?,?,?,?,?)');
 const getMachine=db.prepare('SELECT 1 FROM machines WHERE machine_no=?');
 const addMachine=db.prepare('INSERT INTO machines(machine_no,machine_name,active) VALUES(?,?,1)');
 const models=new Map(),batches=new Map(),machines=new Set(),blocked=new Set();
 let inserted=0,newModels=0,newBatches=0,newMachines=0,wrongCompany=0;
 db.exec('BEGIN IMMEDIATE');
 try{
  const existingCompany=getCompany.get(n(forceCompany));
  const cid=existingCompany?.id||Number(addCompany.run(forceCompany,n(forceCompany)).lastInsertRowid);
  for(const r of toInsert){
   const name=n(r.model);
   if(blocked.has(name)){wrongCompany++;continue}
   let m=models.get(name);
   if(!m){m=getModel.get(name);if(m&&m.company_id&&m.company_id!==cid){blocked.add(name);wrongCompany++;continue}
    if(!m){m={id:Number(addModel.run(s(r.model),name,cid).lastInsertRowid),company_id:cid};newModels++}
    models.set(name,m);
   }
   const yr=r.date.slice(0,4),variant=hash(n(r.ground)+'|'+n(r.region)).slice(0,12);
   const order='XLSM-'+yr+'-'+variant, batchName='XLSM GEÇMİŞ '+yr+' '+variant, cacheKey=m.id+'|'+order;
   let batch=batches.get(cacheKey);
   if(!batch){batch=getBatch.get(m.id,order,batchName)?.id;if(!batch){batch=Number(addBatch.run(m.id,batchName,0,order,s(r.ground),s(r.region),r.date,r.date).lastInsertRowid);newBatches++}batches.set(cacheKey,batch)}
   const no=s(r.machine_no).replace(/[^0-9]/g,'')||'XLSM-BELIRSIZ';
   if(!machines.has(no)){if(!getMachine.get(no)){addMachine.run(no,s(r.machine_name)||'XLSM geçmiş');newMachines++}machines.add(no)}
   addEntry.run(batch,r.date,no,s(r.shift)||'Gündüz',s(r.machine_name),s(r.operator)||'BİLİNMİYOR',s(r.assistant),numeric(r.qty),numeric(r.fabric_defect),numeric(r.print_defect));inserted++;
  }
  const totals=db.prepare('SELECT COALESCE(SUM(qty),0) qty,MIN(date) first_date,MAX(date) last_date FROM entries WHERE batch_id=?');
  const update=db.prepare('UPDATE batches SET expected_qty=?,first_date=?,last_date=? WHERE id=?');
  for(const id of batches.values()){const t=totals.get(id);update.run(t.qty,t.first_date,t.last_date,id)}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 report.imported=inserted;report.newModels=newModels;report.newBatches=newBatches;report.newMachines=newMachines;report.skippedDifferentCompany=wrongCompany;
 report.finalIntegrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
 assert(report.finalIntegrity==='ok','İşlem sonrası DB bütünlük hatası');
 writeReport(report);
}finally{db.close()}
