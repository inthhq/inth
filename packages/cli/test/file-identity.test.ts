import "../experiments/node/file-identity.ts";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { saveResourceDownload } from "../src/resource-download.ts";
import { readResourceInput } from "../src/resource-input.ts";
import { prepareUploadFile } from "../src/upload-file.ts";
import { UploadReceipt } from "../src/upload-receipt.ts";

interface FileIdentityFault {
  ids: Map<string, bigint>;
  input: string;
  replacement: string;
  output: string;
  cancel?: () => void;
}

const fault = vi.hoisted<FileIdentityFault>(() => ({
  ids: new Map<string, bigint>(),
  input: "",
  output: "",
  replacement: "",
}));

// eslint-disable-next-line anti-slop/no-module-mocking -- Simulate distinct 64-bit file IDs with identical numeric Stats while exercising real files, opens, reads and writes.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const stat = (info: fs.Stats | fs.BigIntStats, bigint: boolean) => {
    if (info.isFile()) {
      const key = `${info.dev}:${info.ino}`;
      let identity = fault.ids.get(key);
      if (identity === undefined) {
        identity = 9_007_199_254_740_992n + BigInt(fault.ids.size);
        fault.ids.set(key, identity);
      }
      Object.defineProperty(info, "ino", {
        value: bigint ? identity : Number(identity),
      });
      for (const name of ["mtimeMs", "ctimeMs"] as const) {
        Object.defineProperty(info, name, {
          value: bigint ? 0n : 0,
        });
      }
    }
    return info;
  };
  return {
    ...actual,
    fstatSync: new Proxy(actual.fstatSync, {
      apply: (target, _receiver, args) =>
        stat(target(args[0], args[1]), args[1]?.bigint === true),
    }),
    lstatSync: new Proxy(actual.lstatSync, {
      apply: (target, _receiver, args) =>
        stat(target(args[0], args[1]), args[1]?.bigint === true),
    }),
    openSync: (file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (file === fault.input) {
        actual.unlinkSync(fault.input);
        actual.renameSync(fault.replacement, fault.input);
        fault.input = "";
      }
      return actual.openSync(file, flags, mode);
    },
    statSync: new Proxy(actual.statSync, {
      apply: (target, _receiver, args) =>
        stat(target(args[0], args[1]), args[1]?.bigint === true),
    }),
    writeSync: new Proxy(actual.writeSync, {
      apply(target, _receiver, args) {
        const count = target(args[0], args[1], args[2], args[3], args[4]);
        if (fault.output) {
          actual.renameSync(fault.output, `${fault.output}.owned`);
          actual.writeFileSync(fault.output, "caller data");
          fault.output = "";
          fault.cancel?.();
        }
        return count;
      },
    }),
  };
});

const directories: string[] = [];
const directory = (): string => {
  const selected = fs.mkdtempSync(path.join(tmpdir(), "inth-exact-id-"));
  directories.push(selected);
  return selected;
};

afterEach(() => {
  fault.ids.clear();
  fault.input = "";
  fault.replacement = "";
  fault.output = "";
  fault.cancel = undefined;
  for (const selected of directories.splice(0)) {
    fs.rmSync(selected, { force: true, recursive: true });
  }
});

it.each(["text", "binary"])(
  "refuses a substituted %s input whose file ID rounds to the selected ID",
  async (kind) => {
    const selected = directory();
    const input = path.join(selected, "input.txt");
    const replacement = path.join(selected, "replacement.txt");
    fs.writeFileSync(input, "original");
    fs.writeFileSync(replacement, "replaced");
    fault.input = input;
    fault.replacement = replacement;
    const { signal } = new AbortController();
    await (kind === "text"
      ? expect(
          readResourceInput(input, "message-file", signal)
        ).rejects.toMatchObject({
          code: "usage_error",
        })
      : expect(
          prepareUploadFile(
            parseArguments(["chat", "attachment-upload", "--file", input]),
            signal
          )
        ).rejects.toThrow("stable regular file"));
    expect(fs.readFileSync(input, "utf-8")).toBe("replaced");
  }
);

it("preserves a replacement receipt whose file ID rounds to the saved receipt ID", () => {
  const selected = directory();
  const output = path.join(selected, "receipt.json");
  const data = {
    apiOrigin: "https://api.inth.com",
    clientAttachmentId: "b8dde372-1324-4d2e-a15a-fd3761964299",
    fileName: "input.txt",
    mediaType: "text/plain",
    organizationId: "org_original",
    schemaVersion: 2,
    sizeBytes: 8,
    stage: "prepared",
  };
  const receipt = new UploadReceipt(output, data);
  const replacement = fs
    .readFileSync(output, "utf-8")
    .replace("org_original", "org_replaced");
  fs.renameSync(output, `${output}.owned`);
  fs.writeFileSync(output, replacement, { mode: 0o600 });
  expect(() => receipt.update({ ...data, stage: "reserved" })).toThrow(
    "Cannot safely write --receipt"
  );
  expect(fs.readFileSync(output, "utf-8")).toBe(replacement);
});

it("preserves a replacement download whose file ID rounds to the incomplete output ID", async () => {
  const selected = directory();
  const output = path.join(selected, "download.bin");
  const controller = new AbortController();
  fault.output = output;
  fault.cancel = () => controller.abort();
  await expect(
    saveResourceDownload(
      parseArguments([
        "support",
        "attachment-get",
        "sat_123",
        "--output",
        output,
      ]),
      {
        bytes: new Uint8Array([1, 2, 3, 4]),
        contentType: "application/octet-stream",
        requestId: null,
      },
      controller.signal
    )
  ).rejects.toThrow();
  expect(fs.readFileSync(output, "utf-8")).toBe("caller data");
});

it("accepts an unchanged file whose exact ID exceeds the safe integer range", async () => {
  const input = path.join(directory(), "input.txt");
  fs.writeFileSync(input, "original");
  await expect(
    readResourceInput(input, "message-file", new AbortController().signal)
  ).resolves.toBe("original");
});
