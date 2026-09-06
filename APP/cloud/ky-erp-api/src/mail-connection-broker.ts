// KY ERP Mail Connection Broker
// Provider-specific transport stays behind this canonical capability contract.

export const MAIL_PROVIDER_TYPES = [
  "MICROSOFT_365",
  "GMAIL",
  "JMAP",
  "IMAP_SMTP",
] as const;

export type MailProviderType = typeof MAIL_PROVIDER_TYPES[number];

export type MailProviderCapabilities = {
  folders: boolean;
  threads: boolean;
  drafts: boolean;
  reply: boolean;
  forward: boolean;
  attachments: boolean;
  push: boolean;
  delta: boolean;
  sharedMailbox: boolean;
  oauth: boolean;
  jmap: boolean;
  imap: boolean;
  smtp: boolean;
};

const CAPABILITIES: Record<MailProviderType, MailProviderCapabilities> = {
  MICROSOFT_365: {
    folders: true, threads: true, drafts: true, reply: true, forward: true,
    attachments: true, push: true, delta: true, sharedMailbox: true,
    oauth: true, jmap: false, imap: false, smtp: false,
  },
  GMAIL: {
    folders: true, threads: true, drafts: true, reply: true, forward: true,
    attachments: true, push: true, delta: true, sharedMailbox: false,
    oauth: true, jmap: false, imap: false, smtp: false,
  },
  JMAP: {
    folders: true, threads: true, drafts: true, reply: true, forward: true,
    attachments: true, push: true, delta: true, sharedMailbox: false,
    oauth: true, jmap: true, imap: false, smtp: false,
  },
  IMAP_SMTP: {
    folders: true, threads: false, drafts: false, reply: true, forward: true,
    attachments: true, push: false, delta: true, sharedMailbox: false,
    oauth: true, jmap: false, imap: true, smtp: true,
  },
};

export function normalizeMailProvider(value: unknown): MailProviderType | "" {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "MICROSOFT" || normalized === "OUTLOOK" || normalized === "OFFICE365") return "MICROSOFT_365";
  if (normalized === "GOOGLE" || normalized === "GOOGLE_WORKSPACE") return "GMAIL";
  return (MAIL_PROVIDER_TYPES as readonly string[]).includes(normalized)
    ? normalized as MailProviderType
    : "";
}

export function mailProviderCapabilities(provider: unknown) {
  const normalized = normalizeMailProvider(provider);
  return normalized ? { provider: normalized, ...CAPABILITIES[normalized] } : null;
}

export function mailProviderRegistry() {
  return MAIL_PROVIDER_TYPES.map((provider) => ({
    provider,
    capabilities: CAPABILITIES[provider],
  }));
}

export type CanonicalMailAddress = { email: string; name?: string };
export type CanonicalMailEnvelope = {
  providerMessageId: string;
  providerThreadId?: string;
  internetMessageId?: string;
  from?: CanonicalMailAddress;
  to: CanonicalMailAddress[];
  cc?: CanonicalMailAddress[];
  bcc?: CanonicalMailAddress[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  sentAt?: string;
  receivedAt?: string;
  isRead?: boolean;
  isFlagged?: boolean;
  hasAttachments?: boolean;
  providerMetadata?: Record<string, unknown>;
};

export type CanonicalMailSendRequest = {
  logicalEventId: string;
  fromAccountId: string;
  to: CanonicalMailAddress[];
  cc?: CanonicalMailAddress[];
  bcc?: CanonicalMailAddress[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachmentRefs?: string[];
  replyToMessageId?: string;
};

export interface MailProviderAdapter {
  readonly provider: MailProviderType;
  capabilities(): MailProviderCapabilities;
  health(): Promise<{ ok: boolean; detail?: string }>;
  listFolders(): Promise<Array<{ id: string; name: string; type?: string; parentId?: string }>>;
  sync(params: { folderId?: string; cursor?: string }): Promise<{ messages: CanonicalMailEnvelope[]; cursor?: string }>;
  createDraft?(request: CanonicalMailSendRequest): Promise<{ providerDraftId: string }>;
  send(request: CanonicalMailSendRequest): Promise<{ providerMessageId?: string; acceptanceId?: string; state: "ACCEPTED" | "UNKNOWN_REVIEW_REQUIRED" }>;
}
