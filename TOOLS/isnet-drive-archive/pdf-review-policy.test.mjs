import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const basedir=dirname(fileURLToPath(import.meta.url));

test("PDF uyuşmazlığı: mevcut XML/PDF korunur, alternatif tek saklanır, inceleme kararı kalıcıdır",()=>{
  const root=mkdtempSync(join(tmpdir(),"KY-ISNET-QA-PDF-CONFLICT-"));
  try{
    const job=spawnSync(process.execPath,[join(basedir,"isnet-drive-yerel.mjs")],{
      cwd:basedir,env:{...process.env,KY_ISNET_SELFTEST:"1",KY_ISNET_ARCHIVE_ROOT:root},
      encoding:"utf8",timeout:25000,windowsHide:true,
    });
    assert.equal(job.status,0,"Arşivleme regresyonu başarısız; process exit="+job.status);
    assert.match(job.stdout,/KY_ISNET_LOCAL_ARCHIVE_QA_PASS: ORIGINALS_DEDUP_PDF_VERSIONS_REVIEW/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
