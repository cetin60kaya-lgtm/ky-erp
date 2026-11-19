// Keep each Worker request small; a user click may safely continue several
// stored Gmail pages in sequence. Never confuse "messages processed" with
// newly imported unique emails or 15/15 completed folders.
export const GMAIL_SYNC_STEPS_PER_CLICK = 8;

const nonnegative=(value)=>Math.max(0,Number(value)||0);

export async function runGmailSyncBatch({syncStep,onProgress=()=>{},shouldStop=()=>false,maxSteps=GMAIL_SYNC_STEPS_PER_CLICK}) {
  if(typeof syncStep!=="function")throw new TypeError("syncStep function is required");
  const max=Math.max(1,Math.min(GMAIL_SYNC_STEPS_PER_CLICK,Math.trunc(Number(maxSteps)||1)));
  let steps=0,processed=0,completedFolders=0,totalFolders=0,lastFolder="";
  let reason="limit",partial=true;
  for(let i=0;i<max;i++){
    if(shouldStop()){reason="cancelled";break;}
    const response=await syncStep();
    steps++;
    processed+=nonnegative(response?.total);
    completedFolders=nonnegative(response?.completedFolders);
    totalFolders=nonnegative(response?.totalFolders);
    const folders=Array.isArray(response?.folders)?response.folders:[];
    lastFolder=String(folders[0]?.name||folders[0]?.folder||lastFolder);
    partial=response?.partial===true;
    onProgress({steps,maxSteps:max,processed,completedFolders,totalFolders,lastFolder,partial});
    if(!partial){reason="completed";break;}
    if(folders.some(folder=>folder?.ok===false||nonnegative(folder?.failed)>0)){reason="folder-error";break;}
    if(!folders.length){reason="no-folders";break;}
    // Empty pages can legitimately complete an empty label, but a page with
    // no imported messages AND no completion is not proof of forward progress.
    if(nonnegative(response?.total)===0&&!folders.some(folder=>folder?.completed===true)){
      reason="no-progress";break;
    }
  }
  return {steps,maxSteps:max,processed,completedFolders,totalFolders,lastFolder,partial,reason};
}
