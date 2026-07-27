export default function ProductionEntrySummary({ rows }) {
  const active=rows.filter(x=>x.status!=="context");
  const stats=[['Toplam satır',active.length],['Hazır kayıt',active.filter(x=>x.status==='ready').length],['Kontrol bekleyen',active.filter(x=>x.status==='review').length],['Hatalı kayıt',active.filter(x=>x.status==='error').length],['Toplam adet',active.reduce((s,x)=>s+Number(x.quantity||0),0)]];
  return <div className="smart-summary">{stats.map(([label,value])=><div key={label} className="stat"><span>{label}</span><b>{Number(value).toLocaleString('tr-TR')}</b></div>)}</div>;
}
