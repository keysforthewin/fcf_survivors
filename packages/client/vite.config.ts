import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const serverHost = process.env.SERVER_HOST ?? "localhost";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  resolve: {
    alias: {
      "@fcf/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/leaderboard": `http://${serverHost}:4000`,
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
