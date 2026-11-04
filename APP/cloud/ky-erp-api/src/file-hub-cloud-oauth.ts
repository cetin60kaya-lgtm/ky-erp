// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { canManageOwnCompanyStorage } from "./file-hub-company-owner-access";
import { syncFileHubDesignModel } from "./file-hub-design-sync";
import { selectCloudModelBinding, canUseModelImageFolder, classifyDesignSourcePath, matchExistingDesignModelNames, normalizeDesignModelKey } from "./file-hub-cloud-model-binding";
import { prioritizeGoogleScanQueue } from "./file-hub-google-priority";

type Bindings = Cloudflare.Env & {
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  MICROSOFT_GRAPH_CLIENT_ID?: string;
  MICROSOFT_GRAPH_CLIENT_SECRET?: string;
  FILE_HUB_OAUTH_KEY?: string;
  DROPBOX_CLIENT_ID?: string;
  DROPBOX_CLIENT_SECRET?: string;
};
type AppEnv = { Bindings: Bindings; Variables: { requestId: string } };
type Row = Record<string, any>;

const now = () => new Date().toISOString();
const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const json = (value: unknown): Row => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  try { const parsed = JSON.parse(text(value) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
};
const err = (code: string, message: string, details?: unknown) => ({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } });
const b64url = (bytes: Uint8Array) => {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const unb64url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const raw = atob(normalized);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};
const providerFamily = (provider: unknown) => upper(provider) === "GOOGLE_DRIVE" ? "GOOGLE" : ["ONEDRIVE", "SHAREPOINT"].includes(upper(provider)) ? "MICROSOFT" : upper(provider) === "DROPBOX" ? "DROPBOX" : "";
const appBaseUrl = "https://kyerp.net";
const apiBaseUrl = "https://api.kyerp.net";
const sanitizeReturnPath = (value: unknown) => {
  const path = text(value);
  return /^\/depolama\/[a-z0-9-]+(?:\?[^#]*)?$/i.test(path) ? path : "/depolama/depolama-kaynaklar";
};

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try { const body = await c.req.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {}; }
  catch { return {}; }
}
async function currentUser(c: Context<AppEnv>) { return await getAuthenticatedUser(c) as Row | null; }
function companySlug(c: Context<AppEnv>, body: Row = {}) {
  return text(body.mainCompanySlug || body.main_company_slug || c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug"));
}
async function assertCompanyOwner(c: Context<AppEnv>, body: Row = {}) {
  const user = await currentUser(c);
  if (!user || !["COMPANY_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(upper(user.role))) {
    return { error: c.json(err("COMPANY_OWNER_ONLY", "Bu işlemi yalnız firma sahibi veya kendi firmasında uygulama sahibi yönetebilir."), 403) };
  }
  const slug = companySlug(c, body);
  if (!slug) return { error: c.json(err("TENANT_REQUIRED", "Aktif firma seçimi gerekli."), 422) };
  if (!canManageOwnCompanyStorage(user, slug)) return { error: c.json(err("TENANT_FORBIDDEN", "Başka firmanın depolama bağlantısını yönetemezsiniz."), 403) };
  return { user, slug };
}

async function cryptoKey(c: Context<AppEnv>) {
  const secret = text(c.env.FILE_HUB_OAUTH_KEY);
  if (!secret) throw Object.assign(new Error("FILE_HUB_OAUTH_KEY tanımlı değil."), { code: "OAUTH_KEY_MISSING" });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(c: Context<AppEnv>, value: unknown) {
  const plain = text(value);
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(c), new TextEncoder().encode(plain));
  return `${b64url(iv)}.${b64url(new Uint8Array(cipher))}`;
}
async function decrypt(c: Context<AppEnv>, value: unknown) {
  const source = text(value);
  if (!source) return "";
  const [ivPart, cipherPart] = source.split(".");
  if (!ivPart || !cipherPart) throw new Error("Şifreli token biçimi geçersiz.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(ivPart) }, await cryptoKey(c), unb64url(cipherPart));
  return new TextDecoder().decode(plain);
}

function providerConfig(c: Context<AppEnv>, providerType: unknown) {
  const provider = upper(providerType);
  if (provider === "GOOGLE_DRIVE") {
    return {
      provider,
      family: "GOOGLE",
      clientId: text(c.env.GOOGLE_DRIVE_CLIENT_ID),
      clientSecret: text(c.env.GOOGLE_DRIVE_CLIENT_SECRET),
      redirectUri: `${apiBaseUrl}/api/auth/file-hub/oauth/google/callback`,
      scope: "openid email profile https://www.googleapis.com/auth/drive",
    };
  }
  if (["ONEDRIVE", "SHAREPOINT"].includes(provider)) {
    return {
      provider,
      family: "MICROSOFT",
      clientId: text(c.env.MICROSOFT_GRAPH_CLIENT_ID),
      clientSecret: text(c.env.MICROSOFT_GRAPH_CLIENT_SECRET),
      redirectUri: `${apiBaseUrl}/api/auth/file-hub/oauth/microsoft/callback`,
      scope: "openid profile email offline_access User.Read Files.ReadWrite.All Sites.ReadWrite.All",
    };
  }
  if (provider === "DROPBOX") return {provider,family:"DROPBOX",clientId:text(c.env.DROPBOX_CLIENT_ID),clientSecret:text(c.env.DROPBOX_CLIENT_SECRET),redirectUri:`${apiBaseUrl}/api/auth/file-hub/oauth/dropbox/callback`,scope:"account_info.read files.metadata.read files.content.read files.content.write"};
  return { provider, family: "", clientId: "", clientSecret: "", redirectUri: "", scope: "" };
}
function providerReady(c: Context<AppEnv>, provider: string) {
  const cfg = providerConfig(c, provider);
  return Boolean(cfg.family && cfg.clientId && cfg.clientSecret && text(c.env.FILE_HUB_OAUTH_KEY));
}
function stateToken() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }

async function tokenPost(url: string, values: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(values),
  });
  const payload = await response.json().catch(() => ({})) as Row;
  if (!response.ok || !text(payload.access_token)) {
    // Google/Microsoft/Dropbox'in serbest metin hata aciklamalarini URL, frontend
    // veya audit kaydina tasima. Yalniz sabit, gizli veri icermeyen siniflar.
    const providerError = text(payload.error).toLowerCase();
    const safeCodes: Record<string, string> = {
      invalid_client: "OAUTH_TOKEN_INVALID_CLIENT",
      invalid_grant: "OAUTH_TOKEN_INVALID_GRANT",
      redirect_uri_mismatch: "OAUTH_TOKEN_REDIRECT_MISMATCH",
      unauthorized_client: "OAUTH_TOKEN_UNAUTHORIZED_CLIENT",
      invalid_request: "OAUTH_TOKEN_INVALID_REQUEST",
    };
    const code = safeCodes[providerError] || (response.ok ? "OAUTH_TOKEN_NO_ACCESS" : "OAUTH_TOKEN_FAILED");
    throw Object.assign(new Error("OAuth token alisverisi reddedildi."), { code });
  }
  return payload;
}
async function exchangeCode(c: Context<AppEnv>, providerType: string, code: string) {
  const cfg = providerConfig(c, providerType);
  if (cfg.family === "DROPBOX") return tokenPost("https://api.dropboxapi.com/oauth2/token",{code,client_id:cfg.clientId,client_secret:cfg.clientSecret,redirect_uri:cfg.redirectUri,grant_type:"authorization_code"});
  if (cfg.family === "GOOGLE") {
    return tokenPost("https://oauth2.googleapis.com/token", {
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    });
  }
  return tokenPost("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    scope: cfg.scope,
  });
}
async function refreshProviderToken(c: Context<AppEnv>, account: Row) {
  const refresh = await decrypt(c, account.refresh_token_cipher);
  if (!refresh) throw Object.assign(new Error("Bulut bağlantısının yenileme anahtarı bulunamadı; hesabı yeniden bağlayın."), { code: "REFRESH_TOKEN_MISSING" });
  const cfg = providerConfig(c, account.provider_type);
  const payload = cfg.family === "GOOGLE"
    ? await tokenPost("https://oauth2.googleapis.com/token", { refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" })
    : cfg.family === "DROPBOX"
    ? await tokenPost("https://api.dropboxapi.com/oauth2/token", { refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" })
    : await tokenPost("https://login.microsoftonline.com/common/oauth2/v2.0/token", { refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token", scope: cfg.scope });
  const accessCipher = await encrypt(c, payload.access_token);
  const refreshCipher = text(payload.refresh_token) ? await encrypt(c, payload.refresh_token) : text(account.refresh_token_cipher);
  const expiresAt = new Date(Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000).toISOString();
  await c.env.DB.prepare(`UPDATE file_hub_oauth_accounts SET access_token_cipher=?,refresh_token_cipher=?,token_expires_at=?,scopes=?,updated_at=? WHERE id=?`)
    .bind(accessCipher, refreshCipher || null, expiresAt, text(payload.scope || account.scopes) || null, now(), account.id).run();
  return { ...account, access_token_cipher: accessCipher, refresh_token_cipher: refreshCipher, token_expires_at: expiresAt, scopes: text(payload.scope || account.scopes) };
}
async function usableAccount(c: Context<AppEnv>, slug: string, accountId: string) {
  let account = await c.env.DB.prepare(`SELECT * FROM file_hub_oauth_accounts WHERE id=? AND main_company_slug=? LIMIT 1`).bind(accountId, slug).first<Row>();
  if (!account) throw Object.assign(new Error("Bulut hesabı bulunamadı."), { code: "ACCOUNT_NOT_FOUND" });
  const expiry = Date.parse(text(account.token_expires_at));
  if (!Number.isFinite(expiry) || expiry < Date.now() + 120000) account = await refreshProviderToken(c, account);
  return { account, accessToken: await decrypt(c, account.access_token_cipher) };
}
async function providerJson(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as Row;
  if (!response.ok) throw Object.assign(new Error(text(payload?.error?.message || payload?.error_description || payload?.error) || `Bulut sağlayıcısı HTTP ${response.status} döndürdü.`), { code: "PROVIDER_API_FAILED", status: response.status });
  return payload;
}

async function accountIdentity(c: Context<AppEnv>, providerType: string, accessToken: string) {
  if (providerFamily(providerType) === "DROPBOX") {
    const profile=await dropboxRpc(accessToken,"users/get_current_account",null);
    return {id:text(profile.account_id),email:text(profile.email),name:text(profile.name?.display_name||profile.email),metadata:{accountType:text(profile.account_type?.[".tag"])}};
  }
  if (providerFamily(providerType) === "GOOGLE") {
    const profile = await providerJson("https://www.googleapis.com/oauth2/v3/userinfo", accessToken);
    return { id: text(profile.sub || profile.email), email: text(profile.email), name: text(profile.name || profile.email), metadata: { picture: text(profile.picture) } };
  }
  const profile = await providerJson("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", accessToken);
  return { id: text(profile.id || profile.userPrincipalName), email: text(profile.mail || profile.userPrincipalName), name: text(profile.displayName || profile.mail || profile.userPrincipalName), metadata: {} };
}

async function listGoogleChildren(token: string, parentId: string, includeFiles = false) {
  const rows: Row[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${String(parentId || "root").replace(/'/g, "\\'")}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,parents,modifiedTime,size,webViewLink,md5Checksum)",
      orderBy: "folder,name",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await providerJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
    rows.push(...(Array.isArray(payload.files) ? payload.files : []));
    pageToken = text(payload.nextPageToken);
  } while (pageToken && rows.length < 5000);
  return rows.filter((row) => includeFiles || row.mimeType === "application/vnd.google-apps.folder").map((row) => ({
    id: text(row.id), name: text(row.name), isFolder: row.mimeType === "application/vnd.google-apps.folder", mimeType: text(row.mimeType), size: Number(row.size || 0), modifiedAt: text(row.modifiedTime), webUrl: text(row.webViewLink), checksum: text(row.md5Checksum), raw: row,
  }));
}

// Dropbox, File Hub'un opsiyonel 3. bulut sağlayıcısıdır. Ana servis olarak zorlanmaz.
// Bu adapter yalnız izin verilmiş Dropbox OAuth tokenı ile API v2 RPC/content çağrıları yapar.
async function dropboxRpc(token:string,route:string,payload:Row|null):Promise<Row>{
  const response=await fetch(`https://api.dropboxapi.com/2/${route}`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload??null)});
  const result=await response.json().catch(()=>({})) as Row;
  if(!response.ok)throw Object.assign(new Error(text(result.error_summary||result.error_description||result.error)||`Dropbox API HTTP ${response.status}`),{code:"DROPBOX_API_FAILED",status:response.status});
  return result;
}
function dropboxRootPath(value:unknown):string {
  const s=text(value);
  if(!s||s==="root")return "";
  if(s.startsWith("id:")||s.startsWith("/"))return s;
  throw Object.assign(new Error("Dropbox klasör kimliği geçersiz."),{code:"DROPBOX_PATH_INVALID",status:422});
}
async function listDropboxChildren(token:string,parentId:string,includeFiles=false){
  const rows:Row[]=[];
  let response=await dropboxRpc(token,"files/list_folder",{path:dropboxRootPath(parentId),recursive:false,include_deleted:false,limit:1000});
  while(true){
    rows.push(...(Array.isArray(response.entries)?response.entries:[]));
    if(!response.has_more)break;
    if(rows.length>=5000)throw Object.assign(new Error("Dropbox klasöründe 5000+ öğe bulundu. Tarama sınırına ulaşıldı; veri tam değil."),{code:"DROPBOX_LIST_LIMIT"});
    response=await dropboxRpc(token,"files/list_folder/continue",{cursor:text(response.cursor)});
  }
  return rows.filter(row=>includeFiles||row[".tag"]==="folder").map(row=>({
    id:text(row.id),name:text(row.name),isFolder:row[".tag"]==="folder",
    mimeType:"",size:Number(row.size||0),modifiedAt:text(row.server_modified||row.client_modified),
    webUrl:"",checksum:text(row.content_hash),raw:row,
  }));
}
async function dropboxArchivePath(token:string,rootId:string,folders:string[],fileName:string){
  const value=dropboxRootPath(rootId);
  const root=value&&!value.startsWith("/")?text((await dropboxRpc(token,"files/get_metadata",{path:value})).path_display):value;
  let current=root.replace(/\/$/,"");
  for(const part of folders){
    const clean=text(part);
    if(!clean||clean==="."||clean===".."||/[\\/\x00-\x1f]/.test(clean))throw Object.assign(new Error("Dropbox alt klasörü geçersiz."),{code:"DROPBOX_PATH_INVALID"});
    current+="/"+clean;
    try{await dropboxRpc(token,"files/create_folder_v2",{path:current,autorename:false})}
    catch(e:any){
      if(Number(e.status)!==409)throw e;
      const existing=await dropboxRpc(token,"files/get_metadata",{path:current});
      if(existing[".tag"]!=="folder")throw Object.assign(new Error("Dropbox hedef adında klasör yerine dosya var."),{code:"DROPBOX_FOLDER_CONFLICT"});
    }
  }
  if(!fileName||fileName==="."||fileName===".."||/[\\/\x00-\x1f]/.test(fileName))throw Object.assign(new Error("Dropbox dosya adı geçersiz."),{code:"DROPBOX_PATH_INVALID"});
  return current+"/"+fileName;
}
async function dropboxArchiveUpload(token:string,path:string,bytes:ArrayBuffer){
  if(bytes.byteLength>150*1024*1024)throw Object.assign(new Error("Dropbox bu yüklemede 150 MiB üstünü desteklemiyor; büyük dosya için yükleme oturumu gerekir."),{code:"DROPBOX_LARGE_UPLOAD_UNSUPPORTED",status:413});
  const response=await fetch("https://content.dropboxapi.com/2/files/upload",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/octet-stream","Dropbox-API-Arg":JSON.stringify({path,mode:"add",autorename:true,mute:true})},body:bytes});
  const data=await response.json().catch(()=>({})) as Row;
  if(!response.ok)throw Object.assign(new Error(text(data.error_summary)||`Dropbox yükleme HTTP ${response.status}`),{code:"DROPBOX_UPLOAD_FAILED",status:response.status});
  return {id:text(data.id),name:text(data.name),webUrl:"",provider:"DROPBOX"};
}

async function graphPaged(url: string, token: string) {
  const rows: Row[] = [];
  let next = url;
  while (next && rows.length < 5000) {
    const payload = await providerJson(next, token);
    rows.push(...(Array.isArray(payload.value) ? payload.value : []));
    next = text(payload["@odata.nextLink"]);
  }
  return rows;
}
async function listMicrosoftChildren(token: string, parentId: string, driveId = "", includeFiles = false) {
  const select = "$select=id,name,size,lastModifiedDateTime,webUrl,folder,file,parentReference,eTag,cTag";
  let url = "";
  if (driveId) url = parentId && parentId !== "root"
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?${select}`
    : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children?${select}`;
  else url = parentId && parentId !== "root"
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children?${select}`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children?${select}`;
  const rows = await graphPaged(url, token);
  return rows.filter((row) => includeFiles || Boolean(row.folder)).map((row) => ({
    id: text(row.id), name: text(row.name), isFolder: Boolean(row.folder), mimeType: text(row.file?.mimeType), size: Number(row.size || 0), modifiedAt: text(row.lastModifiedDateTime), webUrl: text(row.webUrl), checksum: text(row.eTag || row.cTag), raw: row,
  }));
}

async function connectionAccount(c: Context<AppEnv>, slug: string, connectionId: string) {
  const link = await c.env.DB.prepare(`SELECT x.*,c.provider_type,c.remote_root_id,c.remote_root_name,c.name connection_name,c.is_active,c.metadata connection_metadata,a.account_email,a.display_name,a.provider_type account_provider,a.access_token_cipher,a.refresh_token_cipher,a.token_expires_at,a.scopes FROM file_hub_cloud_connection_accounts x JOIN file_hub_connections c ON c.id=x.connection_id AND c.main_company_slug=x.main_company_slug JOIN file_hub_oauth_accounts a ON a.id=x.oauth_account_id AND a.main_company_slug=x.main_company_slug WHERE x.connection_id=? AND x.main_company_slug=? LIMIT 1`).bind(connectionId, slug).first<Row>();
  if (!link) throw Object.assign(new Error("Bulut depolama bağlantısı bulunamadı."), { code: "CLOUD_CONNECTION_NOT_FOUND" });
  const { account, accessToken } = await usableAccount(c, slug, text(link.oauth_account_id));
  return { link: { ...link, ...account }, accessToken };
}
async function upsertCloudFile(c: Context<AppEnv>, slug: string, connectionId: string, provider: string, item: Row, relativePath: string, seenAt: string) {
  let location = await c.env.DB.prepare(`SELECT l.*,a.id asset_id,a.file_name asset_file_name,a.mime_type asset_mime_type,a.size_bytes asset_size_bytes,a.status asset_status,a.metadata asset_metadata,(SELECT COUNT(*) FROM file_hub_relations r JOIN model_records m ON m.id=r.entity_id AND m.main_company_slug=r.main_company_slug WHERE r.main_company_slug=a.main_company_slug AND r.file_asset_id=a.id AND r.entity_type='MODEL') model_relation_count FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.provider_file_id=? LIMIT 1`).bind(slug, connectionId, text(item.id)).first<Row>();
  if (!location) location = await c.env.DB.prepare(`SELECT l.*,a.id asset_id,a.file_name asset_file_name,a.mime_type asset_mime_type,a.size_bytes asset_size_bytes,a.status asset_status,a.metadata asset_metadata,(SELECT COUNT(*) FROM file_hub_relations r JOIN model_records m ON m.id=r.entity_id AND m.main_company_slug=r.main_company_slug WHERE r.main_company_slug=a.main_company_slug AND r.file_asset_id=a.id AND r.entity_type='MODEL') model_relation_count FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.relative_path=? LIMIT 1`).bind(slug, connectionId, relativePath).first<Row>();
  const fileName = text(item.name) || "dosya";
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toUpperCase() : "";
  if (location) {
    const oldMeta=json(location.asset_metadata);
    const changed =
      text(location.asset_file_name)!==fileName ||
      text(location.asset_mime_type)!==text(item.mimeType) ||
      Number(location.asset_size_bytes||0)!==Number(item.size||0) ||
      text(location.provider_modified_at)!==text(item.modifiedAt) ||
      text(oldMeta.checksum)!==text(item.checksum) ||
      text(location.relative_path)!==relativePath ||
      upper(location.asset_status)!=="AVAILABLE" ||
      Number(location.is_available||0)!==1;
    if (changed) {
      // JPEG değiştiyse eski küçük önizlemeyi bir sonraki görüntülemede yeniden üret.
      const previewChanged = text(location.provider_modified_at) !== text(item.modifiedAt) ||
        text(oldMeta.checksum) !== text(item.checksum);
      await c.env.DB.prepare(`UPDATE file_hub_assets
          SET file_name=?,extension=?,mime_type=?,size_bytes=?,status='AVAILABLE',source_type='CLOUD_API',
              last_seen_at=?,updated_at=?,metadata=?,
              preview_status=CASE WHEN ?=1 THEN 'NONE' ELSE preview_status END,
              preview_storage_key=CASE WHEN ?=1 THEN NULL ELSE preview_storage_key END
          WHERE id=? AND main_company_slug=?`)
        .bind(fileName, extension || null, text(item.mimeType) || null, Number(item.size || 0), seenAt, seenAt, JSON.stringify({ provider, providerFileId: item.id, webUrl: item.webUrl || null, checksum: item.checksum || null }), previewChanged ? 1 : 0, previewChanged ? 1 : 0, location.asset_id, slug).run();
      await c.env.DB.prepare(`UPDATE file_hub_locations SET provider_file_id=?,relative_path=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?`)
        // Six SQL placeholders: provider id, path, modification time, last seen, updated, location id.
        .bind(text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, location.id).run();
    }
    return { assetId:text(location.asset_id), changed, needsModelSync:changed || Number(location.model_relation_count||0)===0 };
  }
  const assetId = crypto.randomUUID(), locationId = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO file_hub_assets(id,main_company_slug,logical_key,file_name,extension,mime_type,size_bytes,status,source_type,preview_status,metadata,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'AVAILABLE','CLOUD_API','NONE',?,?,?,?,?)`)
    .bind(assetId, slug, `${provider}:${connectionId}:${text(item.id)}`, fileName, extension || null, text(item.mimeType) || null, Number(item.size || 0), JSON.stringify({ provider, providerFileId: item.id, webUrl: item.webUrl || null, checksum: item.checksum || null }), seenAt, seenAt, seenAt, seenAt).run();
  await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'PRIMARY',1,?,?,?,?)`)
    .bind(locationId, slug, assetId, connectionId, text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, seenAt).run();
  return { assetId, changed:true, needsModelSync:true };
}


function designModelIdentity(value: unknown) {
  // Dosya adı aynen model adıdır. Yalnız uzantı kaldırılır; FINAL/SON gibi
  // modelin gerçek adının parçası olabilecek kelimeler silinmez.
  return text(value).replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
}
async function insertCloudDesignRelation(c:Context<AppEnv>,slug:string,fileAssetId:string,entityId:string,relationType:string,metadata:Row={}){
  if(!entityId) return;
  // Tek bir Drive asset + model + rol bağlantısı tekrar taramalarda çoğalmaz.
  const existing=await c.env.DB.prepare("SELECT id FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' AND entity_id=? AND relation_type=? LIMIT 1")
    .bind(slug,fileAssetId,entityId,relationType).first<Row>();
  if(existing?.id)return;
  const ts=now();
  await c.env.DB.prepare(`INSERT OR IGNORE INTO file_hub_relations(id,main_company_slug,file_asset_id,entity_type,entity_id,relation_type,is_primary,confidence,source,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,0,1,'CLOUD_RULE',?,?,?)`)
    .bind(crypto.randomUUID(),slug,fileAssetId,"MODEL",entityId,relationType,JSON.stringify(metadata),ts,ts).run();
}
// Tek HTTP/scheduled batch boyunca model adlarını yalnız bir defa oku.
const knownModelsByRequest=new WeakMap<object,Map<string,Promise<string[]>>>();
async function knownDesignModelNames(c:Context<AppEnv>,slug:string){
  let cache=knownModelsByRequest.get(c);
  if(!cache){cache=new Map();knownModelsByRequest.set(c,cache);}
  if(!cache.has(slug))cache.set(slug,(async()=>{
    const rows=await c.env.DB.prepare("SELECT model_name,model_code FROM model_records WHERE main_company_slug=? AND COALESCE(TRIM(deleted_at),'')='' LIMIT 10000")
      .bind(slug).all<Row>();
    return [...new Set((rows.results||[]).flatMap((row:Row)=>[text(row.model_name),text(row.model_code)]).filter(Boolean))];
  })());
  return await cache.get(slug)!;
}
async function syncCloudDesignBinding(c:Context<AppEnv>,slug:string,connectionId:string,fileAssetId:string,item:Row,relativePath:string,provider:string){
  const result=await c.env.DB.prepare(`SELECT module_code,purpose_code,root_path
      FROM file_hub_bindings
     WHERE main_company_slug=? AND storage_connection_id=? AND sync_enabled=1
       AND module_code IN ('DESEN','DTF','IMALAT')
     ORDER BY LENGTH(root_path) DESC`).bind(slug,connectionId).all<Row>();
  const binding=selectCloudModelBinding(result.results||[],relativePath,text(item.name));
  if(!binding)return null;
  const extension=upper(text(item.name).split(".").pop());
  const classified=classifyDesignSourcePath(binding,relativePath);
  const purposeCode=classified.isDtf && extension!=="PDF" ? "MODEL_SOURCE" : classified.purposeCode;
  const names=await knownDesignModelNames(c,slug);
  const sourceStem=designModelIdentity(item.name);
  const folderMatches=classified.folderModelName
    ? matchExistingDesignModelNames(names,classified.folderModelName).filter((name:string)=>normalizeDesignModelKey(name)===normalizeDesignModelKey(classified.folderModelName))
    : [];
  // Gelen kaynakta klasör adı baskın; yerleşim/giden üretimde yalnız bilinen
  // model adlarını ara. Tire ve A/B varyantlarının gerçek model adını bozma.
  const isRgb = purposeCode==="MODEL_IMAGE";
  const otherMatches=classified.folderModelName ? folderMatches
    : matchExistingDesignModelNames(names,sourceStem,{multi:purposeCode==="OUTGOING_DESIGN"});
  // RGB ana görselde dosya adı TAM model adı olmalıdır. K-B_BOY, ILAVE vb.
  // kısmi eşleşmeler ana görseli sessizce değiştiremez; inceleme bekler.
  const candidates=isRgb
    ? otherMatches.filter((name:string)=>normalizeDesignModelKey(name)===normalizeDesignModelKey(sourceStem))
    : otherMatches;
  const ambiguousRgb=isRgb && !candidates.length && otherMatches.length>0;
  // Yeni model oluşturabilen tek legacy akış: tam yeni RGB dosya adı.
  // PSD, PDF, AI, DTF ve kalıp dosyası tek başına yeni model oluşturamaz.
  const selected=candidates.length ? candidates
    : isRgb && !classified.folderModelName && !ambiguousRgb ? [sourceStem] : [];
  if(!selected.length)return null;
  let first:Row|null=null, matchedCount=0;
  for(const modelName of selected){
    const synced = await syncFileHubDesignModel(c,{
      slug,fileAssetId,modelName,purposeCode,isDtf:classified.isDtf,
      fileName:text(item.name),extension,mimeType:text(item.mimeType),sizeBytes:Number(item.size||0),
      sha256:text(item.checksum),relativePath,providerType:provider,storageConnectionId:connectionId,
    });
    if(!synced?.modelId)continue;
    await insertCloudDesignRelation(c,slug,fileAssetId,synced.modelId,classified.isDtf ? (extension==="PDF" ? "RIP_PDF" : "DTF_SOURCE") : purposeCode,
      {moduleCode:upper(binding.module_code),purposeCode,relativePath,provider,isDtf:classified.isDtf});
    matchedCount+=1;
    first ||= synced;
  }
  return first ? {...first,matchedCount} : null;
}


function archiveParts(relativePath: unknown, fallbackName: unknown) {
  const parts=text(relativePath).replace(/\\/g,"/").split("/").map(text).filter(Boolean);
  const fileName=parts.pop()||text(fallbackName)||"belge";
  return{folders:parts,fileName};
}
function googleQueryValue(value: unknown){return text(value).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function googleChildFolder(token:string,parentId:string,name:string){
  const q=`'${googleQueryValue(parentId||"root")}' in parents and name='${googleQueryValue(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params=new URLSearchParams({q,fields:"files(id,name)",pageSize:"10",spaces:"drive"});
  const payload=await providerJson(`https://www.googleapis.com/drive/v3/files?${params}`,token);
  const existing=(Array.isArray(payload.files)?payload.files:[]).find((row:Row)=>text(row.name)===name);
  if(existing?.id)return text(existing.id);
  const created=await providerJson("https://www.googleapis.com/drive/v3/files?fields=id,name",token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId||"root"]})});
  return text(created.id);
}
async function ensureGooglePath(token:string,rootId:string,folders:string[]){
  let parent=rootId||"root";
  for(const folder of folders)parent=await googleChildFolder(token,parent,folder);
  return parent;
}
async function googleExistingFile(token:string,parentId:string,name:string){
  const q=`'${googleQueryValue(parentId||"root")}' in parents and name='${googleQueryValue(name)}' and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const params=new URLSearchParams({q,fields:"files(id,name,webViewLink)",pageSize:"10",spaces:"drive"});
  const payload=await providerJson(`https://www.googleapis.com/drive/v3/files?${params}`,token);
  return(Array.isArray(payload.files)?payload.files:[]).find((row:Row)=>text(row.name)===name)||null;
}
async function googleUpload(token:string,parentId:string,fileName:string,mimeType:string,bytes:ArrayBuffer){
  const existing=await googleExistingFile(token,parentId,fileName);
  const updateId=text(existing?.id),method=updateId?"PATCH":"POST";
  const initUrl=updateId
    ?`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(updateId)}?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,webViewLink`
    :"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,webViewLink";
  const metadata=updateId?{name:fileName}:{name:fileName,parents:[parentId||"root"]};
  const init=await fetch(initUrl,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":mimeType||"application/octet-stream","X-Upload-Content-Length":String(bytes.byteLength)},body:JSON.stringify(metadata)});
  if(!init.ok)throw Object.assign(new Error(`Google Drive upload oturumu HTTP ${init.status} döndürdü.`),{code:"GOOGLE_UPLOAD_SESSION_FAILED",status:init.status});
  const location=text(init.headers.get("Location"));if(!location)throw Object.assign(new Error("Google Drive upload oturum adresi dönmedi."),{code:"GOOGLE_UPLOAD_LOCATION_MISSING"});
  const upload=await fetch(location,{method:"PUT",headers:{"Content-Type":mimeType||"application/octet-stream","Content-Length":String(bytes.byteLength)},body:bytes});
  const payload=await upload.json().catch(()=>({})) as Row;
  if(!upload.ok)throw Object.assign(new Error(text(payload?.error?.message)||`Google Drive upload HTTP ${upload.status} döndürdü.`),{code:"GOOGLE_UPLOAD_FAILED",status:upload.status});
  return{id:text(payload.id||updateId),name:text(payload.name||fileName),webUrl:text(payload.webViewLink||existing?.webViewLink),provider:"GOOGLE_DRIVE"};
}
function microsoftChildrenUrl(driveId:string,parentId:string){
  if(driveId)return parentId&&parentId!=="root"
    ?`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`
    :`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;
  return parentId&&parentId!=="root"
    ?`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children`
    :"https://graph.microsoft.com/v1.0/me/drive/root/children";
}
async function ensureMicrosoftPath(token:string,rootId:string,driveId:string,folders:string[]){
  let parent=rootId||"root";
  for(const name of folders){
    const children=await listMicrosoftChildren(token,parent,driveId,true);
    const existing=children.find(row=>row.isFolder&&text(row.name)===name);
    if(existing?.id){parent=text(existing.id);continue}
    const created=await providerJson(microsoftChildrenUrl(driveId,parent),token,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,folder:{}, "@microsoft.graph.conflictBehavior":"fail"})});
    parent=text(created.id);
    if(!parent)throw Object.assign(new Error(`${name} bulut klasörü oluşturulamadı.`),{code:"MICROSOFT_FOLDER_CREATE_FAILED"});
  }
  return parent;
}
function microsoftContentUrl(driveId:string,parentId:string,fileName:string){
  const encoded=encodeURIComponent(fileName);
  if(driveId)return parentId&&parentId!=="root"
    ?`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}:/${encoded}:/content`
    :`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${encoded}:/content`;
  return parentId&&parentId!=="root"
    ?`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}:/${encoded}:/content`
    :`https://graph.microsoft.com/v1.0/me/drive/root:/${encoded}:/content`;
}
async function microsoftUpload(token:string,driveId:string,parentId:string,fileName:string,mimeType:string,bytes:ArrayBuffer){
  const response=await fetch(microsoftContentUrl(driveId,parentId,fileName),{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":mimeType||"application/octet-stream"},body:bytes});
  const payload=await response.json().catch(()=>({})) as Row;
  if(!response.ok)throw Object.assign(new Error(text(payload?.error?.message)||`Microsoft Graph upload HTTP ${response.status} döndürdü.`),{code:"MICROSOFT_UPLOAD_FAILED",status:response.status});
  return{id:text(payload.id),name:text(payload.name||fileName),webUrl:text(payload.webUrl),provider:"MICROSOFT"};
}

export async function archiveFileToCloudConnection(c:Context<AppEnv>,slug:string,connectionId:string,input:{relativePath:string;fileName:string;mimeType?:string;bytes:ArrayBuffer}){
  const {link,accessToken}=await connectionAccount(c,slug,connectionId);
  if(Number(link.is_active)===0)throw Object.assign(new Error("Bulut depolama servisi pasif."),{code:"CONNECTION_DISABLED"});
  if(upper(link.sync_mode)!=="CLOUD_API")throw Object.assign(new Error("Seçilen hedef doğrudan bulut API bağlantısı değil."),{code:"NOT_CLOUD_API"});
  const provider=upper(link.provider_type),driveId=text(link.provider_drive_id),rootId=text(link.remote_root_id)||"root",parts=archiveParts(input.relativePath,input.fileName);
  if(provider==="GOOGLE_DRIVE"){
    const parentId=await ensureGooglePath(accessToken,rootId,parts.folders);
    return{...(await googleUpload(accessToken,parentId,parts.fileName,text(input.mimeType)||"application/octet-stream",input.bytes)),providerType:provider,parentId,relativePath:text(input.relativePath)};
  }
  if(provider==="DROPBOX"){
    const path=await dropboxArchivePath(accessToken,rootId,parts.folders,parts.fileName);
    return{...(await dropboxArchiveUpload(accessToken,path,input.bytes)),providerType:provider,relativePath:text(input.relativePath)};
  }
  if(["ONEDRIVE","SHAREPOINT"].includes(provider)){
    const parentId=await ensureMicrosoftPath(accessToken,rootId,driveId,parts.folders);
    return{...(await microsoftUpload(accessToken,driveId,parentId,parts.fileName,text(input.mimeType)||"application/octet-stream",input.bytes)),providerType:provider,parentId,relativePath:text(input.relativePath)};
  }
  throw Object.assign(new Error("Bu File Hub sağlayıcısı doğrudan bulut arşivlemeyi desteklemiyor."),{code:"CLOUD_ARCHIVE_PROVIDER_UNSUPPORTED"});
}


// Google Drive orijinalini R2'ye kopyalamadan, sağlayıcının küçük JPEG önizlemesini cache'le.
export async function ensureCloudModelImagePreview(c: Context<AppEnv>, slug: string, assetId: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    `SELECT a.extension,a.mime_type,l.provider_file_id,x.oauth_account_id
       FROM file_hub_assets a
       JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.is_available=1
       JOIN file_hub_connections sc ON sc.id=l.storage_connection_id AND sc.main_company_slug=l.main_company_slug
       JOIN file_hub_cloud_connection_accounts x ON x.connection_id=sc.id AND x.main_company_slug=sc.main_company_slug
      WHERE a.id=? AND a.main_company_slug=? AND sc.provider_type='GOOGLE_DRIVE'
      LIMIT 1`,
  ).bind(assetId,slug).first<Row>();
  if (!row || !["JPG","JPEG","PNG","WEBP","PSD","PSB","AI","PDF","TIF","TIFF"].includes(upper(row.extension))) return false;
  const { accessToken } = await usableAccount(c,slug,text(row.oauth_account_id));
  const metadata = await providerJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(text(row.provider_file_id))}?fields=thumbnailLink,mimeType`,
    accessToken,
  );
  const link = text(metadata.thumbnailLink);
  if (!link) return false;
  const thumbnail = new URL(link);
  if (thumbnail.protocol !== "https:" || !(thumbnail.hostname === "googleusercontent.com" ||
      thumbnail.hostname.endsWith(".googleusercontent.com"))) return false;
  const response = await fetch(thumbnail.toString(), { headers: { Authorization:`Bearer ${accessToken}` } });
  if (!response.ok) return false;
  const mime = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!["image/jpeg","image/png","image/webp"].includes(mime)) return false;
  if (Number(response.headers.get("content-length") || 0) > 2_000_000) return false;
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 2_000_000) return false;
  const key = `file-hub/previews/cloud/${encodeURIComponent(slug)}/${encodeURIComponent(assetId)}`;
  await c.env.FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
  await c.env.DB.prepare(
    `UPDATE file_hub_assets SET preview_storage_key=?,preview_status='READY',updated_at=?
       WHERE id=? AND main_company_slug=?`,
  ).bind(key,now(),assetId,slug).run();
  return true;
}

export async function readFileHubAssetForMail(c:any,slug:string,assetId:string,maxBytes=25*1024*1024){
  const asset=await c.env.DB.prepare(`SELECT id,file_name,mime_type,size_bytes,status,source_type,preview_storage_key,metadata
    FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1`).bind(assetId,slug).first<Row>();
  if(!asset)throw Object.assign(new Error("File Hub dosyası bulunamadı."),{code:"MAIL_ATTACHMENT_NOT_FOUND",status:404});
  if(upper(asset.status)!=="AVAILABLE")throw Object.assign(new Error("File Hub dosyası şu anda kullanılamıyor."),{code:"MAIL_ATTACHMENT_UNAVAILABLE",status:409});
  const declared=Math.max(0,Number(asset.size_bytes||0));
  if(declared>maxBytes)throw Object.assign(new Error("Mail eki 25 MB sınırını aşıyor."),{code:"MAIL_ATTACHMENT_TOO_LARGE",status:413,sizeBytes:declared,maxBytes});
  const fileName=text(asset.file_name)||"ek";
  const mimeType=text(asset.mime_type)||"application/octet-stream";

  if(upper(asset.source_type)==="ACCOUNTING_STAGING"&&text(asset.preview_storage_key)){
    const object=await c.env.FILES.get(text(asset.preview_storage_key));
    if(!object)throw Object.assign(new Error("Muhasebe belge eki R2 intake alanında bulunamadı."),{code:"MAIL_ATTACHMENT_R2_MISSING",status:404});
    const buffer=await object.arrayBuffer();
    if(buffer.byteLength>maxBytes)throw Object.assign(new Error("Mail eki 25 MB sınırını aşıyor."),{code:"MAIL_ATTACHMENT_TOO_LARGE",status:413,sizeBytes:buffer.byteLength,maxBytes});
    return{fileAssetId:assetId,fileName,mimeType,sizeBytes:buffer.byteLength,bytes:new Uint8Array(buffer),source:"R2_INTAKE"};
  }

  const row=await c.env.DB.prepare(`SELECT l.provider_file_id,l.storage_connection_id,x.oauth_account_id,x.provider_drive_id,c.provider_type
    FROM file_hub_locations l
    JOIN file_hub_connections c ON c.id=l.storage_connection_id AND c.main_company_slug=l.main_company_slug
    JOIN file_hub_cloud_connection_accounts x ON x.connection_id=c.id AND x.main_company_slug=c.main_company_slug
    WHERE l.file_asset_id=? AND l.main_company_slug=? AND l.is_available=1
    ORDER BY CASE WHEN l.location_role='PRIMARY' THEN 0 ELSE 1 END,l.updated_at DESC LIMIT 1`).bind(assetId,slug).first<Row>();
  if(!row)throw Object.assign(new Error("Bu File Hub dosyasının Worker tarafından okunabilir bulut kaynağı yok. Yerel/NAS dosyasını önce bağlı bulut arşivine veya belge yükleme alanına alın."),{code:"MAIL_ATTACHMENT_SOURCE_OFFLINE",status:409});
  const {accessToken}=await usableAccount(c,slug,text(row.oauth_account_id));
  const provider=upper(row.provider_type),fileId=text(row.provider_file_id),driveId=text(row.provider_drive_id);
  const url=provider==="GOOGLE_DRIVE"
    ?`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
    :driveId
      ?`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(fileId)}/content`
      :`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`;
  const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},redirect:"follow"});
  if(!response.ok)throw Object.assign(new Error(`File Hub eki sağlayıcıdan alınamadı (HTTP ${response.status}).`),{code:"MAIL_ATTACHMENT_DOWNLOAD_FAILED",status:502});
  const length=Number(response.headers.get("Content-Length")||0);
  if(length>maxBytes)throw Object.assign(new Error("Mail eki 25 MB sınırını aşıyor."),{code:"MAIL_ATTACHMENT_TOO_LARGE",status:413,sizeBytes:length,maxBytes});
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>maxBytes)throw Object.assign(new Error("Mail eki 25 MB sınırını aşıyor."),{code:"MAIL_ATTACHMENT_TOO_LARGE",status:413,sizeBytes:buffer.byteLength,maxBytes});
  return{fileAssetId:assetId,fileName,mimeType:text(response.headers.get("Content-Type"))||mimeType,sizeBytes:buffer.byteLength,bytes:new Uint8Array(buffer),source:provider};
}



/** Google Drive taraması: sayfa imleci ve klasör kuyruğu tenant bağlantı metadata'sında tutulur.
 * Dosyalar fiziksel olarak taşınmaz; kesilen sayfa tekrar işlendiğinde upsert idempotent kalır. */
async function googleChildrenPage(token: string, parentId: string, pageToken = "") {
  const params = new URLSearchParams({
    q: "'" + String(parentId || "root").replace(/'/g, "\\'") + "' in parents and trashed=false",
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,md5Checksum)",
    pageSize: "15", spaces: "drive",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const response = await providerJson("https://www.googleapis.com/drive/v3/files?" + params, token);
  const children = (Array.isArray(response.files) ? response.files : []).map((row: Row) => ({
    id: text(row.id), name: text(row.name), isFolder: row.mimeType === "application/vnd.google-apps.folder",
    mimeType: text(row.mimeType), size: Number(row.size || 0), modifiedAt: text(row.modifiedTime),
    webUrl: text(row.webViewLink), checksum: text(row.md5Checksum),
  })).filter((row: Row) => row.id && row.name);
  return { children, nextPageToken: text(response.nextPageToken) };
}

// Microsoft Graph tek sayfa okunur. nextLink yalniz Graph hostunda kabul edilir.
async function microsoftChildrenPage(token:string,parentId:string,driveId="",nextLink="") {
  const select="$select=id,name,size,lastModifiedDateTime,webUrl,folder,file,parentReference,eTag,cTag&$top=15";
  const base=driveId
    ? (parentId && parentId!=="root"
      ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children?${select}`
      : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children?${select}`)
    : (parentId && parentId!=="root"
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentId)}/children?${select}`
      : `https://graph.microsoft.com/v1.0/me/drive/root/children?${select}`);
  const link=nextLink||base;
  const url=new URL(link);
  if(url.origin!=="https://graph.microsoft.com"||!url.pathname.startsWith("/v1.0/"))
    throw Object.assign(new Error("Microsoft Graph sayfa adresi geçersiz."),{code:"INVALID_GRAPH_PAGE"});
  const payload=await providerJson(url.toString(),token);
  const children=(Array.isArray(payload.value)?payload.value:[]).map((row:Row)=>({
    id:text(row.id), name:text(row.name), isFolder:Boolean(row.folder),
    mimeType:text(row.file?.mimeType), size:Number(row.size||0),
    modifiedAt:text(row.lastModifiedDateTime),webUrl:text(row.webUrl),
    checksum:text(row.eTag||row.cTag),
  })).filter((row:Row)=>row.id&&row.name);
  return {children,nextPageToken:text(payload["@odata.nextLink"])};
}

// Dosyalar klasor atamasi oncesinde indekslendiyse root taramasini beklemeden
// yalniz atanan MODEL_IMAGE altindaki iliskisiz resimleri kucuk partilerle eslestir.
async function backfillIndexedCloudModelImages(c: Context<AppEnv>, slug: string, connectionId: string, provider: string) {
  const binding = await c.env.DB.prepare(
    "SELECT root_path FROM file_hub_bindings WHERE main_company_slug=? AND storage_connection_id=? AND module_code='DESEN' AND purpose_code='MODEL_IMAGE' AND sync_enabled=1 LIMIT 1",
  ).bind(slug, connectionId).first<Row>();
  if (!binding || !canUseModelImageFolder(binding.root_path)) return 0;
  const root = text(binding.root_path).replace(/^\/+|\/+$/g, "");
  const candidates = await c.env.DB.prepare(
    "SELECT a.id asset_id,a.file_name,a.mime_type,a.size_bytes,l.provider_file_id,l.relative_path " +
    "FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug " +
    "WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1 " +
    "AND substr(l.relative_path,1,length(?))=? AND substr(l.relative_path,length(?)+1,1)='/' " +
    "AND l.provider_file_id IS NOT NULL AND lower(a.extension) IN ('jpg','jpeg','png','webp') " +
    "AND NOT EXISTS(SELECT 1 FROM file_hub_relations r WHERE r.main_company_slug=l.main_company_slug " +
    "AND r.file_asset_id=l.file_asset_id AND r.entity_type='MODEL' AND r.relation_type='MODEL_IMAGE') " +
    "ORDER BY l.relative_path LIMIT 25",
  ).bind(slug, connectionId, root, root, root).all<Row>();
  let linked = 0;
  for (const row of candidates.results || []) {
    const item = { id: text(row.provider_file_id), name: text(row.file_name), mimeType: text(row.mime_type), size: Number(row.size_bytes || 0) };
    const model = await syncCloudDesignBinding(c, slug, connectionId, text(row.asset_id), item, text(row.relative_path), provider);
    if (model?.modelId) linked += 1;
  }
  return linked;
}

// Eski bağ atamasından önce indekslenmiş dosyaları tekrar Drive'dan indirmeden
// küçük, devam edebilir parçalarda tek model kimliğine bağla. Dosya taşıma yok.
async function backfillIndexedCloudDesignFiles(c:Context<AppEnv>,slug:string,connectionId:string,provider:string,afterPath:string){
  const query=async(after:string)=>await c.env.DB.prepare(
    "SELECT a.id asset_id,a.file_name,a.extension,a.mime_type,a.size_bytes,l.relative_path,l.provider_file_id " +
    "FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug " +
    "WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1 " +
    "AND l.relative_path>? AND lower(a.extension) IN ('jpg','jpeg','png','webp','pdf','psd','psb','ai','tif','tiff','svg','eps') " +
    "ORDER BY l.relative_path LIMIT 30"
  ).bind(slug,connectionId,after).all<Row>();
  let rows=(await query(afterPath)).results||[];
  if(!rows.length && afterPath)rows=(await query("")).results||[];
  let matched=0;
  for(const row of rows){
    const item={id:text(row.provider_file_id),name:text(row.file_name),mimeType:text(row.mime_type),size:Number(row.size_bytes||0)};
    const result=await syncCloudDesignBinding(c,slug,connectionId,text(row.asset_id),item,text(row.relative_path),provider);
    if(result?.modelId)matched+=Number(result.matchedCount||1);
  }
  return {matched,lastPath:rows.length?text(rows[rows.length-1].relative_path):""};
}

async function runGoogleSyncBatch(c: Context<AppEnv>, slug: string, connectionId: string, pageLimit = 1, scheduled = false) {
  const { link, accessToken } = await connectionAccount(c, slug, connectionId);
  const providerType=upper(link.provider_type);
  if (!["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"].includes(providerType)) throw Object.assign(new Error("Google Drive veya Microsoft depolama servisi bekleniyor."), { code: "INVALID_PROVIDER" });
  if (Number(link.is_active) === 0) throw Object.assign(new Error("Depolama servisi pasif."), { code: "CONNECTION_DISABLED", status: 409 });
  const rootId = text(link.remote_root_id) || "root";
  const raw = text(link.connection_metadata), meta = json(raw);
  const resumed = meta.cloudSyncCursor && meta.cloudSyncCursor.rootId === rootId && Array.isArray(meta.cloudSyncCursor.queue);
  const previousComplete = Date.parse(text(meta.cloudSyncProgress?.completedAt)) || 0;
  if (scheduled && !resumed && previousComplete && Date.now() - previousComplete < 6 * 3600000) return { skipped: true };
  if ((Date.parse(text(meta.cloudSyncLeaseUntil)) || 0) > Date.now()) return { inProgress: true, busy: true, ...json(meta.cloudSyncProgress) };
  const leaseId = crypto.randomUUID();
  const leaseUntil = new Date(Date.now() + 180000).toISOString();
  const acquired = await c.env.DB.prepare("UPDATE file_hub_connections SET metadata=? WHERE id=? AND main_company_slug=? AND COALESCE(metadata,'')=? AND is_active=1")
    .bind(JSON.stringify({ ...meta, cloudSyncLeaseId: leaseId, cloudSyncLeaseUntil: leaseUntil }), connectionId, slug, raw).run();
  if (Number(acquired.meta?.changes || 0) !== 1) return { inProgress: true, busy: true };

  let cursor = resumed
    ? { ...meta.cloudSyncCursor, queue: meta.cloudSyncCursor.queue.map((f: Row) => ({ id: text(f.id), path: text(f.path), pageToken: text(f.pageToken) })) }
    : { rootId, startedAt: now(), queue: [{ id: rootId, path: "", pageToken: "" }], pages: 0, files: 0, folders: 0, changedFiles: 0, modelSyncs: 0, designBackfillPath:text(meta.designBackfillPath) };
  // Eski checkpoint korunur; yillar onceki klasorler 2026 islerini bloklamaz.
  prioritizeGoogleScanQueue(cursor.queue);
  let checkpoint = JSON.parse(JSON.stringify(cursor));
  let files = 0, folders = 0, modelSyncs = 0, linkedImages: number | null = null, linkedModels: number | null = null;
  const persist = async (state: Row, complete = false, error = "", release = false) => {
    const stamp = now();
    const progress = { files: Number(state.files || 0), folders: Number(state.folders || 0),
      changedFiles: Number(state.changedFiles || 0), modelSyncs: Number(state.modelSyncs || 0),
      startedAt: state.startedAt, updatedAt: stamp, completedAt: complete ? stamp : null,
      pages: Number(state.pages || 0), pendingFolders: Array.isArray(state.queue) ? state.queue.length : 0,
      state: error ? "ERROR" : complete ? "COMPLETED" : release ? "WAITING" : "RUNNING" };
    const data = { ...meta, cloudDirect: true, cloudSyncCursor: complete ? null : state,
      cloudSyncProgress: progress, syncTruncated: !complete,
      lastSyncFiles: progress.files, lastSyncFolders: progress.folders,
      lastChangedFiles: progress.changedFiles, lastModelSyncs: progress.modelSyncs,
      ...(complete ? { lastLinkedImages: linkedImages, lastLinkedModels: linkedModels } : {}),
      designBackfillPath:text(state.designBackfillPath || ""),
      cloudSyncLeaseId: complete || error || release ? null : leaseId,
      cloudSyncLeaseUntil: complete || error || release ? null : leaseUntil };
    if (JSON.stringify(data).length > 240000) throw Object.assign(new Error("Dosya tarama kuyruğu metadata sınırını aştı."), { code: "SYNC_CURSOR_TOO_LARGE" });
    const saved = await c.env.DB.prepare("UPDATE file_hub_connections SET metadata=?,connection_status=?,last_error=?,last_sync_at=CASE WHEN ?=1 THEN ? ELSE last_sync_at END,updated_at=? WHERE id=? AND main_company_slug=? AND json_extract(metadata,'$.cloudSyncLeaseId')=?")
      .bind(JSON.stringify(data), error ? "ERROR" : "CONNECTED", error || null,
        complete ? 1 : 0, stamp, stamp, connectionId, slug, leaseId).run();
    if (Number(saved.meta?.changes || 0) !== 1) throw Object.assign(new Error("Senkronizasyon kilidi değişti, indeks korundu."), { code: "SYNC_LEASE_CONFLICT", status: 409 });
  };
  try {
    for (let p = 0; p < Math.min(4, Math.max(1, Number(pageLimit) || 1)) && cursor.queue.length; p++) {
      const folder = cursor.queue[0];
      const page = providerType==="GOOGLE_DRIVE"
        ? await googleChildrenPage(accessToken, folder.id, folder.pageToken)
        : await microsoftChildrenPage(accessToken, folder.id, text(link.provider_drive_id), folder.pageToken);
      const discoveredFolders: Row[] = [];
      for (const child of page.children) {
        const relativePath = folder.path ? folder.path + "/" + child.name : child.name;
        if (child.isFolder) {
          folders += 1; cursor.folders += 1;
          discoveredFolders.push({ id: child.id, path: relativePath, pageToken: "" });
        } else {
          const indexed = await upsertCloudFile(c, slug, connectionId, providerType, child, relativePath, now());
          files += 1; cursor.files += 1;
          if (indexed.changed) cursor.changedFiles += 1;
          if (indexed.needsModelSync) {
            const model = await syncCloudDesignBinding(c, slug, connectionId, indexed.assetId, child, relativePath, providerType);
            if (model?.modelId) { modelSyncs += 1; cursor.modelSyncs += 1; }
          }
        }
      }
      if (page.nextPageToken) folder.pageToken = page.nextPageToken;
      else cursor.queue.shift();
      // Derinlik öncelikli: kökte binlerce klasör olsa bile bekleyen kuyruk büyümez.
      cursor.queue.unshift(...discoveredFolders);
      prioritizeGoogleScanQueue(cursor.queue);
      cursor.pages = Number(cursor.pages || 0) + 1;
      if (cursor.queue.length > 4000) throw Object.assign(new Error("Klasör kuyruğu sınırı aşıldı."), { code: "SYNC_QUEUE_TOO_LARGE" });
      await persist(cursor);
      checkpoint = JSON.parse(JSON.stringify(cursor));
    }
    const recoveredModelLinks = await backfillIndexedCloudModelImages(c, slug, connectionId, providerType);
    const priorDesignFiles = await backfillIndexedCloudDesignFiles(c, slug, connectionId, providerType, text(cursor.designBackfillPath || meta.designBackfillPath));
    cursor.designBackfillPath = priorDesignFiles.lastPath;
    modelSyncs += recoveredModelLinks + priorDesignFiles.matched;
    cursor.modelSyncs += recoveredModelLinks + priorDesignFiles.matched;
    const complete = cursor.queue.length === 0;
    if (complete) {
      const result = await c.env.DB.prepare("SELECT COUNT(DISTINCT l.file_asset_id) linked_images,COUNT(DISTINCT r.entity_id) linked_models FROM file_hub_locations l JOIN file_hub_relations r ON r.file_asset_id=l.file_asset_id AND r.main_company_slug=l.main_company_slug AND r.entity_type='MODEL' AND r.relation_type='MODEL_IMAGE' JOIN model_records m ON m.id=r.entity_id AND m.main_company_slug=r.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1")
        .bind(slug, connectionId).first<Row>();
      linkedImages = Number(result?.linked_images || 0);
      linkedModels = Number(result?.linked_models || 0);
    }
    await persist(cursor, complete, "", true); // Kilidi bırak; tamamlanmamış kuyruk saklanır.
    const design = await c.env.DB.prepare("SELECT root_path FROM file_hub_bindings WHERE main_company_slug=? AND storage_connection_id=? AND module_code='DESEN' AND purpose_code='MODEL_IMAGE' AND sync_enabled=1 LIMIT 1")
      .bind(slug, connectionId).first<Row>();
    return { files, folders, totalFiles: cursor.files, totalFolders: cursor.folders, modelSyncs,
      linkedImages, linkedModels, truncated: !complete, inProgress: !complete, completed: complete,
      lastSyncAt: complete ? now() : null, designImageBindingPresent: Boolean(design && canUseModelImageFolder(design.root_path)),
      designImageRootPath: text(design?.root_path) };
  } catch (error: any) {
    // Checkpoint sonrası yarım sayfa yeniden okunabilir; eski kayıtlar silinmez.
    await persist(checkpoint, false, text(error?.message).slice(0, 300)).catch(() => {});
    throw error;
  }
}

export async function runFileHubCloudScheduledSync(env: Cloudflare.Env) {
  const c = { env } as Context<AppEnv>;
  const result = await env.DB.prepare(
    `SELECT DISTINCT c.id,c.main_company_slug
       FROM file_hub_connections c
       LEFT JOIN file_hub_bindings b
         ON b.main_company_slug=c.main_company_slug
        AND b.storage_connection_id=c.id
        AND b.sync_enabled=1
      WHERE c.is_active=1
        AND c.sync_mode='CLOUD_API'
        AND (b.id IS NOT NULL OR json_extract(c.metadata,'$.cloudSyncCursor') IS NOT NULL)
      ORDER BY CASE WHEN json_extract(c.metadata,'$.cloudSyncCursor') IS NOT NULL THEN 0 ELSE 1 END, c.updated_at ASC
      LIMIT 4`,
  ).all<Row>();

  for (const row of result.results || []) {
    const slug=text(row.main_company_slug), connectionId=text(row.id);
    if(!slug || !connectionId) continue;
    try {
      const { link, accessToken } = await connectionAccount(c, slug, connectionId);
      const provider=upper(link.provider_type), driveId=text(link.provider_drive_id);
      if (["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"].includes(provider)) {
        await runGoogleSyncBatch(c, slug, connectionId, 3, true);
        continue;
      }
      const rootId=text(link.remote_root_id)||"root", rootName=text(link.remote_root_name)||"Ana Klasör", seenAt=now();
      const queue:Row[]=[{id:rootId,path:""}];
      let files=0,folders=0,truncated=false,changedFiles=0,modelSyncs=0;
      const limit=1200;
      while(queue.length && files+folders<limit){
        const current=queue.shift()!;
        const children=provider==="GOOGLE_DRIVE"
          ? await listGoogleChildren(accessToken,current.id,true)
          : await listMicrosoftChildren(accessToken,current.id,driveId,true);
        for(const child of children){
          const relativePath=current.path?`${current.path}/${child.name}`:child.name;
          if(child.isFolder){
            folders+=1;
            if(files+folders<limit) queue.push({id:child.id,path:relativePath});
            else truncated=true;
          } else {
            const indexed=await upsertCloudFile(c,slug,connectionId,provider,child,relativePath,seenAt);
            if(indexed.changed) changedFiles+=1;
            if(indexed.needsModelSync){
              const synced=await syncCloudDesignBinding(c,slug,connectionId,indexed.assetId,child,relativePath,provider);
              if(synced) modelSyncs+=1;
            }
            files+=1;
          }
          if(files+folders>=limit){truncated=true;break;}
        }
      }
      await env.DB.prepare(`UPDATE file_hub_connections
        SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,metadata=?,updated_at=?
        WHERE id=? AND main_company_slug=?`)
        .bind(seenAt,JSON.stringify({...json(link.connection_metadata),cloudDirect:true,driveId:driveId||null,lastSyncFiles:files,lastSyncFolders:folders,lastChangedFiles:changedFiles,lastModelSyncs:modelSyncs,syncTruncated:truncated,rootName}),seenAt,connectionId,slug).run();
    } catch(error:any) {
      await env.DB.prepare(`UPDATE file_hub_connections
        SET connection_status='ERROR',last_error=?,updated_at=?
        WHERE id=? AND main_company_slug=?`)
        .bind(text(error?.message)||"Bulut senkronizasyonu başarısız.",now(),connectionId,slug).run().catch(()=>{});
    }
  }
}

export function registerFileHubCloudOauthRoutes(app: Hono<AppEnv>) {
  app.get("/api/file-hub/cloud/providers", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    return c.json({ ok: true, data: [
      { providerType: "GOOGLE_DRIVE", label: "Google Drive", authFamily: "GOOGLE", configured: providerReady(c, "GOOGLE_DRIVE"), redirectUri: providerConfig(c, "GOOGLE_DRIVE").redirectUri, registrationVerified: false, mode: "CLOUD_API" },
      { providerType: "ONEDRIVE", label: "Microsoft OneDrive", authFamily: "MICROSOFT", configured: providerReady(c, "ONEDRIVE"), redirectUri: providerConfig(c, "ONEDRIVE").redirectUri, registrationVerified: false, mode: "CLOUD_API" },
      { providerType: "DROPBOX", label: "Dropbox (alternatif)", authFamily: "DROPBOX", configured: providerReady(c, "DROPBOX"), redirectUri: providerConfig(c, "DROPBOX").redirectUri, registrationVerified: false, mode: "CLOUD_API", optional: true },
      { providerType: "SHAREPOINT", label: "Microsoft SharePoint", authFamily: "MICROSOFT", configured: providerReady(c, "SHAREPOINT"), redirectUri: providerConfig(c, "SHAREPOINT").redirectUri, registrationVerified: false, mode: "CLOUD_API" },
      { providerType: "LOCAL_FOLDER", label: "Yerel Klasör", configured: true, mode: "AGENT" },
      { providerType: "NAS", label: "NAS / Ağ Klasörü", configured: true, mode: "AGENT" },
    ] });
  });

  app.get("/api/file-hub/cloud/accounts", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    const slug = companySlug(c); if (!slug) return c.json(err("TENANT_REQUIRED", "Aktif firma seçimi gerekli."), 422);
    const result = await c.env.DB.prepare(`SELECT id,provider_type,provider_account_id,account_email,display_name,token_expires_at,scopes,metadata,created_at,updated_at FROM file_hub_oauth_accounts WHERE main_company_slug=? ORDER BY updated_at DESC`).bind(slug).all<Row>();
    return c.json({ ok: true, data: (result.results || []).map((row) => ({ ...row, metadata: json(row.metadata) })) });
  });

  // OAuth hesabi silme islemi yalniz bu ana firma tenant'ini etkiler.
  // Etkin servis varsa engellenir; fiziksel Drive/OneDrive dosyasi ve D1 indeks silinmez.
  app.delete("/api/file-hub/cloud/accounts/:id", async (c) => {
    const gate = await assertCompanyOwner(c); if (gate.error) return gate.error;
    const id = text(c.req.param("id"));
    const account = await c.env.DB.prepare(
      "SELECT id FROM file_hub_oauth_accounts WHERE id=? AND main_company_slug=? LIMIT 1",
    ).bind(id, gate.slug).first<Row>();
    if (!account) return c.json(err("ACCOUNT_NOT_FOUND", "Bu firmaya ait bulut hesabı bulunamadı."), 404);
    const active = await c.env.DB.prepare(
      `SELECT COUNT(*) n FROM file_hub_cloud_connection_accounts a
       JOIN file_hub_connections co ON co.id=a.connection_id AND co.main_company_slug=a.main_company_slug
       WHERE a.main_company_slug=? AND a.oauth_account_id=? AND co.is_active=1`,
    ).bind(gate.slug, id).first<Row>();
    if (Number(active?.n || 0) > 0) return c.json(err(
      "ACCOUNT_HAS_ACTIVE_SERVICES",
      "Hesabı kaldırmadan önce bu firmanın bağlı dosya servislerini pasifleştirin. Drive dosyaları ve indeks korunur.",
    ), 409);
    // Geçmişte pasif edilen servis kartları ve File Hub belge kayıtları korunur.
    // Sadece OAuth hesabına ait bağlantı haritaları ve şifreli token kaydı kaldırılır.
    await c.env.DB.prepare(
      "DELETE FROM file_hub_cloud_connection_accounts WHERE main_company_slug=? AND oauth_account_id=?",
    ).bind(gate.slug, id).run();
    await c.env.DB.prepare(
      "DELETE FROM file_hub_oauth_accounts WHERE main_company_slug=? AND id=?",
    ).bind(gate.slug, id).run();
    return c.json({ ok: true, data: { accountRemoved: true, indexedFilesPreserved: true } });
  });

  // Salt-okunur, şirket kapsamlı anlık durum. Büyük indeks sorgusu veya tarama başlatmaz.
  app.get("/api/file-hub/cloud/connections/:id/status", async (c) => {
    const gate = await assertCompanyOwner(c); if (gate.error) return gate.error;
    const connectionId = text(c.req.param("id"));
    const row = await c.env.DB.prepare(
      "SELECT id,provider_type,connection_status,last_sync_at,last_error,metadata FROM file_hub_connections WHERE id=? AND main_company_slug=? LIMIT 1",
    ).bind(connectionId,gate.slug).first<Row>();
    if (!row) return c.json(err("CONNECTION_NOT_FOUND", "Bu firmaya ait dosya servisi bulunamadı."), 404);
    const metadata=json(row.metadata);
    const until=Date.parse(text(metadata.cloudSyncLeaseUntil))||0;
    const progress=json(metadata.cloudSyncProgress);
    const inProgress=Boolean(metadata.cloudSyncCursor);
    const leaseActive=until>Date.now();
    return c.json({ok:true,data:{
      id:row.id,providerType:row.provider_type,connectionStatus:row.connection_status,
      lastSyncAt:row.last_sync_at,lastError:row.last_error,
      sync:{...progress, state:progress.state==="ERROR"?"ERROR":inProgress?(leaseActive?"RUNNING":"WAITING"):progress.state||"NOT_STARTED",
        inProgress, leaseActive, pendingFolders:Number(progress.pendingFolders||metadata.cloudSyncCursor?.queue?.length||0)}
    }});
  });

  app.post("/api/file-hub/cloud/authorize", async (c) => {
    const body = await bodyOf(c); const gate = await assertCompanyOwner(c, body); if (gate.error) return gate.error;
    const providerType = upper(body.providerType), cfg = providerConfig(c, providerType);
    if (!cfg.family) return c.json(err("INVALID_PROVIDER", "Bu servis doğrudan bulut bağlantısını desteklemiyor."), 422);
    if (!providerReady(c, providerType)) return c.json(err("OAUTH_NOT_CONFIGURED", `${providerType === "GOOGLE_DRIVE" ? "Google Drive" : providerType === "DROPBOX" ? "Dropbox" : "Microsoft"} OAuth uygulama bilgileri henüz production ortamında tanımlı değil.`), 503);
    const state = stateToken(), createdAt = now(), expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(), returnPath = sanitizeReturnPath(body.returnPath);
    await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE expires_at<?`).bind(createdAt).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_oauth_states(state,main_company_slug,provider_type,user_id,return_path,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`).bind(state, gate.slug, providerType, gate.user.id, returnPath, expiresAt, createdAt).run();
    let authorizeUrl = "";
    if (cfg.family === "DROPBOX") {
      const params=new URLSearchParams({client_id:cfg.clientId,redirect_uri:cfg.redirectUri,response_type:"code",token_access_type:"offline",scope:cfg.scope,state});
      authorizeUrl=`https://www.dropbox.com/oauth2/authorize?${params}`;
    } else if (cfg.family === "GOOGLE") {
      const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: cfg.scope, access_type: "offline", include_granted_scopes: "true", prompt: "consent", state });
      authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } else {
      const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", response_mode: "query", scope: cfg.scope, state });
      authorizeUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    }
    return c.json({ ok: true, data: { authorizeUrl } });
  });

  async function oauthCallback(c: Context<AppEnv>, family: string) {
    const state = text(c.req.query("state")), code = text(c.req.query("code")), providerError = text(c.req.query("error_description") || c.req.query("error"));
    if (!state) return c.redirect(`${appBaseUrl}/depolama/depolama-kaynaklar?storageError=oauth_state_missing`);
    const row = await c.env.DB.prepare(`SELECT * FROM file_hub_oauth_states WHERE state=? LIMIT 1`).bind(state).first<Row>();
    if (!row || Date.parse(text(row.expires_at)) < Date.now() || providerFamily(row.provider_type) !== family) {
      if (row) await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE state=?`).bind(state).run();
      return c.redirect(`${appBaseUrl}/depolama/depolama-kaynaklar?storageError=oauth_state_invalid`);
    }
    const returnPath = sanitizeReturnPath(row.return_path);
    if (providerError || !code) {
      await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE state=?`).bind(state).run();
      return c.redirect(`${appBaseUrl}${returnPath}${returnPath.includes("?") ? "&" : "?"}storageError=${encodeURIComponent(providerError || "oauth_cancelled")}`);
    }
    try {
      const token = await exchangeCode(c, text(row.provider_type), code);
      const identity = await accountIdentity(c, text(row.provider_type), text(token.access_token));
      const existing = await c.env.DB.prepare(`SELECT * FROM file_hub_oauth_accounts WHERE main_company_slug=? AND provider_type=? AND provider_account_id=? LIMIT 1`).bind(row.main_company_slug, row.provider_type, identity.id).first<Row>();
      const accountId = text(existing?.id) || crypto.randomUUID(), accessCipher = await encrypt(c, token.access_token), refreshCipher = text(token.refresh_token) ? await encrypt(c, token.refresh_token) : text(existing?.refresh_token_cipher), expiresAt = new Date(Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000).toISOString(), ts = now();
      if (existing) {
        await c.env.DB.prepare(`UPDATE file_hub_oauth_accounts SET account_email=?,display_name=?,access_token_cipher=?,refresh_token_cipher=?,token_expires_at=?,scopes=?,metadata=?,updated_at=? WHERE id=?`).bind(identity.email || null, identity.name || null, accessCipher, refreshCipher || null, expiresAt, text(token.scope) || text(existing.scopes) || null, JSON.stringify(identity.metadata || {}), ts, accountId).run();
      } else {
        await c.env.DB.prepare(`INSERT INTO file_hub_oauth_accounts(id,main_company_slug,provider_type,provider_account_id,account_email,display_name,access_token_cipher,refresh_token_cipher,token_expires_at,scopes,created_by_user_id,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(accountId, row.main_company_slug, row.provider_type, identity.id, identity.email || null, identity.name || null, accessCipher, refreshCipher || null, expiresAt, text(token.scope) || null, row.user_id, JSON.stringify(identity.metadata || {}), ts, ts).run();
      }
      await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE state=?`).bind(state).run();
      const separator = returnPath.includes("?") ? "&" : "?";
      return c.redirect(`${appBaseUrl}${returnPath}${separator}storageConnected=1&storageAccount=${encodeURIComponent(accountId)}&storageProvider=${encodeURIComponent(text(row.provider_type))}`);
    } catch (error: any) {
      await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE state=?`).bind(state).run();
      const separator = returnPath.includes("?") ? "&" : "?";
      return c.redirect(`${appBaseUrl}${returnPath}${separator}storageError=${encodeURIComponent(text(error?.code || error?.message || "oauth_failed"))}`);
    }
  }
  app.get("/api/auth/file-hub/oauth/google/callback", (c) => oauthCallback(c, "GOOGLE"));
  app.get("/api/auth/file-hub/oauth/microsoft/callback", (c) => oauthCallback(c, "MICROSOFT"));
  app.get("/api/auth/file-hub/oauth/dropbox/callback", (c) => oauthCallback(c, "DROPBOX"));

  app.get("/api/file-hub/cloud/folders", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    const slug = companySlug(c), accountId = text(c.req.query("accountId")), parentId = text(c.req.query("parentId")) || "root", driveId = text(c.req.query("driveId"));
    if (!slug || !accountId) return c.json(err("REQUIRED", "Aktif firma ve bulut hesabı zorunludur."), 422);
    try {
      const { account, accessToken } = await usableAccount(c, slug, accountId);
      const provider = upper(account.provider_type);
      const rows = provider === "GOOGLE_DRIVE" ? await listGoogleChildren(accessToken, parentId, false) : provider==="DROPBOX"?await listDropboxChildren(accessToken,parentId,false):await listMicrosoftChildren(accessToken, parentId, driveId, false);
      return c.json({ ok: true, data: rows.map(({ raw, ...row }) => row) });
    } catch (error: any) { return c.json(err(text(error?.code) || "FOLDER_LIST_FAILED", text(error?.message) || "Klasörler alınamadı."), Number(error?.status) || 502); }
  });

  app.get("/api/file-hub/cloud/sharepoint/sites", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    const slug = companySlug(c), accountId = text(c.req.query("accountId")), q = text(c.req.query("q"));
    if (!slug || !accountId || q.length < 2) return c.json(err("REQUIRED", "SharePoint site araması için en az 2 karakter yazın."), 422);
    try {
      const { account, accessToken } = await usableAccount(c, slug, accountId); if (upper(account.provider_type) !== "SHAREPOINT") return c.json(err("INVALID_PROVIDER", "Bu hesap SharePoint hesabı değil."), 422);
      const payload = await providerJson(`https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(q)}&$select=id,displayName,name,webUrl`, accessToken);
      return c.json({ ok: true, data: Array.isArray(payload.value) ? payload.value : [] });
    } catch (error: any) { return c.json(err(text(error?.code) || "SITE_LIST_FAILED", text(error?.message) || "SharePoint siteleri alınamadı."), Number(error?.status) || 502); }
  });

  app.get("/api/file-hub/cloud/sharepoint/drives", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    const slug = companySlug(c), accountId = text(c.req.query("accountId")), siteId = text(c.req.query("siteId"));
    if (!slug || !accountId || !siteId) return c.json(err("REQUIRED", "SharePoint site seçimi zorunludur."), 422);
    try {
      const { accessToken } = await usableAccount(c, slug, accountId);
      const rows = await graphPaged(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl,driveType`, accessToken);
      return c.json({ ok: true, data: rows });
    } catch (error: any) { return c.json(err(text(error?.code) || "DRIVE_LIST_FAILED", text(error?.message) || "SharePoint kitaplıkları alınamadı."), Number(error?.status) || 502); }
  });

  app.post("/api/file-hub/cloud/connections", async (c) => {
    const body = await bodyOf(c); const gate = await assertCompanyOwner(c, body); if (gate.error) return gate.error;
    const accountId = text(body.accountId), rootFolderId = text(body.rootFolderId) || "root", rootFolderName = text(body.rootFolderName) || "Ana Klasör", driveId = text(body.driveId), isPrimary = Boolean(body.isPrimary);
    if (!accountId) return c.json(err("ACCOUNT_REQUIRED", "Bağlanacak bulut hesabını seçin."), 422);
    const account = await c.env.DB.prepare(`SELECT * FROM file_hub_oauth_accounts WHERE id=? AND main_company_slug=? LIMIT 1`).bind(accountId, gate.slug).first<Row>();
    if (!account) return c.json(err("ACCOUNT_NOT_FOUND", "Bulut hesabı bulunamadı."), 404);
    const provider = upper(account.provider_type); if (!["GOOGLE_DRIVE", "ONEDRIVE", "SHAREPOINT", "DROPBOX"].includes(provider)) return c.json(err("INVALID_PROVIDER", "Bulut hesabı sağlayıcısı geçersiz."), 422);
    if (provider === "SHAREPOINT" && !driveId) return c.json(err("DRIVE_REQUIRED", "SharePoint belge kitaplığı seçimi zorunludur."), 422);
    const id = crypto.randomUUID(), ts = now(), name = text(body.name) || `${text(account.display_name || account.account_email) || provider} · ${rootFolderName}`;
    if (isPrimary) await c.env.DB.prepare(`UPDATE file_hub_connections SET is_primary=0,updated_at=? WHERE main_company_slug=?`).bind(ts, gate.slug).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_connections(id,main_company_slug,provider_type,name,is_active,is_primary,local_root_path,remote_root_id,remote_root_name,sync_mode,connection_status,last_sync_at,last_error,metadata,created_at,updated_at) VALUES(?,?,?,?,1,?,NULL,?,?,'CLOUD_API','CONNECTED',NULL,NULL,?,?,?)`)
      .bind(id, gate.slug, provider, name, isPrimary ? 1 : 0, rootFolderId, rootFolderName, JSON.stringify({ cloudDirect: true, accountEmail: text(account.account_email), accountName: text(account.display_name), driveId: driveId || null }), ts, ts).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_cloud_connection_accounts(connection_id,main_company_slug,oauth_account_id,provider_drive_id,created_at,updated_at) VALUES(?,?,?,?,?,?)`).bind(id, gate.slug, accountId, driveId || null, ts, ts).run();
    return c.json({ ok: true, data: { id } }, 201);
  });

  app.delete("/api/file-hub/cloud/connections/:id", async (c) => {
    const gate = await assertCompanyOwner(c); if (gate.error) return gate.error; const id = c.req.param("id"), ts = now();
    const row = await c.env.DB.prepare(`SELECT id FROM file_hub_connections WHERE id=? AND main_company_slug=? LIMIT 1`).bind(id, gate.slug).first<Row>();
    if (!row) return c.json(err("NOT_FOUND", "Depolama servisi bulunamadı."), 404);
    await c.env.DB.prepare(`UPDATE file_hub_connections SET is_active=0,connection_status='DISCONNECTED',updated_at=? WHERE id=? AND main_company_slug=?`).bind(ts, id, gate.slug).run();
    return c.json({ ok: true });
  });

  app.post("/api/file-hub/cloud/connections/:id/sync", async (c) => {
    const body = await bodyOf(c); const gate = await assertCompanyOwner(c, body); if (gate.error) return gate.error; const connectionId = c.req.param("id"), limit = Math.min(2500, Math.max(50, Number(body.limit || 1200)));
    try {
      const { link, accessToken } = await connectionAccount(c, gate.slug, connectionId); if (Number(link.is_active) === 0) return c.json(err("CONNECTION_DISABLED", "Bu depolama servisi pasif."), 409);
      const provider = upper(link.provider_type), driveId = text(link.provider_drive_id), rootId = text(link.remote_root_id) || "root", rootName = text(link.remote_root_name) || "Ana Klasör", seenAt = now();
      if (["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT"].includes(provider)) {
        const progress = await runGoogleSyncBatch(c, gate.slug, connectionId, 1, false);
        return c.json({ ok: true, data: progress });
      }
      const queue: Row[] = [{ id: rootId, path: "" }]; let files = 0, folders = 0, truncated = false, modelSyncs = 0;
      const designBinding = await c.env.DB.prepare(`SELECT root_path FROM file_hub_bindings WHERE main_company_slug=? AND storage_connection_id=? AND module_code='DESEN' AND purpose_code='MODEL_IMAGE' AND sync_enabled=1 LIMIT 1`).bind(gate.slug, connectionId).first<Row>();
      while (queue.length && files + folders < limit) {
        const current = queue.shift()!;
        const children = provider === "GOOGLE_DRIVE" ? await listGoogleChildren(accessToken, current.id, true) : provider==="DROPBOX"?await listDropboxChildren(accessToken,current.id,true):await listMicrosoftChildren(accessToken, current.id, driveId, true);
        for (const child of children) {
          const relativePath = current.path ? `${current.path}/${child.name}` : child.name;
          if (child.isFolder) { folders += 1; if (files + folders < limit) queue.push({ id: child.id, path: relativePath }); else truncated = true; }
          else {
            const indexed = await upsertCloudFile(c, gate.slug, connectionId, provider, child, relativePath, seenAt);
            if (indexed.needsModelSync) {
              const synced = await syncCloudDesignBinding(c, gate.slug, connectionId, indexed.assetId, child, relativePath, provider);
              if (synced?.modelId) modelSyncs += 1;
            }
            files += 1;
          }
          if (files + folders >= limit) { truncated = true; break; }
        }
      }
      // Bu rakamlar dosya tarama sayısı değil, D1'de gerçekten bulunan model ilişkileridir.
      const linked = await c.env.DB.prepare(`SELECT COUNT(DISTINCT l.file_asset_id) AS linked_images, COUNT(DISTINCT r.entity_id) AS linked_models
          FROM file_hub_locations l
          JOIN file_hub_relations r ON r.file_asset_id=l.file_asset_id AND r.main_company_slug=l.main_company_slug AND r.entity_type='MODEL' AND r.relation_type='MODEL_IMAGE'
          JOIN model_records m ON m.id=r.entity_id AND m.main_company_slug=r.main_company_slug
          WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.is_available=1`).bind(gate.slug, connectionId).first<Row>();
      const linkedImages = Number(linked?.linked_images || 0);
      const linkedModels = Number(linked?.linked_models || 0);
      await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,metadata=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(seenAt, JSON.stringify({ ...json(link.connection_metadata), cloudDirect: true, accountEmail: text(link.account_email), accountName: text(link.display_name), driveId: driveId || null, lastSyncFiles: files, lastSyncFolders: folders, lastModelSyncs: modelSyncs, lastLinkedImages: linkedImages, lastLinkedModels: linkedModels, syncTruncated: truncated, rootName }), seenAt, connectionId, gate.slug).run();
      return c.json({ ok: true, data: { files, folders, truncated, lastSyncAt: seenAt, modelSyncs, linkedImages, linkedModels, designImageBindingPresent: Boolean(designBinding), designImageRootPath: text(designBinding?.root_path) } });
    } catch (error: any) {
      await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='ERROR',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(text(error?.message) || "Bulut senkronizasyonu başarısız.", now(), connectionId, gate.slug).run().catch(() => {});
      return c.json(err(text(error?.code) || "CLOUD_SYNC_FAILED", text(error?.message) || "Bulut senkronizasyonu başarısız."), Number(error?.status) || 502);
    }
  });

  app.get("/api/file-hub/cloud/files/:assetId/download", async (c) => {
    const gate = await assertCompanyOwner(c); if (gate.error) return gate.error; const slug = gate.slug!, assetId = c.req.param("assetId");
    const row = await c.env.DB.prepare(`SELECT a.file_name,a.mime_type,l.provider_file_id,l.storage_connection_id,x.oauth_account_id,x.provider_drive_id,c.provider_type FROM file_hub_assets a JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug JOIN file_hub_connections c ON c.id=l.storage_connection_id AND c.main_company_slug=l.main_company_slug JOIN file_hub_cloud_connection_accounts x ON x.connection_id=c.id AND x.main_company_slug=c.main_company_slug WHERE a.id=? AND a.main_company_slug=? LIMIT 1`).bind(assetId, slug).first<Row>();
    if (!row) return c.json(err("NOT_FOUND", "Bulut dosyası bulunamadı."), 404);
    try {
      const { accessToken } = await usableAccount(c, slug, text(row.oauth_account_id)); const provider = upper(row.provider_type), fileId = text(row.provider_file_id), driveId = text(row.provider_drive_id);
      const url = provider === "GOOGLE_DRIVE" ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media` : driveId ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(fileId)}/content` : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`;
      const response = provider==="DROPBOX"
        ? await fetch("https://content.dropboxapi.com/2/files/download",{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Dropbox-API-Arg":JSON.stringify({path:fileId})}})
        : await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow" }); if (!response.ok || !response.body) return c.json(err("DOWNLOAD_FAILED", `Bulut dosyası HTTP ${response.status} ile alınamadı.`), 502);
      const headers = new Headers(); headers.set("Content-Type", text(row.mime_type) || response.headers.get("Content-Type") || "application/octet-stream"); headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(text(row.file_name) || "dosya")}`); headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: 200, headers });
    } catch (error: any) { return c.json(err(text(error?.code) || "DOWNLOAD_FAILED", text(error?.message) || "Bulut dosyası indirilemedi."), 502); }
  });
}
