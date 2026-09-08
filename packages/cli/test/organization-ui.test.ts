import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

it.skipIf(process.platform === "win32")(
  "selects and cancels through the real Clack terminal UI",
  () => {
    const result = spawnSync(
      "python3",
      [
        fileURLToPath(new URL("../scripts/test-selector.py", import.meta.url)),
        process.execPath,
        fileURLToPath(new URL("fixtures/node-picker.ts", import.meta.url)),
      ],
      { encoding: "utf-8", timeout: 20_000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBeNull();
    expect(result.stderr, result.stdout).toBe("");
    expect(result.status, result.error?.message).toBe(0);
  },
  25_000
);
