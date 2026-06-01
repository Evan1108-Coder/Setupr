import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/setup.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["react-devtools-core", "yoga-wasm-web"],
  treeshake: true,
  minify: false,
  shims: false,
  esbuildOptions(options) {
    options.define = {
      "process.env.NODE_ENV": '"production"',
    };
  },
});
