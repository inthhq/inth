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
  descriptor: -1,
  directoryDescriptor: -1,
  operation: "",
  replacement: "",
  target: "",
}));

// eslint-disable-next-line anti-slop/no-module-mocking -- Inject filesystem errors while exercising real exclusive creates, writes, closes and identity-checked cleanup.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const replaceOutput = () => {
    if (!fault.replacement) {
      return;
    }
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
        throw new Error("EIO: simulated deferred close failure");
      }
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
        throw new Error("EIO: simulated sync failure");
      }
      actual.fsyncSync(descriptor);
    },
    openSync: (file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const descriptor = actual.openSync(file, flags, mode);
      if (file === fault.target) {
        fault.descriptor = descriptor;
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
          throw new Error("ENOSPC: simulated partial write failure");
        }
        return actual.writeSync(
          descriptor,
          bytes,
          offset,
          Math.min(4, length),
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
    descriptor: -1,
    directoryDescriptor: -1,
    operation: "",
    replacement: "",
    target: "",
  });
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

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
