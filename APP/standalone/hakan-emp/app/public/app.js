let core={rows:[],summary:{},models:[],machines:[],operators:[],companies:[]},done={rows:[]},cari={rows:[],movements:[]},allCompanies={rows:[]},machinesAll={rows:[]},notes={rows:[]},reminders={rows:[]},checks={rows:[]},sync={},settings={values:{}};
let prodView='OPEN',noteView='ACTIVE',remView='PENDING',checkView='PAYABLE',selectedCompanyId=0,currentModel=null,currentDetail=null,weekCursor='';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const n=v=>Number(v||0),fmt=v=>new Intl.NumberFormat('tr-TR').format(n(v)),money=v=>'₺'+new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n(v)),today=()=>new Date().toISOString().slice(0,10),norm=s=>String(s||'').trim().toLocaleUpperCase('tr-TR'),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const dateTR=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:(s||'—')};
function isoLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addDaysIso(s,days){const d=new Date((s||today())+'T12:00:00');d.setDate(d.getDate()+Number(days||0));return isoLocal(d)}
function weekStartIso(s=today()){const d=new Date((s||today())+'T12:00:00'),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return isoLocal(d)}
function weekLabelText(start){const end=addDaysIso(start,6);return dateTR(start)+' — '+dateTR(end)}
weekCursor=weekStartIso(today());
async function api(url,opt){const r=await fetch(url,opt);let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||'İşlem başarısız');return j}
const post=(u,x)=>api(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)});
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove('show'),1800)}

const meta={production:['HAKAN EMP / İMALAT','İmalat Havuzu','Haftalık üretim fişleri + açık iş havuzu + irsaliye/fatura dengesi.'],cari:['HAKAN EMP / CARİ','Cari Takip','Firma seç, bakiye ve bütün hareketleri tek ekranda gör.'],checks:['HAKAN EMP / ÇEK','Çek Takip','Ay ay ayrılmış çekler, toplamlar, makbuz ve çıktı.'],settings:['HAKAN EMP / AYARLAR','Ayarlar','Firma, imalat, makine, cari, çek ve senkron ayarları.'],notes:['HAKAN EMP / NOTLAR','Notlarım','Patron ile muhasebe arasındaki aktif not ve görev panosu.'],reminders:['HAKAN EMP / ÖDEME','Ödeme Hatırlatma','Yaklaşan, geciken ve ödenen ödemeleri takip et.']};
function navigate(p){$$('.page').forEach(x=>x.classList.remove('active'));$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('#'+p).classList.add('active');$('#crumb').textContent=meta[p][0];$('#pageTitle').textContent=meta[p][1];$('#pageSub').textContent=meta[p][2];if(p==='production')renderProduction();if(p==='cari')renderCari();if(p==='checks')renderChecks();if(p==='settings')renderSettings();if(p==='notes')renderNotes();if(p==='reminders')renderReminders()}
$$('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.page));

function syncModalLayers(){
 const layers=$$('#modal .modal-instance'),count=layers.length;
 layers.forEach((layer,i)=>{const fromTop=count-1-i,card=layer.querySelector('.modal-card');layer.classList.toggle('top',i===count-1);layer.style.zIndex=String(90+i);if(card){card.style.setProperty('--stack-x',(fromTop*-12)+'px');card.style.setProperty('--stack-y',(fromTop*-10)+'px');card.style.setProperty('--stack-scale',String(Math.max(.94,1-fromTop*.025)))}})
}
function modal(title,sub,html){
 const host=$('#modal'),layer=document.createElement('div');layer.className='modal-instance';
 layer.innerHTML=`<div class="modal-card quick-window"><button class="modal-x" onclick="closeModal()">×</button><div class="modal-head"><small>HAKAN EMP · HIZLI İŞLEM</small><h3>${esc(title)}</h3><p>${esc(sub||'')}</p></div><div class="modal-body">${html}</div><div class="resize-handle resize-handle-left" data-resize-card title="Boyutu ayarla"></div></div>`;
 layer.addEventListener('mousedown',e=>{if(e.target===layer&&layer.classList.contains('top'))closeModal()});
 host.appendChild(layer);host.classList.add('show');syncModalLayers();
 const saved=localStorage.getItem('hakanEmpQuickSize');if(saved){try{const s=JSON.parse(saved),card=layer.querySelector('.modal-card');if(s.w)card.style.width=s.w+'px';if(s.h)card.style.height=s.h+'px'}catch{}}
 setTimeout(()=>{const scope=layer,first=scope.querySelector('[autofocus]')||scope.querySelector('select:not([disabled]),input:not([type="hidden"]):not([disabled])');if(first){first.focus();if(first.select)first.select()}},40)
}
function closeModal(){const host=$('#modal'),layers=$$('#modal .modal-instance');if(layers.length)layers[layers.length-1].remove();if(!host.querySelector('.modal-instance'))host.classList.remove('show');syncModalLayers()}
window.closeModal=closeModal;
function companyOptions(selected=''){return(cari.rows||core.companies||[]).map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?'selected':''}>${esc(c.name)}</option>`).join('')}
function defaultCompanyId(){return n(settings.values?.default_company_id)||n(selectedCompanyId)||n((cari.rows||[])[0]?.id)||n((core.companies||[])[0]?.id)}
function openOptions(selected='',companyId=0){let a=core.rows||[];if(companyId)a=a.filter(r=>n(r.company_id)===n(companyId));return a.map(r=>`<option value="${r.model_id}" ${String(r.model_id)===String(selected)?'selected':''}>${esc(r.model_name)}${r.company_name?' — '+esc(r.company_name):''}</option>`).join('')}
function operatorOptions(selected=''){const a=core.operators||[];return '<option value="">Makinacı seç</option>'+a.map(o=>`<option value="${esc(o.name)}" ${norm(o.name)===norm(selected)?'selected':''}>${esc(o.name)}</option>`).join('')}

function updateWeekUi(){
 const w=core.week||{start:weekCursor,end:addDaysIso(weekCursor,6)};weekCursor=w.start||weekCursor;
 if($('#weekLabel'))$('#weekLabel').textContent=weekLabelText(weekCursor);
 if($('#weekSub'))$('#weekSub').textContent=(core.summary?.weekEntries||0)+' üretim fişi · Fiş tarihi hangi haftadaysa kayıt o haftaya gider.';
}
async function loadProductionPeriod(){
 try{
  [core,done]=await Promise.all([api('/api/dashboard?week='+encodeURIComponent(weekCursor)),api('/api/completed?week='+encodeURIComponent(weekCursor))]);
  renderProduction();
 }catch(e){toast(e.message)}
}
async function moveWeek(days){weekCursor=weekStartIso(addDaysIso(weekCursor,days));await loadProductionPeriod()} window.moveWeek=moveWeek;
async function goCurrentWeek(){weekCursor=weekStartIso(today());await loadProductionPeriod()} window.goCurrentWeek=goCurrentWeek;

function renderProduction(){
 const sm=core.summary||{};updateWeekUi();
 $('#sOpen').textContent=fmt(sm.open);
 $('#sWeekModels').textContent=fmt(sm.weekModels);
 $('#sWeekProduced').textContent=fmt(sm.weekProduced);
 $('#sWeekDefects').textContent=fmt(sm.weekDefects);
 $('#sWeekEntries').textContent=fmt(sm.weekEntries)+' fiş';
 $('#sInvoiceReady').textContent=fmt(sm.invoiceReady);
 let a=prodView==='OPEN'?[...(core.rows||[])]:[...(done.rows||[])],q=norm($('#prodSearch').value),f=$('#prodStatus').value;
 if(q)a=a.filter(r=>norm((r.model_name||'')+' '+(r.company_name||'')+' '+(r.ground||'')).includes(q));
 if(f&&prodView==='OPEN')a=a.filter(r=>r.action_code===f);
 $('#prodRows').innerHTML=a.length?a.map(r=>`<div class="data-row prod-grid clickable ${n(r.week_entries)?'week-active-row':''}" onclick="openModel(${r.model_id})">
   <div class="cell-main"><b>${esc(r.model_name)}</b><small>${esc(r.company_name||'Firma yok')}${r.ground?' · Zemin '+esc(r.ground):''} · Son ${dateTR(r.last_date)}</small></div>
   <div class="num">${fmt(r.incoming_qty)}</div>
   <div class="num week-num"><b>${fmt(r.week_produced)}</b><small>${fmt(r.week_entries)} fiş${n(r.week_fabric_defect)+n(r.week_print_defect)?' · '+fmt(n(r.week_fabric_defect)+n(r.week_print_defect))+' sakat':''}</small></div>
   <div class="num">${fmt(r.produced_qty)}</div>
   <div class="num">${fmt(r.dispatch_qty)}</div>
   <div class="num">${fmt(r.invoice_qty)}</div>
   <div class="num">${fmt(r.invoice_remaining)}</div>
   <div><span class="status ${r.color||'green'}">${prodView==='DONE'?'TAMAM':esc(r.action)}</span></div>
  </div>`).join(''):'<div class="empty">'+(prodView==='OPEN'?'Havuzda açık iş yok.':'Tamamlanan iş yok.')+'</div>'
}
$$('[data-prod-view]').forEach(b=>b.onclick=()=>{$$('[data-prod-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');prodView=b.dataset.prodView;$('#prodStatus').disabled=prodView==='DONE';renderProduction()});
$('#prodSearch').oninput=renderProduction;$('#prodStatus').onchange=renderProduction;

function openJob(){
 modal('Yeni İmalat İşi','Gelen toplam adedi yaz; bundan sonra bütün takip bu modelde yürür.',`
 <form class="form" id="jobForm">
  <label class="field">Firma<select name="companyId">${companyOptions(defaultCompanyId())}</select></label>
  <label class="field full">Model<input name="modelName" list="models" required autofocus placeholder="A MODELİ"><datalist id="models">${(core.models||[]).map(m=>`<option value="${esc(m.name)}"></option>`).join('')}</datalist></label>
  <label class="field">Gelen İmalat Adedi<input name="expectedQty" type="number" min="1" required></label>
  <label class="field">Zemin Rengi<input name="ground" required placeholder="Siyah / Ekru / Lacivert"></label>
  <label class="field">Başlangıç Tarihi<input name="date" type="date" value="${today()}" required></label>
  <label class="field full">Sipariş No (opsiyonel)<input name="orderNo"></label>
  <div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">İşi Aç</button></div>
 </form>`);
 $('#jobForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/job',Object.fromEntries(new FormData(e.target)));closeModal();toast('İmalat işi açıldı');await loadAll()}catch(err){toast(err.message)}}
}
window.openJob=openJob;

function openProduction(mid=''){
 if(!(core.rows||[]).length)return toast('Önce iş açın');
 modal('Üretim Girişi','Sadece adet, makine, vardiya, makinacı ve iki sakat bilgisi.',`
 <form class="form" id="productionForm">
  <label class="field full">Model<select name="modelId" id="pModel" required><option value="">Model seç</option>${openOptions(mid)}</select></label>
  <label class="field">Tarih<input name="date" type="date" value="${today()}" required></label>
  <label class="field">Makine<select name="machineNo" id="pMachine" required><option value="">Makine seç</option>${(core.machines||[]).map(m=>`<option value="${esc(m.machine_no)}">No ${esc(m.machine_no)} — ${esc(m.machine_name||'')}</option>`).join('')}</select></label>
  <label class="field">Vardiya<select name="shift" id="pShift"><option ${settings.values?.default_shift==='Gece'?'':'selected'}>Gündüz</option><option ${settings.values?.default_shift==='Gece'?'selected':''}>Gece</option></select></label>
  <label class="field">Makinacı<select name="operator" id="pOperator">${operatorOptions()}</select></label>
  <label class="field">Üretim Adedi<input name="qty" type="number" min="1" required></label>
  <label class="field">Kumaş Sakatı<input name="fabricDefect" type="number" min="0" value="0"></label>
  <label class="field">Baskı Sakatı<input name="printDefect" type="number" min="0" value="0"></label>
  <div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Üretimi Kaydet</button></div>
 </form>`);
 const fill=()=>{const m=(core.machines||[]).find(x=>String(x.machine_no)===$('#pMachine').value);if(!m)return;$('#pOperator').value=$('#pShift').value==='Gece'?(m.night_operator||''):(m.day_operator||'')};$('#pMachine').onchange=fill;$('#pShift').onchange=fill;if(mid)$('#pModel').value=mid;setTimeout(()=>{const el=mid?$('#productionForm [name="qty"]'):$('#pModel');if(el){el.focus();if(el.select)el.select()}},60);
 $('#productionForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/production',Object.fromEntries(new FormData(e.target)));closeModal();toast('Üretim işlendi');await loadAll();if(mid)openModel(mid)}catch(err){toast(err.message)}}
}
window.openProduction=openProduction;

let serialLookupData=null,serialLookupTimer=null;
function serialSaved(){try{return JSON.parse(localStorage.getItem('hakanEmpSerialPrefs')||'{}')}catch{return{}}}
function serialRemember(x){localStorage.setItem('hakanEmpSerialPrefs',JSON.stringify(x))}
function serialRecentHtml(a=[]){
 if(!a.length)return'';
 return '<div class="serial-recent"><b>Son üretimler</b>'+a.map(r=>'<span>'+dateTR(r.date)+' · M'+esc(r.machine_no||'-')+' · '+esc(r.shift||'')+' · '+esc(r.operator||'')+' <strong>'+fmt(r.qty)+'</strong></span>').join('')+'</div>'
}
function renderSerialLookup(x){
 const prevKey=norm(serialLookupData?.model?.name||serialLookupData?.modelName),nextKey=norm(x?.model?.name||x?.modelName);const box=$('#serialModelStatus'),exp=$('#serialExpectedWrap'),ground=$('#serialGround'),repeat=$('#serialRepeatConfirmed'),fresh=$('#serialNewConfirmed');if(prevKey&&nextKey&&prevKey!==nextKey&&ground)ground.value='';serialLookupData=x;
 if(!box)return;
 repeat.value='0';fresh.value='0';ground.readOnly=false;ground.tabIndex=0;
 if(!x||x.state==='EMPTY'){box.className='serial-status neutral';box.innerHTML='<b>Model adını yaz.</b><span>Sistem daha önceki kaydı kontrol edecek.</span>';exp.classList.add('hidden');return}
 const s=x.summary||{},similar=x.similar||[];
 const suggestions=similar.length?'<div class="similar-models"><small>Benzer modeller</small>'+similar.map(m=>'<button type="button" data-serial-model="'+esc(m.name)+'">'+esc(m.name)+'</button>').join('')+'</div>':'';
 if(x.state==='OPEN'){
   exp.classList.add('hidden');if(s.ground){ground.value=s.ground;ground.readOnly=true;ground.tabIndex=-1}
   box.className='serial-status open';
   box.innerHTML='<div class="serial-state-line"><span class="serial-badge open">DEVAM EDEN MODEL</span><strong>'+esc(x.model?.name||'')+'</strong></div><div class="serial-kpis"><span>Gelen <b>'+fmt(s.incoming_qty)+'</b></span><span>Önceki Üretim <b>'+fmt(s.produced_qty)+'</b></span><span>Kalan <b>'+fmt(s.production_remaining)+'</b></span><span>Zemin <b>'+esc(s.ground||'—')+'</b></span></div>'+serialRecentHtml(x.recent)+suggestions;
 }else if(x.state==='REPEAT'){
   exp.classList.remove('hidden');if(s.ground)ground.value=s.ground;
   box.className='serial-status repeat';
   box.innerHTML='<div class="serial-state-line"><span class="serial-badge repeat">ÖNCEDEN ÜRETİLMİŞ</span><strong>'+esc(x.model?.name||'')+'</strong></div><div class="serial-kpis"><span>Son Tarih <b>'+dateTR(s.last_date)+'</b></span><span>Eski Gelen <b>'+fmt(s.incoming_qty)+'</b></span><span>Eski Üretim <b>'+fmt(s.produced_qty)+'</b></span><span>Eski Zemin <b>'+esc(s.ground||'—')+'</b></span></div><div class="repeat-question"><b>Aynı modelin repetesi mi?</b><button type="button" class="confirm-repeat" id="serialRepeatYes">Evet, Repete Aç</button><button type="button" id="serialRepeatNo">Hayır, Model Adını Düzelteceğim</button></div>'+serialRecentHtml(x.recent)+suggestions;
 }else{
   exp.classList.remove('hidden');
   box.className='serial-status new';
   const needConfirm=similar.length>0;fresh.value=needConfirm?'0':'1';
   box.innerHTML='<div class="serial-state-line"><span class="serial-badge new">YENİ MODEL</span><strong>'+esc(x.modelName||'')+'</strong></div><span class="serial-message">'+(needConfirm?'Benzer model bulundu. Yeni kayıt açmadan önce kontrol et.':'Bu adla daha önce kayıt yok; ilk üretim işi açılacak.')+'</span>'+suggestions+(needConfirm?'<div class="repeat-question"><button type="button" class="confirm-new" id="serialNewYes">Evet, Bu Yeni Model</button></div>':'');
 }
 box.querySelectorAll('[data-serial-model]').forEach(b=>b.onclick=()=>chooseSerialModel(b.dataset.serialModel));
 $('#serialRepeatYes')?.addEventListener('click',confirmSerialRepeat);
 $('#serialRepeatNo')?.addEventListener('click',rejectSerialRepeat);
 $('#serialNewYes')?.addEventListener('click',confirmSerialNew);
}
async function runSerialLookup(){
 const input=$('#serialModelName');if(!input)return null;const name=input.value.trim();
 if(!name){renderSerialLookup({state:'EMPTY'});return null}
 try{const x=await api('/api/production-lookup?model='+encodeURIComponent(name));renderSerialLookup(x);return x}catch(e){toast(e.message);return null}
}
function chooseSerialModel(name){const el=$('#serialModelName');if(!el)return;el.value=name;runSerialLookup().then(x=>{if(x?.state==='OPEN')$('#serialQty')?.focus();else $('#serialGround')?.focus()})}
window.chooseSerialModel=chooseSerialModel;
function confirmSerialRepeat(){const h=$('#serialRepeatConfirmed');if(h)h.value='1';const b=$('#serialModelStatus .serial-badge');if(b)b.textContent='REPETE ONAYLANDI';const q=$('#serialModelStatus .repeat-question');if(q)q.innerHTML='<b>Repete olarak yeni üretim partisi açılacak.</b>';$('#serialExpectedQty')?.focus()}
window.confirmSerialRepeat=confirmSerialRepeat;
function rejectSerialRepeat(){const el=$('#serialModelName');if(el){el.focus();el.select()}}
window.rejectSerialRepeat=rejectSerialRepeat;
function confirmSerialNew(){const h=$('#serialNewConfirmed');if(h)h.value='1';const q=$('#serialModelStatus .repeat-question');if(q)q.innerHTML='<b>Yeni model olarak onaylandı.</b>';$('#serialExpectedQty')?.focus()}
window.confirmSerialNew=confirmSerialNew;
function serialSetOperator(){
 const machine=(core.machines||[]).find(m=>String(m.machine_no)===$('#serialMachine')?.value),shift=$('#serialShift')?.value||'Gündüz',sel=$('#serialOperator');
 if(!sel||!machine)return;const name=shift==='Gece'?(machine.night_operator||''):(machine.day_operator||'');
 if(name&&!([...sel.options].some(o=>norm(o.value)===norm(name))))sel.insertAdjacentHTML('beforeend','<option value="'+esc(name)+'">'+esc(name)+'</option>');
 if(name)sel.value=name;
}
function openSerialProduction(){
 const p=serialSaved(),cid=n(p.companyId)||defaultCompanyId(),shift=p.shift||settings.values?.default_shift||'Gündüz';
 modal('Seri Üretim Girişi','Fişleri peş peşe gir. Modeli yazınca yeni / devam / repete durumu otomatik çıkar.',`
 <form class="form serial-form" id="serialProductionForm">
  <div class="serial-topline full"><span>⚡ SERİ GİRİŞ</span><small>Kaydet → sonraki fiş. Tarih / makine / vardiya ekranda kalır.</small></div>
  <label class="field serial-company-context">Firma<select name="companyId" id="serialCompany" tabindex="-1">${companyOptions(cid)}</select></label>
  <label class="field full serial-model-field">Model Adı<input name="modelName" id="serialModelName" list="serialModels" autocomplete="off" autofocus required placeholder="Model adını yaz..."><datalist id="serialModels">${(core.models||[]).map(m=>`<option value="${esc(m.name)}"></option>`).join('')}</datalist></label>
  <div class="field full serial-status neutral" id="serialModelStatus"><b>Model adını yaz.</b><span>Sistem daha önceki kaydı kontrol edecek.</span></div>
  <label class="field">Zemin Rengi<input name="ground" id="serialGround" required placeholder="Siyah / Ekru / Lacivert"></label>
  <label class="field hidden" id="serialExpectedWrap">Gelen Toplam Adet<input name="expectedQty" id="serialExpectedQty" type="number" min="1" placeholder="Bu işin toplam adedi"></label>
  <label class="field">Makine<select name="machineNo" id="serialMachine" required><option value="">Makine seç</option>${(core.machines||[]).map(m=>`<option value="${esc(m.machine_no)}" ${String(p.machineNo||'')===String(m.machine_no)?'selected':''}>No ${esc(m.machine_no)} — ${esc(m.machine_name||'')}</option>`).join('')}</select></label>
  <label class="field serial-main-qty">Üretim Adedi<input name="qty" id="serialQty" type="number" min="1" required placeholder="0"></label>
  <label class="field">Tarih<input name="date" id="serialDate" type="date" value="${esc(p.date||today())}" required></label>
  <label class="field">Vardiya<select name="shift" id="serialShift"><option ${shift==='Gündüz'?'selected':''}>Gündüz</option><option ${shift==='Gece'?'selected':''}>Gece</option></select></label>
  <label class="field">Makinacı<select name="operator" id="serialOperator" required>${operatorOptions(p.operator||'')}</select></label>
  <label class="field">Kumaş Sakatı<input name="fabricDefect" type="number" min="0" value="0"></label>
  <label class="field">Baskı Sakatı<input name="printDefect" type="number" min="0" value="0"></label>
  <input type="hidden" name="repeatConfirmed" id="serialRepeatConfirmed" value="0">
  <input type="hidden" name="newConfirmed" id="serialNewConfirmed" value="0">
  <div class="full serial-last-result" id="serialLastResult"></div>
  <div class="form-actions"><button type="button" onclick="closeModal()">Kapat</button><button type="submit" class="primary serial-save">Kaydet + Sonraki Fiş</button></div>
 </form>`);
 const f=$('#serialProductionForm'),model=$('#serialModelName'),machine=$('#serialMachine'),shiftEl=$('#serialShift');
 serialSetOperator();
 machine.onchange=serialSetOperator;shiftEl.onchange=serialSetOperator;
 model.oninput=()=>{clearTimeout(serialLookupTimer);serialLookupTimer=setTimeout(runSerialLookup,260)};
 model.onblur=()=>{if(model.value.trim())runSerialLookup()};
 model.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSerialLookup().then(x=>{if(x?.state==='OPEN')$('#serialQty')?.focus();else $('#serialGround')?.focus()})}};
 f.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();f.requestSubmit()}});
 f.onsubmit=async e=>{
   e.preventDefault();
   let x=serialLookupData;if(!x||norm(x.model?.name||x.modelName)!==norm(model.value))x=await runSerialLookup();if(!x)return;
   if(x.state==='REPEAT'&&$('#serialRepeatConfirmed').value!=='1')return toast('Önce repete onayı ver');
   if(x.state==='NEW'&&(x.similar||[]).length&&$('#serialNewConfirmed').value!=='1')return toast('Benzer modelleri kontrol edip yeni model onayı ver');
   const data=Object.fromEntries(new FormData(f));
   try{
     const result=await post('/api/serial-production',data),sum=result.summary||{};
     serialRemember({companyId:data.companyId,date:data.date,machineNo:data.machineNo,shift:data.shift,operator:data.operator});
     $('#serialLastResult').innerHTML='<div class="serial-success"><b>✓ '+esc(data.modelName)+' · '+fmt(data.qty)+' adet kaydedildi</b><span>Yeni toplam <strong>'+fmt(sum.produced_qty)+'</strong> / Gelen <strong>'+fmt(sum.incoming_qty)+'</strong> · Kalan <strong>'+fmt(sum.production_remaining)+'</strong> · Zemin <strong>'+esc(sum.ground||data.ground)+'</strong></span></div>';
     toast(result.isRepeat?'Repete açıldı ve üretim işlendi':'Üretim işlendi');
     await loadAll();
     model.value='';$('#serialGround').value='';$('#serialGround').readOnly=false;$('#serialExpectedQty').value='';$('#serialQty').value='';f.fabricDefect.value='0';f.printDefect.value='0';$('#serialRepeatConfirmed').value='0';$('#serialNewConfirmed').value='0';serialLookupData=null;renderSerialLookup({state:'EMPTY'});model.focus();
   }catch(err){toast(err.message==='REPETE_ONAY_GEREKLI'?'Repete onayı gerekli':err.message==='BENZER_MODEL_ONAY_GEREKLI'?'Benzer model onayı gerekli':err.message)}
 }
}
window.openSerialProduction=openSerialProduction;

function openDispatch(mid=''){
 if(!(core.rows||[]).length)return toast('Açık imalat yok');
 modal('İrsaliye Ekle','Bir modele birden fazla irsaliye eklenebilir; adetler toplanır.',`
 <form class="form" id="dispatchForm">
  <label class="field full">Model<select name="modelId" required><option value="">Model seç</option>${openOptions(mid)}</select></label>
  <label class="field">Tarih<input name="date" type="date" value="${today()}" required></label>
  <label class="field">İrsaliye No<input name="docNo"></label>
  <label class="field full">İrsaliye Adedi<input name="qty" type="number" min="1" required></label>
  <input type="hidden" name="type" value="dispatch">
  <div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">İrsaliyeyi Ekle</button></div>
 </form>`);
 if(mid)$('#dispatchForm').modelId.value=mid;setTimeout(()=>{const el=mid?$('#dispatchForm [name="qty"]'):$('#dispatchForm [name="modelId"]');if(el){el.focus();if(el.select)el.select()}},60);
 $('#dispatchForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/financial',Object.fromEntries(new FormData(e.target)));closeModal();toast('İrsaliye işlendi');await loadAll();if(mid)openModel(mid)}catch(err){toast(err.message)}}
}
window.openDispatch=openDispatch;

function openInvoice(mid='',companyId=''){
 if(!(core.rows||[]).length)return toast('Açık imalat yok');const cid=n(companyId)||defaultCompanyId();
 modal('Fatura Girişi','Fatura adedi modele, tutarı seçilen firmanın carisine işlenir.',`
 <form class="form" id="invoiceForm">
  <label class="field">Firma<select name="companyId" id="iCompany" required><option value="">Firma seç</option>${companyOptions(cid)}</select></label>
  <label class="field full">Model<select name="modelId" id="iModel" required><option value="">Model seç</option>${openOptions(mid,cid)}</select></label>
  <label class="field">Tarih<input name="date" type="date" value="${today()}" required></label>
  <label class="field">Fatura Kodu / No<input name="docNo" required></label>
  <label class="field">Fatura Adedi<input name="qty" type="number" min="1" required></label>
  <label class="field">Fatura Tutarı (TL)<input name="amount" type="number" min="0" step="0.01" required></label>
  <label class="field full">Not<input name="note"></label>
  <input type="hidden" name="type" value="invoice">
  <div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Faturayı İşle</button></div>
 </form>`);
 $('#iCompany').onchange=()=>{$('#iModel').innerHTML='<option value="">Model seç</option>'+openOptions('',n($('#iCompany').value))};if(mid)$('#iModel').value=mid;setTimeout(()=>{const el=mid?$('#invoiceForm [name="docNo"]'):$('#iModel');if(el){el.focus();if(el.select)el.select()}},60);
 $('#invoiceForm').onsubmit=async e=>{e.preventDefault();try{const x=Object.fromEntries(new FormData(e.target));selectedCompanyId=n(x.companyId);await post('/api/financial',x);closeModal();toast('Fatura ve cari işlendi');await loadAll();if(mid)openModel(mid)}catch(err){toast(err.message)}}
}
window.openInvoice=openInvoice;

async function openModel(id){
 currentModel=id;currentDetail=await api('/api/model-detail?modelId='+id+'&week='+encodeURIComponent(weekCursor));const o=currentDetail.open||calcDoneFromDetail(currentDetail),active=!!currentDetail.open;
 const action=active?(o?.action||'AÇIK İŞ'):'TAMAMLANDI',statusClass=active?(o?.color||'blue'):'green',weekEvents=currentDetail.weekEvents||[];
 $('#dCompany').textContent=(currentDetail.model.company_name||'FİRMA')+(o?.ground?' · Zemin '+o.ground:'');$('#dTitle').textContent=currentDetail.model.name;
 $('#drawerBody').innerHTML=`<div class="drawer-content model-workspace">
   <div class="model-status-strip"><div><span class="status ${statusClass}">${esc(action)}</span><b>${active?'İmalat havuzunda açık iş':'Tamamlanan model'}</b><small>${o?.first_date?dateTR(o.first_date)+' → '+dateTR(o.last_date):''}</small></div><div class="model-batch-chip">${esc(o?.batch_no||currentDetail.batches?.[0]?.batch_no||'')}</div></div>
   <div class="week-detail-strip"><div><small>SEÇİLİ HAFTA</small><b>${weekLabelText(weekCursor)}</b></div><div><span>ÜRETİM</span><b>${fmt(o?.week_produced)}</b></div><div><span>FİŞ</span><b>${fmt(o?.week_entries)}</b></div><div><span>SAKAT</span><b>${fmt(n(o?.week_fabric_defect)+n(o?.week_print_defect))}</b></div></div>
   <div class="drawer-stats"><div class="drawer-stat"><span>GELEN</span><b>${fmt(o?.incoming_qty)}</b></div><div class="drawer-stat"><span>TOPLAM ÜRETİM</span><b>${fmt(o?.produced_qty)}</b></div><div class="drawer-stat"><span>İRSALİYE</span><b>${fmt(o?.dispatch_qty)}</b></div><div class="drawer-stat"><span>FATURA</span><b>${fmt(o?.invoice_qty)}</b></div><div class="drawer-stat"><span>FATURA KALAN</span><b>${fmt(o?.invoice_remaining)}</b></div><div class="drawer-stat"><span>TOPLAM SAKAT</span><b>${fmt(n(o?.fabric_defect)+n(o?.print_defect))}</b></div></div>
   <div class="model-work-grid">
    <div class="model-history">
      <div class="section-title"><b>${weekLabelText(weekCursor)} Hareketleri</b><span>${weekEvents.length} kayıt</span></div>
      ${weekEvents.length?weekEvents.map(eventHtml).join(''):'<div class="empty compact-empty">Bu haftada bu modele ait hareket yok.</div>'}
      <details class="all-history"><summary>Tüm işlem geçmişini göster <span>${(currentDetail.events||[]).length} kayıt</span></summary><div class="all-history-body">${(currentDetail.events||[]).length?currentDetail.events.map(eventHtml).join(''):'<div class="empty">İşlem yok.</div>'}</div></details>
    </div>
    <aside class="model-action-card"><h3>Havuz İşlemleri</h3><p>Bütün işlemler bu model kartından yürür. Fatura dengesi tamamlanınca model otomatik Tamamlananlar'a gider.</p>
      ${active?`<button class="work-action primary" onclick="openProduction(${id})"><b>+ Yeni İmalat Kaydı</b><span>Makine fişini tarihine göre haftaya işle</span></button><button class="work-action" onclick="openJobAdjust()"><b>Gelen Adedi Düzenle</b><span>Toplam adet / zemin / sipariş bilgisi</span></button><button class="work-action" onclick="openDispatch(${id})"><b>+ İrsaliye</b><span>Birden fazla irsaliye eklenebilir</span></button><button class="work-action" onclick="openInvoice(${id},${n(currentDetail.model.company_id)})"><b>+ Fatura</b><span>Adet ve tutarı cariye işle</span></button>`:''}
      <button class="work-action" onclick="openModelCari()"><b>Cariyi Aç</b><span>${esc(currentDetail.model.company_name||'Firma')}</span></button>
      <button class="work-action note" onclick="openModelNote()"><b>+ İç Not</b><span>Patron / muhasebe notu bırak</span></button>
    </aside>
   </div>
 </div>`;
 applySavedWindowSize($('#drawer'),'hakanEmpDetailSize');$('#drawer').classList.add('show');$('#backdrop').classList.add('show')
}
window.openModel=openModel;
function openModelCari(){if(!currentDetail)return;selectedCompanyId=n(currentDetail.model.company_id);closeDrawer();navigate('cari')} window.openModelCari=openModelCari;
function openModelNote(){if(!currentDetail)return;openNote({title:currentDetail.model.name+' — İmalat Notu',body:'',category:'İmalat',target:'Patron'})} window.openModelNote=openModelNote;
function openJobAdjust(){
 if(!currentDetail?.open)return toast('Yalnız açık havuzdaki iş düzenlenebilir');
 const o=currentDetail.open;
 modal('Gelen Adedi Düzenle','Havuzdaki modelin toplam gelen adedini ve temel bilgisini düzelt.',`<form class="form" id="jobAdjustForm"><input type="hidden" name="batchId" value="${o.batch_id||o.id}"><input type="hidden" name="week" value="${esc(weekCursor)}"><label class="field full">Model<input value="${esc(currentDetail.model.name)}" disabled></label><label class="field">Gelen Toplam Adet<input name="expectedQty" type="number" min="1" value="${n(o.incoming_qty)}" required autofocus></label><label class="field">Zemin<input name="ground" value="${esc(o.ground||'')}" required></label><label class="field full">Sipariş No<input name="orderNo" value="${esc(o.order_no||'')}"></label><div class="adjust-warning">Yeni toplam; mevcut üretim, irsaliye veya fatura adedinden küçük olamaz.</div><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Güncelle</button></div></form>`);
 $('#jobAdjustForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/job-adjust',Object.fromEntries(new FormData(e.target)));closeModal();toast('Havuz adedi güncellendi');await loadProductionPeriod();await openModel(currentModel)}catch(err){toast(err.message)}}
}
window.openJobAdjust=openJobAdjust;
function calcDoneFromDetail(d){const b=d.batches?.[0];if(!b)return{};const ev=d.events||[],we=d.weekEvents||[],prod=ev.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.qty),0),fd=ev.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.fabric_defect),0),pd=ev.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.print_defect),0),wprod=we.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.qty),0),wfd=we.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.fabric_defect),0),wpd=we.filter(x=>x.kind==='production'&&x.batch_id===b.id).reduce((a,x)=>a+n(x.print_defect),0),went=we.filter(x=>x.kind==='production'&&x.batch_id===b.id).length;return{batch_id:b.id,batch_no:b.batch_no,first_date:b.first_date,last_date:b.last_date,order_no:b.order_no,incoming_qty:b.expected_qty,produced_qty:prod,dispatch_qty:b.dispatch_qty,invoice_qty:b.invoice_qty,invoice_remaining:Math.max(0,n(b.dispatch_qty)-n(b.invoice_qty)),fabric_defect:fd,print_defect:pd,ground:b.ground,week_produced:wprod,week_entries:went,week_fabric_defect:wfd,week_print_defect:wpd}}
function eventHtml(e){const lab=e.kind==='production'?'Üretim':e.kind==='dispatch'?'İrsaliye':'Fatura',ico=e.kind==='production'?'Ü':e.kind==='dispatch'?'İ':'F';let sub=e.kind==='production'?['Makine '+(e.machine_no||'-'),e.shift,e.operator,(n(e.fabric_defect)+n(e.print_defect))?'Sakat '+fmt(n(e.fabric_defect)+n(e.print_defect)):''].filter(Boolean).join(' • '):[e.doc_no,e.amount?money(e.amount):''].filter(Boolean).join(' • ');return`<div class="timeline-item"><div class="timeline-date">${dateTR(e.date)}</div><div class="timeline-icon ${e.kind}">${ico}</div><div class="timeline-main"><b>${lab}</b><small>${esc(sub)}</small></div><div class="timeline-value">${fmt(e.qty)}</div></div>`}
function closeDrawer(){$('#drawer').classList.remove('show');$('#backdrop').classList.remove('show')}
window.closeDrawer=closeDrawer;
function applySavedWindowSize(el,key){if(!el)return;try{const s=JSON.parse(localStorage.getItem(key)||'{}');if(s.w)el.style.width=s.w+'px';if(s.h)el.style.height=s.h+'px'}catch{}}
document.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('.resize-handle');if(!handle)return;
 const target=handle.hasAttribute('data-resize-card')?handle.closest('.modal-card'):$('#drawer');if(!target)return;
 e.preventDefault();e.stopPropagation();
 const rect=target.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,sw=rect.width,sh=rect.height;
 const isQuick=target.classList.contains('modal-card'),key=isQuick?'hakanEmpQuickSize':'hakanEmpDetailSize';
 const minW=isQuick?480:560,minH=isQuick?360:420;
 const move=ev=>{const w=Math.max(minW,Math.min(window.innerWidth-32,sw+(sx-ev.clientX))),h=Math.max(minH,Math.min(window.innerHeight-32,sh+(ev.clientY-sy)));target.style.width=w+'px';target.style.height=h+'px'};
 const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);const r=target.getBoundingClientRect();localStorage.setItem(key,JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}))};
 document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});
});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#modal .modal-instance'))closeModal();else if($('#drawer').classList.contains('show'))closeDrawer()});

function selectedCompany(){return(cari.rows||[]).find(c=>n(c.id)===n(selectedCompanyId))||null}
function renderCari(){
 const rows=cari.rows||[],mov=cari.movements||[];
 $('#cTotalBalance').textContent=money(rows.reduce((a,c)=>a+n(c.balance),0));$('#cTotalInvoices').textContent=money(rows.reduce((a,c)=>a+n(c.invoice_total),0));$('#cTotalPayments').textContent=money(rows.reduce((a,c)=>a+n(c.payment_total),0));$('#cCompanyCount').textContent=fmt(rows.length);
 if(!selectedCompanyId&&rows[0])selectedCompanyId=n(rows[0].id);if(selectedCompanyId&&!rows.some(c=>n(c.id)===n(selectedCompanyId)))selectedCompanyId=n(rows[0]?.id);
 const q=norm($('#companySearch').value),list=rows.filter(c=>!q||norm(c.name).includes(q));
 $('#companyList').innerHTML=list.length?list.map(c=>`<button class="company-item ${n(c.id)===n(selectedCompanyId)?'active':''}" onclick="selectCompany(${c.id})"><div><b>${esc(c.name)}</b><small>${c.movement_count||0} hareket · Fatura ${money(c.invoice_total)}</small></div><strong class="${n(c.balance)>0?'positive':'zero'}">${money(c.balance)}</strong></button>`).join(''):'<div class="empty">Firma bulunamadı.</div>';
 const c=selectedCompany();if(!c){$('#companyEmpty').classList.remove('hidden');$('#companyDetail').classList.add('hidden');return}
 $('#companyEmpty').classList.add('hidden');$('#companyDetail').classList.remove('hidden');$('#cdName').textContent=c.name;$('#cdNote').textContent=c.note||'Firma cari kartı';$('#cdBalance').textContent=money(c.balance);$('#cdInvoice').textContent=money(c.invoice_total);$('#cdPayment').textContent=money(c.payment_total);$('#cdMovementCount').textContent=fmt(c.movement_count||0);
 const cm=mov.filter(m=>n(m.company_id)===n(c.id));
 $('#companyMovementRows').innerHTML=cm.length?cm.map(m=>{const inv=norm(m.type)==='INVOICE';return`<div class="data-row company-movement-grid"><div>${dateTR(m.date)}</div><div><span class="status ${inv?'blue':'green'}">${inv?'FATURA':'ÖDEME'}</span></div><div class="cell-main"><b>${esc(m.model_name||m.doc_no||'-')}</b><small>${esc(m.doc_no||'')}</small></div><div>${esc(m.note||'')}</div><div class="num ${inv?'amount-plus':'amount-minus'}">${inv?'+':'-'}${money(Math.abs(n(m.amount)))}</div></div>`}).join(''):'<div class="empty">Bu firmada henüz hareket yok.</div>';
 renderSettingsCompanies();
}
function selectCompany(id){selectedCompanyId=n(id);renderCari()} window.selectCompany=selectCompany;
$('#companySearch').oninput=renderCari;

function openPayment(companyId=''){
 const cid=n(companyId)||n(selectedCompanyId)||defaultCompanyId();
 modal('Ödeme Al','Seçilen firmanın cari bakiyesinden düşer.',`<form class="form" id="paymentForm"><label class="field full">Firma<select name="companyId" required><option value="">Firma seç</option>${companyOptions(cid)}</select></label><label class="field">Tarih<input name="date" type="date" value="${today()}" required></label><label class="field">Tutar (TL)<input name="amount" type="number" min="0.01" step="0.01" required></label><label class="field">Referans / Dekont<input name="docNo"></label><label class="field full">Not<input name="note"></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Ödemeyi Kaydet</button></div></form>`);
 $('#paymentForm').onsubmit=async e=>{e.preventDefault();try{const x=Object.fromEntries(new FormData(e.target));selectedCompanyId=n(x.companyId);await post('/api/payment',x);closeModal();toast('Ödeme işlendi');await loadAll();navigate('cari')}catch(err){toast(err.message)}}
}
window.openPayment=openPayment;
function openPaymentForSelected(){const c=selectedCompany();if(!c)return toast('Önce firma seç');openPayment(c.id)} window.openPaymentForSelected=openPaymentForSelected;
function openInvoiceForSelected(){const c=selectedCompany();if(!c)return toast('Önce firma seç');openInvoice('',c.id)} window.openInvoiceForSelected=openInvoiceForSelected;

function openCompany(id=''){
 const source=allCompanies.rows?.length?allCompanies.rows:(cari.rows||[]),c=id?source.find(x=>n(x.id)===n(id)):null;
 modal(c?'Firma Düzenle':'Yeni Firma','Cari ve imalat işlemlerinde kullanılacak firma kartı.',`<form class="form" id="companyForm"><input type="hidden" name="id" value="${c?.id||''}"><label class="field full">Firma Adı<input name="name" value="${esc(c?.name||'')}" autofocus required></label><label class="field">Açılış Bakiyesi<input name="openingBalance" type="number" step="0.01" value="${n(c?.opening_balance)}"></label><label class="field">Durum<select name="active"><option value="1" ${c?.active===0?'':'selected'}>Aktif</option><option value="0" ${c?.active===0?'selected':''}>Pasif</option></select></label><label class="field full">Not<textarea name="note" placeholder="Firma ile ilgili kısa not">${esc(c?.note||'')}</textarea></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Kaydet</button></div></form>`);
 $('#companyForm').onsubmit=async e=>{e.preventDefault();try{const x=Object.fromEntries(new FormData(e.target));const r=await post('/api/company',x);selectedCompanyId=x.active==='0'?0:(n(x.id)||n(r.id));closeModal();toast('Firma kaydedildi');await loadAll();navigate('cari')}catch(err){toast(err.message)}}
}
window.openCompany=openCompany;
function openCompanyEditSelected(){const c=selectedCompany();if(c)openCompany(c.id)} window.openCompanyEditSelected=openCompanyEditSelected;

function filteredNotes(){let a=[...(notes.rows||[])];if(noteView==='ACTIVE')a=a.filter(x=>x.active!==0&&norm(x.status)==='AKTİF');if(noteView==='PINNED')a=a.filter(x=>x.active!==0&&n(x.pinned));if(noteView==='DONE')a=a.filter(x=>norm(x.status)==='TAMAMLANDI');const q=norm($('#noteSearch')?.value);if(q)a=a.filter(x=>norm([x.title,x.body,x.author,x.target,x.category].join(' ')).includes(q));return a}
function renderNotes(){const all=notes.rows||[];$('#nActive').textContent=fmt(all.filter(x=>x.active!==0&&norm(x.status)==='AKTİF').length);$('#nPinned').textContent=fmt(all.filter(x=>x.active!==0&&n(x.pinned)).length);$('#nDone').textContent=fmt(all.filter(x=>norm(x.status)==='TAMAMLANDI').length);$('#nPassive').textContent=fmt(all.filter(x=>x.active===0).length);const a=filteredNotes();$('#noteRows').innerHTML=a.length?a.map(noteCard).join(''):'<div class="empty note-empty">Bu görünümde not yok.</div>'}
function noteCard(x){const pr=norm(x.priority),tone=pr==='ACİL'?'urgent':pr==='ÖNEMLİ'?'important':'normal',done=norm(x.status)==='TAMAMLANDI';return`<article class="paper-note ${tone} ${done?'done':''} ${x.active===0?'passive':''}"><div class="paper-note-top"><span class="note-category">${esc(x.category||'Genel')}</span><div>${n(x.pinned)?'<span class="pin">📌</span>':''}<span class="note-priority">${esc(x.priority||'NORMAL')}</span></div></div><h3>${esc(x.title||'Not')}</h3><p>${esc(x.body||'')}</p><div class="note-route"><b>${esc(x.author||'Muhasebe')}</b><span>→</span><b>${esc(x.target||'Patron')}</b></div><div class="note-foot"><small>${new Date(x.updated_at||x.created_at).toLocaleString('tr-TR')}</small><div><button class="mini" onclick="openNote('${x.uid}')">Düzenle</button>${!done&&x.active!==0?`<button class="mini ok" onclick="setNoteStatus('${x.uid}','TAMAMLANDI',1)">Tamamlandı</button>`:''}${x.active!==0?`<button class="mini" onclick="setNoteStatus('${x.uid}','${esc(x.status||'AKTİF')}',0)">Pasif</button>`:`<button class="mini" onclick="setNoteStatus('${x.uid}','AKTİF',1)">Aktif Et</button>`}</div></div></article>`}
function openNote(arg=''){let x=null;if(typeof arg==='string'&&arg)x=(notes.rows||[]).find(n=>n.uid===arg);else if(arg&&typeof arg==='object')x=arg;modal(x?.uid?'Notu Düzenle':'Yeni Not','Patron ile muhasebe arasındaki kısa görev/not panosu.',`<form class="form" id="noteForm"><input type="hidden" name="uid" value="${esc(x?.uid||'')}"><label class="field full">Başlık<input name="title" value="${esc(x?.title||'')}" autofocus placeholder="Örn: Tan Baskı çek makbuzu"></label><label class="field">Yazan<select name="author"><option ${x?.author==='Patron'?'selected':''}>Patron</option><option ${x?.author==='Patron'?'':'selected'}>Muhasebe</option></select></label><label class="field">Kime<select name="target"><option ${x?.target==='Muhasebe'?'':'selected'}>Patron</option><option ${x?.target==='Muhasebe'?'selected':''}>Muhasebe</option></select></label><label class="field">Kategori<select name="category">${['Genel','Muhasebe','İmalat','Çek','Ödeme','Acil'].map(v=>`<option ${x?.category===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">Öncelik<select name="priority"><option ${x?.priority==='NORMAL'||!x?.priority?'selected':''}>NORMAL</option><option ${x?.priority==='ÖNEMLİ'?'selected':''}>ÖNEMLİ</option><option ${x?.priority==='ACİL'?'selected':''}>ACİL</option></select></label><label class="field">Sabitle<select name="pinned"><option value="0" ${n(x?.pinned)?'':'selected'}>Hayır</option><option value="1" ${n(x?.pinned)?'selected':''}>Evet</option></select></label><label class="field full">Not<textarea name="body" rows="6" required placeholder="Kısa ve net not yaz...">${esc(x?.body||'')}</textarea></label><input type="hidden" name="status" value="${esc(x?.status||'AKTİF')}"><input type="hidden" name="active" value="${x?.active===0?'0':'1'}"><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Notu Kaydet</button></div></form>`);$('#noteForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/note',Object.fromEntries(new FormData(e.target)));closeModal();toast('Not kaydedildi');await loadAll();navigate('notes')}catch(err){toast(err.message)}}}
window.openNote=openNote;
async function setNoteStatus(uid,status,active){await post('/api/note-status',{uid,status,active});toast(active?'Not güncellendi':'Not pasife alındı');await loadAll()} window.setNoteStatus=setNoteStatus;
$$('[data-note-view]').forEach(b=>b.onclick=()=>{$$('[data-note-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');noteView=b.dataset.noteView;renderNotes()});
$('#noteSearch').oninput=renderNotes;
function openReminder(){
 modal('Ödeme Hatırlat','Cari firmayı seç veya serbest kişi/iş gir.',`<form class="form" id="remForm"><label class="field full">Cari / Kişi<select id="remPartySelect"><option value="">Seç</option>${(cari.rows||[]).map(c=>`<option value="${esc(c.name)}">${esc(c.name)} · Bakiye ${money(c.balance)}</option>`).join('')}<option value="__OTHER__">Diğer / Serbest</option></select></label><label class="field full hidden" id="remPartyCustomWrap">Serbest İsim<input id="remPartyCustom" placeholder="Özgür Bantçı"></label><input type="hidden" name="party" id="remParty"><label class="field">Ödeme Tarihi<input name="dueDate" type="date" value="${today()}" required></label><label class="field">Tutar<input name="amount" type="number" min="0" step="0.01"></label><label class="field full">Açıklama / Not<textarea name="note" placeholder="Ne için ödeme yapılacak?"></textarea></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Hatırlatmayı Ekle</button></div></form>`);
 const sel=$('#remPartySelect'),wrap=$('#remPartyCustomWrap'),custom=$('#remPartyCustom'),party=$('#remParty');sel.onchange=()=>{wrap.classList.toggle('hidden',sel.value!=='__OTHER__');party.value=sel.value==='__OTHER__'?custom.value:sel.value;if(sel.value==='__OTHER__')custom.focus()};custom.oninput=()=>{party.value=custom.value};
 $('#remForm').onsubmit=async e=>{e.preventDefault();party.value=sel.value==='__OTHER__'?custom.value:sel.value;if(!party.value.trim())return toast('Cari / kişi seç');try{await post('/api/reminder',Object.fromEntries(new FormData(e.target)));closeModal();toast('Ödeme hatırlatma eklendi');await loadAll();navigate('reminders')}catch(err){toast(err.message)}}
}
window.openReminder=openReminder;

function renderReminders(){
 const all=reminders.rows||[],pending=all.filter(r=>r.status==='PENDING'),paid=all.filter(r=>r.status==='PAID');
 $('#rPending').textContent=fmt(pending.length);$('#rWeek').textContent=fmt(pending.filter(r=>n(r.days_remaining)>=0&&n(r.days_remaining)<=7).length);$('#rOverdue').textContent=fmt(pending.filter(r=>n(r.days_remaining)<0).length);$('#rPaid').textContent=fmt(paid.length);
 let a=[...all];if(remView==='PENDING')a=a.filter(r=>r.status==='PENDING');if(remView==='OVERDUE')a=a.filter(r=>r.status==='PENDING'&&n(r.days_remaining)<0);if(remView==='PAID')a=a.filter(r=>r.status==='PAID');const q=norm($('#remSearch').value);if(q)a=a.filter(r=>norm((r.party||'')+' '+(r.payee||'')+' '+(r.note||'')+' '+(r.description||'')).includes(q));
 $('#reminderRows').innerHTML=a.length?a.map(r=>{const p=r.status==='PENDING',d=n(r.days_remaining),cl=!p?'green':d<0?'red':d<=3?'orange':'blue',label=!p?'ÖDENDİ':d<0?Math.abs(d)+' GÜN GEÇTİ':d===0?'BUGÜN':d+' GÜN';return`<div class="data-row reminder-grid"><div><b>${dateTR(r.due_date)}</b></div><div class="cell-main"><b>${esc(r.party||r.payee||'-')}</b><small>${p?'Ödeme bekliyor':'Ödendi '+dateTR((r.paid_at||'').slice(0,10))}</small></div><div>${esc(r.note||r.description||'')}</div><div class="num">${n(r.amount)?money(r.amount):'—'}</div><div><span class="status ${cl}">${label}</span></div><div class="row-actions">${p?`<button class="mini" onclick="payReminder(${r.id})">Ödendi</button>`:''}</div></div>`}).join(''):'<div class="empty">Bu görünümde ödeme hatırlatma yok.</div>';
}
$$('[data-rem-view]').forEach(b=>b.onclick=()=>{$$('[data-rem-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');remView=b.dataset.remView;renderReminders()});
$('#remSearch').oninput=renderReminders;
async function payReminder(id){if(!confirm('Bu ödeme yapıldı olarak işaretlensin mi?'))return;await post('/api/reminder-paid',{id});toast('Ödendi olarak işaretlendi');await loadAll()}
window.payReminder=payReminder;

function checkClosed(c){const s=norm(c.status);return s.includes('ÖDEND')||s.includes('TAHSİL')||s.includes('İPTAL')||s.includes('İADE')}
function checkPaid(c){const s=norm(c.status);return s.includes('ÖDEND')||s.includes('TAHSİL')}
function dueText(c){const d=n(c.days_remaining);if(c.days_remaining===99999)return'Vade yok';if(d<0)return Math.abs(d)+' gün geçti';if(d===0)return'Bugün';return d+' gün'}
function dueClass(c){const d=n(c.days_remaining);return d<0?'over':d<=7?'urgent':d<=30?'soon':''}
function monthKey(s){return/^\d{4}-\d{2}/.test(String(s||''))?String(s).slice(0,7):'NONE'}
function monthLabel(k){if(k==='NONE')return'TARİHSİZ';const[y,m]=k.split('-').map(Number);return new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).toLocaleUpperCase('tr-TR')}
function filteredChecks(){let a=[...(checks.rows||[])],ym=today().slice(0,7),h=n(settings.values?.check_horizon_days)||90;if(checkView==='PAYABLE')a=a.filter(c=>c.direction==='OUT'&&!checkClosed(c));if(checkView==='MONTH')a=a.filter(c=>c.direction==='OUT'&&!checkClosed(c)&&monthKey(c.due_date)===ym);if(checkView==='THREE')a=a.filter(c=>c.direction==='OUT'&&!checkClosed(c)&&n(c.days_remaining)>=0&&n(c.days_remaining)<=h);if(checkView==='PAID')a=a.filter(c=>c.direction==='OUT'&&checkPaid(c));if(checkView==='IN')a=a.filter(c=>c.direction==='IN');if(checkView==='OUT')a=a.filter(c=>c.direction==='OUT');const q=norm($('#checkSearch').value);if(q)a=a.filter(c=>norm((c.counterparty||'')+' '+(c.bank||'')+' '+(c.serial_no||'')+' '+(c.drawer||'')+' '+(c.against_text||'')+' '+(c.note||'')+' '+(c.receipt_by||'')).includes(q));return a}
function renderChecks(){
 const all=checks.rows||[],out=all.filter(c=>c.direction==='OUT'&&!checkClosed(c)),ym=today().slice(0,7),h=n(settings.values?.check_horizon_days)||90;
 $('#ch90').previousElementSibling.textContent=h+' GÜN';$('#chPayable').textContent=money(out.reduce((a,c)=>a+n(c.amount),0));$('#chMonth').textContent=money(out.filter(c=>monthKey(c.due_date)===ym).reduce((a,c)=>a+n(c.amount),0));$('#ch90').textContent=money(out.filter(c=>n(c.days_remaining)>=0&&n(c.days_remaining)<=h).reduce((a,c)=>a+n(c.amount),0));$('#chIncoming').textContent=money(all.filter(c=>c.direction==='IN'&&!checkClosed(c)).reduce((a,c)=>a+n(c.amount),0));$('#chPaid').textContent=money(all.filter(c=>c.direction==='OUT'&&checkPaid(c)).reduce((a,c)=>a+n(c.amount),0));
 const rows=filteredChecks(),months=[...new Set(rows.map(c=>monthKey(c.due_date)))];
 $('#checkRows').innerHTML=months.length?months.map((k,i)=>{const r=rows.filter(c=>monthKey(c.due_date)===k),total=r.reduce((z,c)=>z+n(c.amount),0),open=r.filter(c=>!checkClosed(c)).reduce((z,c)=>z+n(c.amount),0),paid=r.filter(checkPaid).reduce((z,c)=>z+n(c.amount),0),incoming=r.filter(c=>c.direction==='IN').reduce((z,c)=>z+n(c.amount),0);return`<section class="month-group month${i%6}"><div class="month-head month-head-pro"><div class="month-title"><h3>${monthLabel(k)}</h3><small>${r.length} çek</small></div><div class="month-metrics"><span>AY TOPLAMI<b>${money(total)}</b></span><span>AÇIK<b>${money(open)}</b></span><span>ÖDENEN<b>${money(paid)}</b></span><span>GELEN<b>${money(incoming)}</b></span></div></div><div class="check-column-head"><span>VADE</span><span>YÖN</span><span>FİRMA / KİŞİ</span><span>BANKA / NO</span><span>AÇIKLAMA</span><span>TUTAR</span><span>MAKBUZ</span><span>DURUM</span><span></span></div>${r.map(checkRow).join('')}</section>`}).join(''):'<div class="empty">Bu görünümde çek yok.</div>'
}
function checkRow(c){const closed=checkClosed(c),status=checkPaid(c)?['green',c.status]:norm(c.status).includes('İPTAL')?['gray','İPTAL']:n(c.days_remaining)<0?['red','GECİKTİ']:c.direction==='IN'?['blue',c.status||'PORTFÖY']:['orange',c.status||'ÖDENECEK'],dir=c.direction==='IN'?'GELEN':'VERİLEN',partyPrefix=c.direction==='IN'?'Kimden':'Kime',desc=c.against_text||c.note||'—';return`<div class="check-row"><div class="check-date"><b>${dateTR(c.due_date)}</b><small class="due ${dueClass(c)}">${dueText(c)}</small></div><div><span class="direction ${c.direction==='IN'?'in':'out'}">${dir}</span></div><div class="check-party"><b>${esc(c.counterparty||'-')}</b><small>${partyPrefix}${c.drawer?' · '+esc(c.drawer):''}</small></div><div class="check-bank"><b>${esc(c.bank||'-')}</b><small>${esc(c.serial_no||'-')}</small></div><div class="check-desc"><b>${esc(desc)}</b><small>${esc(c.note&&c.note!==desc?c.note:'')}</small></div><div class="num">${money(c.amount)}</div><div class="${c.receipt_received?'receipt-ok':'receipt-no'}">${c.receipt_received?'✓ Makbuz alındı':'Makbuz yok'}<span class="receipt-sub">${c.receipt_by?esc(c.receipt_by):''}</span></div><div><span class="status ${status[0]}">${esc(status[1])}</span></div><div class="row-actions"><button class="mini" onclick="checkDetail(${c.id})">Aç</button>${!closed?`<button class="mini" onclick="setCheck(${c.id},'${c.direction==='IN'?'TAHSİL':'ÖDENDİ'}')">${c.direction==='IN'?'Tahsil':'Ödendi'}</button>`:''}</div></div>`}
$$('[data-check-view]').forEach(b=>b.onclick=()=>{$$('[data-check-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');checkView=b.dataset.checkView;renderChecks()});
$('#checkSearch').oninput=renderChecks;

function openCheck(){
 modal('Çek Ekle','Hızlı çek kaydı.',`<form class="form" id="checkForm"><label class="field">Yön<select name="direction"><option value="OUT">Verilen Çek</option><option value="IN">Gelen Çek</option></select></label><label class="field">Vade<input name="dueDate" type="date" required></label><label class="field">Banka<input name="bank"></label><label class="field">Çek No<input name="serialNo"></label><label class="field full">Firma / Kişi<input name="counterparty" required></label><label class="field">Keşideci<input name="drawer"></label><label class="field">Tutar<input name="amount" type="number" min="0" step="0.01" required></label><label class="field full">Karşılığı / Açıklama<input name="againstText"></label><label class="field full">Not<input name="note"></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Çeki Kaydet</button></div></form>`);
 $('#checkForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/check',Object.fromEntries(new FormData(e.target)));closeModal();toast('Çek kaydedildi');await loadAll()}catch(err){toast(err.message)}}
}
window.openCheck=openCheck;

function checkDetail(id){
 const c=(checks.rows||[]).find(x=>n(x.id)===n(id));if(!c)return;
 modal('Çek Detayı',`${c.direction==='IN'?'Gelen':'Verilen'} çek · ${dateTR(c.due_date)}`,`<form class="form" id="receiptForm"><div class="full">${c.image_path?`<img class="check-image" src="/api/check-image?id=${c.id}&t=${Date.now()}">`:'<div class="check-placeholder">Çek görseli eklenmemiş</div>'}<label class="field">Çek Görseli<input type="file" id="checkImage" accept="image/*"></label></div><label class="field full">Firma / Kişi<input value="${esc(c.counterparty||'')}" disabled></label><label class="field">Makbuz Alındı<select name="receiptReceived"><option value="0" ${!c.receipt_received?'selected':''}>Hayır</option><option value="1" ${c.receipt_received?'selected':''}>Evet</option></select></label><label class="field">Kim aldı?<input name="receiptBy" value="${esc(c.receipt_by||'')}" placeholder="Akis"></label><label class="field full">Çekin Karşılığı<input name="againstText" value="${esc(c.against_text||'')}"></label><label class="field full">Makbuz / Not<input name="receiptNote" value="${esc(c.receipt_note||c.note||'')}"></label><div class="form-actions"><button type="button" onclick="closeModal()">Kapat</button><button class="primary">Bilgileri Kaydet</button></div></form>`);
 $('#receiptForm').onsubmit=async e=>{e.preventDefault();try{const x=Object.fromEntries(new FormData(e.target));x.id=id;await post('/api/check-receipt',x);const f=$('#checkImage').files[0];if(f){const data=await fileData(f);await post('/api/check-image',{id,data})}closeModal();toast('Çek bilgileri güncellendi');await loadAll()}catch(err){toast(err.message)}}
}
window.checkDetail=checkDetail;
const fileData=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
async function setCheck(id,status){if(!confirm(status+' olarak işaretlensin mi?'))return;await post('/api/check-status',{id,status});toast('Çek güncellendi');await loadAll()}
window.setCheck=setCheck;
function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function exportChecksCsv(){const a=filteredChecks(),rows=[['Ay','Vade','Yön','Firma/Kişi','Banka','Çek No','Açıklama','Tutar','Makbuz','Alan','Durum']];for(const c of a)rows.push([monthLabel(monthKey(c.due_date)),dateTR(c.due_date),c.direction==='IN'?'Gelen':'Verilen',c.counterparty||'',c.bank||'',c.serial_no||'',c.against_text||c.note||'',n(c.amount),c.receipt_received?'Alındı':'Yok',c.receipt_by||'',c.status||'']);const csv='\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),ael=document.createElement('a');ael.href=url;ael.download='HAKAN_EMP_CEK_'+today()+'.csv';ael.click();setTimeout(()=>URL.revokeObjectURL(url),1000)} window.exportChecksCsv=exportChecksCsv;
function printChecks(){const a=filteredChecks(),months=[...new Set(a.map(c=>monthKey(c.due_date)))],body=months.map(k=>{const r=a.filter(c=>monthKey(c.due_date)===k),total=r.reduce((z,c)=>z+n(c.amount),0);return`<section><header><h2>${monthLabel(k)}</h2><strong>${money(total)}</strong></header><table><thead><tr><th>Vade</th><th>Yön</th><th>Firma / Kişi</th><th>Banka / No</th><th>Açıklama</th><th>Tutar</th><th>Makbuz</th><th>Durum</th></tr></thead><tbody>${r.map(c=>`<tr><td>${dateTR(c.due_date)}</td><td>${c.direction==='IN'?'Gelen':'Verilen'}</td><td>${esc(c.counterparty||'')}</td><td>${esc(c.bank||'')} / ${esc(c.serial_no||'')}</td><td>${esc(c.against_text||c.note||'')}</td><td class="num">${money(c.amount)}</td><td>${c.receipt_received?'Alındı'+(c.receipt_by?' / '+esc(c.receipt_by):''):'Yok'}</td><td>${esc(c.status||'')}</td></tr>`).join('')}</tbody></table></section>`}).join(''),w=window.open('','_blank','width=1400,height=900');if(!w)return toast('Yazdırma penceresi açılamadı');w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>HAKAN EMP Çek Listesi</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1e2430;font-size:9px}h1{margin:0 0 3mm;font-size:18px}p{margin:0 0 5mm;color:#667}section{break-inside:avoid;margin:0 0 6mm;border:1px solid #bbb}header{display:flex;justify-content:space-between;padding:3mm 4mm;background:#eef2f7;border-bottom:1px solid #bbb}header h2{margin:0;font-size:13px}header strong{font-size:13px}table{width:100%;border-collapse:collapse}th,td{padding:2.2mm;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{font-size:8px;background:#fafafa}.num{text-align:right;white-space:nowrap}tbody tr:last-child td{border-bottom:0}</style></head><body><h1>HAKAN EMP — Çek Listesi</h1><p>${dateTR(today())} · ${a.length} çek</p>${body}</body></html>`);w.document.close();setTimeout(()=>{w.focus();w.print()},250)} window.printChecks=printChecks;


function renderSettings(){renderSettingsCompanies();renderOperators();renderMachines();renderSync();renderSettingForms()}
$$('.settings-tab').forEach(b=>b.onclick=()=>{$$('.settings-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.setting-pane').forEach(x=>x.classList.remove('active'));$('#setting-'+b.dataset.setting).classList.add('active')});
function renderSettingsCompanies(){if(!$('#settingsCompanyRows'))return;const a=allCompanies.rows||[];$('#settingsCompanyRows').innerHTML=a.length?a.map(c=>`<div class="data-row settings-company-grid ${c.active===0?'row-passive':''}"><div class="cell-main"><b>${esc(c.name)}</b><small>${esc(c.note||'')}</small></div><div class="num">${money(c.opening_balance)}</div><div class="num">${money(c.invoice_total)}</div><div class="num">${money(c.payment_total)}</div><div class="num">${money(c.balance)}</div><div><span class="status ${c.active===0?'gray':'green'}">${c.active===0?'PASİF':'AKTİF'}</span></div><div><button class="mini" onclick="openCompany(${c.id})">Düzenle</button></div></div>`).join(''):'<div class="empty">Firma yok.</div>'}
function renderOperators(){if(!$('#operatorRows'))return;const a=core.operators||[];$('#operatorRows').innerHTML=a.length?a.map(o=>`<button class="operator-item" onclick="openOperator(${o.id})"><span class="operator-avatar">${esc((o.name||'?').slice(0,1).toLocaleUpperCase('tr-TR'))}</span><b>${esc(o.name)}</b><small>Düzenle</small></button>`).join(''):'<div class="empty">Makinacı tanımı yok.</div>'}
function openOperator(id=''){const o=id?(core.operators||[]).find(x=>n(x.id)===n(id)):null;modal(o?'Makinacı Düzenle':'Yeni Makinacı','İsim listesine ekle; sonra gündüz/gece makine atamasında seç.',`<form class="form" id="operatorForm"><input type="hidden" name="id" value="${o?.id||''}"><label class="field full">Makinacı Adı<input name="name" value="${esc(o?.name||'')}" autofocus required></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Kaydet</button></div></form>`);$('#operatorForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/operator',Object.fromEntries(new FormData(e.target)));closeModal();toast('Makinacı kaydedildi');await loadAll()}catch(err){toast(err.message)}}}
window.openOperator=openOperator;
function renderMachines(){if(!$('#machineRows'))return;const a=machinesAll.rows||[];$('#machineRows').innerHTML=a.length?a.map(m=>`<div class="machine-row machine-manage ${m.active===0?'row-passive':''}"><strong>${esc(m.machine_no)}</strong><div class="cell-main"><b>${esc(m.machine_name||'-')}</b><small>${m.active===0?'Pasif makine':'Aktif makine'}</small></div><div>${esc(m.day_operator||'—')}</div><div>${esc(m.night_operator||'—')}</div><div class="row-actions"><button class="mini" onclick="openMachine('${esc(m.machine_no)}')">Düzenle</button>${m.active===0?`<button class="mini ok" onclick="openMachine('${esc(m.machine_no)}')">Aktif Et</button>`:`<button class="mini danger" onclick="removeMachine('${esc(m.machine_no)}')">Çıkar</button>`}</div></div>`).join(''):'<div class="empty">Makine yok.</div>'}
function openMachine(no=''){const m=no?(machinesAll.rows||[]).find(x=>String(x.machine_no)===String(no)):null;modal(m?'Makine Düzenle':'Yeni Makine','Makine adı, numarası ve vardiya makinacılarını yönet.',`<form class="form" id="machineForm"><input type="hidden" name="originalMachineNo" value="${esc(m?.machine_no||'')}"><label class="field">Makine No<input name="machineNo" value="${esc(m?.machine_no||'')}" autofocus required></label><label class="field">Makine Adı<input name="machineName" value="${esc(m?.machine_name||'')}" required></label><label class="field">Gündüz Makinacı<select name="dayOperator">${operatorOptions(m?.day_operator||'')}</select></label><label class="field">Gece Makinacı<select name="nightOperator">${operatorOptions(m?.night_operator||'')}</select></label><label class="field">Durum<select name="active"><option value="1" ${m?.active===0?'':'selected'}>Aktif</option><option value="0" ${m?.active===0?'selected':''}>Pasif</option></select></label><div class="form-actions"><button type="button" onclick="closeModal()">Vazgeç</button><button class="primary">Makineyi Kaydet</button></div></form>`);$('#machineForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/machine',Object.fromEntries(new FormData(e.target)));closeModal();toast('Makine kaydedildi');await loadAll()}catch(err){toast(err.message)}}}
window.openMachine=openMachine;
async function removeMachine(no){if(!confirm('Makine çıkarılsın mı? Geçmiş üretimi varsa silinmez, pasif yapılır.'))return;try{const r=await post('/api/machine-remove',{machineNo:no});toast(r.soft?'Geçmiş kayıt nedeniyle makine pasif yapıldı':'Makine silindi');await loadAll()}catch(e){toast(e.message)}} window.removeMachine=removeMachine;
function renderSettingForms(){const v=settings.values||{};$('#setDefaultCompany').innerHTML='<option value="">Firma seç</option>'+companyOptions(v.default_company_id||'');$('#setDefaultShift').value=v.default_shift||'Gündüz';$('#setCheckHorizon').value=v.check_horizon_days||'90';$('#setReceiptRequired').value=v.receipt_required??'1'}
$('#productionSettingsForm').onsubmit=async e=>{e.preventDefault();await post('/api/settings',Object.fromEntries(new FormData(e.target)));toast('İmalat ayarları kaydedildi');await loadAll()};
$('#checkSettingsForm').onsubmit=async e=>{e.preventDefault();await post('/api/settings',Object.fromEntries(new FormData(e.target)));toast('Çek ayarları kaydedildi');await loadAll()};

function renderSync(){const ok=!!sync.enabled;$('#sideSyncDot').classList.toggle('ok',ok);$('#syncDot').classList.toggle('ok',ok);$('#sideSyncTitle').textContent=ok?'OneDrive aktif':'OneDrive yok';$('#sideSyncText').textContent=ok?'10 dk otomatik':'bağlantı yok';$('#syncTitle').textContent=ok?'Senkron Hazır':'OneDrive Bulunamadı';$('#syncText').textContent=ok?'Sadece yeni işlemler taşınır.':'OneDrive kökü bulunamadı.';$('#syncLast').textContent=sync.lastSync?new Date(sync.lastSync).toLocaleString('tr-TR'):'Henüz yok';$('#syncOut').textContent=sync.pendingOut||0;$('#syncIn').textContent=sync.pendingIn||0}
$('#syncNow').onclick=async()=>{try{await post('/api/sync/now',{});toast('Senkron tamamlandı');await loadAll()}catch(e){toast(e.message)}};
$('#backupNow').onclick=async()=>{await post('/api/backup',{});toast('Tam yedek alındı')};

async function loadAll(){try{[core,done,cari,allCompanies,machinesAll,notes,reminders,checks,sync,settings]=await Promise.all([api('/api/dashboard'),api('/api/completed'),api('/api/companies'),api('/api/companies-all'),api('/api/machines-all'),api('/api/notes'),api('/api/reminders'),api('/api/checks'),api('/api/sync/status'),api('/api/settings')]);if(!selectedCompanyId&&cari.rows?.[0])selectedCompanyId=n(cari.rows[0].id);renderProduction();renderCari();renderChecks();renderSettingsCompanies();renderOperators();renderMachines();renderNotes();renderReminders();renderSync();renderSettingForms()}catch(e){toast(e.message)}}
$('#refreshBtn').onclick=async()=>{await loadAll();toast('Güncellendi')};
loadAll();
