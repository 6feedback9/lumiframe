import { defineConfig } from "tsup";

// Two builds instead of one `--format iife,esm` pass: esbuild's IIFE
// global-name output wraps a module with both a default export and named
// exports (detectProduct) as `{ default, detectProduct }`, which would
// make merchant sites write `TryOn.default.init(...)` instead of the
// documented `TryOn.init(...)` (packages/sdk/README.md). The footer below
// unwraps it for the browser global specifically; ESM consumers
// (bundlers) get the normal `{ default, detectProduct }` shape via import.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    minify: true,
    clean: true,
  },
  {
    entry: { index: "src/index.ts" },
    format: ["iife"],
    globalName: "TryOn",
    minify: true,
    clean: false,
    footer: {
      js: "if(typeof window!=='undefined'&&window.TryOn&&'default' in window.TryOn){window.TryOn=window.TryOn.default;}",
    },
  },
]);
