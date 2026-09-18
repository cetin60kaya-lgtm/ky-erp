(() => {
  const VERSION = '20260918-1420-one-engine';
  const ROOT_ID = 'kyerp-ik-print-root';
  const STYLE_ID = 'kyerp-ik-print-style';
  let busy = false;

  const txt = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const money = (v) => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(v)||0);
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
  async function loadRows(startDate,endDate){
    const [summaryRaw,employeesRaw]=await Promise.all([
      apiGet('/ik/daily-attendance/weekly-summary',{startDate,endDate}),
      apiGet('/ik/daily-employees',{includePassive:true}),
    ]);
    const summary=Array.isArray(summaryRaw)?summaryRaw:[]; const employees=Array.isArray(employeesRaw)?employeesRaw:[];
    const map=new Map(employees.map(x=>[String(x.id),x]));
    return summary.filter(r=>Number(r?.dayCount||0)+Number(r?.nightCount||0)>0||Number(r?.totalAmount||0)>0).map(r=>{
      const p=map.get(String(r.employeeId))||{};
      return {no:personNo(p),name:personName(p),role:personRole(p),dayCount:Number(r.dayCount||0),dayTotal:Number(r.dayTotal||0),nightCount:Number(r.nightCount||0),nightTotal:Number(r.nightTotal||0),total:Number(r.totalAmount||0)};
    }).sort((a,b)=>String(a.role).localeCompare(String(b.role),'tr')||String(a.name).localeCompare(String(b.name),'tr'));
  }
  function rangeFrom(root){ const d=[...root.querySelectorAll('input[type="date"]')]; return {startDate:String(d[0]?.value||''),endDate:String(d[1]?.value||'')}; }

  async function weekly(root){
    if(busy) return; const {startDate,endDate}=rangeFrom(root); if(!startDate||!endDate) return alert('Tarih aralığı seçili değil.'); busy=true;
    try{
      const rows=await loadRows(startDate,endDate); if(!rows.length) throw new Error('Bu aralıkta vardiya kaydı yok.');
      const t=rows.reduce((a,r)=>({dc:a.dc+r.dayCount,da:a.da+r.dayTotal,nc:a.nc+r.nightCount,na:a.na+r.nightTotal,gt:a.gt+r.total}),{dc:0,da:0,nc:0,na:0,gt:0});
      const body=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.no)}</td><td class="l">${esc(r.name)}</td><td class="l">${esc(r.role)}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td><td>${esc(money(r.total))}</td></tr>`).join('');
      const html=`<main class="weekly"><h1>HAFTALIK ÖDEME LİSTESİ</h1><p>${esc(startDate)} - ${esc(endDate)} · ${rows.length} kişi</p><table><colgroup><col style="width:4%"><col style="width:9%"><col style="width:23%"><col style="width:14%"><col style="width:8%"><col style="width:12%"><col style="width:8%"><col style="width:12%"><col style="width:10%"></colgroup><thead><tr><th>#</th><th>No</th><th class="l">Personel</th><th class="l">Vasıf</th><th>Gündüz Adet</th><th>Gündüz Tutar</th><th>Gece Adet</th><th>Gece Tutar</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4" class="l">GENEL TOPLAM</td><td>${t.dc}</td><td>${esc(money(t.da))}</td><td>${t.nc}</td><td>${esc(money(t.na))}</td><td>${esc(money(t.gt))}</td></tr></tfoot></table></main>`;
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 landscape;margin:8mm}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important}.weekly{width:265mm!important;margin:0 auto!important}.weekly h1{text-align:center;font-size:15px;margin:0 0 1.5mm}.weekly p{text-align:center;font-size:8px;margin:0 0 3mm}.weekly table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}.weekly th,.weekly td{border:1px solid #111;padding:1.6mm 1.1mm;text-align:center;white-space:nowrap}.weekly .l{text-align:left!important}.weekly th{background:#eef2f7!important}.weekly tfoot td{font-weight:700;background:#f8fafc!important}.weekly tr{break-inside:avoid!important}}`;
      printDoc(css,html);
    }catch(e){busy=false; alert(e?.message||'Haftalık liste hazırlanamadı.');}
  }

  async function payment(screen){
    if(busy) return; const {startDate,endDate}=rangeFrom(screen); if(!startDate||!endDate) return alert('Tarih aralığı seçili değil.'); busy=true;
    try{
      const rows=await loadRows(startDate,endDate); if(!rows.length) throw new Error('Bu aralıkta ödeme fişi yok.');
      const pages=[]; for(let i=0;i<rows.length;i+=10) pages.push(rows.slice(i,i+10));
      const card=(r)=>{const du=r.dayCount?r.dayTotal/r.dayCount:0, nu=r.nightCount?r.nightTotal/r.nightCount:0; return `<article class="slip"><h2>PERSONEL ÖDEME FİŞİ</h2><h3>${esc(r.name)}</h3><div class="role">${esc(r.role)}</div><div class="date">Tarih: ${esc(startDate)} - ${esc(endDate)}</div><b class="vo">VARDİYA ÖZETİ</b><table><thead><tr><th>Vardiya</th><th>Birim</th><th>Adet</th><th>Toplam</th></tr></thead><tbody><tr><td>GÜNDÜZ</td><td>${esc(money(du))}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td></tr><tr><td>GECE</td><td>${esc(money(nu))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td></tr></tbody></table><div class="pay"><span>TOPLAM ÖDEME</span><strong>${esc(money(r.total))}</strong></div></article>`;};
      const html=pages.map((p,pi)=>`<section class="page"><header><b>EL ÖDEME FİŞLERİ</b><span>${esc(startDate)} - ${esc(endDate)} · Sayfa ${pi+1}/${pages.length}</span></header><div class="grid">${p.map(card).join('')}</div></section>`).join('');
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 portrait;margin:7mm}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important}.page{width:196mm!important;height:283mm!important;margin:0 auto!important;overflow:hidden!important;page-break-after:always!important}.page:last-child{page-break-after:auto!important}.page header{height:8mm;display:flex;justify-content:space-between;align-items:center;font-size:7px}.page header b{font-size:10px}.grid{display:grid!important;grid-template-columns:96mm 96mm!important;grid-template-rows:repeat(5,52mm)!important;gap:2mm 4mm!important;width:196mm!important}.slip{width:96mm!important;height:52mm!important;box-sizing:border-box!important;border:1px solid #777!important;padding:1.8mm 2.6mm!important;overflow:hidden!important;break-inside:avoid!important}.slip h2{text-align:center;font-size:6.7px;margin:0 0 .4mm}.slip h3{text-align:center;font-size:10px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.role{text-align:center;font-size:6px;margin:.3mm 0}.date{font-size:5.8px;margin:.5mm 0}.vo{display:block;font-size:5.8px;margin:.4mm 0}.slip table{width:100%;border-collapse:collapse;font-size:5.8px}.slip th,.slip td{border:1px solid #777;padding:.7mm .8mm}.pay{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #111;margin-top:1mm;padding-top:1mm}.pay span{font-size:6.8px;font-weight:700}.pay strong{font-size:13.5px}}`;
      printDoc(css,html);
    }catch(e){busy=false; alert(e?.message||'Ödeme fişleri hazırlanamadı.');}
  }

  function isPaymentScreen(button){ const s=button.closest('.kyik-screen'); if(!s) return null; const u=txt(s).toLocaleUpperCase('tr-TR'); return u.includes('GÜNLÜK ÖDEME FİŞLERİ')?s:null; }
  document.addEventListener('click',(e)=>{
    const b=e.target?.closest?.('button'); if(!b) return; const label=txt(b);
    if(label==='Haftalık Liste Yazdır' && b.closest('.kyik-safe-daily')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();weekly(b.closest('.kyik-safe-daily'));return;}
    if(label==='PDF İndir'){const s=isPaymentScreen(b); if(!s) return; e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();payment(s);}
  },true);

  function simplifyPaymentUi(){
    document.querySelectorAll('.kyik-slip-select').forEach(x=>x.style.display='none');
    document.querySelectorAll('button').forEach(b=>{const t=txt(b); if(t==='Görünenleri Seç'||t==='Görünen Seçimi Kaldır'||t==='Çıktı Seçimini Temizle') b.style.display='none';});
    document.querySelectorAll('.kyik-print-pick-info').forEach(x=>{x.textContent='PDF: bu tarih aralığındaki tüm kişiler basılır';});
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(simplifyPaymentUi)); mo.observe(document.documentElement,{subtree:true,childList:true}); simplifyPaymentUi();
  window.__KYERP_IK_PRINT_ENGINE__={version:VERSION};
})();
