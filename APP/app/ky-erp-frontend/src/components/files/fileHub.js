import { apiGet, apiPatch, apiPost, apiPut } from "../../utils/api";

export const FILE_HUB_PROVIDERS = ["GOOGLE_DRIVE", "ONEDRIVE", "LOCAL_FOLDER", "NAS", "SHAREPOINT"];

export function getFileHubOverview() { return apiGet("/file-hub/overview"); }
export function getFileHubConnections() { return apiGet("/file-hub/connections"); }
export function createFileHubConnection(body) { return apiPost("/file-hub/connections", body); }
export function updateFileHubConnection(id, body) { return apiPatch(`/file-hub/connections/${id}`, body); }
export function getFileHubBindings() { return apiGet("/file-hub/bindings"); }
export function saveFileHubBinding(body) { return apiPut("/file-hub/bindings", body); }
export function resolveFileHubStorage(moduleCode, purposeCode) { return apiGet("/file-hub/resolve-storage", { moduleCode, purposeCode }); }
export function getEntityFiles(entityType, entityId) { return apiGet("/file-hub/entity-files", { entityType, entityId }); }
export function searchFileHub(q) { return apiGet("/file-hub/search", { q }); }
