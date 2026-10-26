import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const unifiedProBuild=process.env.KYERP_SECURITY_PRO_BUILD==="1";
const proxyTarget =
  process.env.VITE_API_PROXY_TARGET || "http://localhost:3101";

// https://vite.dev/config/
export default defineConfig({
  base: unifiedProBuild?"/guvenlik/pro/":"/",
  publicDir: unifiedProBuild?false:"public",
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    ...(unifiedProBuild?{outDir:"dist-security-pro",emptyOutDir:true}:{}),
    rollupOptions: {
      ...(unifiedProBuild?{input:fileURLToPath(new URL("./pro.html",import.meta.url))}:{}),
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("node_modules/pdfmake")) {
            return "vendor-pdf";
          }

          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          return "vendor-misc";
        },
      },
    },
  },
});
