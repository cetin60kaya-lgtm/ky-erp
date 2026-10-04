const {spawn}=require('child_process');
const fs=require('fs');
const os=require('os');
const path=require('path');

const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hakan-emp-smoke-'));
const port=18991;
const child=spawn(process.execPath,[path.join(root,'app','server.js')],{
  cwd:root,
  env:{...process.env,HAKAN_EMP_APP_ROOT:path.join(root,'app'),HAKAN_EMP_DATA_DIR:tmp,HAKAN_EMP_PORT:String(port)},
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

  console.log(JSON.stringify({ok:true,companies:all.rows.length,notes:notes.rows.length,machineSoftDelete:true}));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>{child.kill();setTimeout(()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}},100)});
