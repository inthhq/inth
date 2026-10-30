import * as fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { saveBillingApproval } from "../src/billing-approval.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { saveResourceDownload } from "../src/resource-download.ts";
import { UploadReceipt } from "../src/upload-receipt.ts";
import { billingQuote, writeUuid } from "./fixtures/agent-access-v2-writes.ts";

const fault = vi.hoisted(() => ({
  checkpointDescriptor: -1,
  descriptor: -1,
  directoryDescriptor: -1,
  once: false,
  operation: "",
  replaced: false,
  replacement: "",
  target: "",
  updating: false,
}));

// eslint-disable-next-line anti-slop/no-module-mocking -- Inject filesystem errors while exercising real exclusive creates, writes, closes and identity-checked cleanup.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const fail = (message: string): never => {
    if (fault.once) {
      fault.operation = "";
    }
    throw new Error(message);
  };
  const replaceOutput = () => {
    if (!fault.replacement || fault.replaced) {
      return;
    }
    fault.replaced = true;
    actual.renameSync(fault.target, `${fault.target}.owned`);
    if (fault.replacement === "symlink") {
      const caller = `${fault.target}.caller`;
      actual.writeFileSync(caller, "caller data");
      actual.symlinkSync(caller, fault.target);
    } else {
      actual.writeFileSync(fault.target, "caller data");
    }
  };
  return {
    ...actual,
    closeSync: (descriptor: number) => {
      actual.closeSync(descriptor);
      if (descriptor === fault.descriptor && fault.operation === "close") {
        replaceOutput();
        fail("EIO: simulated deferred close failure");
      }
    },
    fstatSync: (descriptor: number) => {
      if (descriptor === fault.descriptor && fault.operation === "stat") {
        replaceOutput();
        throw new Error("EIO: simulated descriptor stat failure");
      }
      return actual.fstatSync(descriptor);
    },
    fsyncSync: (descriptor: number) => {
      if (
        descriptor === fault.directoryDescriptor &&
        fault.operation === "directory sync"
      ) {
        replaceOutput();
        throw new Error("EIO: simulated directory sync failure");
      }
      if (descriptor === fault.descriptor && fault.operation === "sync") {
        fail("EIO: simulated sync failure");
      }
      if (
        descriptor === fault.checkpointDescriptor &&
        fault.operation === "checkpoint sync"
      ) {
        fail("EIO: simulated recovery checkpoint sync failure");
      }
      actual.fsyncSync(descriptor);
    },
    ftruncateSync: (descriptor: number, length: number) => {
      actual.ftruncateSync(descriptor, length);
      if (descriptor === fault.descriptor && fault.operation === "truncate") {
        fail("EIO: simulated truncate failure");
      }
    },
    openSync: (file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const descriptor = actual.openSync(file, flags, mode);
      if (file === fault.target) {
        fault.descriptor = descriptor;
      }
      if (
        file !== fault.target &&
        fault.operation === "checkpoint sync" &&
        actual.fstatSync(descriptor).isFile()
      ) {
        fault.checkpointDescriptor = descriptor;
      }
      if (
        fault.operation === "directory sync" &&
        actual.fstatSync(descriptor).isDirectory()
      ) {
        fault.directoryDescriptor = descriptor;
      }
      return descriptor;
    },
    writeSync: (
      descriptor: number,
      bytes: Uint8Array,
      offset: number,
      length: number,
      position?: number
    ) => {
      if (descriptor === fault.descriptor && fault.operation === "write") {
        if (offset > 0) {
          replaceOutput();
          fail("ENOSPC: simulated partial write failure");
        }
        return actual.writeSync(
          descriptor,
          bytes,
          offset,
          fault.updating ? Math.max(1, length - 4) : Math.min(4, length),
          position
        );
      }
      return actual.writeSync(descriptor, bytes, offset, length, position);
    },
  };
});

const directories: string[] = [];
const output = (): string => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "inth-save-failure-"));
  directories.push(directory);
  fault.target = path.join(directory, "output.json");
  return fault.target;
};

const saves: {
  name: string;
  code: string;
  operations: string[];
  save: (target: string) => void | Promise<void>;
}[] = [
  {
    code: "approval_save_failed",
    name: "billing approval",
    operations: ["write", "sync", "close"],
    save: (target) => {
      const options = parseArguments([
        "billing",
        "credit-preview",
        "--credits",
        "100",
        "--catalog-version",
        "1",
        "--checkout-attempt-id",
        writeUuid,
        "--save-approval",
        target,
      ]);
      const request = buildResourceRequest(options);
      request.body = JSON.stringify({
        input: {
          catalogVersion: 1,
          checkoutAttemptId: writeUuid,
          credits: 100,
        },
        organizationId: "org_123",
      });
      saveBillingApproval(
        options,
        request,
        JSON.stringify({ data: billingQuote, success: true })
      );
    },
  },
  {
    code: "file_write_failed",
    name: "download",
    operations: ["write", "close"],
    save: async (target) => {
      await saveResourceDownload(
        parseArguments([
          "support",
          "attachment-get",
          "sat_123",
          "--output",
          target,
        ]),
        {
          bytes: new Uint8Array([0, 128, 255, 1, 2, 3, 4, 5]),
          contentType: "application/octet-stream",
          requestId: null,
        },
        new AbortController().signal
      );
    },
  },
  {
    code: "receipt_write_failed",
    name: "new receipt",
    operations: ["write", "sync", "close", "directory sync"],
    save: (target) => {
      const receipt = new UploadReceipt(target, {
        apiOrigin: "https://api.inth.com",
        clientAttachmentId: writeUuid,
        fileName: "recording.webm",
        mediaType: "video/webm",
        organizationId: "org_123",
        schemaVersion: 2,
        sizeBytes: 12,
        stage: "prepared",
      });
      expect(receipt.path).toBe(target);
    },
  },
];

afterEach(() => {
  Object.assign(fault, {
    checkpointDescriptor: -1,
    descriptor: -1,
    directoryDescriptor: -1,
    once: false,
    operation: "",
    replaced: false,
    replacement: "",
    target: "",
    updating: false,
  });
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

const reservedReceiptData = () => ({
  apiOrigin: "https://api.inth.com",
  attachmentId: "sat_123",
  clientAttachmentId: writeUuid,
  fileName: "recording.webm",
  mediaType: "video/webm",
  organizationId: "org_123",
  schemaVersion: 2,
  sizeBytes: 12,
  stage: "transfer_unknown",
});

it.each(["write", "truncate", "sync"])(
  "restores the committed receipt after a one-time update %s failure and permits retry",
  (operation) => {
    const target = output();
    const data = reservedReceiptData();
    const receipt = new UploadReceipt(target, data);
    const previous = fs.readFileSync(target);
    data.stage = "ready";
    Object.assign(fault, { once: true, operation, updating: true });
    expect(() => receipt.update(data)).toThrowError(
      expect.objectContaining({ code: "receipt_write_failed" })
    );
    expect(fs.readFileSync(target)).toEqual(previous);
    expect(fs.readdirSync(path.dirname(target))).toEqual([
      path.basename(target),
    ]);
    receipt.update(data);
    expect(JSON.parse(fs.readFileSync(target, "utf-8"))).toEqual(data);
    expect(() => fs.fstatSync(fault.descriptor)).toThrow(/EBADF/u);
  }
);

it.each(["write", "truncate", "sync", "close"])(
  "keeps a complete private recovery receipt after persistent update %s failure",
  (operation) => {
    const target = output();
    const data = reservedReceiptData();
    const receipt = new UploadReceipt(target, data);
    data.stage = "ready";
    Object.assign(fault, { operation, updating: true });
    let message = "";
    try {
      receipt.update(data);
    } catch (error) {
      expect(error).toMatchObject({ code: "receipt_write_failed" });
      message = String(error);
    }
    const copies = fs
      .readdirSync(path.dirname(target))
      .filter((entry) => entry !== path.basename(target));
    expect(copies).toHaveLength(1);
    const recoveryPath = path.join(path.dirname(target), copies[0] ?? "");
    expect(message).toContain(JSON.stringify(recoveryPath));
    expect(JSON.parse(fs.readFileSync(recoveryPath, "utf-8"))).toEqual(data);
    if (process.platform !== "win32") {
      // eslint-disable-next-line no-bitwise -- Recovery copies must remain private.
      expect(fs.statSync(recoveryPath).mode & 0o777).toBe(0o600);
    }
    expect(() => fs.fstatSync(fault.descriptor)).toThrow(/EBADF/u);
    fault.operation = "";
    receipt.discard();
    expect(fs.readdirSync(path.dirname(target))).toEqual([]);
  }
);

it("leaves the committed receipt untouched when its recovery checkpoint cannot be synced", () => {
  const target = output();
  const data = reservedReceiptData();
  const receipt = new UploadReceipt(target, data);
  const previous = fs.readFileSync(target);
  fault.operation = "checkpoint sync";
  expect(() => receipt.update({ ...data, stage: "ready" })).toThrowError(
    expect.objectContaining({ code: "receipt_write_failed" })
  );
  expect(fs.readFileSync(target)).toEqual(previous);
  expect(fs.readdirSync(path.dirname(target))).toEqual([path.basename(target)]);
});

it.for(["file", "symlink"])(
  "preserves a replacement %s while rolling back a failed receipt update",
  (replacement, context) => {
    if (replacement === "symlink" && process.platform === "win32") {
      context.skip();
    }
    const target = output();
    const data = reservedReceiptData();
    const receipt = new UploadReceipt(target, data);
    const previous = fs.readFileSync(target);
    Object.assign(fault, {
      once: true,
      operation: "write",
      replacement,
      updating: true,
    });
    expect(() => receipt.update({ ...data, stage: "ready" })).toThrowError(
      expect.objectContaining({ code: "receipt_write_failed" })
    );
    expect(fs.readFileSync(target, "utf-8")).toBe("caller data");
    expect(fs.readFileSync(`${target}.owned`)).toEqual(previous);
  }
);

it.for(saves)(
  "closes the $name descriptor when its first stat fails without deleting an unverifiable path",
  async (test) => {
    const target = output();
    fault.operation = "stat";
    await expect(
      Promise.resolve().then(() => test.save(target))
    ).rejects.toMatchObject({ code: test.code });
    const actual = await vi.importActual<typeof fs>("node:fs");
    expect(() => actual.fstatSync(fault.descriptor)).toThrow(/EBADF/u);
    expect(actual.readFileSync(target).byteLength).toBe(0);
  }
);

it.for(
  saves.flatMap((save) =>
    ["file", "symlink"].map((replacement) => ({ ...save, replacement }))
  )
)(
  "preserves a replacement $replacement when the $name descriptor cannot be identified",
  async (test, context) => {
    if (test.replacement === "symlink" && process.platform === "win32") {
      context.skip();
    }
    const target = output();
    fault.operation = "stat";
    fault.replacement = test.replacement;
    await expect(
      Promise.resolve().then(() => test.save(target))
    ).rejects.toMatchObject({ code: test.code });
    const actual = await vi.importActual<typeof fs>("node:fs");
    expect(() => actual.fstatSync(fault.descriptor)).toThrow(/EBADF/u);
    expect(actual.readFileSync(target, "utf-8")).toBe("caller data");
  }
);

it.for(
  saves.flatMap((save) =>
    save.operations.map((operation) => ({ ...save, operation }))
  )
)(
  "removes an unsuccessful $name after a $operation error and permits retry",
  async (test, context) => {
    if (test.operation === "directory sync" && process.platform === "win32") {
      context.skip();
    }
    const target = output();
    fault.operation = test.operation;
    await expect(
      Promise.resolve().then(() => test.save(target))
    ).rejects.toMatchObject({ code: test.code });
    expect(fs.existsSync(target)).toBe(false);
    fault.operation = "";
    await test.save(target);
    expect(fs.statSync(target).size).toBeGreaterThan(0);
  }
);

it.for(
  saves.flatMap((save) =>
    save.operations
      .filter(
        (operation) => operation === "close" || operation === "directory sync"
      )
      .flatMap((operation) =>
        ["file", "symlink"].map((replacement) => ({
          ...save,
          operation,
          replacement,
        }))
      )
  )
)(
  "preserves a replacement $replacement after a $name $operation error",
  async (test, context) => {
    if (
      (test.replacement === "symlink" || test.operation === "directory sync") &&
      process.platform === "win32"
    ) {
      context.skip();
    }
    const target = output();
    fault.operation = test.operation;
    fault.replacement = test.replacement;
    await expect(
      Promise.resolve().then(() => test.save(target))
    ).rejects.toMatchObject({ code: test.code });
    expect(fs.readFileSync(target, "utf-8")).toBe("caller data");
  }
);
