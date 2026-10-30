import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { readResourceInput } from "../src/resource-input.ts";

const directories: string[] = [];
const prepare = () => {
  const directory = mkdtempSync(path.join(tmpdir(), "inth-text-input-"));
  directories.push(directory);
  const input = path.join(directory, "input.txt");
  const replacement = path.join(directory, "replacement.txt");
  writeFileSync(input, "selected input");
  return { directory, input, replacement };
};
const readDuringReplacement = (
  input: string,
  replacement: string,
  option: string
) =>
  spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("fixtures/resource-input-race.ts", import.meta.url)
      ),
      input,
      replacement,
      option,
    ],
    { encoding: "utf-8", timeout: 10_000 }
  );

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("text input path replacement", () => {
  it.each(["data-file", "message-file"])(
    "refuses a different regular file substituted after checking --%s",
    (option) => {
      const { input, replacement } = prepare();
      writeFileSync(replacement, "unselected input");
      const result = readDuringReplacement(input, replacement, option);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        code: "usage_error",
        message: `--${option} must name a stable regular file.`,
        substituted: true,
      });
    }
  );

  it.skipIf(process.platform === "win32")(
    "refuses a substituted symlink to another input",
    () => {
      const { directory, input, replacement } = prepare();
      const other = path.join(directory, "other.txt");
      writeFileSync(other, "unselected input");
      symlinkSync(other, replacement);
      const result = readDuringReplacement(input, replacement, "data-file");
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        code: "usage_error",
        message: "--data-file must name a stable regular file.",
        substituted: true,
      });
    }
  );

  it.skipIf(process.platform === "win32")(
    "refuses a substituted FIFO without waiting for a writer",
    () => {
      const { input, replacement } = prepare();
      execFileSync("mkfifo", [replacement]);
      const result = readDuringReplacement(input, replacement, "message-file");
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        code: "usage_error",
        message: "--message-file must name a stable regular file.",
        substituted: true,
      });
    },
    15_000
  );

  it.skipIf(process.platform === "win32")(
    "reads a stable symlink to a regular file",
    async () => {
      const { input, replacement } = prepare();
      symlinkSync(input, replacement);
      expect(
        await readResourceInput(
          replacement,
          "data-file",
          new AbortController().signal
        )
      ).toBe("selected input");
    }
  );
});
