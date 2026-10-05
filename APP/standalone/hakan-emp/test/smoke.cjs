const {spawn}=require('child_process');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hakan-emp-smoke-'));
const port=18991;
const child=spawn(process.execPath,[path.join(root,'app','server.js')],{
  cwd:root,
  env:{...process.env,HAKAN_EMP_APP_ROOT:path.join(root,'app'),HAKAN_EMP_DATA_DIR:tmp,HAKAN_EMP_PORT:String(port),HAKAN_EMP_DISABLE_SYNC:'1'},
  stdio:['ignore','pipe','pipe']
});
const base='http://127.0.0.1:'+port;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,method='GET',body){
  const r=await fetch(base+p,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const j=await r.json();
  if(!r.ok)throw new Error(p+' '+JSON.stringify(j));
  return j;
}
async function ready(){for(let i=0;i<50;i++){try{await api('/api/dashboard');return}catch{}await sleep(100)}throw new Error('server not ready')}
function ok(v,m){if(!v)throw new Error('ASSERT '+m)}
(async()=>{
  await ready();
  const c=await api('/api/company','POST',{name:'SMOKE FİRMA',openingBalance:1000,note:'test',active:1});
  let all=await api('/api/companies-all');ok(all.rows.some(x=>x.id===c.id&&x.active===1),'company active');
  await api('/api/company','POST',{id:c.id,name:'SMOKE FİRMA',openingBalance:1000,note:'test',active:0});
  all=await api('/api/companies-all');ok(all.rows.some(x=>x.id===c.id&&x.active===0),'company passive');
  const active=await api('/api/companies');ok(!active.rows.some(x=>x.id===c.id),'passive hidden');
  await api('/api/company','POST',{id:c.id,name:'SMOKE FİRMA',openingBalance:1000,note:'test',active:1});

  const note=await api('/api/note','POST',{title:'Test Not',body:'Patron muhasebe smoke',author:'Muhasebe',target:'Patron',category:'Genel',priority:'ÖNEMLİ',active:1,pinned:1});
  let notes=await api('/api/notes');ok(notes.rows.some(x=>x.uid===note.uid&&x.pinned===1),'note create');
  await api('/api/note-status','POST',{uid:note.uid,status:'TAMAMLANDI',active:1});
  notes=await api('/api/notes');ok(notes.rows.some(x=>x.uid===note.uid&&x.status==='TAMAMLANDI'),'note status');

  await api('/api/machine','POST',{machineNo:'99',machineName:'SMOKE MAKİNE',dayOperator:'Ali',nightOperator:'MURAT',active:1});
  let machines=await api('/api/machines-all');ok(machines.rows.some(x=>x.machine_no==='99'&&x.day_operator==='Ali'&&x.night_operator==='MURAT'),'machine create');
  const rm=await api('/api/machine-remove','POST',{machineNo:'99'});ok(rm.soft===false,'unused machine delete');
  machines=await api('/api/machines-all');ok(!machines.rows.some(x=>x.machine_no==='99'),'machine removed');

  const job=await api('/api/job','POST',{companyId:c.id,modelName:'SMOKE MODEL',expectedQty:100,ground:'SİYAH',date:'2026-10-04'});
  await api('/api/machine','POST',{machineNo:'98',machineName:'SMOKE HISTORY',dayOperator:'Ali',nightOperator:'MURAT',active:1});
  await api('/api/production','POST',{modelId:job.modelId,date:'2026-10-04',machineNo:'98',shift:'Gündüz',operator:'Ali',qty:10,fabricDefect:0,printDefect:0});
  const rm2=await api('/api/machine-remove','POST',{machineNo:'98'});ok(rm2.soft===true,'used machine soft delete');
  machines=await api('/api/machines-all');ok(machines.rows.some(x=>x.machine_no==='98'&&x.active===0),'used machine passive');

  // Weekly pool: the same open job stays in the pool across weeks.
  await api('/api/job-adjust','POST',{batchId:job.batchId,expectedQty:70,ground:'SİYAH',orderNo:'SMOKE'});
  await api('/api/production','POST',{modelId:job.modelId,date:'2026-10-05',machineNo:'98',shift:'Gündüz',operator:'Ali',qty:40,fabricDefect:1,printDefect:2});
  await api('/api/production','POST',{modelId:job.modelId,date:'2026-10-12',machineNo:'98',shift:'Gece',operator:'MURAT',qty:20,fabricDefect:0,printDefect:1});
  const w1=await api('/api/dashboard?week=2026-10-05');
  const w2=await api('/api/dashboard?week=2026-10-12');
  const rw1=w1.rows.find(x=>x.model_id===job.modelId),rw2=w2.rows.find(x=>x.model_id===job.modelId);
  ok(w1.week.start==='2026-10-05'&&w1.week.end==='2026-10-11','week 1 range');
  ok(rw1&&rw1.week_produced===40&&rw1.week_entries===1,'week 1 production');
  ok(rw2&&rw2.week_produced===20&&rw2.week_entries===1,'week 2 production');
  ok(rw2.produced_qty===70,'general production preserved across weeks');

  // Pool completion: dispatch + invoice balance closes the job automatically.
  await api('/api/financial','POST',{modelId:job.modelId,type:'dispatch',date:'2026-10-13',docNo:'SMOKE-I',qty:70,companyId:c.id});
  await api('/api/financial','POST',{modelId:job.modelId,type:'invoice',date:'2026-10-13',docNo:'SMOKE-F',qty:70,amount:700,companyId:c.id,note:'smoke'});
  const openAfter=await api('/api/dashboard?week=2026-10-12');
  const doneAfter=await api('/api/completed?week=2026-10-12');
  ok(!openAfter.rows.some(x=>x.model_id===job.modelId),'completed model leaves active pool');
  ok(doneAfter.rows.some(x=>x.model_id===job.modelId&&x.status==='TAMAM'),'completed model enters completed pool');

  console.log(JSON.stringify({ok:true,companies:all.rows.length,notes:notes.rows.length,machineSoftDelete:true,weeklyPool:true,autoComplete:true}));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{child.kill();setTimeout(()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}},100)});

// UI selector guard
const uiJs=fs.readFileSync(path.join(root,'app','public','app.js'),'utf8');
if(/(?<!\$)\$\('[^']+'\)\.forEach/.test(uiJs))throw new Error('UI selector guard: use $$() for NodeList forEach');

// interaction layer guard
const uiCss=fs.readFileSync(path.join(root,'app','public','app.css'),'utf8');
if(!uiCss.includes('.drawer{z-index:80!important}'))throw new Error('interaction layer guard: drawer must be above backdrop');
if(!uiCss.includes('.backdrop{z-index:70!important}'))throw new Error('interaction layer guard: backdrop z-index missing');
if(!uiCss.includes('.modal{z-index:100!important}'))throw new Error('interaction layer guard: modal must be above drawer');
