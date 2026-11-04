#!/usr/bin/env node
/** On-demand Google Drive PSD preview queue consumer. No Photoshop, no permanent PSD copies. */
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { renderPsdComposite } from './psd-composite-preview.mjs';

const API = String(process.env.KYERP_API_URL || 'https://api.kyerp.net').replace(/\/+$/, '');
const KEY = String(process.env.KYERP_AGENT_KEY || '').trim();
const COMPANY = String(process.env.KYERP_MAIN_COMPANY_SLUG || 'mecit-hakan').trim();
const DEVICE = String(process.env.KYERP_DEVICE_NAME || os.hostname()).trim();
const MAX_SOURCE = 1024 * 1024 * 1024;
const MAX_PREVIEW = 12_000_000;
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
if (!KEY) throw new Error('KYERP_AGENT_KEY tanımlı olmalı.');
const headers = { 'X-KYERP-Agent-Key': KEY, 'X-KYERP-Tenant-Slug': COMPANY };

async function post(action, payload = {}) {
  const response = await fetch(API + '/api/auth/file-hub-agent/psd-preview/' + action, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainCompanySlug: COMPANY, deviceName: DEVICE, ...payload }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result?.error?.code || 'HTTP_' + response.status);
  return result.data || {};
}

async function processJob(job) {
  const assetId = String(job.fileAssetId || '');
  if (!/^[a-z0-9-]{16,}$/i.test(assetId)) throw new Error('INVALID_ASSET_ID');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kyerp-psd-preview-'));
  try {
    const source = path.join(dir, 'source.psd');
    const response = await fetch(API + '/api/auth/file-hub-agent/psd-preview/source/' + encodeURIComponent(assetId), {
      headers, signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error('SOURCE_HTTP_' + response.status);
    const sizeHint = Number(response.headers.get('content-length') || 0);
    if (sizeHint > MAX_SOURCE) throw new Error('SOURCE_TOO_LARGE');
    let bytes = 0;
    const limiter = new Transform({ transform(chunk, _enc, callback) {
      bytes += chunk.length;
      callback(bytes > MAX_SOURCE ? new Error('SOURCE_TOO_LARGE') : null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(source, { flags: 'wx', mode: 0o600 }));
    let preview = null;
    for (const maxEdge of [2400, 1600, 1000]) {
      preview = await renderPsdComposite(source, { maxEdge });
      if (preview.png.length <= MAX_PREVIEW) break;
    }
    if (!preview || preview.png.length > MAX_PREVIEW) throw new Error('PREVIEW_TOO_LARGE');
    const form = new FormData();
    form.set('mainCompanySlug', COMPANY);
    form.set('deviceName', DEVICE);
    form.set('fileAssetId', assetId);
    form.set('file', new Blob([preview.png], { type: 'image/png' }), 'full-canvas.png');
    const upload = await fetch(API + '/api/auth/file-hub-agent/preview', {
      method: 'POST', headers, body: form, signal: AbortSignal.timeout(120_000),
    });
    const result = await upload.json().catch(() => ({}));
    if (!upload.ok || result.ok === false) throw new Error(result?.error?.code || 'UPLOAD_HTTP_' + upload.status);
    console.log('[PSD PREVIEW] ' + assetId + ' ' + preview.width + 'x' + preview.height + ' READY');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

while (true) {
  let retry = 12_000;
  try {
    const { job } = await post('claim');
    if (job?.fileAssetId) {
      retry = 1_000;
      try { await processJob(job); }
      catch (error) {
        const code = String(error?.message || 'PREVIEW_FAILED').toUpperCase();
        const safeCode = /^(PSD_[A-Z0-9_]+|NOT_PSD_OR_PSB|SOURCE_[A-Z0-9_]+|PREVIEW_TOO_LARGE|INVALID_ASSET_ID|UPLOAD_HTTP_[0-9]+)$/.test(code) ? code : 'PREVIEW_FAILED';
        console.error('[PSD PREVIEW FAIL] ' + job.fileAssetId + ' ' + safeCode);
        await post('fail', { fileAssetId: job.fileAssetId, code: safeCode }).catch(() => {});
      }
    }
  } catch (error) { console.error('[PSD QUEUE] ' + String(error.message || 'unavailable').slice(0, 80)); retry = 30_000; }
  await nap(retry);
}
