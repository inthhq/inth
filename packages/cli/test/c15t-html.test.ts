import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it, vi } from "vitest";

import { runHtmlGenerationWorkflow } from "../src/native/c15t-html.ts";

const fault = vi.hoisted(() => ({
  code: "",
  descriptor: -1,
  failCleanup: false,
  failWrite: false,
  nativeError: false,
  race: false,
  replaceOnWrite: false,
  target: "",
}));

// eslint-disable-next-line anti-slop/no-module-mocking -- Inject filesystem faults while using real files, exclusive opens, inode checks, and upstream recovery.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    linkSync: (source: fs.PathLike, target: fs.PathLike) => {
      if (!fault.code) {
        return actual.linkSync(source, target);
      }
      if (fault.race) {
        actual.writeFileSync(target, "Another writer's page");
      }
      if (fault.nativeError) {
        throw new Error(`${fault.code}: simulated native link failure`);
      }
      throw Object.assign(new Error(`${fault.code}: simulated link failure`), {
        code: fault.code,
      });
    },
    openSync: (file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const descriptor = actual.openSync(file, flags, mode);
      if (file === fault.target) {
        fault.descriptor = descriptor;
      }
      return descriptor;
    },
    unlinkSync: (file: fs.PathLike) => {
      if (fault.failCleanup && path.basename(String(file)) === "0.tmp") {
        fault.failCleanup = false;
        throw new Error("EIO: simulated cleanup failure");
      }
      actual.unlinkSync(file);
    },
    writeSync: (
      descriptor: number,
      bytes: Uint8Array,
      offset: number,
      length: number
    ) => {
      if (fault.failWrite && descriptor === fault.descriptor) {
        if (offset > 0) {
          if (fault.replaceOnWrite) {
            actual.unlinkSync(fault.target);
            actual.writeFileSync(fault.target, "Another writer's replacement");
          }
          throw Object.assign(new Error("ENOSPC: simulated partial write"), {
            code: "ENOSPC",
          });
        }
        return actual.writeSync(descriptor, bytes, offset, Math.min(8, length));
      }
      return actual.writeSync(descriptor, bytes, offset, length);
    },
  };
});

const directories: string[] = [];
const directory = (): string => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "inth-html-copy-"))
  );
  directories.push(root);
  fault.target = path.join(root, "index.html");
  return root;
};
const apply = (cwd: string) =>
  runHtmlGenerationWorkflow(
    ["generate", "--apply"],
    {
      generation: {
        backendURL: "https://site.inth.app",
        framework: "html",
        mode: "hosted",
      },
    },
    { cwd }
  );

afterEach(() => {
  Object.assign(fault, {
    code: "",
    descriptor: -1,
    failCleanup: false,
    failWrite: false,
    nativeError: false,
    race: false,
    replaceOnWrite: false,
    target: "",
  });
  for (const root of directories.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

it.each(["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"])(
  "publishes manifest-free HTML when hard links report %s",
  (code) => {
    const root = directory();
    fault.code = code;
    const result = apply(root);
    expect(result.created).toEqual(["index.html"]);
    expect(fs.readFileSync(fault.target, "utf-8")).toContain(
      "https://site.inth.app/inth.js"
    );
    expect(fs.readdirSync(root)).toEqual(["index.html"]);
    expect(apply(root).created).toEqual([]);
  }
);

const legacyPage = (head: string, body: string): string => `<!doctype html>
<html>
  <head>
${head}  </head>
  <body>
${body}  </body>
</html>
`;

it("asks to rename c15t snippets instead of adding second copies", () => {
  const root = directory();
  const page = legacyPage(
    '    <script src="https://site.inth.app/c15t.js" defer></script>\n',
    '    <a href="#c15t-preferences">Privacy settings</a>\n'
  );
  fs.writeFileSync(fault.target, page);
  const { instructions } = apply(root).plan;
  expect(fs.readFileSync(fault.target, "utf-8")).toBe(page);
  expect(
    instructions.filter((instruction) => instruction.startsWith("Add to"))
  ).toEqual([]);
  expect(
    instructions.filter((instruction) => instruction.includes("still uses"))
  ).toEqual([
    expect.stringMatching(
      /^index\.html still uses \/c15t\.js\. Inth uses \/inth\.js instead\..*\n<script/su
    ),
    expect.stringMatching(
      /^index\.html still uses #c15t-preferences\. Inth uses #inth-preferences instead\..*\n<a href="#inth-preferences">/su
    ),
  ]);
});

it("asks to rename an old preferences link next to a new script", () => {
  const root = directory();
  const page = legacyPage(
    "",
    '    <a href="#c15t-preferences">Privacy settings</a>\n'
  );
  fs.writeFileSync(fault.target, page);
  const { instructions } = apply(root).plan;
  expect(
    instructions.filter((instruction) => instruction.startsWith("Add to"))
  ).toEqual([
    expect.stringMatching(
      /^Add to index\.html:\n<script\s+src="[^"]+\/inth\.js"/u
    ),
  ]);
  expect(
    instructions.filter((instruction) => instruction.includes("still uses"))
  ).toEqual([expect.stringContaining("still uses #c15t-preferences")]);
});

it("does not copy after an unrelated hard-link error", () => {
  const root = directory();
  fault.code = "EACCES";
  expect(() => apply(root)).toThrow("EACCES");
  expect(fs.readdirSync(root)).toEqual([]);
});

it("recognizes Scriptc's errno message format", () => {
  const root = directory();
  fault.code = "ENOTSUP";
  fault.nativeError = true;
  expect(apply(root).created).toEqual(["index.html"]);
});

it("preserves a competing page during exclusive-copy publication", () => {
  const root = directory();
  fault.code = "EPERM";
  fault.race = true;
  expect(() => apply(root)).toThrow("EEXIST");
  expect(fs.readFileSync(fault.target, "utf-8")).toBe("Another writer's page");
  expect(fs.readdirSync(root)).toEqual(["index.html"]);
});

it("removes its partial copy and recovery files after a failed write", () => {
  const root = directory();
  fault.code = "EXDEV";
  fault.failWrite = true;
  expect(() => apply(root)).toThrow("ENOSPC");
  expect(fs.readdirSync(root)).toEqual([]);
});

it("preserves a replacement written while its copy fails", () => {
  const root = directory();
  fault.code = "EXDEV";
  fault.failWrite = true;
  fault.replaceOnWrite = true;
  expect(() => apply(root)).toThrow("ENOSPC");
  expect(fs.readFileSync(fault.target, "utf-8")).toBe(
    "Another writer's replacement"
  );
  expect(fs.readdirSync(root)).toEqual(["index.html"]);
});

it("recovers a published copy when cleanup fails", () => {
  const root = directory();
  fault.code = "ENOSYS";
  fault.failCleanup = true;
  expect(() => apply(root)).toThrow("EIO");
  expect(fs.readdirSync(root)).toEqual([]);
});
