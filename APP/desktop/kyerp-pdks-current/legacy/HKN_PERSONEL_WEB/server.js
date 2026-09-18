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
 const num=['MAAS','NSUCRET','MSUCRET','EMAAS','KULIZIN','CCKSAY','GYUCRET','GYEMUCRET'];
 const dates=['IGTARIH','ICTARIH','DTARIH','NCVTAR','EVTAR','SGKGIRTAR'];
 try{const b=req.body||{},sets=[],params=[];for(const k of [...text,...num,...dates]){if(!(k in b))continue;sets.push(`${k}=?`);let v=b[k];if(dates.includes(k)){v=v?new Date(validIso(v)+'T00:00:00'):null;}else if(num.includes(k)){v=v===''||v==null?0:Number(v);}params.push(v);}if(!sets.length)return res.json({ok:true});params.push(req.params.pkno);await update(`update KIMLIK set ${sets.join(',')} where PKNO=?`,params);res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/defs',async(req,res)=>{try{const q=async(t)=>await query(`select * from ${t}`);const [grup,servis,sirket,bolum,durum,gorev]=await Promise.all([q('GRUPLAR'),q('SERVISLER'),q('SIRKETLER'),q('BOLUMLER'),q('DURUMLAR'),q('GOREVLER')]);res.json({grup,servis,sirket,bolum,durum,gorev});}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/giriscikis/:pkno',async(req,res)=>{try{const s=req.query.start?validIso(req.query.start):todayIso(),e=req.query.end?validIso(req.query.end):s;const sql=`select PKNO,TARIH,SAAT,ISLEM from GIRISCIKIS where PKNO=? and TARIH>=${ts(s)} and TARIH<${ts(nextIso(e))} order by TARIH,SAAT`;const rows=await query(sql,[req.params.pkno]);res.json(rows.map(r=>({...r,tarih:dmy(r.tarih)})));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/izin/:pkno',async(req,res)=>{try{const rows=await query('select * from IZIN where PKNO=? order by BTARIH desc',[req.params.pkno]);res.json(rows);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/avans/:pkno',async(req,res)=>{try{const rows=await query('select * from AVANS where PKNO=? order by TARIH desc',[req.params.pkno]);res.json(rows);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/odeme/:pkno',async(req,res)=>{try{const rows=await query('select * from ODEME where PKNO=? order by TARIH desc',[req.params.pkno]);res.json(rows);}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/summary',async(req,res)=>{try{const d=todayIso(),n=nextIso(d);const [p,g]=await Promise.all([query(`select count(*) as CNT from KIMLIK where IGTARIH<${ts(n)} and (ICTARIH is null or ICTARIH>=${ts(d)})`),query(`select count(distinct PKNO) as CNT from GIRISCIKIS where TARIH>=${ts(d)} and TARIH<${ts(n)}`)]);res.json({aktif:Number(p[0]?.cnt||0),bugun:Number(g[0]?.cnt||0)});}catch(e){res.status(500).json({error:e.message});}});
app.listen(PORT,'127.0.0.1',()=>console.log(`HKN Personel http://127.0.0.1:${PORT}`));
