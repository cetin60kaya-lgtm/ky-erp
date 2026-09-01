// @ts-nocheck
import type { Context } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";
const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const now = () => new Date().toISOString();
const objectOf = (v: unknown): Row => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Row;
  try { const parsed = JSON.parse(text(v) || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
};
const normalize = (v: unknown) => upper(v).replace(/İ/g, "I").replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ").replace(/\s+/g, " ").trim();

async function modelRows(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC`,
  ).bind(MODEL_SCOPE, slug).all<Row>();
  return (result.results || []).map((row: Row) => ({ ...objectOf(row.data), storeId:row.id, fileName:row.file_name }));
}

async function saveModel(c: Context<AppEnv>, slug: string, model: Row) {
  const ts = now();
  const payload = { ...model, id:text(model.id), createdAt:text(model.createdAt || ts), updatedAt:ts };
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) LIMIT 1`,
  ).bind(MODEL_SCOPE, payload.id, slug).first<Row>();
  if (existing?.id) {
    await c.env.DB.prepare(`UPDATE json_store SET data=?,updated_at=? WHERE id=?`).bind(JSON.stringify(payload),ts,existing.id).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),MODEL_SCOPE,slug,payload.id,JSON.stringify(payload),ts,ts).run();
  }
  return payload;
}

function roleFor(purposeCode: string, extension: string) {
  if (purposeCode === "MODEL_IMAGE") return "MODEL_IMAGE";
  if (purposeCode === "PLACEMENT") return extension === "PDF" ? "PLACEMENT_PDF" : "PLACEMENT_FILE";
  if (purposeCode === "RIP_PDF") return "RIP_PDF";
  if (purposeCode === "OUTGOING_DESIGN") return "OUTGOING_DESIGN";
  if (purposeCode === "MODEL_SOURCE" && extension === "PSD") return "SOURCE_PSD";
  if (purposeCode === "MODEL_SOURCE" && extension === "AI") return "SOURCE_AI";
  if (purposeCode === "MODEL_SOURCE") return "SOURCE_FILE";
  return purposeCode || "OTHER";
}

export async function syncFileHubDesignModel(c: Context<AppEnv>, input: Row) {
  const slug = text(input.slug), modelName = text(input.modelName), fileAssetId = text(input.fileAssetId);
  const purposeCode = upper(input.purposeCode), extension = upper(input.extension);
  if (!slug || !modelName || !fileAssetId) return null;

  const rows = await modelRows(c, slug);
  let current = rows.find((row: Row) => normalize(row.modelName || row.modelCode) === normalize(modelName) && upper(row.status) !== "ARCHIVE");
  const created = !current;
  if (!current) {
    current = {
      id: crypto.randomUUID(),
      modelName,
      modelCode:modelName,
      companyId:"",
      companyName:"",
      status: purposeCode === "MODEL_IMAGE" ? "NEW_ARRIVAL" : "MODEL_INFO_MISSING",
      sourceType:"FILE_HUB",
      operations:[{
        id:crypto.randomUUID(), printAreaCode:"FRONT", printAreaName:"Ön", sequence:1,
        moldType:"UNDEFINED", placementStatus:"WAITING", dyehouseStatus:"WAITING",
        productionReady:false, channels:[], colorGroups:[],
      }],
      files:[], metadata:{}, createdAt:now(),
    };
  }

  const previewUrl = `/api/file-hub/files/${encodeURIComponent(fileAssetId)}/preview`;
  const role = roleFor(purposeCode, extension);
  let files = Array.isArray(current.files) ? [...current.files] : [];
  const oldIndex = files.findIndex((row: Row) => text(row.id) === fileAssetId || text(row.fileHubAssetId) === fileAssetId);
  const fileRow = {
    id:fileAssetId,
    fileHubAssetId:fileAssetId,
    fileName:text(input.fileName),
    role,
    printAreaCode:"FRONT",
    contentType:text(input.mimeType),
    size:Number(input.sizeBytes || 0),
    sourceSha256:text(input.sha256),
    sourceRelativePath:text(input.relativePath),
    sourceProvider:upper(input.providerType),
    storageConnectionId:text(input.storageConnectionId),
    bridgeManaged:false,
    fileHubManaged:true,
    previewUrl: ["MODEL_IMAGE","PLACEMENT_PDF","RIP_PDF"].includes(role) ? previewUrl : "",
    thumbnailUrl: role === "MODEL_IMAGE" ? previewUrl : "",
    createdAt:text(input.createdAt || now()),
    updatedAt:now(),
  };
  if (oldIndex >= 0) files[oldIndex] = { ...files[oldIndex], ...fileRow };
  else {
    if (role === "MODEL_IMAGE") {
      files = files.map((row: Row) => row.fileHubManaged === true && row.role === "MODEL_IMAGE" ? { ...row, role:"REVISION_IMAGE" } : row);
    }
    files.unshift(fileRow);
  }

  const saved = await saveModel(c, slug, {
    ...current,
    modelName:text(current.modelName || modelName),
    modelCode:text(current.modelCode || modelName),
    sourceType:text(current.sourceType || "FILE_HUB"),
    status: role === "MODEL_IMAGE" && upper(current.status) === "MODEL_INFO_MISSING" ? "NEW_ARRIVAL" : text(current.status || "NEW_ARRIVAL"),
    files,
    metadata:{
      ...objectOf(current.metadata),
      fileHub:{
        enabled:true,
        lastFileAssetId:fileAssetId,
        lastPurposeCode:purposeCode,
        lastProvider:upper(input.providerType),
        lastRelativePath:text(input.relativePath),
        lastSyncAt:now(),
        physicalSourceIsProvider:true,
        r2Role:"PREVIEW_CACHE_ONLY",
      },
    },
  });
  return { created, modelId:saved.id, modelName:saved.modelName, role };
}
