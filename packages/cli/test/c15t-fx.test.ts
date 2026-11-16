import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import {
  FX_RELEASE,
  backendEnv,
  fxArguments,
  fxAsset,
  fxBaseUrl,
  fxEnvironment,
  fxFailure,
  fxSettings,
  hex,
  mergeBackendEnv,
  tarFile,
} from "../src/c15t-fx.ts";

const session = {
  gatewayUrl: "https://api.inth.com/v1/wizard/gateway",
  model: "claude-opus-5-5",
  smallModel: "claude-haiku-5-5",
  token: "iwz_v1.payload.sig",
};

const directories: string[] = [];
const denied = (group: Record<string, string>) =>
  Object.keys(group).filter((pattern) => group[pattern] === "deny");
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("inth c15t --inth arguments", () => {
  it("selects Inth's setup agent", () => {
    expect(parseArguments(["c15t", "--inth"]).c15t).toMatchObject({
      action: "inth",
    });
  });

  it("refuses JSON output and a second action, since the agent uses the terminal", () => {
    expect(() => parseArguments(["c15t", "--inth", "--json"])).toThrow(
      /Agent sessions use this terminal/u
    );
    expect(() => parseArguments(["c15t", "--inth", "--codex"])).toThrow(
      /Choose one of/u
    );
    expect(() => parseArguments(["c15t", "--inth", "--yes"])).toThrow(
      /apply to scaffold/u
    );
  });
});

describe("fx release", () => {
  it("has a build for each macOS and Linux machine and none for Windows", () => {
    for (const [platform, arch] of [
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["linux", "arm64"],
      ["linux", "x64"],
    ]) {
      expect(fxAsset(FX_RELEASE, platform ?? "", arch ?? "")?.sha256).toMatch(
        /^[\da-f]{64}$/u
      );
    }
    expect(fxAsset(FX_RELEASE, "win32", "x64")).toBeUndefined();
  });

  it("reads the executable out of a real tar.gz archive", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "inth-fx-tar-"));
    directories.push(directory);
    await writeFile(path.join(directory, "fx"), "#!/bin/sh\necho fx\n");
    await writeFile(path.join(directory, "LICENSE"), "Apache-2.0\n".repeat(80));
    const archive = path.join(directory, "fx.tar.gz");
    const tar = spawnSync("tar", ["-czf", archive, "LICENSE", "fx"], {
      cwd: directory,
    });
    expect(tar.status).toBe(0);
    const bytes = gunzipSync(await readFile(archive));
    expect(new TextDecoder().decode(tarFile(new Uint8Array(bytes), "fx"))).toBe(
      "#!/bin/sh\necho fx\n"
    );
    expect(tarFile(new Uint8Array(bytes), "missing")).toBeUndefined();
    expect(tarFile(new Uint8Array(512), "fx")).toBeUndefined();
  });

  it("prints digests the way release checksums are written", () => {
    const digest = createHash("sha256").update("fx").digest();
    expect(hex(new Uint8Array(digest))).toBe(
      createHash("sha256").update("fx").digest("hex")
    );
  });
});

describe("fx settings", () => {
  it("connects fx only to Inth's gateway, with the token read from the environment", () => {
    const settings = JSON.parse(fxSettings(session));
    expect(settings.provider).toBe("inth");
    expect(settings.providers.inth).toMatchObject({
      auth: { env: "INTH_WIZARD_TOKEN", type: "bearer" },
      base_url: "https://api.inth.com/v1/wizard/gateway/v1",
      protocol: "anthropic-messages",
      reviewer_model: "claude-haiku-5-5",
    });
    expect(settings.models.inth).toBe("claude-opus-5-5");
    expect(JSON.stringify(settings)).not.toContain(session.token);
  });

  it("denies secrets, edits outside the app, and commands that ship or leak", () => {
    const { permission } = JSON.parse(fxSettings(session));
    expect(denied(permission.read)).toEqual(
      expect.arrayContaining([".env*", "*/.env*", ".npmrc"])
    );
    expect(denied(permission.edit)).toEqual(
      expect.arrayContaining(["/*", "~*", "..*", "*/..*", ".git/*", ".env*"])
    );
    expect(denied(permission.bash)).toEqual(
      expect.arrayContaining([
        "*.env*",
        "*INTH_WIZARD_TOKEN*",
        "git push*",
        "npm publish*",
        "sudo *",
      ])
    );
    // fx applies the last matching rule, so each group must open with its default.
    for (const group of [permission.read, permission.edit, permission.bash]) {
      expect(Object.entries(group)[0]).toEqual(["*", "allow"]);
    }
    expect(permission.subagent).toBe("deny");
    expect(permission.skill).toBe("deny");
  });

  it("accepts only an HTTPS gateway, or plain HTTP on this machine", () => {
    expect(fxBaseUrl("http://127.0.0.1:4599/v1/wizard/gateway/")).toBe(
      "http://127.0.0.1:4599/v1/wizard/gateway/v1"
    );
    for (const url of [
      "http://api.example.com/v1/wizard/gateway",
      "https://user:pass@api.inth.com/v1/wizard/gateway",
      "https://api.inth.com/v1/wizard/gateway?x=1",
      "not a url",
    ]) {
      expect(() => fxBaseUrl(url)).toThrow(/Invalid wizard gateway URL/u);
    }
  });
});

describe("fx environment", () => {
  it("keeps the person's shell setup but none of fx's or inth's own settings", () => {
    const env = fxEnvironment(
      {
        AI_GATEWAY_API_KEY: "person's key",
        ANTHROPIC_API_KEY: "person's key",
        FX_PERMISSION_MODE: "full-access",
        FX_PROVIDER: "gateway",
        HOME: "/Users/person",
        INTH_TOKEN: "org key",
        PATH: "/usr/bin",
        fx_model: "other",
      },
      "/state/fx-home",
      session.token
    );
    expect(env).toEqual({
      FX_AUTO_UPGRADE: "0",
      FX_DISABLE_KEYCHAIN: "1",
      FX_HERDR: "0",
      FX_HOME: "/state/fx-home",
      FX_SOUND: "off",
      HOME: "/Users/person",
      INTH_WIZARD_TOKEN: session.token,
      PATH: "/usr/bin",
    });
  });

  it("runs one unattended request on Inth's connection", () => {
    expect(fxArguments(session, "-- set up c15t")).toEqual([
      "ask",
      "--json",
      "--no-color",
      "--permission-mode",
      "auto",
      "--provider",
      "inth",
      "--model",
      "claude-opus-5-5",
      "--",
      "-- set up c15t",
    ]);
  });
});

describe("backend URL in .env", () => {
  it("uses the variable the framework quickstart reads, keeping other lines", () => {
    const target = backendEnv("next-app", "https://acme.c15t.dev");
    expect(target?.env).toEqual({
      file: ".env",
      name: "NEXT_PUBLIC_C15T_BACKEND_URL",
    });
    expect(
      mergeBackendEnv(
        "SECRET=1\nNEXT_PUBLIC_C15T_BACKEND_URL=https://old.c15t.dev\n",
        target?.line ?? ""
      )
    ).toBe("SECRET=1\nNEXT_PUBLIC_C15T_BACKEND_URL=https://acme.c15t.dev\n");
    expect(backendEnv("vue", "https://acme.c15t.dev")?.env.name).toBe(
      "VITE_C15T_BACKEND_URL"
    );
  });

  it("writes nothing for plain HTML or an unknown framework", () => {
    expect(backendEnv("html", "https://acme.c15t.dev")).toBeUndefined();
    expect(backendEnv(undefined, "https://acme.c15t.dev")).toBeUndefined();
  });
});

describe("failed runs", () => {
  it.each([
    [
      "API access denied · HTTP 403 · permission_error: This run used its model budget. Run the wizard again to continue.",
      /run inth c15t --inth again to continue/u,
    ],
    [
      "permission_error: You have used today’s wizard budget. Try again tomorrow.",
      /Try again tomorrow/u,
    ],
    [
      "permission_error: The Inth wizard is at capacity today.",
      /at capacity today/u,
    ],
    [
      "authentication_error: The wizard session expired or is invalid.",
      /session expired/u,
    ],
    ["", /stopped before finishing/u],
  ])("explains %j", (output, message) => {
    expect(fxFailure(output)).toMatch(message);
  });
});
