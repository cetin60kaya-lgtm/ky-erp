import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.kyerp.pdks",
  appName: "KY PDKS",
  webDir: "../../app/ky-erp-frontend/dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
