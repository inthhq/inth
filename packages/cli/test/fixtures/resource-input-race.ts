import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

import { CliError } from "../../src/cli-error.ts";

const [input, replacement, option] = process.argv.slice(2);
if (!input || !replacement || !option) {
  throw new Error("Expected input, replacement and option.");
}

const open = fs.openSync;
let substituted = false;
fs.openSync = (path, flags, mode) => {
  if (path === input) {
    fs.unlinkSync(input);
    fs.renameSync(replacement, input);
    substituted = true;
  }
  return open(path, flags, mode);
};
syncBuiltinESMExports();

await import("../../experiments/node/file-identity.ts");
const { readResourceInput } = await import("../../src/resource-input.ts");
try {
  const text = await readResourceInput(
    input,
    option,
    new AbortController().signal
  );
  console.log(JSON.stringify({ text }));
} catch (error) {
  console.log(
    JSON.stringify({
      code: error instanceof CliError ? error.code : "probe_error",
      message: error instanceof Error ? error.message : "Unknown input error",
      substituted,
    })
  );
}
