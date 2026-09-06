export async function mailReplyContext(db: D1Database, tenant: string, accountId: string, messageId: string) {
  if (!messageId) return null;
  const original = await db.prepare(`SELECT m.provider_message_id,m.internet_message_id,m.subject,t.provider_thread_id
    FROM mail_messages m LEFT JOIN mail_threads t ON t.id=m.thread_id
    AND t.main_company_slug=m.main_company_slug AND t.account_id=m.account_id
    WHERE m.id=? AND m.main_company_slug=? AND m.account_id=? LIMIT 1`)
    .bind(messageId, tenant, accountId).first<{provider_message_id:string;internet_message_id:string;subject:string;provider_thread_id:string}>();
  if (!original?.provider_message_id) throw Object.assign(new Error("Yanıtlanacak mail bu posta kutusunda bulunamadı."), {code:"MAIL_REPLY_NOT_FOUND",status:422});
  return original;
}

export function gmailReplyHeaders(original: {internet_message_id:string;provider_thread_id:string} | null) {
  if (!original) return [];
  const id=String(original.internet_message_id || "").trim();
  if (!/^<[^<>\s]+>$/.test(id) || !original.provider_thread_id) {
    throw Object.assign(new Error("Yanıt ilişkisi eksik. Önce posta kutusunu senkronize edin."), {code:"MAIL_REPLY_THREAD_MISSING",status:422});
  }
  return [`In-Reply-To: ${id}`, `References: ${id}`];
}
