import { apiPost } from "../utils/api";

function unwrap(payload) {
  return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

function assertOperationalPdksCommand(command) {
  const folded = String(command || "").trim().toLocaleUpperCase("tr-TR");
  const blocked = ["AVANS", "BORDRO", "MAAŞ", "MAAS", "BANKA", "ELDEN", "KESİNTİ", "KESINTI", "İCRA", "ICRA", "HACİZ", "HACIZ", "FİBE", "FIBE"];
  if (blocked.some((word) => folded.includes(word))) {
    throw new Error("Finans ve bordro işlemleri PDKS'den yapılamaz. İK İşlem Merkezi'ni kullanın.");
  }
}

async function runAssistant(command, { mainCompanyId, commit }) {
  return unwrap(await apiPost("/ik/personnel-control/assistant/command", {
    command: String(command || "").trim(),
    mainCompanyId,
    commit: Boolean(commit),
  }));
}

export async function previewPdksAssistantCommand(command, { mainCompanyId } = {}) {
  const raw = String(command || "").trim();
  if (!raw) throw new Error("Komut yazın.");
  assertOperationalPdksCommand(raw);
  return runAssistant(raw, { mainCompanyId, commit: false });
}

export async function commitPdksAssistantCommand(command, { mainCompanyId } = {}) {
  const raw = String(command || "").trim();
  if (!raw) throw new Error("Komut yazın.");
  assertOperationalPdksCommand(raw);
  return runAssistant(raw, { mainCompanyId, commit: true });
}

export async function executePdksAssistantCommand(command, { mainCompanyId } = {}) {
  const preview = await previewPdksAssistantCommand(command, { mainCompanyId });
  const summary = preview?.summary || "İşlem önizlendi.";
  const approved = typeof window === "undefined"
    ? false
    : window.confirm(`PDKS D1 işlemi uygulanacak:\n\n${summary}\n\nOnaylıyor musunuz?`);
  if (!approved) return { ...preview, committed: false, message: "İşlem iptal edildi; D1'e yazılmadı." };
  const result = await commitPdksAssistantCommand(command, { mainCompanyId });
  return { ...result, message: result?.summary || "PDKS işlemi D1'e uygulandı." };
}

export const PDKS_ASSISTANT_EXAMPLES = [
  "Ali Akkaya bugün 08:32 geldi",
  "Ali Akkaya bugün gelmedi, yok yaz",
  "Ali Akkaya bugün 18:55 çıkış yaptı",
];
