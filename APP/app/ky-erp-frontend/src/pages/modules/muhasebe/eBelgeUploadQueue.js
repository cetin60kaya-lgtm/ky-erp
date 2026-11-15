export const EBELGE_BATCH_FILES=8;
export const EBELGE_BATCH_BYTES=40*1024*1024;
export const eBelgeFileKey=file=>[file.name,file.size,file.lastModified].join("|");
export function splitEBelgeUploadQueue(files){
  const batches=[];let batch=[],bytes=0;
  for(const file of Array.from(files||[])){
    if(batch.length&&(batch.length>=EBELGE_BATCH_FILES||bytes+file.size>EBELGE_BATCH_BYTES)){
      batches.push(batch);batch=[];bytes=0;
    }
    batch.push(file);bytes+=file.size;
  }
  if(batch.length)batches.push(batch);
  return batches;
}
