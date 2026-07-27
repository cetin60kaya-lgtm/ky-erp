import { execFileSync } from "child_process";

for (const script of [
  "db:seed",
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
]) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm", "run", script], {
      stdio: "inherit",
    });
  } else {
    execFileSync("npm", ["run", script], { stdio: "inherit" });
  }
}
