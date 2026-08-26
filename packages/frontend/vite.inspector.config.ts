import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Builds the injected inspector as a single self-contained IIFE bundle
 * (`dist-inspector/inspector.js`) that client websites can include with a
 * <script> tag. html2canvas is bundled in (not externalized) so the script is
 * fully standalone.
 */
export default defineConfig({
  build: {
    outDir: "dist-inspector",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/inspector/inspector-entry.ts"),
      name: "CrpInspector",
      formats: ["iife"],
      fileName: () => "inspector.js",
    },
    rollupOptions: {
      output: { entryFileNames: "inspector.js" },
    },
  },
});
