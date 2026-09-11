import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { binary, run } from "./native-test-support.ts";

export const verifyHelp = (): void => {
  const help = run(binary, ["--help"], { env: { ...process.env, PATH: "" } });
  assert.match(help.stdout, /auth/u);
  assert.equal(help.stderr, "");
};

export const verifyUsageErrors = (): void => {
  for (const scenario of [
    {
      args: ["status"],
      error: 'Unknown command "status". Did you mean "inth auth status"?',
    },
    {
      args: ["refresh"],
      error: 'Unknown command "refresh". Did you mean "inth auth refresh"?',
    },
    {
      args: ["unsupported-command"],
      error: 'Unknown command. Run "inth --help" for available commands.',
    },
    {
      args: ["auth"],
      error:
        "Usage: inth auth <start|complete|retry|status|refresh|organizations>",
    },
    {
      args: ["auth", "unknown"],
      error:
        "Usage: inth auth <start|complete|retry|status|refresh|organizations>",
    },
    {
      args: ["login", "--unknown"],
      error:
        'Unknown option "--unknown". Run inth --help for available options.',
    },
    { args: ["logout", "extra"], error: "Usage: inth logout" },
  ]) {
    const invalid = run(binary, scenario.args, { status: 1 });
    assert.equal(invalid.stdout, "");
    assert.equal(invalid.stderr, `Error: ${scenario.error}\n`);
  }
};

/** An API key from the environment or flag must work without any writable state directory. */
export const verifyStatelessBypass = async (): Promise<void> => {
  const blockedHome = await mkdtemp(
    path.join(os.tmpdir(), "inth-stateless-test-")
  );
  try {
    const blockedParent = path.join(blockedHome, "unavailable");
    await writeFile(
      blockedParent,
      "This is a file, so no state directory can be created inside it."
    );
    await writeFile(
      path.join(blockedHome, "Library"),
      "Unavailable macOS state parent."
    );
    for (const args of [
      ["login"],
      ["auth", "status"],
      ["login", "--token", "inth_flag"],
    ]) {
      const bypass = run(binary, args, {
        env: {
          ...process.env,
          APPDATA: blockedParent,
          HOME: blockedHome,
          INTH_TOKEN: "inth_test_environment",
          USERPROFILE: blockedHome,
          XDG_STATE_HOME: blockedParent,
        },
      });
      assert.match(bypass.stdout, /organization API key/u);
      assert.doesNotMatch(
        bypass.stdout + bypass.stderr,
        /inth_test_environment|inth_flag/u
      );
      assert.equal(bypass.stderr, "");
    }
    const blockedFiles = await readdir(blockedHome);
    assert.deepEqual(blockedFiles.toSorted(), ["Library", "unavailable"]);
  } finally {
    await rm(blockedHome, { force: true, recursive: true });
  }
};
