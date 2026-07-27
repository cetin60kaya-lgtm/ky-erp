import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { maskSensitiveData, safeJsonObject } from "./ai.security";

type AiUser = { id: string; role?: string };
type ProjectScope = "backend" | "frontend" | "all";
type CodeEdit = { operation?: string; path?: string; find?: string; replacement?: string };

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 200_000;
const MAX_READ_CHARS = 60_000;
const MAX_SEARCH_FILES = 1_500;
const MAX_EDIT_FILES = 8;
const MAX_EDITS = 12;
const MAX_EDIT_OUTPUT_CHARS = 500_000;
const ALLOWED_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".jsonc", ".jsx", ".md", ".mjs",
  ".prisma", ".ps1", ".scss", ".sql", ".ts", ".tsx", ".yaml", ".yml",
]);
const DENIED_SEGMENTS = new Set([
  ".git", ".wrangler", "code-backup", "data", "dist", "logs", "node_modules",
  "sql-backup", "storage", "temp", "tmp",
]);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

@Injectable()
export class AiDevelopmentService {
  private readonly backendRoot = path.resolve(process.cwd());
  private readonly frontendRoot = path.resolve(this.backendRoot, "../ky-erp-frontend");
  private readonly projectRoot = path.resolve(this.backendRoot, "../../..");

  isEnabled() {
    return process.env.NODE_ENV !== "production" &&
      String(process.env.AI_DEVELOPER_MODE || "").trim().toLowerCase() === "true";
  }

  status(user: AiUser) {
    const isAdmin = String(user.role || "").toUpperCase() === "ADMIN";
    return {
      enabled: this.isEnabled() && isAdmin,
      configured: this.isEnabled(),
      adminRequired: true,
      environment: process.env.NODE_ENV || "development",
      scopes: ["frontend", "backend"],
      confirmationRequiredForWrites: true,
      automaticValidation: true,
    };
  }

  assertAllowed(user: AiUser) {
    if (String(user.role || "").toUpperCase() !== "ADMIN") {
      throw new ForbiddenException("Geliştirme araçları yalnızca sistem yöneticisine açıktır.");
    }
    if (!this.isEnabled()) {
      throw new ForbiddenException("Geliştirme modu bu ortamda etkin değil.");
    }
  }

  private resolveProjectFile(input: unknown) {
    const raw = String(input || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!raw || path.isAbsolute(raw) || /^[a-z]:/i.test(raw)) {
      throw new BadRequestException("Dosya yolu backend/ veya frontend/ ile başlamalıdır.");
    }
    const segments = raw.split("/").filter(Boolean);
    if (segments.includes("..") || segments.length < 2) {
      throw new BadRequestException("Geçersiz proje dosyası yolu.");
    }
    const scope = segments.shift()?.toLowerCase();
    const base = scope === "backend" ? this.backendRoot : scope === "frontend" ? this.frontendRoot : null;
    if (!base) throw new BadRequestException("Yalnızca backend/ ve frontend/ kaynaklarına erişilebilir.");
    const lowered = segments.map((segment) => segment.toLowerCase());
    if (lowered.some((segment) => DENIED_SEGMENTS.has(segment)) || lowered.some((segment) => segment.startsWith(".env"))) {
      throw new ForbiddenException("Bu dosya veya klasör geliştirme araçlarına kapalıdır.");
    }
    const relative = segments.join("/");
    if (/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(segments.at(-1) || "")) {
      throw new ForbiddenException("Kilit dosyaları doğrudan değiştirilemez.");
    }
    const extension = path.extname(relative).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new ForbiddenException("Bu dosya türüne erişim izni yok.");
    const absolute = path.resolve(base, ...segments);
    if (absolute !== base && !absolute.startsWith(`${base}${path.sep}`)) {
      throw new ForbiddenException("Proje kökü dışına erişilemez.");
    }
    return { absolute, relative: `${scope}/${relative}`, scope: scope as Exclude<ProjectScope, "all"> };
  }

  private roots(scope: ProjectScope) {
    if (scope === "backend") return [{ name: "backend", root: this.backendRoot }];
    if (scope === "frontend") return [{ name: "frontend", root: this.frontendRoot }];
    return [{ name: "backend", root: this.backendRoot }, { name: "frontend", root: this.frontendRoot }];
  }

  private scope(value: unknown): ProjectScope {
    const scope = String(value || "all").toLowerCase();
    if (!(["backend", "frontend", "all"] as string[]).includes(scope)) {
      throw new BadRequestException("Kapsam backend, frontend veya all olmalıdır.");
    }
    return scope as ProjectScope;
  }

  private async listFiles(root: string, max = MAX_SEARCH_FILES) {
    const output: string[] = [];
    const visit = async (directory: string) => {
      if (output.length >= max) return;
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (output.length >= max) break;
        if (DENIED_SEGMENTS.has(entry.name.toLowerCase()) || entry.name.toLowerCase().startsWith(".env")) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(absolute);
      }
    };
    await visit(root);
    return output;
  }

  overview(user: AiUser) {
    this.assertAllowed(user);
    return {
      success: true,
      sourceCount: 2,
      data: {
        mode: "ADMIN_LOCAL_DEVELOPMENT",
        projects: [
          { scope: "backend", framework: "NestJS + Prisma", pathPrefix: "backend/" },
          { scope: "frontend", framework: "React + Vite", pathPrefix: "frontend/" },
        ],
        protections: ["Gizli dosyalar kapalı", "Kod yazımı onaylı", "Test başarısızsa otomatik geri dönüş"],
      },
    };
  }

  async search(rawArgs: unknown, user: AiUser) {
    this.assertAllowed(user);
    const args = safeJsonObject(rawArgs);
    const query = String(args.query || "").trim();
    if (query.length < 2 || query.length > 120) throw new BadRequestException("Arama 2-120 karakter olmalıdır.");
    const limit = Math.min(50, Math.max(1, Number(args.limit || 20) || 20));
    const matches: Array<{ path: string; line: number; preview: string }> = [];
    for (const project of this.roots(this.scope(args.scope))) {
      const files = await this.listFiles(project.root);
      for (const file of files) {
        if (matches.length >= limit) break;
        const info = await stat(file).catch(() => null);
        if (!info || info.size > MAX_FILE_BYTES) continue;
        const content = await readFile(file, "utf8").catch(() => "");
        content.split(/\r?\n/).forEach((line, index) => {
          if (matches.length < limit && line.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))) {
            matches.push({
              path: `${project.name}/${path.relative(project.root, file).replace(/\\/g, "/")}`,
              line: index + 1,
              preview: maskSensitiveData(line.trim()).slice(0, 300),
            });
          }
        });
      }
    }
    return { success: true, sourceCount: matches.length, data: matches };
  }

  async read(rawArgs: unknown, user: AiUser) {
    this.assertAllowed(user);
    const args = safeJsonObject(rawArgs);
    const resolved = this.resolveProjectFile(args.path);
    const info = await stat(resolved.absolute).catch(() => null);
    if (!info?.isFile()) throw new BadRequestException("Dosya bulunamadı.");
    if (info.size > MAX_FILE_BYTES) throw new BadRequestException("Dosya güvenli okuma sınırını aşıyor.");
    const lines = (await readFile(resolved.absolute, "utf8")).split(/\r?\n/);
    const startLine = Math.min(lines.length || 1, Math.max(1, Number(args.startLine || 1) || 1));
    const endLine = Math.min(lines.length, Math.max(startLine, Number(args.endLine || startLine + 250) || startLine + 250));
    const content = lines.slice(startLine - 1, endLine).map((line, index) => `${startLine + index}: ${line}`).join("\n");
    return { success: true, sourceCount: 1, data: { path: resolved.relative, startLine, endLine, content: maskSensitiveData(content).slice(0, MAX_READ_CHARS) } };
  }

  async errors(rawArgs: unknown, user: AiUser) {
    this.assertAllowed(user);
    const args = safeJsonObject(rawArgs);
    const lineCount = Math.min(300, Math.max(20, Number(args.lines || 120) || 120));
    const logRoot = path.join(this.projectRoot, "LOGS");
    const logs = ["backend-hidden-error.log", "backend-hidden.log", "frontend-hidden-error.log", "frontend-hidden.log"];
    const data = [];
    for (const name of logs) {
      const file = path.join(logRoot, name);
      const content = await readFile(file, "utf8").catch(() => "");
      data.push({ name, content: maskSensitiveData(content.split(/\r?\n/).slice(-lineCount).join("\n")).slice(-MAX_READ_CHARS) });
    }
    return { success: true, sourceCount: data.length, data };
  }

  prepareEdits(rawArgs: unknown, user: AiUser) {
    this.assertAllowed(user);
    const args = safeJsonObject(rawArgs);
    const edits = Array.isArray(args.edits) ? args.edits.map((value) => safeJsonObject(value) as CodeEdit) : [];
    if (!edits.length || edits.length > MAX_EDITS) throw new BadRequestException(`1-${MAX_EDITS} kod düzenlemesi bekleniyor.`);
    const paths = new Set<string>();
    for (const edit of edits) {
      const operation = String(edit.operation || "replace");
      if (!(["create", "replace"] as string[]).includes(operation)) throw new BadRequestException("Kod işlemi create veya replace olmalıdır.");
      const resolved = this.resolveProjectFile(edit.path);
      paths.add(resolved.relative);
      const replacement = String(edit.replacement ?? "");
      if (operation === "replace" && !String(edit.find || "")) throw new BadRequestException("Replace işlemi için find zorunludur.");
      if (replacement.length > MAX_FILE_BYTES) throw new BadRequestException("Kod düzenlemesi boyut sınırını aşıyor.");
    }
    if (paths.size > MAX_EDIT_FILES) throw new BadRequestException(`Tek onayda en fazla ${MAX_EDIT_FILES} dosya değiştirilebilir.`);
    return { edits, summary: String(args.summary || `${paths.size} kaynak dosyası düzenlenecek.`).slice(0, 500), paths: [...paths] };
  }

  private async runCommand(cwd: string, script: string) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    try {
      const { stdout, stderr } = await execFileAsync(npm, ["run", script], { cwd, timeout: 120_000, maxBuffer: 2_000_000 });
      return { script, success: true, output: maskSensitiveData(`${stdout}\n${stderr}`).slice(-12_000) };
    } catch (error: any) {
      return { script, success: false, output: maskSensitiveData(`${error?.stdout || ""}\n${error?.stderr || error?.message || ""}`).slice(-12_000) };
    }
  }

  async validate(scopeValue: unknown, user: AiUser) {
    this.assertAllowed(user);
    const scope = this.scope(scopeValue);
    const checks: Array<{ cwd: string; script: string }> = [];
    if (scope === "backend" || scope === "all") checks.push({ cwd: this.backendRoot, script: "test:ai" }, { cwd: this.backendRoot, script: "build" });
    if (scope === "frontend" || scope === "all") checks.push({ cwd: this.frontendRoot, script: "lint" }, { cwd: this.frontendRoot, script: "build" });
    const results = [];
    for (const check of checks) results.push(await this.runCommand(check.cwd, check.script));
    return { success: results.every((result) => result.success), results };
  }

  async applyEdits(rawPayload: unknown, user: AiUser) {
    this.assertAllowed(user);
    const payload = safeJsonObject(rawPayload);
    const prepared = this.prepareEdits({ edits: payload.edits, summary: payload.summary }, user);
    const originals = new Map<string, string | null>();
    const nextContents = new Map<string, string>();
    const scopes = new Set<ProjectScope>();

    for (const edit of prepared.edits) {
      const operation = String(edit.operation || "replace");
      const resolved = this.resolveProjectFile(edit.path);
      scopes.add(resolved.scope);
      if (!originals.has(resolved.absolute)) {
        const existing = await readFile(resolved.absolute, "utf8").catch((error: any) => error?.code === "ENOENT" ? null : Promise.reject(error));
        originals.set(resolved.absolute, existing);
        nextContents.set(resolved.absolute, existing || "");
      }
      const current = nextContents.get(resolved.absolute) || "";
      if (operation === "create") {
        if (originals.get(resolved.absolute) !== null) throw new BadRequestException(`${resolved.relative} zaten mevcut.`);
        nextContents.set(resolved.absolute, String(edit.replacement || ""));
      } else {
        if (originals.get(resolved.absolute) === null) throw new BadRequestException(`${resolved.relative} bulunamadı.`);
        const find = String(edit.find || "");
        const occurrences = current.split(find).length - 1;
        if (occurrences !== 1) throw new BadRequestException(`${resolved.relative} içinde hedef metin tam bir kez bulunmalıdır; bulunan: ${occurrences}.`);
        nextContents.set(resolved.absolute, current.replace(find, String(edit.replacement ?? "")));
      }
    }
    const totalChars = [...nextContents.values()].reduce((sum, content) => sum + content.length, 0);
    if (totalChars > MAX_EDIT_OUTPUT_CHARS) throw new BadRequestException("Toplam düzenleme boyutu güvenli sınırı aşıyor.");

    const backupId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const backupRoot = path.join(this.projectRoot, "CODE-BACKUP", "ai-dev", backupId);
    await mkdir(backupRoot, { recursive: true });
    const manifest: any[] = [];
    for (const [absolute, original] of originals) {
      const resolved = [...prepared.paths].find((candidate) => this.resolveProjectFile(candidate).absolute === absolute) || path.basename(absolute);
      if (original !== null) {
        const backupFile = path.join(backupRoot, resolved.replace(/\//g, path.sep));
        await mkdir(path.dirname(backupFile), { recursive: true });
        await copyFile(absolute, backupFile);
      }
      manifest.push({ path: resolved, existed: original !== null, beforeSha256: original === null ? null : sha256(original), afterSha256: sha256(nextContents.get(absolute) || "") });
    }
    await writeFile(path.join(backupRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    const rollback = async () => {
      for (const [absolute, original] of originals) {
        if (original === null) await rm(absolute, { force: true });
        else await writeFile(absolute, original, "utf8");
      }
    };
    try {
      for (const [absolute, content] of nextContents) {
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, content, "utf8");
      }
      const validationScope: ProjectScope = scopes.size > 1 ? "all" : ([...scopes][0] || "all");
      const validation = await this.validate(validationScope, user);
      if (!validation.success) {
        await rollback();
        throw new BadRequestException(`Kod doğrulaması başarısız oldu; değişiklikler geri alındı. ${validation.results.filter((row) => !row.success).map((row) => `${row.script}: ${row.output.slice(-1500)}`).join(" ")}`);
      }
      return { module: "ADMIN", recordType: "source_code", recordId: backupId, before: { files: manifest.map(({ path, beforeSha256 }) => ({ path, sha256: beforeSha256 })) }, after: { files: manifest.map(({ path, afterSha256 }) => ({ path, sha256: afterSha256 })), backupPath: `CODE-BACKUP/ai-dev/${backupId}`, validation: validation.results.map(({ script, success }) => ({ script, success })) } };
    } catch (error) {
      await rollback().catch(() => undefined);
      throw error;
    }
  }
}
