// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env & {
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_CLIENT_SECRET?: string;
  MICROSOFT_GRAPH_CLIENT_ID?: string;
  MICROSOFT_GRAPH_CLIENT_SECRET?: string;
  FILE_HUB_OAUTH_KEY?: string;
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
const providerFamily = (provider: unknown) => upper(provider) === "GOOGLE_DRIVE" ? "GOOGLE" : ["ONEDRIVE", "SHAREPOINT"].includes(upper(provider)) ? "MICROSOFT" : "";
const appBaseUrl = "https://app.kyerp.net";
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
  if (!user || upper(user.role) !== "COMPANY_ADMIN") {
    return { error: c.json(err("COMPANY_OWNER_ONLY", "Google Drive / OneDrive / SharePoint bağlantısını yalnız bu firmanın sahibi / işvereni yönetebilir."), 403) };
  }
  const slug = companySlug(c, body);
  if (!slug) return { error: c.json(err("TENANT_REQUIRED", "Aktif firma seçimi gerekli."), 422) };
  const own = text(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug);
  if (!own || own !== slug) return { error: c.json(err("TENANT_FORBIDDEN", "Başka firmanın depolama bağlantısını yönetemezsiniz."), 403) };
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
    throw Object.assign(new Error(text(payload.error_description || payload.error) || `OAuth token isteği HTTP ${response.status} döndürdü.`), { code: "OAUTH_TOKEN_FAILED" });
  }
  return payload;
}
async function exchangeCode(c: Context<AppEnv>, providerType: string, code: string) {
  const cfg = providerConfig(c, providerType);
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
  let location = await c.env.DB.prepare(`SELECT l.*,a.id asset_id FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.provider_file_id=? LIMIT 1`).bind(slug, connectionId, text(item.id)).first<Row>();
  if (!location) location = await c.env.DB.prepare(`SELECT l.*,a.id asset_id FROM file_hub_locations l JOIN file_hub_assets a ON a.id=l.file_asset_id AND a.main_company_slug=l.main_company_slug WHERE l.main_company_slug=? AND l.storage_connection_id=? AND l.relative_path=? LIMIT 1`).bind(slug, connectionId, relativePath).first<Row>();
  const fileName = text(item.name) || "dosya";
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toUpperCase() : "";
  if (location) {
    await c.env.DB.prepare(`UPDATE file_hub_assets SET file_name=?,extension=?,mime_type=?,size_bytes=?,status='AVAILABLE',source_type='CLOUD_API',last_seen_at=?,updated_at=?,metadata=? WHERE id=? AND main_company_slug=?`)
      .bind(fileName, extension || null, text(item.mimeType) || null, Number(item.size || 0), seenAt, seenAt, JSON.stringify({ provider, providerFileId: item.id, webUrl: item.webUrl || null, checksum: item.checksum || null }), location.asset_id, slug).run();
    await c.env.DB.prepare(`UPDATE file_hub_locations SET provider_file_id=?,relative_path=?,is_available=1,provider_modified_at=?,last_seen_at=?,updated_at=? WHERE id=?`)
      .bind(text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, location.id).run();
    return text(location.asset_id);
  }
  const assetId = crypto.randomUUID(), locationId = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO file_hub_assets(id,main_company_slug,logical_key,file_name,extension,mime_type,size_bytes,status,source_type,preview_status,metadata,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'AVAILABLE','CLOUD_API','NONE',?,?,?,?,?)`)
    .bind(assetId, slug, `${provider}:${connectionId}:${text(item.id)}`, fileName, extension || null, text(item.mimeType) || null, Number(item.size || 0), JSON.stringify({ provider, providerFileId: item.id, webUrl: item.webUrl || null, checksum: item.checksum || null }), seenAt, seenAt, seenAt, seenAt).run();
  await c.env.DB.prepare(`INSERT INTO file_hub_locations(id,main_company_slug,file_asset_id,storage_connection_id,provider_file_id,relative_path,location_role,is_available,provider_modified_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'PRIMARY',1,?,?,?,?)`)
    .bind(locationId, slug, assetId, connectionId, text(item.id), relativePath, text(item.modifiedAt) || null, seenAt, seenAt, seenAt).run();
  return assetId;
}


function archiveParts(relativePath: unknown, fallbackName: unknown) {
  const parts=text(relativePath).replace(/\\/g,"/").split("/").map(text).filter(Boolean);
  const fileName=parts.pop()||text(fallbackName)||"belge";
  return{folders:parts,fileName};
}
function googleQueryValue(value: unknown){return text(value).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function googleChildFolder(token:string,parentId:string,name:string){
  const q=\`'\${googleQueryValue(parentId||"root")}' in parents and name='\${googleQueryValue(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false\`;
  const params=new URLSearchParams({q,fields:"files(id,name)",pageSize:"10",spaces:"drive"});
  const payload=await providerJson(\`https://www.googleapis.com/drive/v3/files?\${params}\`,token);
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
  const q=\`'\${googleQueryValue(parentId||"root")}' in parents and name='\${googleQueryValue(name)}' and trashed=false and mimeType!='application/vnd.google-apps.folder'\`;
  const params=new URLSearchParams({q,fields:"files(id,name,webViewLink)",pageSize:"10",spaces:"drive"});
  const payload=await providerJson(\`https://www.googleapis.com/drive/v3/files?\${params}\`,token);
  return(Array.isArray(payload.files)?payload.files:[]).find((row:Row)=>text(row.name)===name)||null;
}
async function googleUpload(token:string,parentId:string,fileName:string,mimeType:string,bytes:ArrayBuffer){
  const existing=await googleExistingFile(token,parentId,fileName);
  const updateId=text(existing?.id),method=updateId?"PATCH":"POST";
  const initUrl=updateId
    ?\`https://www.googleapis.com/upload/drive/v3/files/\${encodeURIComponent(updateId)}?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,webViewLink\`
    :"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,webViewLink";
  const metadata=updateId?{name:fileName}:{name:fileName,parents:[parentId||"root"]};
  const init=await fetch(initUrl,{method,headers:{Authorization:\`Bearer \${token}\`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":mimeType||"application/octet-stream","X-Upload-Content-Length":String(bytes.byteLength)},body:JSON.stringify(metadata)});
  if(!init.ok)throw Object.assign(new Error(\`Google Drive upload oturumu HTTP \${init.status} döndürdü.\`),{code:"GOOGLE_UPLOAD_SESSION_FAILED",status:init.status});
  const location=text(init.headers.get("Location"));if(!location)throw Object.assign(new Error("Google Drive upload oturum adresi dönmedi."),{code:"GOOGLE_UPLOAD_LOCATION_MISSING"});
  const upload=await fetch(location,{method:"PUT",headers:{"Content-Type":mimeType||"application/octet-stream","Content-Length":String(bytes.byteLength)},body:bytes});
  const payload=await upload.json().catch(()=>({})) as Row;
  if(!upload.ok)throw Object.assign(new Error(text(payload?.error?.message)||\`Google Drive upload HTTP \${upload.status} döndürdü.\`),{code:"GOOGLE_UPLOAD_FAILED",status:upload.status});
  return{id:text(payload.id||updateId),name:text(payload.name||fileName),webUrl:text(payload.webViewLink||existing?.webViewLink),provider:"GOOGLE_DRIVE"};
}
function microsoftChildrenUrl(driveId:string,parentId:string){
  if(driveId)return parentId&&parentId!=="root"
    ?\`https://graph.microsoft.com/v1.0/drives/\${encodeURIComponent(driveId)}/items/\${encodeURIComponent(parentId)}/children\`
    :\`https://graph.microsoft.com/v1.0/drives/\${encodeURIComponent(driveId)}/root/children\`;
  return parentId&&parentId!=="root"
    ?\`https://graph.microsoft.com/v1.0/me/drive/items/\${encodeURIComponent(parentId)}/children\`
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
    if(!parent)throw Object.assign(new Error(\`\${name} bulut klasörü oluşturulamadı.\`),{code:"MICROSOFT_FOLDER_CREATE_FAILED"});
  }
  return parent;
}
function microsoftContentUrl(driveId:string,parentId:string,fileName:string){
  const encoded=encodeURIComponent(fileName);
  if(driveId)return parentId&&parentId!=="root"
    ?\`https://graph.microsoft.com/v1.0/drives/\${encodeURIComponent(driveId)}/items/\${encodeURIComponent(parentId)}:/\${encoded}:/content\`
    :\`https://graph.microsoft.com/v1.0/drives/\${encodeURIComponent(driveId)}/root:/\${encoded}:/content\`;
  return parentId&&parentId!=="root"
    ?\`https://graph.microsoft.com/v1.0/me/drive/items/\${encodeURIComponent(parentId)}:/\${encoded}:/content\`
    :\`https://graph.microsoft.com/v1.0/me/drive/root:/\${encoded}:/content\`;
}
async function microsoftUpload(token:string,driveId:string,parentId:string,fileName:string,mimeType:string,bytes:ArrayBuffer){
  const response=await fetch(microsoftContentUrl(driveId,parentId,fileName),{method:"PUT",headers:{Authorization:\`Bearer \${token}\`,"Content-Type":mimeType||"application/octet-stream"},body:bytes});
  const payload=await response.json().catch(()=>({})) as Row;
  if(!response.ok)throw Object.assign(new Error(text(payload?.error?.message)||\`Microsoft Graph upload HTTP \${response.status} döndürdü.\`),{code:"MICROSOFT_UPLOAD_FAILED",status:response.status});
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
  if(["ONEDRIVE","SHAREPOINT"].includes(provider)){
    const parentId=await ensureMicrosoftPath(accessToken,rootId,driveId,parts.folders);
    return{...(await microsoftUpload(accessToken,driveId,parentId,parts.fileName,text(input.mimeType)||"application/octet-stream",input.bytes)),providerType:provider,parentId,relativePath:text(input.relativePath)};
  }
  throw Object.assign(new Error("Bu File Hub sağlayıcısı doğrudan bulut arşivlemeyi desteklemiyor."),{code:"CLOUD_ARCHIVE_PROVIDER_UNSUPPORTED"});
}

export function registerFileHubCloudOauthRoutes(app: Hono<AppEnv>) {
  app.get("/api/file-hub/cloud/providers", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    return c.json({ ok: true, data: [
      { providerType: "GOOGLE_DRIVE", label: "Google Drive", authFamily: "GOOGLE", configured: providerReady(c, "GOOGLE_DRIVE"), mode: "CLOUD_API" },
      { providerType: "ONEDRIVE", label: "Microsoft OneDrive", authFamily: "MICROSOFT", configured: providerReady(c, "ONEDRIVE"), mode: "CLOUD_API" },
      { providerType: "SHAREPOINT", label: "Microsoft SharePoint", authFamily: "MICROSOFT", configured: providerReady(c, "SHAREPOINT"), mode: "CLOUD_API" },
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

  app.post("/api/file-hub/cloud/authorize", async (c) => {
    const body = await bodyOf(c); const gate = await assertCompanyOwner(c, body); if (gate.error) return gate.error;
    const providerType = upper(body.providerType), cfg = providerConfig(c, providerType);
    if (!cfg.family) return c.json(err("INVALID_PROVIDER", "Bu servis doğrudan bulut bağlantısını desteklemiyor."), 422);
    if (!providerReady(c, providerType)) return c.json(err("OAUTH_NOT_CONFIGURED", `${providerType === "GOOGLE_DRIVE" ? "Google Drive" : "Microsoft"} OAuth uygulama bilgileri henüz production ortamında tanımlı değil.`), 503);
    const state = stateToken(), createdAt = now(), expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(), returnPath = sanitizeReturnPath(body.returnPath);
    await c.env.DB.prepare(`DELETE FROM file_hub_oauth_states WHERE expires_at<?`).bind(createdAt).run();
    await c.env.DB.prepare(`INSERT INTO file_hub_oauth_states(state,main_company_slug,provider_type,user_id,return_path,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`).bind(state, gate.slug, providerType, gate.user.id, returnPath, expiresAt, createdAt).run();
    let authorizeUrl = "";
    if (cfg.family === "GOOGLE") {
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

  app.get("/api/file-hub/cloud/folders", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401);
    const slug = companySlug(c), accountId = text(c.req.query("accountId")), parentId = text(c.req.query("parentId")) || "root", driveId = text(c.req.query("driveId"));
    if (!slug || !accountId) return c.json(err("REQUIRED", "Aktif firma ve bulut hesabı zorunludur."), 422);
    try {
      const { account, accessToken } = await usableAccount(c, slug, accountId);
      const provider = upper(account.provider_type);
      const rows = provider === "GOOGLE_DRIVE" ? await listGoogleChildren(accessToken, parentId, false) : await listMicrosoftChildren(accessToken, parentId, driveId, false);
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
    const provider = upper(account.provider_type); if (!["GOOGLE_DRIVE", "ONEDRIVE", "SHAREPOINT"].includes(provider)) return c.json(err("INVALID_PROVIDER", "Bulut hesabı sağlayıcısı geçersiz."), 422);
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
      const queue: Row[] = [{ id: rootId, path: "" }]; let files = 0, folders = 0, truncated = false;
      while (queue.length && files + folders < limit) {
        const current = queue.shift()!;
        const children = provider === "GOOGLE_DRIVE" ? await listGoogleChildren(accessToken, current.id, true) : await listMicrosoftChildren(accessToken, current.id, driveId, true);
        for (const child of children) {
          const relativePath = current.path ? `${current.path}/${child.name}` : child.name;
          if (child.isFolder) { folders += 1; if (files + folders < limit) queue.push({ id: child.id, path: relativePath }); else truncated = true; }
          else { await upsertCloudFile(c, gate.slug, connectionId, provider, child, relativePath, seenAt); files += 1; }
          if (files + folders >= limit) { truncated = true; break; }
        }
      }
      await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='CONNECTED',last_sync_at=?,last_error=NULL,metadata=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(seenAt, JSON.stringify({ ...json(link.connection_metadata), cloudDirect: true, accountEmail: text(link.account_email), accountName: text(link.display_name), driveId: driveId || null, lastSyncFiles: files, lastSyncFolders: folders, syncTruncated: truncated, rootName }), seenAt, connectionId, gate.slug).run();
      return c.json({ ok: true, data: { files, folders, truncated, lastSyncAt: seenAt } });
    } catch (error: any) {
      await c.env.DB.prepare(`UPDATE file_hub_connections SET connection_status='ERROR',last_error=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(text(error?.message) || "Bulut senkronizasyonu başarısız.", now(), connectionId, gate.slug).run().catch(() => {});
      return c.json(err(text(error?.code) || "CLOUD_SYNC_FAILED", text(error?.message) || "Bulut senkronizasyonu başarısız."), Number(error?.status) || 502);
    }
  });

  app.get("/api/file-hub/cloud/files/:assetId/download", async (c) => {
    const user = await currentUser(c); if (!user) return c.json(err("UNAUTHORIZED", "Oturum gerekli."), 401); const slug = companySlug(c), assetId = c.req.param("assetId");
    const row = await c.env.DB.prepare(`SELECT a.file_name,a.mime_type,l.provider_file_id,l.storage_connection_id,x.oauth_account_id,x.provider_drive_id,c.provider_type FROM file_hub_assets a JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug JOIN file_hub_connections c ON c.id=l.storage_connection_id AND c.main_company_slug=l.main_company_slug JOIN file_hub_cloud_connection_accounts x ON x.connection_id=c.id AND x.main_company_slug=c.main_company_slug WHERE a.id=? AND a.main_company_slug=? LIMIT 1`).bind(assetId, slug).first<Row>();
    if (!row) return c.json(err("NOT_FOUND", "Bulut dosyası bulunamadı."), 404);
    try {
      const { accessToken } = await usableAccount(c, slug, text(row.oauth_account_id)); const provider = upper(row.provider_type), fileId = text(row.provider_file_id), driveId = text(row.provider_drive_id);
      const url = provider === "GOOGLE_DRIVE" ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media` : driveId ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(fileId)}/content` : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow" }); if (!response.ok || !response.body) return c.json(err("DOWNLOAD_FAILED", `Bulut dosyası HTTP ${response.status} ile alınamadı.`), 502);
      const headers = new Headers(); headers.set("Content-Type", text(row.mime_type) || response.headers.get("Content-Type") || "application/octet-stream"); headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(text(row.file_name) || "dosya")}`); headers.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: 200, headers });
    } catch (error: any) { return c.json(err(text(error?.code) || "DOWNLOAD_FAILED", text(error?.message) || "Bulut dosyası indirilemedi."), 502); }
  });
}
