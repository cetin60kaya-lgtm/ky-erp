import {useState} from "react";
const fmt=v=>v==null?"—":Number(v).toLocaleString("tr-TR");
const tones={blue:"blue",teal:"teal",red:"red",amber:"amber"};
export default function EBelgeRev3Overview({dashboard,openModule}){
 const [period,setPeriod]=useState("all");
 const {metrics={},monthStart,today,summary={}}=dashboard;
 const data=metrics[period]||{},month=metrics.month||{},drafts=metrics.drafts||{};
 const nav=(tab,opts={})=>openModule?.("e-belge",{tabKey:tab,actionContext:{dashboardMetric:true,...opts}});
 const dateOpts=(isMonth=period==="month")=>isMonth?{from:monthStart,to:today}:{};
 const metric=(label,value,tab,opts={},tone="",reason="")=><button key={label} type="button" className={"eb-rev3-metric "+(tones[tone]||"")} disabled={!tab||value==null} onClick={()=>nav(tab,opts)} title={reason||(value==null?"Sayaç henüz doğrulanmadı":"İlgili kayıtları aç")}><span className="eb-rev3-arrow">{value==null?"":"↗"}</span><strong>{fmt(value)}</strong><span>{label}</span>{value==null&&<small>{reason||"Doğrulanmadı"}</small>}</button>;
 const missing=(label,tone="",reason="Sağlayıcı kabulü gerekli")=>metric(label,null,"",{},tone,reason);
 const group=(title,sub,items)=><section className="eb-rev3-panel"><header><h3>{title}</h3><small>{sub}</small></header><div className="eb-rev3-metrics">{items}</div></section>;
 const draft=(kind,key,label,state)=>metric(label,drafts[kind]?.[key],kind==="INVOICE"?"fatura-taslaklari":kind==="ARCHIVE"?"earchive-drafts":"irsaliye-taslaklari",{draftState:state},"teal","Taslak şeması ve kayıt erişimi doğrulanmadı");
 return <section className="eb-rev3-overview">
  <div className="eb-rev3-filter"><label>Gösterim dönemi <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tümü / bu ay ayrı</option><option value="month">Bu ay</option></select></label><span>Resmî kayıtlar · taslak sayaçları tüm dönem · son okuma {today||"—"}</span></div>
  <div className="eb-rev3-dashboard">
   {group("e-Fatura","Gelen ve giden belgeler",[
     metric("Gelen faturalar",data.INCOMING_INVOICE,"gelen-faturalar",dateOpts()),
     metric("Okunmamış",data.INCOMING_INVOICE_UNREAD,"okunmamis-faturalar",dateOpts(),"blue"),
     metric("Giden · bu ay",month.OUTGOING_EINVOICE,"giden-faturalar",dateOpts(true)),
     missing("Ticari yanıt bekleyen","blue"),missing("Temel kontrol bekleyen"),
     draft("INVOICE","active","Fatura taslakları","ACTIVE"),draft("INVOICE","checked","Kontrol edilmiş taslak","CHECKED"),missing("Reddedilen · bu ay","red"),missing("Gönderim hatası","amber")])}
   {group("e-İrsaliye","Sevk ve teslimat",[
     metric("Gelen irsaliyeler",data.INCOMING_DISPATCH,"gelen-irsaliyeler",dateOpts()),
     metric("Okunmamış",data.INCOMING_DISPATCH_UNREAD,"okunmamis-irsaliyeler",dateOpts(),"blue"),
     missing("Teslim yanıtı bekleyen","blue"),metric("Giden · bu ay",month.OUTGOING_DISPATCH,"giden-irsaliyeler",dateOpts(true)),
     draft("DISPATCH","active","İrsaliye taslakları","ACTIVE"),missing("Reddedilen · bu ay","red"),missing("Gönderim hatası","amber"),missing("Kısmi sevk bekleyen","blue","Kaynak rezervasyonu gerekli"),missing("Fatura bekleyen","blue","Kaynak rezervasyonu gerekli")])}
   {group("e-Arşiv","Sağlayıcı yeteneğine bağlı",[
     metric("Giden · bu ay",month.OUTGOING_ARCHIVE,"earchive-out",dateOpts(true)),draft("ARCHIVE","active","Taslaklar","ACTIVE"),missing("E-posta bekleyen","amber"),missing("Rapor hatası","amber"),missing("İptal edilen","red"),draft("ARCHIVE","cancelled","İptal edilen taslaklar","CANCELLED")])}
   {group("KYERP Otomasyon Merkezi","Ortak muhasebe motoru",[
     metric("Eşleştirme bekleyen",data.MATCHING_WAIT,"eslestirmeler",dateOpts(),"blue"),
     metric("Muhasebe onayı bekleyen",data.APPROVAL_WAIT,"muhasebe-onayi",dateOpts(),"blue"),metric("Eksik XML / PDF",data.MISSING_ORIGINAL,"eksik-orijinaller",dateOpts(),"amber","Orijinal bağlantısı eksik"),
     metric("Belge kontrolü",data.ISSUE,"onay-sorunlar",dateOpts(),"amber"),
     draft("INVOICE","cancelled","İptal edilen fatura taslakları","CANCELLED"),missing("Kontör / bağlantı","amber")])}
   <section className="eb-rev3-panel eb-rev3-wide"><header><h3>Belge iş akışı</h3><small>Tek muhasebe kaynağı</small></header><div className="eb-rev3-steps">{[["Belge aktarımı","Orijinal XML / PDF","belgeleri-al"],["Eşleştirme","Cari · model · ürün","eslestirmeler"],["Kontrol","Miktar · vergi · bakiye","onay-sorunlar"],["Muhasebe onayı","Mevcut kayıt motoru","muhasebe-onayi"],["Arşiv","File Hub · geçmiş","arsiv-cikti"]].map(([title,sub,tab],i)=><button type="button" key={tab} onClick={()=>openModule?.("e-belge",{tabKey:tab})}><b>{i+1}</b><span><strong>{title}</strong><small>{sub}</small></span></button>)}</div></section>
   <details className="eb-rev3-panel eb-rev3-wide"><summary>Dönem karşılaştırması</summary><div className="eb-rev3-period"><span>Bu ay · {fmt(summary.monthTotal)} belge</span><span>Gelen tutar · {fmt(summary.monthIncomingAmount)}</span><span>Giden tutar · {fmt(summary.monthOutgoingAmount)}</span><span>Geçen ay · {fmt(summary.previousMonthTotal)} belge</span><span>Bugün alınan · {fmt(summary.todayTotal)}</span></div></details>
  </div>
 </section>
}
