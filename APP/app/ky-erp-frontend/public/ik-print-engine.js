(() => {
  const VERSION = '20260919-0945-a4-print-pro';
  const ROOT_ID = 'kyerp-ik-print-root';
  const STYLE_ID = 'kyerp-ik-print-style';
  const SETTINGS_ID = 'kyerp-ik-print-settings';
  const PREF_KEY = 'kyerpIkPrintPrefs.v2';
  const selectedPaymentKeys = new Set();
  let busy = false;

  const txt = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const money = (v) => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(v)||0);
  const normalizeKey = (v) => String(v || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g,' ');
  const token = () => String(sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token') || '').trim();
  const pad = (v) => String(v).padStart(2,'0');
  const nowText = () => {
    const d = new Date();
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const defaultPrefs = { weeklyDensity:'normal', slipScale:'large' };

  function readPrefs(){
    try {
      const parsed=JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{};
      return {
        weeklyDensity:['large','normal','compact'].includes(parsed.weeklyDensity)?parsed.weeklyDensity:defaultPrefs.weeklyDensity,
        slipScale:['normal','large','xlarge'].includes(parsed.slipScale)?parsed.slipScale:defaultPrefs.slipScale,
      };
    } catch { return {...defaultPrefs}; }
  }
  function writePrefs(next){
    try{localStorage.setItem(PREF_KEY,JSON.stringify(next));}catch{}
  }
  function cleanup(){
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    busy=false;
  }
  function printDoc(css, html){
    cleanup();
    busy=true;
    document.getElementById(SETTINGS_ID)?.remove();
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=css;
    document.head.appendChild(s);
    const r=document.createElement('section');
    r.id=ROOT_ID;
    r.innerHTML=html;
    document.body.appendChild(r);
    addEventListener('afterprint',()=>setTimeout(cleanup,120),{once:true});
    setTimeout(()=>window.print(),90);
  }
  function companySlug(){
    const raw=String(localStorage.getItem('kyerp.activeCompany')||'').trim();
    if(!raw) return '';
    try{const x=JSON.parse(raw); return String(x?.slug||x?.mainCompanySlug||x?.id||'').trim();}catch{return raw;}
  }
  async function apiGet(path, params={}){
    const t=token();
    if(!t) throw new Error('Oturum anahtarı bulunamadı. Sayfayı yenileyip tekrar deneyin.');
    const u=new URL(`https://api.kyerp.net/api${path}`);
    Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)u.searchParams.set(k,String(v));});
    const slug=companySlug();
    if(slug&&!u.searchParams.has('mainCompanySlug'))u.searchParams.set('mainCompanySlug',slug);
    const res=await fetch(u,{headers:{Accept:'application/json',Authorization:`Bearer ${t}`},cache:'no-store',mode:'cors'});
    const raw=await res.text();
    let p=null;
    try{p=raw?JSON.parse(raw):null;}catch{}
    if(!res.ok){
      if(res.status===401) throw new Error('Oturum süresi dolmuş. Sayfayı yenileyip tekrar deneyin.');
      throw new Error(p?.error?.message||p?.message||`Sunucu hatası (${res.status})`);
    }
    return p?.ok===true&&Object.prototype.hasOwnProperty.call(p,'data')?p.data:p;
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
    const summary=Array.isArray(summaryRaw)?summaryRaw:[];
    const employees=Array.isArray(employeesRaw)?employeesRaw:[];
    const map=new Map(employees.map(x=>[String(x.id),x]));
    return summary
      .filter(r=>Number(r?.dayCount||0)+Number(r?.nightCount||0)>0||Number(r?.totalAmount||0)>0)
      .map(r=>{
        const p=map.get(String(r.employeeId))||{};
        const dayCount=Number(r.dayCount||0);
        const nightCount=Number(r.nightCount||0);
        let dayTotal=Number(r.dayTotal||0);
        let nightTotal=Number(r.nightTotal||0);
        if(dayCount>0&&dayTotal<=0)dayTotal=dayCount*personDayRate(p);
        if(nightCount>0&&nightTotal<=0)nightTotal=nightCount*personNightRate(p);
        const total=Number(r.totalAmount||0)>0?Number(r.totalAmount||0):dayTotal+nightTotal;
        return {key:normalizeKey(personName(p)),no:personNo(p),name:personName(p),role:personRole(p),dayCount,dayTotal,nightCount,nightTotal,total};
      })
      .sort((a,b)=>String(a.name).localeCompare(String(b.name),'tr'));
  }
  function rangeFrom(root){
    const d=[...root.querySelectorAll('input[type="date"]')];
    return {startDate:String(d[0]?.value||''),endDate:String(d[1]?.value||'')};
  }
  function totals(rows){
    return rows.reduce((a,r)=>({dc:a.dc+r.dayCount,da:a.da+r.dayTotal,nc:a.nc+r.nightCount,na:a.na+r.nightTotal,gt:a.gt+r.total}),{dc:0,da:0,nc:0,na:0,gt:0});
  }

  function openSettings(){
    document.getElementById(SETTINGS_ID)?.remove();
    const prefs=readPrefs();
    const overlay=document.createElement('div');
    overlay.id=SETTINGS_ID;
    overlay.innerHTML=`<div class="kyerp-print-settings-card" role="dialog" aria-modal="true" aria-label="A4 çıktı ayarları">
      <div class="head"><div><span>KY ERP / A4 ÇIKTI</span><h3>Çıktı Ayarları</h3><p>Varsayılan düzen güvenlidir; yalnız gerektiğinde değiştirin.</p></div><button type="button" data-close>×</button></div>
      <label><b>Haftalık özet satır boyutu</b><select data-weekly><option value="large">Büyük · 24 kişi/sayfa</option><option value="normal">Normal · 28 kişi/sayfa</option><option value="compact">Sıkışık · 32 kişi/sayfa</option></select><small>A4 yatay. Sayfaya sığmazsa otomatik yeni sayfaya geçer.</small></label>
      <label><b>Ödeme fişi toplam tutarı</b><select data-slip><option value="normal">Normal</option><option value="large">Büyük</option><option value="xlarge">Çok Büyük</option></select><small>A4 dikey, sayfa başına 10 fiş (2 × 5). Kart ölçüsü sabittir.</small></label>
      <div class="info"><strong>Güvenli A4 düzeni</strong><span>Haftalık özet: yatay · Ödeme fişleri: dikey · taşma olursa sayfa otomatik bölünür · genel toplam son sayfada belirgin gösterilir.</span></div>
      <div class="actions"><button type="button" data-default>Varsayılan</button><button type="button" class="primary" data-save>Kaydet</button></div>
    </div>`;
    const style=document.createElement('style');
    style.textContent=`#${SETTINGS_ID}{position:fixed;inset:0;z-index:2147482500;background:rgba(15,31,53,.48);display:grid;place-items:center;padding:18px;font-family:Arial,sans-serif}.kyerp-print-settings-card{width:min(520px,94vw);background:#fff;border:1px solid #cad8e7;border-radius:14px;box-shadow:0 28px 80px rgba(18,43,75,.28);padding:14px;color:#173653}.kyerp-print-settings-card .head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e3eaf2;padding-bottom:10px;margin-bottom:10px}.kyerp-print-settings-card .head span{font-size:9px;color:#2466c2;font-weight:900;letter-spacing:.08em}.kyerp-print-settings-card h3{margin:3px 0 2px;font-size:18px}.kyerp-print-settings-card p{margin:0;color:#6c7c8f;font-size:10px}.kyerp-print-settings-card .head button{width:32px;height:32px;border:1px solid #d3ddea;border-radius:8px;background:#fff;font-size:20px;cursor:pointer}.kyerp-print-settings-card label{display:grid;gap:5px;margin:11px 0}.kyerp-print-settings-card label b{font-size:11px}.kyerp-print-settings-card label small{font-size:9px;color:#748296}.kyerp-print-settings-card select{height:38px;border:1px solid #c9d6e4;border-radius:8px;background:#fff;padding:0 9px;color:#163957;font-weight:700}.kyerp-print-settings-card .info{display:grid;gap:3px;padding:10px;border-radius:9px;background:#f3f7fb;color:#37536f;font-size:9px}.kyerp-print-settings-card .actions{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.kyerp-print-settings-card .actions button{height:34px;padding:0 12px;border:1px solid #cbd7e5;border-radius:8px;background:#fff;color:#27445f;font-weight:800;cursor:pointer}.kyerp-print-settings-card .actions .primary{background:#2468ca;border-color:#2468ca;color:#fff}`;
    overlay.appendChild(style);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-weekly]').value=prefs.weeklyDensity;
    overlay.querySelector('[data-slip]').value=prefs.slipScale;
    const close=()=>overlay.remove();
    overlay.addEventListener('click',(e)=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
    overlay.querySelector('[data-default]').addEventListener('click',()=>{
      overlay.querySelector('[data-weekly]').value=defaultPrefs.weeklyDensity;
      overlay.querySelector('[data-slip]').value=defaultPrefs.slipScale;
    });
    overlay.querySelector('[data-save]').addEventListener('click',()=>{
      writePrefs({weeklyDensity:overlay.querySelector('[data-weekly]').value,slipScale:overlay.querySelector('[data-slip]').value});
      close();
    });
  }

  async function weekly(root){
    if(busy)return;
    const {startDate,endDate}=rangeFrom(root);
    if(!startDate||!endDate)return alert('Tarih aralığı seçili değil.');
    busy=true;
    try{
      const rows=await loadRows(startDate,endDate);
      if(!rows.length)throw new Error('Bu aralıkta vardiya kaydı yok.');
      const prefs=readPrefs();
      const perPage={large:24,normal:28,compact:32}[prefs.weeklyDensity]||28;
      const rowSize={large:'9.5px',normal:'8.8px',compact:'8.1px'}[prefs.weeklyDensity]||'8.8px';
      const grand=totals(rows);
      const pages=[];
      for(let i=0;i<rows.length;i+=perPage)pages.push(rows.slice(i,i+perPage));
      const html=pages.map((pageRows,pageIndex)=>{
        const body=pageRows.map((r,i)=>`<tr><td>${pageIndex*perPage+i+1}</td><td>${esc(r.no)}</td><td class="l person">${esc(r.name)}</td><td class="l">${esc(r.role)}</td><td>${r.dayCount}</td><td class="amt">${esc(money(r.dayTotal))}</td><td>${r.nightCount}</td><td class="amt">${esc(money(r.nightTotal))}</td><td class="amt paycell">${esc(money(r.total))}</td></tr>`).join('');
        const isLast=pageIndex===pages.length-1;
        return `<section class="weekly-page">
          <header class="weekly-head"><div><span>KY ERP · GÜNLÜK PERSONEL</span><h1>HAFTALIK ÖDEME ÖZETİ</h1><p>${esc(startDate)} — ${esc(endDate)} · ${rows.length} kişi</p></div><div class="page-no">Sayfa ${pageIndex+1}/${pages.length}<small>${esc(nowText())}</small></div></header>
          <div class="weekly-kpis"><div><span>Gündüz</span><b>${grand.dc}</b><strong>${esc(money(grand.da))}</strong></div><div><span>Gece</span><b>${grand.nc}</b><strong>${esc(money(grand.na))}</strong></div><div class="total"><span>TOPLAM ÖDEME</span><b>${esc(money(grand.gt))}</b><strong>${rows.length} personel</strong></div></div>
          <table><colgroup><col style="width:4%"><col style="width:8%"><col style="width:23%"><col style="width:14%"><col style="width:8%"><col style="width:12%"><col style="width:8%"><col style="width:12%"><col style="width:11%"></colgroup><thead><tr><th>#</th><th>No</th><th class="l">Personel</th><th class="l">Vasıf</th><th>Gündüz</th><th>Gündüz Tutar</th><th>Gece</th><th>Gece Tutar</th><th>ÖDENECEK</th></tr></thead><tbody>${body}</tbody>${isLast?`<tfoot><tr><td colspan="4" class="l grand-label">GENEL TOPLAM</td><td>${grand.dc}</td><td>${esc(money(grand.da))}</td><td>${grand.nc}</td><td>${esc(money(grand.na))}</td><td class="grand-pay">${esc(money(grand.gt))}</td></tr></tfoot>`:''}</table>
          <footer>KY ERP · A4 Yatay · ${prefs.weeklyDensity==='large'?'Büyük':prefs.weeklyDensity==='compact'?'Sıkışık':'Normal'} satır düzeni</footer>
        </section>`;
      }).join('');
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 landscape;margin:7mm}html,body{margin:0!important;padding:0!important;background:#fff!important}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}#${ROOT_ID}{display:block!important;position:absolute!important;inset:0 auto auto 0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important;color:#111!important}.weekly-page{width:283mm!important;height:196mm!important;box-sizing:border-box!important;margin:0 auto!important;overflow:hidden!important;break-after:page!important;page-break-after:always!important;display:flex!important;flex-direction:column!important}.weekly-page:last-child{break-after:auto!important;page-break-after:auto!important}.weekly-head{height:19mm;box-sizing:border-box;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.4px solid #111;padding:0 0 2.2mm}.weekly-head span{font-size:7.5px;font-weight:900;letter-spacing:.08em}.weekly-head h1{font-size:17px;line-height:1;margin:.9mm 0 .7mm}.weekly-head p{font-size:8px;margin:0}.page-no{text-align:right;font-size:9px;font-weight:800}.page-no small{display:block;margin-top:2mm;font-size:7px;font-weight:400}.weekly-kpis{height:19mm;box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr 1.25fr;gap:2.2mm;padding:2.2mm 0}.weekly-kpis>div{border:1px solid #aab5c2;border-radius:2mm;padding:1.3mm 2mm;display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:2mm}.weekly-kpis span{grid-column:1/-1;font-size:7px;font-weight:800;color:#4b5563}.weekly-kpis b{font-size:12px}.weekly-kpis strong{text-align:right;font-size:10px}.weekly-kpis .total{border:1.8px solid #111;background:#f3f4f6!important}.weekly-kpis .total b{font-size:14px}.weekly-kpis .total strong{font-size:9px}table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:${rowSize}!important;line-height:1.05!important}thead{display:table-header-group!important}th,td{border:1px solid #444!important;padding:1.15mm .9mm!important;text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}th{background:#e8edf3!important;font-size:8px!important;font-weight:900!important}td.l,th.l{text-align:left!important}td.person{font-weight:700!important}.amt{font-variant-numeric:tabular-nums}.paycell{font-weight:900!important}tr{break-inside:avoid!important;page-break-inside:avoid!important}tfoot td{background:#edf1f5!important;font-weight:900!important;border-top:2px solid #111!important;font-size:10px!important;padding-top:1.5mm!important;padding-bottom:1.5mm!important}.grand-label{font-size:11px!important}.grand-pay{font-size:14px!important;background:#dfe7f1!important}footer{margin-top:auto;border-top:1px solid #c3cbd5;padding-top:1.2mm;text-align:right;font-size:6.5px;color:#5b6570}}`;
      printDoc(css,html);
    }catch(e){busy=false;alert(e?.message||'Haftalık liste hazırlanamadı.');}
  }

  async function payment(screen,selection=null){
    if(busy)return;
    const {startDate,endDate}=rangeFrom(screen);
    if(!startDate||!endDate)return alert('Tarih aralığı seçili değil.');
    busy=true;
    try{
      let rows=await loadRows(startDate,endDate);
      if(selection&&selection.size)rows=rows.filter(row=>selection.has(row.key));
      if(!rows.length)throw new Error(selection?.size?'Seçili personel için ödeme fişi bulunamadı.':'Bu aralıkta ödeme fişi yok.');
      const prefs=readPrefs();
      const totalFont={normal:'17px',large:'20px',xlarge:'23px'}[prefs.slipScale]||'20px';
      const nameFont={normal:'11px',large:'12px',xlarge:'12.5px'}[prefs.slipScale]||'12px';
      const pages=[];
      for(let i=0;i<rows.length;i+=10)pages.push(rows.slice(i,i+10));
      const grand=totals(rows);
      const card=(r)=>{
        const du=r.dayCount?r.dayTotal/r.dayCount:0;
        const nu=r.nightCount?r.nightTotal/r.nightCount:0;
        return `<article class="slip"><div class="slip-top"><div><span>PERSONEL ÖDEME FİŞİ</span><h3>${esc(r.name)}</h3><small>${esc(r.role)} · ${esc(r.no)}</small></div><b>${esc(startDate)}<br>${esc(endDate)}</b></div><table><thead><tr><th>Vardiya</th><th>Birim</th><th>Adet</th><th>Tutar</th></tr></thead><tbody><tr><td>GÜNDÜZ</td><td>${esc(money(du))}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td></tr><tr><td>GECE</td><td>${esc(money(nu))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td></tr></tbody></table><div class="pay"><span>TOPLAM ÖDEME</span><strong>${esc(money(r.total))}</strong></div><div class="sign"><span>Personel İmza</span><span>Yetkili</span></div></article>`;
      };
      const html=pages.map((p,pi)=>`<section class="slip-page"><header><div><b>GÜNLÜK PERSONEL ÖDEME FİŞLERİ</b><span>${esc(startDate)} — ${esc(endDate)} · Toplam ${rows.length} kişi · ${esc(money(grand.gt))}</span></div><strong>Sayfa ${pi+1}/${pages.length}</strong></header><div class="grid">${p.map(card).join('')}</div><footer>KY ERP · A4 Dikey · 10 fiş/sayfa · ${esc(nowText())}</footer></section>`).join('');
      const css=`#${ROOT_ID}{display:none}@media print{@page{size:A4 portrait;margin:6mm}html,body{margin:0!important;padding:0!important;background:#fff!important}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}#${ROOT_ID}{display:block!important;position:absolute!important;inset:0 auto auto 0!important;width:100%!important;font-family:Arial,sans-serif!important;background:#fff!important;color:#111!important}.slip-page{width:198mm!important;height:285mm!important;box-sizing:border-box!important;margin:0 auto!important;overflow:hidden!important;break-after:page!important;page-break-after:always!important;display:flex!important;flex-direction:column!important}.slip-page:last-child{break-after:auto!important;page-break-after:auto!important}.slip-page>header{height:9mm!important;box-sizing:border-box!important;display:flex!important;justify-content:space-between!important;align-items:center!important;border-bottom:1.4px solid #111!important;margin-bottom:1.5mm!important}.slip-page>header div{display:flex;align-items:baseline;gap:3mm}.slip-page>header b{font-size:10px}.slip-page>header span{font-size:6.8px;color:#444}.slip-page>header strong{font-size:7px}.grid{display:grid!important;grid-template-columns:97.5mm 97.5mm!important;grid-template-rows:repeat(5,52.4mm)!important;gap:1.7mm 3mm!important;width:198mm!important;height:269mm!important;align-content:start!important}.slip{width:97.5mm!important;height:52.4mm!important;box-sizing:border-box!important;border:1.25px solid #555!important;padding:1.6mm 2mm!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;display:flex!important;flex-direction:column!important}.slip-top{display:flex!important;justify-content:space-between!important;gap:2mm!important;min-height:12.3mm!important}.slip-top>div{min-width:0}.slip-top span{display:block;font-size:6.4px;font-weight:900;letter-spacing:.05em}.slip-top h3{font-size:${nameFont}!important;line-height:1.05!important;margin:.5mm 0 .4mm!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.slip-top small{display:block;font-size:6.3px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slip-top>b{font-size:6.2px;text-align:right;line-height:1.25;white-space:nowrap}.slip table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:6.7px!important}.slip th,.slip td{border:1px solid #777!important;padding:.65mm .65mm!important;text-align:center!important;white-space:nowrap!important}.slip th{background:#edf1f5!important;font-size:6.2px!important}.pay{display:flex!important;justify-content:space-between!important;align-items:center!important;border:1.4px solid #111!important;background:#f1f3f5!important;margin-top:1mm!important;padding:1mm 1.4mm!important;min-height:8.2mm!important;box-sizing:border-box!important}.pay span{font-size:7.6px!important;font-weight:900!important;letter-spacing:.02em}.pay strong{font-size:${totalFont}!important;line-height:1!important;font-weight:900!important;font-variant-numeric:tabular-nums!important}.sign{margin-top:auto!important;padding-top:.8mm!important;display:flex!important;justify-content:space-between!important;color:#666!important;font-size:5.7px!important;border-top:1px dotted #aaa!important}.slip-page>footer{height:4.5mm!important;display:flex!important;align-items:flex-end!important;justify-content:flex-end!important;border-top:1px solid #d0d6dd!important;font-size:5.8px!important;color:#606b75!important;margin-top:auto!important}}`;
      printDoc(css,html);
    }catch(e){busy=false;alert(e?.message||'Ödeme fişleri hazırlanamadı.');}
  }

  function paymentScreenFor(button){
    const screen=button.closest('.kyik-screen');
    if(!screen)return null;
    return txt(screen).toLocaleUpperCase('tr-TR').includes('GÜNLÜK ÖDEME FİŞLERİ')?screen:null;
  }
  function cardKey(card){return normalizeKey(txt(card.querySelector('.kyik-slip-head strong'))||txt(card.querySelector('strong')));}

  function updateSelectionUi(screen){
    const cards=[...screen.querySelectorAll('.kyik-slip-grid .kyik-slip')];
    const validKeys=new Set(cards.map(cardKey).filter(Boolean));
    [...selectedPaymentKeys].forEach(key=>{if(!validKeys.has(key))selectedPaymentKeys.delete(key);});
    cards.forEach(card=>{
      const key=cardKey(card);
      if(!key)return;
      let pick=card.querySelector('.kyerp-pay-card-pick');
      if(!pick){
        pick=document.createElement('button');
        pick.type='button';
        pick.className='kyerp-pay-card-pick';
        pick.innerHTML='<i></i><span>Seç</span>';
        pick.addEventListener('click',(event)=>{
          event.preventDefault();event.stopPropagation();
          if(selectedPaymentKeys.has(key))selectedPaymentKeys.delete(key);else selectedPaymentKeys.add(key);
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
    const count=screen.querySelector('.kyerp-pay-actions .count');
    if(count)count.textContent=`${selectedPaymentKeys.size} seçili · ${cards.length} kişi`;
    const selectionButton=screen.querySelector('[data-kyerp-pay-action="print-selection"]');
    if(selectionButton)selectionButton.disabled=!selectedPaymentKeys.size;
  }

  function ensureSettingsButton(container){
    if(!container||container.querySelector('[data-kyerp-print-settings]'))return;
    const b=document.createElement('button');
    b.type='button';
    b.dataset.kyerpPrintSettings='1';
    b.className='kyik-btn';
    b.innerHTML='<span>A4 Ayarları</span>';
    b.addEventListener('click',openSettings);
    container.appendChild(b);
  }

  function ensurePaymentActions(screen){
    const buttons=[...screen.querySelectorAll('button')];
    const preview=buttons.find(b=>txt(b)==='A4 Önizle');
    const printButton=buttons.find(b=>txt(b)==='Yazdır');
    const pdfButton=buttons.find(b=>['PDF İndir','Ödeme Fişlerini Yazdır','Tümünü Yazdır'].includes(txt(b)));
    if(preview)preview.style.display='none';
    if(printButton)printButton.style.display='none';
    if(pdfButton)pdfButton.style.display='none';
    screen.querySelectorAll('.kyik-slip-select').forEach(x=>x.style.display='none');
    buttons.forEach(b=>{const t=txt(b);if(t==='Görünenleri Seç'||t==='Görünen Seçimi Kaldır'||t==='Çıktı Seçimini Temizle')b.style.display='none';});

    let actions=screen.querySelector('.kyerp-pay-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='kyerp-pay-actions';
      actions.innerHTML='<button type="button" data-kyerp-pay-action="select-all">Tümünü Seç</button><button type="button" data-kyerp-pay-action="clear">Seçimi Temizle</button><button type="button" class="primary" data-kyerp-pay-action="print-selection">Seçimi Yazdır</button><button type="button" data-kyerp-pay-action="print-all">Tümünü Yazdır</button><button type="button" data-kyerp-print-settings="1">A4 Ayarları</button><span class="count">0 seçili</span>';
      const row=(preview||printButton||pdfButton)?.parentElement||screen.querySelector('.kyik-action-row');
      if(row)row.insertBefore(actions,row.firstChild);else screen.prepend(actions);
      actions.querySelector('[data-kyerp-pay-action="select-all"]').addEventListener('click',()=>{
        screen.querySelectorAll('.kyik-slip-grid .kyik-slip').forEach(card=>{const key=cardKey(card);if(key)selectedPaymentKeys.add(key);});
        updateSelectionUi(screen);
      });
      actions.querySelector('[data-kyerp-pay-action="clear"]').addEventListener('click',()=>{selectedPaymentKeys.clear();updateSelectionUi(screen);});
      actions.querySelector('[data-kyerp-pay-action="print-selection"]').addEventListener('click',()=>payment(screen,new Set(selectedPaymentKeys)));
      actions.querySelector('[data-kyerp-pay-action="print-all"]').addEventListener('click',()=>payment(screen,null));
      actions.querySelector('[data-kyerp-print-settings]').addEventListener('click',openSettings);
    }
    screen.querySelectorAll('.kyik-print-pick-info').forEach(x=>{x.textContent='Seçili kişiler veya tüm liste · A4 dikey · sayfa başına 10 kişi';});
    updateSelectionUi(screen);
  }

  function ensureDailySettings(){
    document.querySelectorAll('.kyik-safe-daily .kyik-safe-actions').forEach(actions=>{
      if(actions.querySelector('[data-kyerp-print-settings]'))return;
      const printButton=[...actions.querySelectorAll('button')].find(b=>txt(b)==='Haftalık Liste Yazdır');
      if(!printButton)return;
      const b=document.createElement('button');
      b.type='button';
      b.dataset.kyerpPrintSettings='1';
      b.className='kyik-btn';
      b.innerHTML='<span>A4 Ayarları</span>';
      b.addEventListener('click',openSettings);
      printButton.insertAdjacentElement('afterend',b);
    });
  }

  document.addEventListener('click',(e)=>{
    const b=e.target?.closest?.('button');
    if(!b)return;
    const label=txt(b);
    if(label==='Haftalık Liste Yazdır'&&b.closest('.kyik-safe-daily')){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      weekly(b.closest('.kyik-safe-daily'));
      return;
    }
    const paymentScreen=paymentScreenFor(b);
    if(paymentScreen&&['A4 Önizle','Yazdır','PDF İndir','Ödeme Fişlerini Yazdır'].includes(label)){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      payment(paymentScreen,null);
    }
  },true);

  function simplifyPaymentUi(){
    document.querySelectorAll('.kyik-screen').forEach(screen=>{
      if(!txt(screen).toLocaleUpperCase('tr-TR').includes('GÜNLÜK ÖDEME FİŞLERİ'))return;
      ensurePaymentActions(screen);
    });
    ensureDailySettings();
  }

  let uiQueued=false;
  const queueUi=()=>{if(uiQueued)return;uiQueued=true;requestAnimationFrame(()=>{uiQueued=false;simplifyPaymentUi();});};
  const mo=new MutationObserver(queueUi);
  mo.observe(document.documentElement,{subtree:true,childList:true});
  simplifyPaymentUi();
  window.__KYERP_IK_PRINT_ENGINE__={version:VERSION,readPrefs,openSettings};
})();
