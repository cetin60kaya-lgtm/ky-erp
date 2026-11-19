export const GMAIL_PAGE_SIZE = 40;
export const GMAIL_FOLDERS_PER_PASS = 3;

const OTHER_LABELS = new Set(["UNREAD","STARRED","IMPORTANT","CHAT","CATEGORY_PERSONAL","CATEGORY_SOCIAL","CATEGORY_PROMOTIONS","CATEGORY_UPDATES","CATEGORY_FORUMS"]);
const STANDARD_FOLDERS = ["TRASH","SPAM","DRAFT","SENT","INBOX"];

// Gmail labels are not exclusive folders. A message's canonical place must not
// change merely because it was found through a second label on another page.
export function gmailCanonicalLabel(labels, scanned, knownLabels) {
  const values = Array.isArray(labels) ? labels.map(String) : [];
  const known = new Set(knownLabels);
  for (const id of STANDARD_FOLDERS) if (values.includes(id) && known.has(id)) return id;
  const custom = values.filter((id) => known.has(id) && !OTHER_LABELS.has(id) && !id.startsWith("CATEGORY_"))
    .sort((a,b)=>a.localeCompare(b,"tr"));
  return custom[0] || scanned;
}

// Cursor is a pageToken (not Gmail historyId). It only becomes DONE after
// the final page and after every message on that page persisted successfully.
export function gmailSyncPageState(previous, next, failed) {
  if (failed) return {cursor: previous || "", complete: false, error: true};
  if (next) return {cursor: "PAGE:" + next, complete: false, error: false};
  return {cursor: "DONE", complete: true, error: false};
}
export function gmailReadPageToken(cursor) {
  return String(cursor||"").startsWith("PAGE:") ? String(cursor).slice(5) : "";
}
