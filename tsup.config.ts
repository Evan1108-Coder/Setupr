import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["react", "ink", "yoga-wasm-web"],
  noExternal: [],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
