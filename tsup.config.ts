import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version?: string };

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
      "process.env.npm_package_version": JSON.stringify(pkg.version || "0.0.0"),
    };
  },
});
