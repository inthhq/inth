import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

import { CliError } from "../../src/cli-error.ts";

const [path, replacement, moved] = process.argv.slice(2);
if (!path || !replacement || !moved) {
  throw new Error("Expected receipt, replacement and moved paths.");
}

const open = fs.openSync;
const rename = fs.renameSync;
let armed = false;
let replaced = false;
let descriptor = -1;
const replace = (): void => {
  if (!armed || replaced) {
    return;
  }
  replaced = true;
  rename(path, moved);
  rename(replacement, path);
};
fs.openSync = (file, flags, mode) => {
  const opened = open(file, flags, mode);
  if (armed && file === path) {
    descriptor = opened;
  }
  return opened;
};
fs.renameSync = (source, destination) => {
  if (destination === path) {
    replace();
  }
  rename(source, destination);
};
fs.fstatSync = new Proxy(fs.fstatSync, {
  apply(target, _receiver, args) {
    const current = target(args[0], args[1]);
    if (armed && args[0] === descriptor) {
      replace();
    }
    return current;
  },
});
syncBuiltinESMExports();

await import("../../experiments/node/file-identity.ts");
const { UploadReceipt } = await import("../../src/upload-receipt.ts");
const data = {
  apiOrigin: "https://api.inth.com",
  clientAttachmentId: "b8dde372-1324-4d2e-a15a-fd3761964299",
  fileName: "recording.webm",
  mediaType: "video/webm",
  organizationId: "org_123",
  schemaVersion: 2,
  sizeBytes: 12,
  stage: "prepared",
};
const receipt = new UploadReceipt(path, data);
armed = true;
try {
  receipt.update({ ...data, attachmentId: "sat_123", stage: "reserved" });
  console.log(JSON.stringify({ replaced }));
} catch (error) {
  console.log(
    JSON.stringify({
      code: error instanceof CliError ? error.code : "probe_error",
      replaced,
    })
  );
}
