import fs from "node:fs";

function edit(file, mutate) {
  const source = fs.readFileSync(file, "utf8");
  const next = mutate(source);
  if (next === source) throw new Error(`Dosya değişmedi: ${file}`);
  fs.writeFileSync(file, next, "utf8");
}

function mustReplace(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Desen bulunamadı: ${label}`);
  return source.replace(pattern, replacement);
}

const isnetService = "APP/app/ky-erp-backend/src/muhasebe/isnet-operations.service.ts";
edit(isnetService, (source) => mustReplace(
  source,
  /  private async loginToIsnet\(username: string, password: string\) \{[\s\S]*?\n  \}\n\n  async getSettings/,
`  private async loginToIsnet(username: string, password: string) {
    if (!username || !password) {
      throw new BadRequestException(
        "İşNet kullanıcı adı ve şifresi zorunludur.",
      );
    }

    let apiError: any = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(
        \`${'${this.isnetBaseUrl().replace(/\\/+$/, "")}'}\/api/Account/Login\`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            IdentificationNumber: username,
            Password: password,
          }),
          signal: controller.signal,
        },
      );
      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (response.ok) {
        const result = clean(
          payload?.Result ?? payload?.result,
        ).toLocaleLowerCase("tr-TR");
        const token = clean(payload?.Token ?? payload?.token);
        const errorMessage = clean(
          payload?.ErrorMessage ?? payload?.errorMessage,
        );
        const companies = this.normalizeCompanies(payload);
        if (
          !errorMessage &&
          token &&
          companies.length &&
          (!result || ["0", "success", "başarılı", "basarili", "ok"].includes(result))
        ) {
          return {
            companies,
            expiresOn: payload?.ExpiresOn || payload?.expiresOn || null,
            connectionMode: "api",
          };
        }
        apiError = new Error(
          errorMessage ||
            (!token
              ? "İşNet API giriş tokenı alınamadı."
              : "İşNet API yetkili firma listesi döndürmedi."),
        );
      } else {
        apiError = new Error(\`İşNet API giriş servisi HTTP ${'${response.status}'} döndürdü.\`);
      }
    } catch (error: any) {
      apiError = error;
    } finally {
      clearTimeout(timeout);
    }

    try {
      return await this.loginToPortal(username, password);
    } catch (portalError: any) {
      if (portalError instanceof BadRequestException) throw portalError;
      const apiMessage = clean(apiError?.message) || "API bağlantısı kurulamadı";
      const portalMessage = clean(portalError?.message) || "portal bağlantısı kurulamadı";
      throw new BadGatewayException(
        \`İşNet bağlantısı kurulamadı. API: ${'${apiMessage}'} Portal: ${'${portalMessage}'}\`,
      );
    }
  }

  async getSettings`,
  "loginToIsnet",
));

const workflowService = "APP/app/ky-erp-backend/src/modules/desen/desen-workflow.service.ts";
edit(workflowService, (source) => {
  let next = mustReplace(
    source,
    /import \{ createHash, randomUUID \} from "crypto";/,
    `import { exec } from "child_process";\nimport { createHash, randomUUID } from "crypto";`,
    "workflow child_process import",
  );
  next = mustReplace(
    next,
    /import \{ getStorageRoot \} from "\.\.\/\.\.\/storage\/storage-path\.util";/,
    `import { getStorageRoot } from "../../storage/storage-path.util";\nimport {\n  getDesenFolderSettings,\n  saveDesenFolderSettings,\n  testDesenFolderSettings,\n} from "./desen-folder-settings.util";`,
    "workflow settings import",
  );
  next = mustReplace(
    next,
    /  private folders\(\) \{[\s\S]*?\n  \}\n\n  private async log/,
`  private folders(mainCompanySlug: string) {
    const settings = getDesenFolderSettings(mainCompanySlug);
    const result = {
      root: path.dirname(settings.modelsFolder),
      incoming: settings.incomingFolder,
      error: settings.errorFolder,
      models: settings.modelsFolder,
      archive: settings.archiveFolder,
      staging: path.join(settings.modelsFolder, ".staging"),
    };
    Object.values(result).forEach((folder) => fs.mkdirSync(folder, { recursive: true }));
    return result;
  }

  getFolderSettings(payload: Record<string, any>) {
    const mainCompanySlug = this.slug(payload);
    return testDesenFolderSettings(mainCompanySlug);
  }

  saveFolderSettings(payload: Record<string, any>) {
    const mainCompanySlug = this.slug(payload);
    saveDesenFolderSettings(mainCompanySlug, payload);
    return testDesenFolderSettings(mainCompanySlug);
  }

  testFolderSettings(payload: Record<string, any>) {
    const mainCompanySlug = this.slug(payload);
    return testDesenFolderSettings(mainCompanySlug, payload);
  }

  openIncomingFolder(payload: Record<string, any>) {
    const mainCompanySlug = this.slug(payload);
    const { incomingFolder } = getDesenFolderSettings(mainCompanySlug);
    fs.mkdirSync(incomingFolder, { recursive: true });
    if (process.platform === "win32") {
      exec(\`cmd /c start "" "${'${incomingFolder.replace(/"/g, "\"\"")}'}"\`);
      return { opened: true, folderPath: incomingFolder };
    }
    return {
      opened: false,
      folderPath: incomingFolder,
      message: "Explorer açma yalnızca Windows'ta desteklenir.",
    };
  }

  private async log`,
    "workflow folders",
  );
  next = next.replace(/this\.folders\(\)/g, "this.folders(mainCompanySlug)");
  return next;
});

const desenService = "APP/app/ky-erp-backend/src/modules/desen/desen.service.ts";
edit(desenService, (source) => {
  let next = mustReplace(
    source,
    /import \{ getStorageRoot \} from "\.\.\/\.\.\/storage\/storage-path\.util";/,
    `import { getStorageRoot } from "../../storage/storage-path.util";\nimport { getDesenFolderSettings } from "./desen-folder-settings.util";`,
    "desen settings import",
  );
  next = mustReplace(
    next,
    /  private defaultIncomingModelFolderPath\(\) \{\n    return path\.join\(getStorageRoot\(\), "desen", "gelen"\);\n  \}/,
`  private defaultIncomingModelFolderPath(mainCompanySlug?: string) {
    if (mainCompanySlug) {
      return getDesenFolderSettings(mainCompanySlug).incomingFolder;
    }
    return path.join(getStorageRoot(), "desen", "gelen");
  }`,
    "default incoming folder",
  );
  next = next.replace(/const folderPath = this\.defaultIncomingModelFolderPath\(\);/g, "const folderPath = this.defaultIncomingModelFolderPath(slug);");
  return next;
});

const controller = "APP/app/ky-erp-backend/src/modules/desen/desen.controller.ts";
edit(controller, (source) => mustReplace(
  source,
  /  @Get\("workflow\/inbox"\)\n  async workflowInbox\(@Query\(\) query: Record<string, any>\) \{\n    return apiSuccess\(await this\.workflow\.listInbox\(query\)\);\n  \}\n/,
`  @Get("workflow/inbox")
  async workflowInbox(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listInbox(query));
  }

  @Get("workflow/folder-settings")
  workflowFolderSettings(@Query() query: Record<string, any>) {
    return apiSuccess(this.workflow.getFolderSettings(query ?? {}));
  }

  @Put("workflow/folder-settings")
  workflowSaveFolderSettings(@Body() body: Record<string, any>) {
    return apiSuccess(
      this.workflow.saveFolderSettings(body ?? {}),
      "Desen klasör ayarları kaydedildi",
    );
  }

  @Post("workflow/folder-settings/test")
  workflowTestFolderSettings(@Body() body: Record<string, any>) {
    return apiSuccess(
      this.workflow.testFolderSettings(body ?? {}),
      "Desen klasörleri erişim ve yazma testinden geçti",
    );
  }

  @Post("workflow/folder-settings/open")
  workflowOpenIncomingFolder(@Body() body: Record<string, any>) {
    return apiSuccess(this.workflow.openIncomingFolder(body ?? {}));
  }
`,
  "desen controller routes",
));

const workflowApi = "APP/app/ky-erp-frontend/src/services/desenWorkflowApi.js";
edit(workflowApi, (source) => {
  const anchor = `export async function scanDesignInbox(activeMainCompany) {\n  return unwrap(await apiPost("/desen/workflow/inbox/scan", companyParams(activeMainCompany)));\n}\n`;
  if (!source.includes(anchor)) throw new Error("desenWorkflowApi anchor bulunamadı");
  return source.replace(anchor, `${anchor}\nexport async function getDesignFolderSettings(activeMainCompany) {\n  return unwrap(await apiGet("/desen/workflow/folder-settings", companyParams(activeMainCompany)));\n}\n\nexport async function saveDesignFolderSettings(activeMainCompany, payload = {}) {\n  return unwrap(await apiPut("/desen/workflow/folder-settings", companyParams(activeMainCompany, payload)));\n}\n\nexport async function testDesignFolderSettings(activeMainCompany, payload = {}) {\n  return unwrap(await apiPost("/desen/workflow/folder-settings/test", companyParams(activeMainCompany, payload)));\n}\n\nexport async function openDesignIncomingFolder(activeMainCompany) {\n  return unwrap(await apiPost("/desen/workflow/folder-settings/open", companyParams(activeMainCompany)));\n}\n`);
});

const modelDesk = "APP/app/ky-erp-frontend/src/pages/desen/DesenModelMasasi.jsx";
edit(modelDesk, (source) => {
  let next = mustReplace(source, /  Search,\n  Settings2,/, `  Search,\n  Save,\n  Settings2,`, "Save icon");
  next = mustReplace(
    next,
    /  getDesignCompanies,\n  getDesignInbox,/,
    `  getDesignCompanies,\n  getDesignFolderSettings,\n  getDesignInbox,\n  openDesignIncomingFolder,\n  saveDesignFolderSettings,\n  testDesignFolderSettings,`,
    "workflow api imports",
  );
  next = next.replace(/import \{ openDesenImportFolder \} from "\.\.\/\.\.\/services\/desenApi";\n/, "");
  next = mustReplace(
    next,
    /  const \[showErrors, setShowErrors\] = useState\(false\);/,
`  const [showErrors, setShowErrors] = useState(false);
  const [folderSettingsOpen, setFolderSettingsOpen] = useState(false);
  const [folderSettings, setFolderSettings] = useState(null);`,
    "folder state",
  );
  next = mustReplace(
    next,
    /      const \[inboxData, companyRows\] = await Promise\.all\(\[\n        getDesignInbox\(activeMainCompany\),\n        getDesignCompanies\(activeMainCompany\),\n      \]\);\n      setInbox\(inboxData \|\| EMPTY_INBOX\);\n      setCompanies\(companyRows \|\| \[\]\);/,
`      const [inboxData, companyRows, folderData] = await Promise.all([
        getDesignInbox(activeMainCompany),
        getDesignCompanies(activeMainCompany),
        getDesignFolderSettings(activeMainCompany),
      ]);
      setInbox(inboxData || EMPTY_INBOX);
      setCompanies(companyRows || []);
      setFolderSettings(folderData?.settings || folderData || null);`,
    "load folder settings",
  );
  next = mustReplace(
    next,
    /  const openFolder = async \(\) => \{\n    try \{ await openDesenImportFolder\(activeMainCompany\); \}\n    catch \(error\) \{ setMessage\(error\?\.message \|\| "Klasör açılamadı\."\); \}\n  \};/,
`  const openFolder = async () => {
    try { await openDesignIncomingFolder(activeMainCompany); }
    catch (error) { setMessage(error?.message || "Klasör açılamadı."); }
  };`,
    "open folder",
  );
  next = next.replace(
    `<button className="dsg-btn" onClick={openFolder}><FolderOpen size={16} /> Klasörü Aç</button>`,
    `<button className="dsg-btn" onClick={openFolder}><FolderOpen size={16} /> Klasörü Aç</button><button className="dsg-btn" onClick={() => setFolderSettingsOpen(true)}><Settings2 size={16} /> Klasör Ayarları</button>`,
  );
  next = next.replace(
    `<code>{inbox.folderPath || "STORAGE/desen/gelen"}</code>`,
    `<code>{folderSettings?.incomingFolder || inbox.folderPath || "STORAGE/desen/gelen"}</code>`,
  );
  next = next.replace(
    `{editorGroup && <ModelEditorModal activeMainCompany={activeMainCompany} companies={companies} inboxGroup={editorGroup} onClose={() => setEditorGroup(null)} onSaved={async () => { setEditorGroup(null); setScanOpen(false); await load(); }} />}`,
    `{editorGroup && <ModelEditorModal activeMainCompany={activeMainCompany} companies={companies} inboxGroup={editorGroup} onClose={() => setEditorGroup(null)} onSaved={async () => { setEditorGroup(null); setScanOpen(false); await load(); }} />}
    {folderSettingsOpen && <FolderSettingsModal activeMainCompany={activeMainCompany} initialSettings={folderSettings} onClose={() => setFolderSettingsOpen(false)} onSaved={async (saved) => { setFolderSettings(saved); setFolderSettingsOpen(false); await load(); }} />}`,
  );
  const marker = `\nfunction InboxScanModal(`;
  if (!next.includes(marker)) throw new Error("InboxScanModal marker bulunamadı");
  const component = `
function FolderSettingsModal({ activeMainCompany, initialSettings, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    incomingFolder: initialSettings?.incomingFolder || "",
    modelsFolder: initialSettings?.modelsFolder || "",
    processedFolder: initialSettings?.processedFolder || "",
    errorFolder: initialSettings?.errorFolder || "",
    archiveFolder: initialSettings?.archiveFolder || "",
  }));
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const fields = [
    ["incomingFolder", "Gelen Görsel Klasörü", "Yeni model ve kanal görselleri buradan taranır."],
    ["modelsFolder", "Model Arşiv Klasörü", "Kaydedilen model görselleri firma/model düzeniyle burada tutulur."],
    ["processedFolder", "İşlenenler Klasörü", "Başarıyla alınan kaynak dosyalar buraya taşınır."],
    ["errorFolder", "İşlenemeyenler Klasörü", "Hatalı veya desteklenmeyen dosyalar burada tutulur."],
    ["archiveFolder", "Arşiv Klasörü", "Pasif ve eski desen dosyaları için kullanılır."],
  ];
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const test = async () => {
    setBusy("test"); setMessage("");
    try {
      const result = await testDesignFolderSettings(activeMainCompany, form);
      setMessage(result?.ok ? `Bağlantı başarılı. Gelen klasörde ${'${result.pendingFileCount || 0}'} desteklenen dosya var.` : "Bazı klasörlere yazılamıyor.");
    } catch (error) { setMessage(error?.message || "Klasör testi başarısız."); }
    finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save"); setMessage("");
    try {
      const result = await saveDesignFolderSettings(activeMainCompany, form);
      await onSaved(result?.settings || result);
    } catch (error) { setMessage(error?.message || "Klasör ayarları kaydedilemedi."); }
    finally { setBusy(""); }
  };
  return <WideModal title="Desen Görsel Klasör Ayarları" subtitle="Tarama, model arşivi ve hata klasörleri tek merkezden yönetilir." onClose={onClose} footer={<><span className="dsg-foot-message">{message}</span><button className="dsg-btn ghost" disabled={busy} onClick={onClose}>Vazgeç</button><button className="dsg-btn" disabled={busy} onClick={test}><CheckCircle2 size={15} /> {busy === "test" ? "Test Ediliyor…" : "Bağlantıyı Test Et"}</button><button className="dsg-btn primary" disabled={busy} onClick={save}><Save size={15} /> {busy === "save" ? "Kaydediliyor…" : "Kaydet"}</button></>}>
    <div className="dsg-form-grid">
      {fields.map(([key, label, note]) => <label key={key} className="full"><span>{label}</span><input value={form[key]} onChange={(event) => update(key, event.target.value)} placeholder="D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\gelen" /><small>{note}</small></label>)}
    </div>
  </WideModal>;
}
`;
  return next.replace(marker, `${component}${marker}`);
});

console.log("İşNet bağlantı ve Desen klasör ayarı kaynak düzeltmeleri uygulandı.");
