import { spawnSync } from "child_process";

const scripts = [
  "db:import:companies",
  "db:import:products",
  "db:import:accounting",
  "db:import:payments",
  "db:import:checks",
  "db:import:credit-cards",
  "db:import:documents",
  "db:import:manufacturing",
  "db:import:personnel",
  "db:import:models",
  "db:import:design",
  "db:import:dyehouse",
];

type ScriptResult = {
  script: string;
  success: boolean;
  output: string;
};

function runNpmScript(script: string): ScriptResult {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(cmd, ["run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      MAIN_COMPANY_ID: process.env.MAIN_COMPANY_ID || "main-mecit-hakan",
      MAIN_COMPANY_SLUG: process.env.MAIN_COMPANY_SLUG || "mecit-hakan",
      MAIN_COMPANY_NAME: process.env.MAIN_COMPANY_NAME || "Mecit Hakan",
    },
  });

  const output = [result.stdout || "", result.stderr || ""].join("\n").trim();

  return {
    script,
    success: result.status === 0,
    output,
  };
}

async function main() {
  console.log("sync-all-live-data başlatıldı.");
  console.log("mainCompanyId=main-mecit-hakan");
  console.log("mainCompanySlug=mecit-hakan");
  console.log("anaFirma=Mecit Hakan");

  const results: ScriptResult[] = [];
  for (const script of scripts) {
    console.log(`\n[RUN] ${script}`);
    const result = runNpmScript(script);
    results.push(result);
    if (result.output) {
      console.log(result.output);
    }
    if (!result.success) {
      console.error(`[FAIL] ${script}`);
    }
  }

  const successCount = results.filter((row) => row.success).length;
  const failRows = results.filter((row) => !row.success);

  console.log("\n=== sync-all-live-data raporu ===");
  console.log(`çalışan adım: ${successCount}/${results.length}`);
  console.log(`firma bulundu/eklendi/güncellendi/atlandı: import çıktısında`);
  console.log(`belge bulundu/eklendi/atlandı: import çıktısında`);
  console.log(`ürün eklendi: import çıktısında`);
  console.log(`cari hareket eklendi: import çıktısında`);
  console.log(`desen/model eklendi: import çıktısında`);
  console.log(`imalat eklendi: import çıktısında`);
  console.log(`ik personel eklendi: import çıktısında`);

  if (failRows.length) {
    console.log("hata listesi:");
    for (const row of failRows) {
      console.log(`- ${row.script}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("sync-all-live-data tamamlandı.");
}

main().catch((error) => {
  console.error("sync-all-live-data hatası", error);
  process.exitCode = 1;
});
