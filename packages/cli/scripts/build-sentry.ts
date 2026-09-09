import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { NativeTarget } from "./native-target.ts";

const SENTRY_COMMIT = "724479b549a299ea8363994306b36a00c754fcba";

export const buildSentry = async (
  root: string,
  target: NativeTarget,
  output: string
): Promise<string[]> => {
  const source = path.join(root, "build", "sentry-native-source");
  const sdk = path.join(output, "sentry");
  // eslint-disable-next-line unicorn/consistent-function-scoping -- Default cwd binds this build's repository root.
  const run = (command: string, args: string[], cwd = root): string => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf-8",
      timeout: 600_000,
    });
    if (result.status !== 0) {
      throw new Error(
        result.stderr || result.stdout || `${command} failed: ${result.error}`
      );
    }
    return result.stdout.trim();
  };
  await mkdir(sdk, { recursive: true });
  if (!existsSync(source)) {
    run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      "0.16.2",
      "https://github.com/getsentry/sentry-native.git",
      source,
    ]);
  }
  if (
    run("git", ["rev-parse", "HEAD"], source) !== SENTRY_COMMIT ||
    run("git", ["status", "--porcelain"], source)
  ) {
    throw new Error("Sentry source must match the pinned, unmodified commit.");
  }
  const args = [
    "-S",
    source,
    "-B",
    sdk,
    "-G",
    process.platform === "win32" ? "Ninja" : "Unix Makefiles",
    "-DSENTRY_BACKEND=none",
    "-DSENTRY_TRANSPORT=none",
    "-DSENTRY_SCREENSHOT=none",
    "-DSENTRY_BUILD_SHARED_LIBS=OFF",
    "-DSENTRY_BUILD_TESTS=OFF",
    "-DSENTRY_BUILD_EXAMPLES=OFF",
    "-DCMAKE_BUILD_TYPE=Release",
  ];
  if (target.compiler === "zig") {
    const triple = process.env.SCRIPTC_TARGET;
    const flags = `${triple ? `-target ${triple} ` : ""}-fno-sanitize=undefined`;
    const suffix = process.platform === "win32" ? ".cmd" : "";
    const archiver = path.join(sdk, `zig-ar${suffix}`);
    const indexer = path.join(sdk, `zig-ranlib${suffix}`);
    // CMake's platform modules override archive command templates. Tool wrappers
    // keep both archiving and indexing on Zig for cross-target object formats.
    await writeFile(
      archiver,
      process.platform === "win32"
        ? "@echo off\r\nzig ar %*\r\n"
        : '#!/bin/sh\nexec zig ar "$@"\n',
      { mode: 0o755 }
    );
    await writeFile(
      indexer,
      process.platform === "win32"
        ? "@echo off\r\nzig ranlib %*\r\n"
        : '#!/bin/sh\nexec zig ranlib "$@"\n',
      { mode: 0o755 }
    );
    args.push(
      "-DCMAKE_C_COMPILER=zig",
      `-DCMAKE_C_COMPILER_ARG1=cc ${flags}`,
      "-DCMAKE_CXX_COMPILER=zig",
      `-DCMAKE_CXX_COMPILER_ARG1=c++ ${flags}`,
      "-DCMAKE_ASM_COMPILER=zig",
      `-DCMAKE_ASM_COMPILER_ARG1=cc ${flags}`,
      `-DCMAKE_AR=${archiver}`,
      `-DCMAKE_RANLIB=${indexer}`,
      "-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY"
    );
    if (triple) {
      let system = "Darwin";
      if (target.platform === "win32") {
        system = "Windows";
      }
      if (target.platform === "linux") {
        system = "Linux";
      }
      args.push(
        `-DCMAKE_SYSTEM_NAME=${system}`,
        `-DCMAKE_SYSTEM_PROCESSOR=${target.arch === "arm64" ? "aarch64" : "x86_64"}`
      );
    }
  } else {
    args.push("-DCMAKE_C_COMPILER=clang", "-DCMAKE_CXX_COMPILER=clang++");
  }
  run("cmake", args);
  run("cmake", ["--build", sdk, "--parallel", "8"]);
  const object = path.join(output, "native-sentry.o");
  run(target.compiler, [
    ...target.compilerArgs,
    "-Wall",
    "-Wextra",
    "-Werror",
    "-DSENTRY_BUILD_STATIC",
    "-I",
    path.join(source, "include"),
    "-c",
    "src/native/native-sentry.c",
    "-o",
    object,
  ]);
  if (target.platform === "win32") {
    target.systemLibraries.push(
      "dbghelp",
      "shlwapi",
      "version",
      target.compiler === "zig"
        ? "api-ms-win-core-synch-l1-2-0"
        : "synchronization"
    );
  }
  if (target.platform === "linux") {
    target.systemLibraries.push("rt", "pthread");
  }
  const libraries = [object, path.join(sdk, "libsentry.a")];
  if (target.platform === "linux") {
    libraries.push(path.join(sdk, "vendor", "libunwind", "libunwind.a"));
  }
  return libraries;
};
