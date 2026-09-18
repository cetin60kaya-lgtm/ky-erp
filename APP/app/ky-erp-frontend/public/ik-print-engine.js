(() => {
  const VERSION = '20260918-1514-selectable-print';
  const ROOT_ID = 'kyerp-ik-print-root';
  const STYLE_ID = 'kyerp-ik-print-style';
  const selectedPaymentKeys = new Set();
  let busy = false;

  const txt = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const money = (v) => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(v)||0);
  const normalizeKey = (v) => String(v || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g,' ');
  const token = () => String(sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token') || '').trim();

  function cleanup(){ document.getElementById(ROOT_ID)?.remove(); document.getElementById(STYLE_ID)?.remove(); busy=false; }
  function printDoc(css, html){
    cleanup(); busy=true;
    const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=css; document.head.appendChild(s);
    const r=document.createElement('section'); r.id=ROOT_ID; r.innerHTML=html; document.body.appendChild(r);
    addEventListener('afterprint',()=>setTimeout(cleanup,80),{once:true}); setTimeout(()=>print(),70);
  }
  function companySlug(){
    const raw=String(localStorage.getItem('kyerp.activeCompany')||'').trim(); if(!raw) return '';
    try{const x=JSON.parse(raw); return String(x?.slug||x?.mainCompanySlug||x?.id||'').trim();}catch{return raw;}
  }
  async function apiGet(path, params={}){
    const t=token(); if(!t) throw new Error('Oturum anahtarı bulunamadı. Sayfayı yenileyip tekrar deneyin.');
    const u=new URL(`https://api.kyerp.net/api${path}`);
    Object.entries(params).forEach(([k,v])=>{ if(v!==''&&v!=null) u.searchParams.set(k,String(v)); });
    const slug=companySlug(); if(slug&&!u.searchParams.has('mainCompanySlug')) u.searchParams.set('mainCompanySlug',slug);
    const res=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${t}`},cache:'no-store',mode:'cors'});
    const raw=await res.text(); let p=null; try{p=raw?JSON.parse(raw):null;}catch{}
    if(!res.ok){ if(res.status===401) throw new Error('Oturum süresi dolmuş. Sayfayı yenileyip tekrar deneyin.'); throw new Error(p?.error?.message||p?.message||`Sunucu hatası (${res.status})`); }
    return p?.ok===true && Object.prototype.hasOwnProperty.call(p,'data') ? p.data : p;
  }
  function personName(x={}){return String(x.name||x.fullName||x.adSoyad||x.employeeName||'Personel').trim();}
  function personRole(x={}){return String(x.role||x.qualification||x.title||x.department||'-').trim();}
  function personNo(x={}){return String(x.personnelNo||x.code||x.personnelCode||'-').trim();}
  function personDayRate(x={}){return Number(x.dayRate??x.dayWage??x.daytimeWage??x.gunduzUcreti??0)||0;}
  function personNightRate(x={}){return Number(x.nightRate??x.nightWage??x.nighttimeWage??x.geceUcreti??0)||0;}

  async function loadRows(startDate,endDate){
    const [summaryRaw,employeesRaw]=await Promise.all([
      apiGet('/ik/daily-attendance/weekly-summary',{startDate,endDate}),
      apiGet('/ik/daily-employees',{includePassive:true}),
    ]);
    const summary=Array.isArray(summaryRaw)?summaryRaw:[]; const employees=Array.isArray(employeesRaw)?employeesRaw:[];
    const map=new Map(employees.map(x=>[String(x.id),x]));
    return summary.filter(r=>Number(r?.dayCount||0)+Number(r?.nightCount||0)>0||Number(r?.totalAmount||0)>0).map(r=>{
      const p=map.get(String(r.employeeId))||{};
      const dayCount=Number(r.dayCount||0); const nightCount=Number(r.nightCount||0);
      let dayTotal=Number(r.dayTotal||0); let nightTotal=Number(r.nightTotal||0);
      if(dayCount>0 && dayTotal<=0) dayTotal=dayCount*personDayRate(p);
      if(nightCount>0 && nightTotal<=0) nightTotal=nightCount*personNightRate(p);
      const total=Number(r.totalAmount||0)>0?Number(r.totalAmount||0):dayTotal+nightTotal;
      return {key:normalizeKey(personName(p)),no:personNo(p),name:personName(p),role:personRole(p),dayCount,dayTotal,nightCount,nightTotal,total};
    }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'tr'));
  }
  function rangeFrom(root){ const d=[...root.querySelectorAll('input[type="date"]')]; return {startDate:String(d[0]?.value||''),endDate:String(d[1]?.value||'')}; }

  async function weekly(root){
    if(busy) return; const {startDate,endDate}=rangeFrom(root); if(!startDate||!endDate) return alert('Tarih aralığı seçili değil.'); busy=true;
    try{
      const rows=await loadRows(startDate,endDate); if(!rows.length) throw new Error('Bu aralıkta vardiya kaydı yok.');
      const t=rows.reduce((a,r)=>({dc:a.dc+r.dayCount,da:a.da+r.dayTotal,nc:a.nc+r.nightCount,na:a.na+r.nightTotal,gt:a.gt+r.total}),{dc:0,da:0,nc:0,na:0,gt:0});
      const body=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.no)}</td><td class="l">${esc(r.name)}</td><td class="l">${esc(r.role)}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td><td>${esc(money(r.total))}</td></tr>`).join('');
      const html=`<main class="weekly"><h1>HAFTALIK ÖDEME LİSTESİ</h1><p>${esc(startDate)} - ${esc(endDate)} · ${rows.length} kişi</p><table><colgroup><col style="width:4%"><col style="width:9%"><col style="width:23%"><col style="width:14%"><col style="width:8%"><col style="width:12%"><col style="width:8%"><col style="width:12%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>No</th><th class="l">Personel</th><th class="l">Vasıf</th><th>Gündüz Adet</th><th>Gündüz Tutar</th><th>Gece Adet</th><th>Gece Tutar</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4" class="l">GENEL TOPLAM</td><td>${t.dc}</td><td>${esc(money(t.da))}</td><td>${t.nc}</td><td>${esc(money(t.na))}</td><td>${esc(money(t.gt))}</td></tr></tfoot></table></main>`;
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 landscape;margin:8mm}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important}.weekly{width:265mm!important;margin:0 auto!important}.weekly h1{text-align:center;font-size:15px;margin:0 0 1.5mm}.weekly p{text-align:center;font-size:8px;margin:0 0 3mm}.weekly table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.2px}.weekly th,.weekly td{border:1px solid #111;padding:1.55mm 1.05mm;text-align:center;white-space:nowrap}.weekly .l{text-align:left!important}.weekly th{background:#eef2f7!important}.weekly tfoot td{font-weight:700;background:#f8fafc!important}.weekly tr{break-inside:avoid!important}}`;
      printDoc(css,html);
    }catch(e){busy=false; alert(e?.message||'Haftalık liste hazırlanamadı.');}
  }

  async function payment(screen, selection=null){
    if(busy) return; const {startDate,endDate}=rangeFrom(screen); if(!startDate||!endDate) return alert('Tarih aralığı seçili değil.'); busy=true;
    try{
      let rows=await loadRows(startDate,endDate);
      if(selection && selection.size) rows=rows.filter(row=>selection.has(row.key));
      if(!rows.length) throw new Error(selection?.size?'Seçili personel için ödeme fişi bulunamadı.':'Bu aralıkta ödeme fişi yok.');
      const pages=[]; for(let i=0;i<rows.length;i+=10) pages.push(rows.slice(i,i+10));
      const card=(r)=>{const du=r.dayCount?r.dayTotal/r.dayCount:0, nu=r.nightCount?r.nightTotal/r.nightCount:0; return `<article class="slip"><h2>PERSONEL ÖDEME FİŞİ</h2><h3>${esc(r.name)}</h3><div class="role">${esc(r.role)}</div><div class="date">Tarih: ${esc(startDate)} - ${esc(endDate)}</div><b class="vo">VARDİYA ÖZETİ</b><table><thead><tr><th>Vardiya</th><th>Birim</th><th>Adet</th><th>Toplam</th></tr></thead><tbody><tr><td>GÜNDÜZ</td><td>${esc(money(du))}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td></tr><tr><td>GECE</td><td>${esc(money(nu))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td></tr></tbody></table><div class="pay"><span>TOPLAM ÖDEME</span><strong>${esc(money(r.total))}</strong></div></article>`;};
      const html=pages.map((p,pi)=>`<section class="page"><header><b>EL ÖDEME FİŞLERİ</b><span>${esc(startDate)} - ${esc(endDate)} · Sayfa ${pi+1}/${pages.length}</span></header><div class="grid">${p.map(card).join('')}</div></section>`).join('');
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 portrait;margin:7mm}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important}.page{width:196mm!important;height:283mm!important;margin:0 auto!important;overflow:hidden!important;page-break-after:always!important}.page:last-child{page-break-after:auto!important}.page header{height:8mm;display:flex;justify-content:space-between;align-items:center;font-size:7.5px}.page header b{font-size:10.5px}.grid{display:grid!important;grid-template-columns:96mm 96mm!important;grid-template-rows:repeat(5,52mm)!important;gap:2mm 4mm!important;width:196mm!important}.slip{width:96mm!important;height:52mm!important;box-sizing:border-box!important;border:1px solid #666!important;padding:1.65mm 2.5mm!important;overflow:hidden!important;break-inside:avoid!important}.slip h2{text-align:center;font-size:7px;margin:0 0 .35mm}.slip h3{text-align:center;font-size:11px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.role{text-align:center;font-size:6.5px;margin:.3mm 0}.date{font-size:6.2px;margin:.45mm 0}.vo{display:block;font-size:6.2px;margin:.35mm 0}.slip table{width:100%;border-collapse:collapse;font-size:6.4px}.slip th,.slip td{border:1px solid #666;padding:.65mm .8mm}.pay{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #111;margin-top:.9mm;padding-top:.85mm}.pay span{font-size:7.2px;font-weight:700}.pay strong{font-size:15px}}`;
      printDoc(css,html);
    }catch(e){busy=false; alert(e?.message||'Ödeme fişleri hazırlanamadı.');}
  }

  function paymentScreenFor(button){
    const screen=button.closest('.kyik-screen'); if(!screen) return null;
    return txt(screen).toLocaleUpperCase('tr-TR').includes('GÜNLÜK ÖDEME FİŞLERİ')?screen:null;
  }
  function cardKey(card){return normalizeKey(txt(card.querySelector('.kyik-slip-head strong'))||txt(card.querySelector('strong')));}

  function updateSelectionUi(screen){
    const cards=[...screen.querySelectorAll('.kyik-slip-grid .kyik-slip')];
    const validKeys=new Set(cards.map(cardKey).filter(Boolean));
    [...selectedPaymentKeys].forEach(key=>{if(!validKeys.has(key)) selectedPaymentKeys.delete(key);});
    cards.forEach(card=>{
      const key=cardKey(card); if(!key) return;
      let pick=card.querySelector('.kyerp-pay-card-pick');
      if(!pick){
        pick=document.createElement('button'); pick.type='button'; pick.className='kyerp-pay-card-pick';
        pick.innerHTML='<i></i><span>Seç</span>';
        pick.addEventListener('click',(event)=>{
          event.preventDefault(); event.stopPropagation();
          if(selectedPaymentKeys.has(key)) selectedPaymentKeys.delete(key); else selectedPaymentKeys.add(key);
          updateSelectionUi(screen);
        });
        card.appendChild(pick);
      }
      const selected=selectedPaymentKeys.has(key);
      card.classList.toggle('kyerp-print-selected',selected);
      pick.dataset.selected=selected?'1':'0';
      pick.querySelector('i').textContent=selected?'✓':'';
      pick.querySelector('span').textContent=selected?'Seçili':'Seç';
    });
    const count=screen.querySelector('.kyerp-pay-actions .count'); if(count) count.textContent=`${selectedPaymentKeys.size} seçili · ${cards.length} kişi`;
    const selectionButton=screen.querySelector('[data-kyerp-pay-action="print-selection"]'); if(selectionButton) selectionButton.disabled=!selectedPaymentKeys.size;
  }

  function ensurePaymentActions(screen){
    const buttons=[...screen.querySelectorAll('button')];
    const preview=buttons.find(b=>txt(b)==='A4 Önizle');
    const printButton=buttons.find(b=>txt(b)==='Yazdır');
    const pdfButton=buttons.find(b=>['PDF İndir','Ödeme Fişlerini Yazdır','Tümünü Yazdır'].includes(txt(b)));
    if(preview) preview.style.display='none';
    if(printButton) printButton.style.display='none';
    if(pdfButton) pdfButton.style.display='none';
    screen.querySelectorAll('.kyik-slip-select').forEach(x=>x.style.display='none');
    buttons.forEach(b=>{const t=txt(b); if(t==='Görünenleri Seç'||t==='Görünen Seçimi Kaldır'||t==='Çıktı Seçimini Temizle') b.style.display='none';});

    let actions=screen.querySelector('.kyerp-pay-actions');
    if(!actions){
      actions=document.createElement('div'); actions.className='kyerp-pay-actions';
      actions.innerHTML='<button type="button" data-kyerp-pay-action="select-all">Tümünü Seç</button><button type="button" data-kyerp-pay-action="clear">Seçimi Temizle</button><button type="button" class="primary" data-kyerp-pay-action="print-selection">Seçimi Yazdır</button><button type="button" data-kyerp-pay-action="print-all">Tümünü Yazdır</button><span class="count">0 seçili</span>';
      const row=(preview||printButton||pdfButton)?.parentElement || screen.querySelector('.kyik-action-row');
      if(row) row.insertBefore(actions,row.firstChild); else screen.prepend(actions);
      actions.querySelector('[data-kyerp-pay-action="select-all"]').addEventListener('click',()=>{
        screen.querySelectorAll('.kyik-slip-grid .kyik-slip').forEach(card=>{const key=cardKey(card); if(key) selectedPaymentKeys.add(key);}); updateSelectionUi(screen);
      });
      actions.querySelector('[data-kyerp-pay-action="clear"]').addEventListener('click',()=>{selectedPaymentKeys.clear();updateSelectionUi(screen);});
      actions.querySelector('[data-kyerp-pay-action="print-selection"]').addEventListener('click',()=>payment(screen,new Set(selectedPaymentKeys)));
      actions.querySelector('[data-kyerp-pay-action="print-all"]').addEventListener('click',()=>payment(screen,null));
    }
    screen.querySelectorAll('.kyik-print-pick-info').forEach(x=>{x.textContent='Seçili kişiler veya tüm liste · A4 başına 10 kişi';});
    updateSelectionUi(screen);
  }

  document.addEventListener('click',(e)=>{
    const b=e.target?.closest?.('button'); if(!b) return; const label=txt(b);
    if(label==='Haftalık Liste Yazdır' && b.closest('.kyik-safe-daily')){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();weekly(b.closest('.kyik-safe-daily'));return;
    }
    const paymentScreen=paymentScreenFor(b);
    if(paymentScreen && ['A4 Önizle','Yazdır','PDF İndir','Ödeme Fişlerini Yazdır'].includes(label)){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();payment(paymentScreen,null);return;
    }
  },true);

  function simplifyPaymentUi(){
    document.querySelectorAll('.kyik-screen').forEach(screen=>{
      if(!txt(screen).toLocaleUpperCase('tr-TR').includes('GÜNLÜK ÖDEME FİŞLERİ')) return;
      ensurePaymentActions(screen);
    });
  }
  let uiQueued=false;
  const queueUi=()=>{if(uiQueued)return;uiQueued=true;requestAnimationFrame(()=>{uiQueued=false;simplifyPaymentUi();});};
  const mo=new MutationObserver(queueUi); mo.observe(document.documentElement,{subtree:true,childList:true}); simplifyPaymentUi();
  window.__KYERP_IK_PRINT_ENGINE__={version:VERSION};
})();
