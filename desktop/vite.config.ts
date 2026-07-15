import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const desktopRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(desktopRoot, "renderer"),
  base: "/",
  plugins: [react()],
  build: {
    outDir: path.join(desktopRoot, "..", "desktop-dist", "renderer"),
    emptyOutDir: true,
  },
});
