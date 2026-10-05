// Refreshes vendor/c15t from the published @c15t/cli sources. Scriptc compiles
// the vendored TypeScript statically; it does not compile npm entry points.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep in sync with vendor/c15t/UPSTREAM.md.
const VERSION = "3.0.0-alpha.4";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "inth-c15t-"));
try {
  const run = (command: string, args: string[]): void => {
    const result = spawnSync(command, args, {
      cwd: temporary,
      encoding: "utf-8",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || `${command} failed.`);
    }
  };
  run("npm", ["pack", `@c15t/cli@${VERSION}`, "--silent"]);
  run("tar", ["xzf", `c15t-cli-${VERSION}.tgz`]);
  await Promise.all(
    ["generate", "frontend"].map(async (entry) => {
      const destination = path.join(root, "vendor", "c15t", entry);
      await rm(destination, { force: true, recursive: true });
      await cp(path.join(temporary, "package", "src", entry), destination, {
        recursive: true,
      });
    })
  );
  console.log(`Vendored @c15t/cli ${VERSION} into vendor/c15t.`);
} finally {
  await rm(temporary, { force: true, recursive: true });
}
