import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,ttf,webmanifest}"],
      },
    }),
  ],
  server: {
    proxy: { "/api": process.env.FAIR_API ?? "http://127.0.0.1:8000" },
  },
});
