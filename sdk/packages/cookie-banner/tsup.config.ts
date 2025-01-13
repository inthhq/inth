import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  banner: { js: "'use client'" },
  clean: true,
  dts: true,
  entry: ["./src/index.ts"],
  external: ["react"],
  format: ["esm"],
  ...options,
}));
