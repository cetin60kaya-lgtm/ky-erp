export type D1SyncStatusRow = Record<string, unknown>;
export interface UnifiedSyncStatus {
  asOf: string;
  source: "D1_UNIFIED_OUTBOX_ONLY";
  totalCommands: number;
  status: Readonly<Record<"PENDING"|"CLAIMED"|"ACKED"|"FAILED", number>>;
  devices: Readonly<{registered:number;enabled:number}>;
  recent: ReadonlyArray<{
    id:string;eventType:string;action:string;
    state:string;attempts:number;
    createdAt:string|null;nextAttemptAt:string|null;
    leaseUntil:string|null;acknowledgedAt:string|null;
    errorCode:string|null;
  }>;
  localAgentOnline:false;
  terminalRawCertified:false;
  firebirdVerified:false;
  annualTnfVerified:false;
  sourceReconciled:false;
  productionApproved:false;
  complete:true;
}
export function projectUnifiedSyncStatus(input:{
  company:string;counts:D1SyncStatusRow[];rows:D1SyncStatusRow[];
  devices:D1SyncStatusRow[];asOf:string;
}):UnifiedSyncStatus;
