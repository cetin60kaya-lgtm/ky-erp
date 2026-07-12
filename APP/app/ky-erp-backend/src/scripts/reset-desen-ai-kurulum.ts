import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { DesenService } from "../modules/desen/desen.service";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function main() {
  const mainCompanySlug = clean(
    process.argv[2] || process.env.MAIN_COMPANY_SLUG || "mecit-hakan",
  );
  const defaultFirmName = clean(
    process.argv[3] || process.env.DESEN_DEFAULT_FIRM || "TAHA GİYİM SAN. VE TİC.",
  );

  if (!mainCompanySlug) {
    throw new Error("mainCompanySlug zorunludur.");
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const service = app.get(DesenService);
    const result = await service.resetDesenAiKurulum({
      mainCompanySlug,
      firmName: defaultFirmName,
      createdBy: "script-reset-desen-ai-kurulum",
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
