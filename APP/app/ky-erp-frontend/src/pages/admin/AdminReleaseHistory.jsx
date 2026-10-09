import {useCallback,useEffect,useMemo,useState} from "react";
import {
  GITHUB_API,GITHUB_SITE,KY_BRANCH,releaseKind,verifiedRelease,
  firstVerifiedRun,changeStatus,moduleOf,localStamp,shortSha
} from "../../services/releaseHistory";
import "./AdminReleaseHistory.css";

const FILTERS=["Tümü","İK","PDKS","Muhasebe","İmalat","Boyahane","Desen","Güvenlik","Bulut","Genel"];
const STORE_KEY="kyerp-release-history-cache-v1";
const TTL=120000;
async function github(path) {
  const result=await fetch(GITHUB_API+path,{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});
  if(!result.ok)throw new Error(result.status===403?"GitHub okuma limiti doldu; birkaç dakika sonra yenileyin.":"GitHub yanıtı alınamadı (HTTP "+result.status+").");
  return result.json();
}
function Status({value}){return <span className={"krh-status krh-"+(value?.level||"unknown")}>{value?.label||"Durum bilinmiyor"}</span>;}
function Href({url,children}){return <a href={url} target="_blank" rel="noopener noreferrer">{children}</a>;}
function fromStorage(){
  try{const cache=JSON.parse(sessionStorage.getItem(STORE_KEY)||"null");return cache&&Date.now()-cache.savedAt<TTL?cache.payload:null;}
  catch{return null;}
}
async function readLive(){
  const [workflow,prs]=await Promise.all([
    github("/actions/runs?branch="+encodeURIComponent(KY_BRANCH)+"&per_page=100"),
    github("/pulls?state=all&sort=updated&direction=desc&per_page=100")
  ]);
  const runs=(workflow.workflow_runs||[]).filter(r=>releaseKind(r)!=="OTHER");
  const latestWeb=firstVerifiedRun(runs,"FRONTEND");
  const latestWorker=firstVerifiedRun(runs,"WORKER");
  async function commitsAt(run){
    if(!run?.head_sha)return {ready:false,shas:[]};
    const rows=await github("/commits?sha="+encodeURIComponent(run.head_sha)+"&per_page=100");
    return {ready:true,shas:rows.map(c=>c.sha),releaseSha:run.head_sha,limited:rows.length===100};
  }
  const ancestry=await Promise.allSettled([commitsAt(latestWeb),commitsAt(latestWorker)]);
  const proofs=ancestry.map(x=>x.status==="fulfilled"?x.value:{ready:false,shas:[],error:String(x.reason)});
  return {
    pulls:prs,runs,frontRun:latestWeb,workerRun:latestWorker,
    frontProof:proofs[0],workerProof:proofs[1],
    capturedAt:new Date().toISOString(),hasMore:prs.length===100
  };
}
function statusFor(pr,live){
  const front={ready:live.frontProof?.ready,shas:new Set(live.frontProof?.shas||[])};
  const worker={ready:live.workerProof?.ready,shas:new Set(live.workerProof?.shas||[])};
  return changeStatus(pr,front,worker);
}
export default function AdminReleaseHistory(){
  const [data,setData]=useState(()=>fromStorage());
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [module,setModule]=useState("Tümü");
  const [view,setView]=useState("changes");
  const [page,setPage]=useState(1);
  const [moreBusy,setMoreBusy]=useState(false);
  const [moreError,setMoreError]=useState("");
  const load=useCallback(async(force=false)=>{
    if(!force){const cached=fromStorage();if(cached){setData(cached);return;}}
    setLoading(true);setError("");
    try{
      const next=await readLive();
      setData(next);setPage(1);
      try{sessionStorage.setItem(STORE_KEY,JSON.stringify({savedAt:Date.now(),payload:next}));}catch{/* storage optional */}
    }catch(e){setError(String(e?.message||e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{if(!data)void load();},[data,load]);
  const more=async()=>{
    if(!data||!data.hasMore||moreBusy)return;
    setMoreBusy(true);setMoreError("");
    try{
      const nextPage=page+1;
      const rows=await github("/pulls?state=all&sort=updated&direction=desc&per_page=100&page="+nextPage);
      setPage(nextPage);
      setData(old=>({...old,pulls:[...old.pulls,...rows],hasMore:rows.length===100}));
    }catch(e){setMoreError(String(e?.message||e));}
    finally{setMoreBusy(false);}
  };
  const records=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase("tr-TR");
    return (data?.pulls||[]).filter(pr=>{
      const txt=(pr.title||"")+" "+(pr.body||"")+" "+String(pr.number)+" "+(pr.head?.ref||"");
      return (module==="Tümü"||moduleOf(txt)===module)&&(!q||txt.toLocaleLowerCase("tr-TR").includes(q));
    });
  },[data,query,module]);
  const counts=useMemo(()=>({
    merged:(data?.pulls||[]).filter(x=>x.merged_at).length,
    open:(data?.pulls||[]).filter(x=>!x.merged_at&&x.state==="open").length,
    failed:(data?.runs||[]).filter(x=>x.conclusion==="failure").length
  }),[data]);
  return <section className="krh-page">
    <header className="krh-hero">
      <div>
        <small>PLATFORM YÖNETİMİ / CANLI YAYIN KANITI</small>
        <h2>Güncelleme ve Yayın Geçmişi</h2>
        <p>GitHub'a yazılmak, test edilmek ve canlıya alınmak ayrı kaydedilir. Kaynak doğrudan GitHub iş ve yayın geçmişidir.</p>
      </div>
      <button type="button" disabled={loading} onClick={()=>load(true)}>{loading?"Yükleniyor...":"GitHub'dan Yenile"}</button>
    </header>
    {error?<div className="krh-alert" role="alert">{error} {data?"Önceki doğrulanmış kayıtlar gösteriliyor.":""}</div>:null}
    <div className="krh-summary">
      <div><small>Arayüz / Pages</small><strong>{data?.frontRun?"Canlı kanıtlı":"Kanıt bulunamadı"}</strong><span>{data?.frontRun?localStamp(data.frontRun.updated_at||data.frontRun.created_at):"—"}</span><code>{shortSha(data?.frontRun?.head_sha)}</code></div>
      <div><small>API / Worker</small><strong>{data?.workerRun?"Canlı kanıtlı":"Kanıt bulunamadı"}</strong><span>{data?.workerRun?localStamp(data.workerRun.updated_at||data.workerRun.created_at):"—"}</span><code>{shortSha(data?.workerRun?.head_sha)}</code></div>
      <div><small>Birleşen iş (yüklenen)</small><strong>{counts.merged}</strong><span>{counts.open} açık / taslak</span></div>
      <div><small>Başarısız yayın (yüklenen)</small><strong>{counts.failed}</strong><span>Hatalar geçmişte saklanır</span></div>
    </div>
    {data?<p className="krh-meta">Kaynak: <Href url={GITHUB_SITE}>GitHub canonical repo</Href> · Dal: <code>{KY_BRANCH}</code> · Son okuma: {localStamp(data.capturedAt)}. {(!data.frontProof?.ready||!data.workerProof?.ready)?"Bazı commit eşleşmeleri doğrulanamadı; canlı etiketi verilmedi.":""}</p>:null}
    <nav className="krh-switch" aria-label="Güncelleme kayıt türü">
      <button className={view==="changes"?"active":""} onClick={()=>setView("changes")} type="button">Değişiklikler / PR</button>
      <button className={view==="releases"?"active":""} onClick={()=>setView("releases")} type="button">Canlı Yayınlar / Hatalar</button>
    </nav>
    {view==="changes"?<>
      <div className="krh-filters">
        <input aria-label="İş, hata veya PR numarası ara" placeholder="İş, hata veya PR numarası ara..." value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="Modül filtrele" value={module} onChange={e=>setModule(e.target.value)}>{FILTERS.map(v=><option key={v} value={v}>{v}</option>)}</select>
        <span>{records.length} kayıt</span>
      </div>
      <div className="krh-rows">
      {records.map(pr=>{
        const state=statusFor(pr,data);
        return <article className="krh-record" key={pr.number}>
          <div className="krh-record-main">
            <div className="krh-title"><span className="krh-module">{moduleOf(pr.title)}</span><strong>#{pr.number} · {pr.title}</strong></div>
            <div className="krh-details"><span>İşlem: {localStamp(pr.merged_at||pr.updated_at)}</span><span>Dal <code>{pr.head?.ref||"-"}</code></span><span>Birleşim <code>{shortSha(pr.merge_commit_sha)}</code></span></div>
            {pr.body?<p>{pr.body.replace(/[#*_]/g,"").slice(0,230)}</p>:null}
          </div>
          <div className="krh-right"><Status value={state}/><Href url={pr.html_url}>İş / test kanıtı ↗</Href></div>
        </article>;
      })}
      {!loading&&!records.length?<div className="krh-empty">{data?"Aramaya uygun kayıt yok.":"GitHub kayıtları yükleniyor..."}</div>:null}
      </div>
      {data?.hasMore?<button type="button" className="krh-more" disabled={moreBusy} onClick={more}>{moreBusy?"Yükleniyor...":"Daha eski GitHub işlerini yükle"}</button>:null}
      {moreError?<div role="alert" className="krh-alert">{moreError}</div>:null}
    </>:<div className="krh-rows">
      {(data?.runs||[]).map(run=>{
        const kind=releaseKind(run);
        const passed=verifiedRelease(run);
        const status=run.status!=="completed"?{level:"open",label:"Çalışıyor"}:passed?{level:"live",label:"Canlı doğrulaması başarılı"}:{level:"failed",label:run.conclusion==="failure"?"Yayın başarısız":run.conclusion==="cancelled"?"İptal edildi":"Başarılı canlı kanıtı yok"};
        return <article key={run.id} className="krh-record">
          <div className="krh-record-main">
            <div className="krh-title"><span className="krh-module">{kind==="FRONTEND"?"Arayüz":kind==="WORKER"?"API":"Arayüz + API"}</span><strong>{run.name}</strong></div>
            <div className="krh-details"><span>{localStamp(run.updated_at||run.created_at)}</span><span>Dal <code>{run.head_branch||KY_BRANCH}</code></span><span>Commit <code>{shortSha(run.head_sha)}</code></span><span>Run #{run.run_number}</span></div>
          </div><div className="krh-right"><Status value={status}/><Href url={run.html_url}>Yayın logu ↗</Href></div>
        </article>;
      })}
      {!data?.runs?.length?<div className="krh-empty">Yayın kaydı bulunamadı.</div>:null}
    </div>}
    <p className="krh-foot">Canlı durumu yalnız başarılı production yayın işlemi ve ilgili commitin o sürümde bulunduğu kanıtlanırsa gösterilir. Son 100 commit dışında kalan eski işler için canlılık bilinmiyor denir. Bu ekran canlı iş verisini değiştirmez.</p>
  </section>;
}
