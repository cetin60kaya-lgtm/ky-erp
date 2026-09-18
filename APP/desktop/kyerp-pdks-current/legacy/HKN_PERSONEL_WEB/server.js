const express=require('express');
const path=require('path');
const fb=require('node-firebird');
const app=express(),PORT=5051;
const dbOptions={
  host:process.env.KY_PDKS_DB_HOST||'127.0.0.1',
  port:Number(process.env.KY_PDKS_DB_PORT||3050),
  database:process.env.KY_PDKS_DB_PATH||'D:/Hedef500/Hedef500/Data/DATABASE.GDB',
  user:process.env.KY_PDKS_DB_USER||'SYSDBA',
  password:process.env.KY_PDKS_DB_PASSWORD||'',
  lowercase_keys:true,role:null,pageSize:4096
};
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));
function query(sql,params=[]){return new Promise((resolve,reject)=>fb.attach(dbOptions,(err,db)=>{if(err)return reject(err);db.query(sql,params,(e,rows)=>{db.detach();e?reject(e):resolve(rows||[]);});}));}
function update(sql,params=[]){return new Promise((resolve,reject)=>fb.attach(dbOptions,(err,db)=>{if(err)return reject(err);db.transaction(fb.ISOLATION_READ_COMMITTED,(e,tr)=>{if(e){db.detach();return reject(e);}tr.query(sql,params,qerr=>qerr?tr.rollback(()=>{db.detach();reject(qerr);}):tr.commit(cerr=>{db.detach();cerr?reject(cerr):resolve();}));});}));}
function validIso(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw new Error('GeÃƒÂ§ersiz tarih');return s;}
function nextIso(s){validIso(s);const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function ts(s){validIso(s);return `CAST('${s} 00:00:00' AS TIMESTAMP)`;}
function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dmy(v){if(!v)return '';const d=new Date(v);return isNaN(d)?String(v):`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;}
function minuteVal(h,m){return Number(m)>59?Number(m):(Number(h)||0)*60+(Number(m)||0);}
function clock(h,m){const t=minuteVal(h,m);return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
app.get('/api/personel',async(req,res)=>{try{let sql="select PKNO,AD,SOYAD,IGTARIH,ICTARIH,BOLUM,DURUM from KIMLIK";if(req.query.all!=="1"){const a=todayIso(),e=ts(nextIso(a)),s=ts(a);sql+=` where IGTARIH<${e} and (ICTARIH is null or ICTARIH>=${s})`;}sql+=" order by AD,SOYAD";res.json(await query(sql));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/personel/:pkno',async(req,res)=>{try{const sql="select PKNO,AD,SOYAD,GRUP,SERVIS,SIRKET,BOLUM,DURUM,GOREV,IGTARIH,ICTARIH,MAAS,NSUCRET,MSUCRET,EMAAS,DYER,DTARIH,IL,ILCE,CINSIYET,CILTNO,KSIRANO,SAYFANO,NCVTAR,NCVNED,KAYITNO,VYER,BABAAD,ANAAD,MEDHAL,ASDURUM,KGB,UYRUK,ESINIF,EVILILCE,EBELGENO,EVTAR,EKC,AYNO,ELBNO,KULIZIN,CCKSAY,EGTDURUM,YDIL,EVTEL,UALAN,SSKNO,UKNO,BHNO,VKNO,ICIKSEBEB,GYUCRET,GYEMUCRET,GSM,ADRES,SICILNO,SGKGIRTAR from KIMLIK where PKNO=?";const rows=await query(sql,[req.params.pkno]);if(!rows.length)return res.status(404).json({error:'Personel bulunamadÃ„Â±'});res.json(rows[0]);}catch(e){res.status(500).json({error:e.message});}});
app.put('/api/personel/:pkno',async(req,res)=>{
 const text=['AD','SOYAD','DYER','IL','ILCE','CINSIYET','CILTNO','KSIRANO','SAYFANO','NCVNED','KAYITNO','VYER','BABAAD','ANAAD','MEDHAL','ASDURUM','KGB','UYRUK','ESINIF','EVILILCE','EBELGENO','EKC','AYNO','ELBNO','EGTDURUM','YDIL','EVTEL','UALAN','SSKNO','UKNO','BHNO','VKNO','ICIKSEBEB','GSM','ADRES','SICILNO'];
 const nums=['GRUP','SERVIS','SIRKET','BOLUM','DURUM','GOREV','MAAS','NSUCRET','MSUCRET','EMAAS','KULIZIN','CCKSAY','GYUCRET','GYEMUCRET'];
 const dates=['IGTARIH','ICTARIH','DTARIH','NCVTAR','EVTAR','SGKGIRTAR'];
 try{const set=[],params=[];for(const k of text)if(Object.prototype.hasOwnProperty.call(req.body,k)){set.push(k+'=?');params.push(req.body[k]===''?null:String(req.body[k]));}
 for(const k of nums)if(Object.prototype.hasOwnProperty.call(req.body,k)){set.push(k+'=?');const v=req.body[k];params.push(v===''||v==null?null:Number(v));}
 for(const k of dates)if(Object.prototype.hasOwnProperty.call(req.body,k)){const v=req.body[k];if(v===''||v==null)set.push(k+'=NULL');else{validIso(v);set.push(k+'=CAST(? AS TIMESTAMP)');params.push(v+' 00:00:00');}}
 if(!set.length)return res.json({ok:true});params.push(req.params.pkno);await update('update KIMLIK set '+set.join(',')+' where PKNO=?',params);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/gircik/:pkno',async(req,res)=>{
 try{let where='PKNO=?',params=[req.params.pkno];if(req.query.from&&req.query.to){const a=ts(req.query.from),x=ts(nextIso(req.query.to));where+=` and ((GTARIH>=${a} and GTARIH<${x}) or (CTARIH>=${a} and CTARIH<${x}))`;}const sql=`select SIRA,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA,GTUR,CTUR from GIRCIK where ${where} order by COALESCE(GTARIH,CTARIH) desc,GDAKIKA desc rows 500`;res.json(await query(sql,params));}catch(e){res.status(500).json({error:e.message});}
});
function dashboard(rows){
 const m=new Map();
 for(const r of rows){
  if(!m.has(r.pkno))m.set(r.pkno,{pkno:r.pkno,ad:r.ad||'',soyad:r.soyad||'',events:[]});
  const p=m.get(r.pkno);
  if(r.gtarih){const mm=minuteVal(r.gsaat,r.gdakika);p.events.push({t:'G',d:dmy(r.gtarih),s:clock(r.gsaat,r.gdakika),v:new Date(r.gtarih).getTime()+mm*60000});}
  if(r.ctarih){const mm=minuteVal(r.csaat,r.cdakika);p.events.push({t:'C',d:dmy(r.ctarih),s:clock(r.csaat,r.cdakika),v:new Date(r.ctarih).getTime()+mm*60000});}
 }
 return [...m.values()].map(p=>{p.events.sort((a,b)=>a.v-b.v);const last=p.events[p.events.length-1];const days=new Set(p.events.map(e=>e.d));return {...p,status:!last?'BASMADI':last.t==='G'?'Ã„Â°Ãƒâ€¡ERÃ„Â°DE':'Ãƒâ€¡IKTI',son:last?`${last.d} ${last.s}`:'',adet:days.size};});
}
app.get('/api/canli',async(req,res)=>{
 try{const a=todayIso(),x=nextIso(a),s=ts(a),e=ts(x);const sql=`select K.PKNO,K.AD,K.SOYAD,G.GTARIH,G.GSAAT,G.GDAKIKA,G.CTARIH,G.CSAAT,G.CDAKIKA from KIMLIK K left join GIRCIK G on G.PKNO=K.PKNO and ((G.GTARIH>=${s} and G.GTARIH<${e}) or (G.CTARIH>=${s} and G.CTARIH<${e})) where K.IGTARIH<${e} and (K.ICTARIH is null or K.ICTARIH>=${s}) order by K.AD,K.SOYAD`;const list=dashboard(await query(sql));res.json({toplam:list.length,iceride:list.filter(x=>x.status==='Ã„Â°Ãƒâ€¡ERÃ„Â°DE').length,cikti:list.filter(x=>x.status==='Ãƒâ€¡IKTI').length,basmadi:list.filter(x=>x.status==='BASMADI').length,list});}catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/donem',async(req,res)=>{
 try{const a=validIso(req.query.from),b=validIso(req.query.to),x=nextIso(b),s=ts(a),e=ts(x);const sql=`select K.PKNO,K.AD,K.SOYAD,G.GTARIH,G.GSAAT,G.GDAKIKA,G.CTARIH,G.CSAAT,G.CDAKIKA from KIMLIK K left join GIRCIK G on G.PKNO=K.PKNO and ((G.GTARIH>=${s} and G.GTARIH<${e}) or (G.CTARIH>=${s} and G.CTARIH<${e})) where K.IGTARIH<${e} and (K.ICTARIH is null or K.ICTARIH>=${s}) order by K.AD,K.SOYAD`;const list=dashboard(await query(sql));res.json({from:a,to:b,list});}catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/health',async(req,res)=>{try{const r=await query('select count(*) as TOPLAM from KIMLIK');res.json({ok:true,personel:r[0]?.toplam||0,db:dbOptions.database});}catch(e){res.status(500).json({ok:false,error:e.message});}});

app.get('/api/tanimlar',async(req,res)=>{try{const out={};for(const t of ['GRUP','BOLUM','GOREV','SERVIS','DURUM','FIRMA','TATIL','DONEM']){out[t.toLowerCase()]=await query('select KOD,AD from '+t+' order by KOD');}out.avtur=await query('select KOD,TUR,ISARET from AVTUR order by KOD');res.json(out);}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/personel-bulk',async(req,res)=>{try{const fields=['GRUP','BOLUM','DURUM','SERVIS','GOREV','SIRKET'];const field=String(req.body.field||'').toUpperCase();const pknos=Array.isArray(req.body.pknos)?req.body.pknos.filter(Boolean):[];if(!fields.includes(field))throw new Error('Toplu iÃ…Å¸lem alanÃ„Â± geÃƒÂ§ersiz');if(!pknos.length)throw new Error('Personel seÃƒÂ§ilmedi');if(pknos.length>200)throw new Error('Ãƒâ€¡ok fazla personel seÃƒÂ§ildi');const v=req.body.value===''||req.body.value==null?null:Number(req.body.value);if(v!==null&&!Number.isFinite(v))throw new Error('TanÃ„Â±m kodu geÃƒÂ§ersiz');const marks=pknos.map(()=>'?').join(',');await update('update KIMLIK set '+field+'=? where PKNO in ('+marks+')',[v,...pknos]);res.json({ok:true,count:pknos.length,field,value:v});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/izin/:pkno',async(req,res)=>{try{res.json(await query('select PKNO,TARIH,TIP,MAZERET,BASSAAT,BITSAAT,SURESAAT,BASDAKIKA,BITDAKIKA,SUREDAKIKA,SIRA from OZELIZIN where PKNO=? order by TARIH desc,SIRA desc rows 300',[req.params.pkno]));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/avans/:pkno',async(req,res)=>{try{res.json(await query('select A.PKNO,A.KOD,A.TARIH,A.MIKTAR,A.VTARIH,A.TURKOD,A.TAKSITSAYISI,A.TAKSITNO,A.ACIKLAMA,V.TUR,V.ISARET from AVANS A left join AVTUR V on V.KOD=A.TURKOD where A.PKNO=? order by A.TARIH desc rows 300',[req.params.pkno]));}catch(e){res.status(500).json({error:e.message});}});


function hm(v){if(!/^\d{2}:\d{2}$/.test(v||''))throw new Error('Saat HH:MM olmalÃ„Â±');const a=v.split(':').map(Number);if(a[0]>23||a[1]>59)throw new Error('GeÃƒÂ§ersiz saat');return {s:v,d:a[0]*60+a[1]};}
async function nextId(table,col){const r=await query(`select coalesce(max(${col}),0)+1 as N from ${table}`);return Number(r[0]?.n||1);}
app.post('/api/gircik/:pkno',async(req,res)=>{try{
 const d=validIso(req.body.date),g=req.body.giris?hm(req.body.giris):null,c=req.body.cikis?hm(req.body.cikis):null;if(!g&&!c)throw new Error('GiriÃ…Å¸ veya ÃƒÂ§Ã„Â±kÃ„Â±Ã…Å¸ saati gerekli');
 const id=await nextId('GIRCIK','SIRA'),date=`CAST('${d} 00:00:00' AS TIMESTAMP)`;
 await update(`insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,TUS1,CTARIH,CSAAT,CDAKIKA,CTUR,TUS2,MKOD) values (?,?,${g?date:'NULL'},?,?,?, ?,${c?date:'NULL'},?,?,?, ?,?)`,
 [id,req.params.pkno,g?.s||null,g?.d||null,null,null,c?.s||null,c?.d||null,null,null,'000']);res.json({ok:true,sira:id});
 }catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/gircik/:pkno/:sira',async(req,res)=>{try{await update('delete from GIRCIK where PKNO=? and SIRA=?',[req.params.pkno,Number(req.params.sira)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/izin/:pkno',async(req,res)=>{try{
 const a=validIso(req.body.baslangic),b=validIso(req.body.bitis||req.body.baslangic),tip=String(req.body.tip||'ÃƒÅ“cretsiz').slice(0,30),maz=String(req.body.mazeret||'').slice(0,80);
 const full=req.body.sure!=='Saatlik Ã„Â°zin',bs=full?null:hm(req.body.basSaat),bt=full?null:hm(req.body.bitSaat);if(!full&&bt.d<=bs.d)throw new Error('BitiÃ…Å¸ saati baÃ…Å¸langÃ„Â±ÃƒÂ§tan sonra olmalÃ„Â±');
 let d=new Date(a+'T00:00:00'),end=new Date(b+'T00:00:00'),count=0;
 while(d<=end){const di=isoDate(d),id=await nextId('OZELIZIN','SIRA'),mins=full?450:bt.d-bs.d,ss=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  await update(`insert into OZELIZIN (PKNO,BASSAAT,BITSAAT,SURESAAT,BASDAKIKA,BITDAKIKA,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) values (?,?,?,?,?,?,?,4,CAST('${di} 00:00:00' AS TIMESTAMP),?,?,?,'0')`,[req.params.pkno,bs?.s||null,bt?.s||null,ss,bs?.d||null,bt?.d||null,mins,tip,maz,id]);count++;d.setDate(d.getDate()+1);}
 res.json({ok:true,count});}catch(e){res.status(400).json({error:e.message});}});
function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
app.delete('/api/izin/:pkno/:sira',async(req,res)=>{try{await update('delete from OZELIZIN where PKNO=? and SIRA=?',[req.params.pkno,Number(req.params.sira)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/avans/:pkno',async(req,res)=>{try{
 const t=validIso(req.body.tarih),v=validIso(req.body.verilis||req.body.tarih),tur=Number(req.body.tur),m=Math.abs(Number(req.body.miktar)),tak=Math.max(1,Number(req.body.taksit||1));if(!Number.isFinite(m)||m<=0)throw new Error('Miktar geÃƒÂ§ersiz');
 const tr=await query('select TUR,ISARET from AVTUR where KOD=?',[tur]);if(!tr.length)throw new Error('TÃƒÂ¼r bulunamadÃ„Â±');const signed=tr[0].isaret==='-'?-m:m,id=await nextId('AVANS','KOD');
 await update(`insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (?,CAST('${t} 00:00:00' AS TIMESTAMP),?,CAST('${v} 00:00:00' AS TIMESTAMP),?,?,?,?,1,?)`,[req.params.pkno,signed,tur,id,m,tak,String(req.body.aciklama||'').slice(0,120)]);
 res.json({ok:true,kod:id});}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/avans/:pkno/:kod',async(req,res)=>{try{await update('delete from AVANS where PKNO=? and KOD=?',[req.params.pkno,Number(req.params.kod)]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/puantaj/:pkno',async(req,res)=>{try{
 const a=validIso(req.query.from),b=validIso(req.query.to),e=ts(nextIso(b)),s=ts(a);
 const sql=`select TARIH,GIRIS,CIKIS,STATUS,DEVAMSIZLIKS,DEVAMSIZLIKG,GECS,GECG,ERKENS,ERKENG,EKSIKS,EKSIKG,SAAT1,DAKIKA1,GUN1,SAAT2,DAKIKA2,GUN2,SAAT3,DAKIKA3,GUN3,SAAT4,DAKIKA4,GUN4,SAAT5,DAKIKA5,GUN5,SAAT6,DAKIKA6,GUN6,SAAT7,DAKIKA7,GUN7,SAAT8,DAKIKA8,GUN8,SAAT9,DAKIKA9,GUN9 from PUANTAJ where PKNO=? and TARIH>=${s} and TARIH<${e} order by TARIH`;
 res.json(await query(sql,[req.params.pkno]));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/odeme-summary/:pkno',async(req,res)=>{try{
 const a=validIso(req.query.from),b=validIso(req.query.to),e=ts(nextIso(b)),s=ts(a),p=(await query('select MAAS,GYUCRET,GYEMUCRET from KIMLIK where PKNO=?',[req.params.pkno]))[0]||{};
 const pu=await query(`select DEVAMSIZLIKG,GECG,ERKENG,EKSIKG,DAKIKA1,GUN1,DAKIKA2,GUN2,DAKIKA3,GUN3,DAKIKA4,GUN4,DAKIKA5,GUN5,DAKIKA6,GUN6,DAKIKA7,GUN7,DAKIKA8,GUN8,DAKIKA9,GUN9 from PUANTAJ where PKNO=? and TARIH>=${s} and TARIH<${e}`,[req.params.pkno]);
 const av=await query(`select coalesce(sum(MIKTAR),0) TOPLAM from AVANS where PKNO=? and TARIH>=${s} and TARIH<${e}`,[req.params.pkno]);
 let dev=0,gec=0,erk=0,eks=0,normalD=0,normalG=0;for(const x of pu){dev+=Number(x.devamsizlikg||0);gec+=Number(x.gecg||0);erk+=Number(x.erkeng||0);eks+=Number(x.eksikg||0);normalD+=Number(x.dakika1||0);normalG+=Number(x.gun1||0);}
 const maas=Number(p.maas||0),gunluk=Number(p.gyucret||0)||(maas/30),kesinti=Number(av[0]?.toplam||0),devKes=dev*gunluk,net=maas+kesinti-devKes;
 res.json({maas,gunluk,normalDakika:normalD,normalGun:normalG,devamsizGun:dev,gecGun:gec,erkenGun:erk,eksikGun:eks,ekToplam:kesinti,devamsizlikKesinti:devKes,net});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/personel',async(req,res)=>{try{
 const pk=String(req.body.pkno||'').trim();if(!/^\d{5}$/.test(pk))throw new Error('Kart no 5 haneli olmalÃ„Â±');if((await query('select PKNO from KIMLIK where PKNO=?',[pk])).length)throw new Error('Bu kart numarasÃ„Â± zaten var');
 const ps=await nextId('KIMLIK','PS'),ad=String(req.body.ad||'').trim().toUpperCase(),soy=String(req.body.soyad||'').trim().toUpperCase(),g=validIso(req.body.giris||todayIso());if(!ad||!soy)throw new Error('Ad ve soyad gerekli');
 await update(`insert into KIMLIK (PS,PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,DURUM,GOREV,MAAS,KULIZIN,CCKSAY,ESDRM,DYER,BABAAD,ANAAD,MEDHAL,UYRUK,ADRES,SSKNO,SICILNO) values (?,?,?,?,CAST('${g} 00:00:00' AS TIMESTAMP),?,?,?,?,?,0,0,-1,'','','','','','','','')`,[ps,pk,ad,soy,Number(req.body.grup||1),Number(req.body.bolum||1),Number(req.body.durum||2),Number(req.body.gorev||1),Number(req.body.maas||0)]);
 res.json({ok:true,pkno:pk});}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/personel/:pkno/cikis',async(req,res)=>{try{const d=validIso(req.body.tarih);await update(`update KIMLIK set ICTARIH=CAST('${d} 00:00:00' AS TIMESTAMP) where PKNO=?`,[req.params.pkno]);res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});

app.get('/api/donemler',async(req,res)=>{try{
 const rows=await query('select KOD,AD,BASTAR,BITTAR,GRUP from DONEM order by BASTAR desc,GRUP');
 res.json(rows);
}catch(e){res.status(500).json({error:e.message});}});

app.get('/api/odeme/:pkno',async(req,res)=>{try{
 const a=validIso(req.query.from),b=validIso(req.query.to),s=ts(a),e=ts(nextIso(b));
 const rows=await query(`select PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH from ODEME where PKNO=? and BASTAR>=${s} and BASTAR<${e} order by BASTAR desc`,[req.params.pkno]);
 res.json(rows);
}catch(e){res.status(400).json({error:e.message});}});

app.post('/api/odeme/:pkno',async(req,res)=>{try{
 const a=validIso(req.body.from),b=validIso(req.body.to),nt=validIso(req.body.normalTarih||todayIso()),ft=validIso(req.body.mesaiTarih||todayIso());
 const n=Math.max(0,Number(req.body.normal||0)),f=Math.max(0,Number(req.body.mesai||0));
 if(!Number.isFinite(n)||!Number.isFinite(f))throw new Error('Ãƒâ€“deme tutarÃ„Â± geÃƒÂ§ersiz');
 const ex=await query(`select PKNO from ODEME where PKNO=? and BASTAR=CAST('${a} 00:00:00' AS TIMESTAMP) and BITTAR=CAST('${b} 00:00:00' AS TIMESTAMP)`,[req.params.pkno]);
 if(ex.length)await update(`update ODEME set NODENEN=?,NOTARIH=CAST('${nt} 00:00:00' AS TIMESTAMP),FMODENEN=?,FMOTARIH=CAST('${ft} 00:00:00' AS TIMESTAMP) where PKNO=? and BASTAR=CAST('${a} 00:00:00' AS TIMESTAMP) and BITTAR=CAST('${b} 00:00:00' AS TIMESTAMP)`,[n,f,req.params.pkno]);
 else await update(`insert into ODEME (PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values (?,CAST('${a} 00:00:00' AS TIMESTAMP),CAST('${b} 00:00:00' AS TIMESTAMP),?,CAST('${nt} 00:00:00' AS TIMESTAMP),?,CAST('${ft} 00:00:00' AS TIMESTAMP))`,[req.params.pkno,n,f]);
 res.json({ok:true});
}catch(e){res.status(400).json({error:e.message});}});

app.get('/api/bordro-alanlari',async(req,res)=>{try{
 res.json(await query('select KOD,AD,KAD,BKOD,CARPAN,CALAN,TIP from BORDRO order by KOD'));
}catch(e){res.status(500).json({error:e.message});}});

app.listen(PORT,"127.0.0.1",()=>console.log("HKN Personel ready on "+PORT));
