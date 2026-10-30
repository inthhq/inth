import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, it, vi } from "vitest";

import { UploadReceipt } from "../src/upload-receipt.ts";
import type { UploadReceiptData } from "../src/upload-receipt.ts";

const directories: string[] = [];
const data: UploadReceiptData = {
  apiOrigin: "https://api.inth.com",
  clientAttachmentId: "b8dde372-1324-4d2e-a15a-fd3761964299",
  fileName: "recording.webm",
  mediaType: "video/webm",
  organizationId: "org_123",
  schemaVersion: 2,
  sizeBytes: 12,
  stage: "prepared",
};
const directory = (): string => {
  const value = mkdtempSync(path.join(tmpdir(), "inth-receipt-platform-"));
  directories.push(value);
  return value;
};
afterEach(() => {
  vi.unstubAllGlobals();
  for (const value of directories.splice(0)) {
    rmSync(value, { force: true, recursive: true });
  }
});

it.for(["file", "symlink"])(
  "preserves a replacement %s substituted at the receipt write",
  (kind, context) => {
    if (kind === "symlink" && process.platform === "win32") {
      context.skip();
    }
    const parent = directory();
    const receipt = path.join(parent, "receipt.json");
    const replacement = path.join(parent, "replacement.json");
    const moved = path.join(parent, "moved.json");
    const caller = path.join(parent, "caller.json");
    writeFileSync(caller, "caller recovery data", { mode: 0o600 });
    if (kind === "symlink") {
      symlinkSync(caller, replacement);
    } else {
      writeFileSync(replacement, "caller recovery data", { mode: 0o600 });
    }
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("fixtures/upload-receipt-race.ts", import.meta.url)
        ),
        receipt,
        replacement,
        moved,
      ],
      { encoding: "utf-8", timeout: 10_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ replaced: true });
    expect(readFileSync(receipt, "utf-8")).toBe("caller recovery data");
    expect(readFileSync(caller, "utf-8")).toBe("caller recovery data");
  }
);

it("keeps the latest complete JSON when a receipt update becomes shorter", () => {
  const target = path.join(directory(), "receipt.json");
  const receipt = new UploadReceipt(target, data);
  receipt.update({ ...data, stage: "transfer_unknown" });
  receipt.update({ ...data, stage: "ready" });
  expect(JSON.parse(readFileSync(target, "utf-8"))).toEqual({
    ...data,
    stage: "ready",
  });
});

it.skipIf(process.platform === "win32").each(["linux", "win32"])(
  "uses %s permission semantics when creating and updating a receipt",
  (platform) => {
    const parent = directory();
    chmodSync(parent, 0o777);
    vi.stubGlobal("process", { ...process, platform });
    const target = path.join(parent, "receipt.json");
    if (platform === "linux") {
      expect(() => new UploadReceipt(target, data)).toThrow();
      return;
    }
    const receipt = new UploadReceipt(target, data);
    receipt.update({ ...data, attachmentId: "sat_123", stage: "reserved" });
    expect(JSON.parse(readFileSync(target, "utf-8"))).toMatchObject({
      attachmentId: "sat_123",
      stage: "reserved",
    });
    expect(() => new UploadReceipt(target, data)).toThrow();
    writeFileSync(target, "caller replacement");
    expect(() => receipt.update(data)).toThrow();
    expect(readFileSync(target, "utf-8")).toBe("caller replacement");
  }
);
