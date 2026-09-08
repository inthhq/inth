import { spawnSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { nativeTarget } from "./native-target.ts";
import { signNative, signingIdentity } from "./sign-native.ts";

const target = nativeTarget(
  process.platform,
  process.arch,
  process.env.SCRIPTC_TARGET,
  process.env.SCRIPTC_CC
);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(
  root,
  "build",
  process.env.SCRIPTC_TARGET
    ? `native-${target.platform}-${target.arch}`
    : "native"
);
const binaries = path.join(root, "dist");
const fixtures = process.argv.includes("--tests");
const identity = signingIdentity(process.env.INTH_CODESIGN_IDENTITY);
if (process.argv.slice(2).some((argument) => argument !== "--tests")) {
  throw new Error("Usage: build-scriptc.ts [--tests]");
}
const require = createRequire(import.meta.url);
const run = (command: string, args: string[]): string => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    timeout: 600_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed.`);
  }
  return result.stdout.trim();
};
await mkdir(output, { recursive: true });
await mkdir(binaries, { recursive: true });
run(process.execPath, [
  require.resolve("typescript/bin/tsc"),
  "-p",
  "tsconfig.native.json",
]);
const libraries: string[] = [];
target.sources.push("native-mcp");
for (const source of target.sources) {
  const object = path.join(output, `${source}.o`);
  run(target.compiler, [
    ...target.compilerArgs,
    "-Wall",
    "-Wextra",
    "-Werror",
    "-c",
    `src/native/${source}.c`,
    "-o",
    object,
  ]);
  libraries.push(object);
}
const tomlObject = path.join(output, "toml.o");
run(target.compiler, [
  ...target.compilerArgs,
  "-c",
  "vendor/tomlc99/toml.c",
  "-o",
  tomlObject,
]);
libraries.push(tomlObject);
if (target.platform === "darwin") {
  const sdk = run("xcrun", ["--show-sdk-path"]);
  for (const framework of ["Security", "CoreFoundation"]) {
    libraries.push(
      path.join(
        sdk,
        `System/Library/Frameworks/${framework}.framework/${framework}.tbd`
      )
    );
  }
}
const manifest = path.join(output, "ffi.json");
await writeFile(
  manifest,
  JSON.stringify(
    {
      ffi_format: 3,
      functions: [
        {
          name: "mcpTomlStatus",
          params: ["string"],
          returns: "i32",
          symbol: "inth_mcp_toml_status",
        },
        {
          name: "outputColumns",
          params: [],
          returns: "i32",
          symbol: "inth_output_columns",
        },
        {
          name: "terminalBegin",
          params: [],
          returns: "i32",
          symbol: "inth_terminal_begin",
        },
        {
          name: "terminalEnd",
          params: [],
          returns: "i32",
          symbol: "inth_terminal_end",
        },
        {
          name: "terminalKey",
          params: [],
          returns: "i32",
          symbol: "inth_terminal_key",
        },
        {
          name: "terminalRows",
          params: [],
          returns: "i32",
          symbol: "inth_terminal_rows",
        },
        {
          name: "terminalLine",
          params: ["string"],
          returns: "i32",
          symbol: "inth_terminal_line",
        },
        {
          name: "writeConfig",
          params: ["string", "string"],
          returns: "i32",
          symbol: "inth_write_config",
        },
        {
          name: "writeMcpConfig",
          params: ["string", "string"],
          returns: "i32",
          symbol: "inth_write_mcp_config",
        },
        {
          name: "prepareDirectory",
          params: ["string"],
          returns: "i32",
          symbol: "inth_prepare_directory",
        },
        {
          name: "openBrowser",
          params: ["string"],
          returns: "i32",
          symbol: "inth_open_browser",
        },
        {
          name: "browserUrlValid",
          params: ["string"],
          returns: "i32",
          symbol: "inth_browser_url_valid",
        },
        {
          name: "secretRead",
          params: [
            "string",
            "string",
            {
              callback: {
                id: "value",
                lifetime: "call",
                params: ["string", { context: "value" }],
                returns: "void",
              },
            },
            { context: "value" },
          ],
          returns: "i32",
          symbol: "inth_secret_read",
        },
        {
          name: "secretWrite",
          params: ["string", "string", "string"],
          returns: "i32",
          symbol: "inth_secret_write",
        },
        {
          name: "secretDelete",
          params: ["string", "string"],
          returns: "i32",
          symbol: "inth_secret_delete",
        },
        {
          name: "lockAcquire",
          params: ["string"],
          returns: "i32",
          symbol: "inth_lock_acquire",
        },
        {
          name: "lockRelease",
          params: ["i32"],
          returns: "i32",
          symbol: "inth_lock_release",
        },
        {
          name: "removeDirectory",
          params: ["string"],
          returns: "i32",
          symbol: "inth_remove_directory",
        },
        {
          name: "httpDate",
          params: ["string"],
          returns: "f64",
          symbol: "inth_http_date",
        },
      ],
      libraries,
      system_libraries: target.systemLibraries,
    },
    null,
    2
  )
);
const entries = [{ name: "inth", source: "src/inth.ts" }];
if (fixtures) {
  entries.push({ name: "auth-bench", source: "bench/native-auth.ts" });
  for (const name of [
    "mcp-test",
    "keychain-test",
    "auth-test",
    "transport-test",
    "telemetry-test",
    "cli-test",
    "ui-test",
    "output-test",
    "identity-test",
    "profile-test",
    "organization-test",
    "resource-test",
    "resource-output-test",
  ]) {
    entries.push({ name, source: `test/native/${name}.ts` });
  }
}
for (const entry of entries) {
  run(process.execPath, [
    require.resolve("scriptc/dist/bootstrap.js"),
    "build",
    entry.source,
    "--ffi",
    manifest,
    "-o",
    path.join(
      entry.name === "inth" ? binaries : output,
      entry.name + (target.platform === "win32" ? ".exe" : "")
    ),
  ]);
  console.log(`Built static Scriptc ${entry.name}.`);
}
// Sign before copying compatibility paths so every entry has the same code identity.
if (fixtures && target.platform === "win32") {
  for (const name of ["windows-console-test", "windows-credentials-test"]) {
    run(target.compiler, [
      ...target.compilerArgs,
      "-Wall",
      "-Wextra",
      "-Werror",
      `test/native/${name}.c`,
      path.join(output, "native-url.o"),
      ...target.systemLibraries.map((library) => `-l${library}`),
      "-o",
      path.join(output, `${name}.exe`),
    ]);
  }
}
if (target.platform === "darwin") {
  signNative(path.join(binaries, "inth"), identity);
}
// Preserve paths used during the native experiment, with the same credentials.
const legacy = path.join(root, "dist-bin", "scriptc");
await mkdir(legacy, { recursive: true });
await cp(
  path.join(binaries, target.executable),
  path.join(legacy, target.executable)
);
await cp(
  path.join(binaries, target.executable),
  path.join(legacy, target.platform === "win32" ? "inth-auth.exe" : "inth-auth")
);
await writeFile(
  path.join(binaries, "target.json"),
  JSON.stringify({
    arch: target.arch,
    executable: target.executable,
    platform: target.platform,
  })
);
