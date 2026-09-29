import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const script = fileURLToPath(new URL("../../../install.sh", import.meta.url));
const roots: string[] = [];
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
  );
});

const temporary = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "inth-install-test-"));
  roots.push(root);
  return root;
};

const executable = async (file: string, contents: string) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  await chmod(file, 0o755);
};

// A platform package whose `inth` prints a fixed version.
const archive = async () => {
  const root = await temporary();
  await executable(
    path.join(root, "package/bin/inth"),
    "#!/bin/sh\necho 9.9.9\n"
  );
  const file = path.join(root, "package.tgz");
  spawnSync("tar", ["-czf", file, "-C", root, "package"], { stdio: "ignore" });
  return readFile(file);
};

const sha512 = (contents: Buffer) =>
  `sha512-${createHash("sha512").update(contents).digest("base64")}`;

const registry = async (tarball: Buffer, integrity: string) => {
  const requests: string[] = [];
  let url = "";
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/package.tgz") {
      response.end(tarball);
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        dist: { integrity, tarball: `${url}/package.tgz` },
        version: "9.9.9",
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanups.push(async () => {
    server.close();
    await once(server, "close");
  });
  // SAFETY: A server listening on a TCP host and port reports an AddressInfo.
  const { port } = server.address() as AddressInfo;
  url = `http://127.0.0.1:${port}`;
  return { requests, url };
};

// Runs install.sh asynchronously so the in-process registry can respond.
const install = async (
  system: string,
  machine: string,
  registryUrl: string,
  environment: Record<string, string> = {}
) => {
  const root = await temporary();
  const bin = path.join(root, "fake-bin");
  await executable(
    path.join(bin, "uname"),
    `#!/bin/sh\ncase "$1" in -s) echo '${system}' ;; -m) echo '${machine}' ;; esac\n`
  );
  const installDir = path.join(root, "install");
  const child = spawn("sh", [script], {
    env: {
      HOME: root,
      INTH_INSTALL_DIR: installDir,
      INTH_NPM_REGISTRY: registryUrl,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      ...environment,
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const [code] = await once(child, "close");
  return { code, installed: path.join(installDir, "inth"), stderr, stdout };
};

describe.skipIf(process.platform === "win32")("install.sh", () => {
  test.each([
    ["Darwin", "arm64", "darwin-arm64"],
    ["Linux", "x86_64", "linux-x64"],
    ["Linux", "aarch64", "linux-arm64"],
  ])(
    "installs the %s %s executable from @inth/cli-%s",
    async (system, machine, target) => {
      const tarball = await archive();
      const server = await registry(tarball, sha512(tarball));

      const result = await install(system, machine, server.url);

      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);
      expect(server.requests[0]).toBe(`/@inth/cli-${target}/latest`);
      expect(result.stdout).toContain(
        `Installed inth 9.9.9 to ${result.installed}`
      );
      const run = spawnSync(result.installed, ["--version"], {
        encoding: "utf-8",
      });
      expect(run.stdout.trim()).toBe("9.9.9");
    }
  );

  test("installs the release pinned by INTH_VERSION", async () => {
    const tarball = await archive();
    const server = await registry(tarball, sha512(tarball));

    const result = await install("Linux", "x86_64", server.url, {
      INTH_VERSION: "0.0.2",
    });

    expect(result.code).toBe(0);
    expect(server.requests[0]).toBe("/@inth/cli-linux-x64/0.0.2");
  });

  test("keeps the existing executable when the archive fails its integrity check", async () => {
    const tarball = await archive();
    const server = await registry(tarball, sha512(Buffer.from("tampered")));
    const installDir = await temporary();
    const existing = path.join(installDir, "inth");
    await executable(existing, "#!/bin/sh\necho 0.0.1\n");

    const result = await install("Linux", "x86_64", server.url, {
      INTH_INSTALL_DIR: installDir,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "does not match the registry's sha512 integrity"
    );
    expect(await readFile(existing, "utf-8")).toContain("0.0.1");
  });

  test("reports an update when it replaces an existing executable", async () => {
    const tarball = await archive();
    const server = await registry(tarball, sha512(tarball));
    const installDir = await temporary();
    await executable(path.join(installDir, "inth"), "#!/bin/sh\necho 0.0.1\n");

    const result = await install("Linux", "x86_64", server.url, {
      INTH_INSTALL_DIR: installDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `Updated inth 0.0.1 to 9.9.9 in ${path.join(installDir, "inth")}`
    );
    expect(result.stdout).not.toContain("inth login");
  });

  test("directs Windows shells to npm without contacting the registry", async () => {
    const tarball = await archive();
    const server = await registry(tarball, sha512(tarball));

    const result = await install("MINGW64_NT-10.0-26100", "x86_64", server.url);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npm install -g @inth/cli");
    expect(server.requests).toEqual([]);
  });
});
