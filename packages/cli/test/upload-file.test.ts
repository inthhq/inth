import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import type { CliArguments } from "../src/arguments.ts";
import { prepareUploadFile } from "../src/upload-file.ts";
import type { UploadFile } from "../src/upload-file.ts";

const directories: string[] = [];
const opened: UploadFile[] = [];
const signal = (): AbortSignal => new AbortController().signal;
const bytes = new Uint8Array([0, 128, 255, 13, 10, 65, 0]);

const filePath = (name = "file.png", content = bytes): string => {
  const directory = mkdtempSync(nodePath.join(tmpdir(), "inth-upload-file-"));
  directories.push(directory);
  const path = nodePath.join(directory, name);
  writeFileSync(path, content);
  return path;
};

const options = (
  path: string,
  command = "chat",
  extra: Record<string, string> = {}
): CliArguments => ({
  ...parseArguments(["chat", "get", "chat_fixture"]),
  argument: "attachment-upload",
  command,
  values: [
    { name: "file", value: path },
    ...Object.entries(extra).map(([name, value]) => ({ name, value })),
  ],
});

const prepare = async (
  path: string,
  command = "chat",
  extra: Record<string, string> = {}
): Promise<UploadFile> => {
  const file = await prepareUploadFile(options(path, command, extra), signal());
  opened.push(file);
  return file;
};

afterEach(() => {
  for (const file of opened.splice(0)) {
    file.close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("bounded binary upload input", () => {
  it("reads original binary bytes without text conversion or modifying the source", async () => {
    const path = filePath();
    const file = await prepare(path);
    expect(file.fileName).toBe("file.png");
    expect(file.mediaType).toBe("image/png");
    expect(file.sizeBytes).toBe(bytes.byteLength);
    expect(await file.readBytes(signal())).toEqual(bytes);
    expect(new Uint8Array(readFileSync(path))).toEqual(bytes);
    await expect(file.readBytes(signal())).rejects.toMatchObject({
      code: "upload_file_consumed",
    });
  });

  it("streams bounded byte chunks, including the final partial chunk", async () => {
    const content = new Uint8Array(131_079);
    content.set(bytes, 65_534);
    content.set(bytes, 131_072);
    const file = await prepare(filePath("screen.webm", content), "support");
    const reader = file.stream(signal()).getReader();
    const result = new Uint8Array(content.byteLength);
    let offset = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Exercise the real streaming reader chunk by chunk.
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      expect(chunk.value.byteLength).toBeLessThanOrEqual(65_536);
      result.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
    expect(offset).toBe(content.byteLength);
    expect(result).toEqual(content);
  });

  it.each([
    ["chat", "document.pdf", 20_971_520],
    ["support", "image.png", 10_485_760],
    ["support", "recording.webm", 104_857_600],
  ])(
    "accepts the exact %s %s size bound and rejects one more byte",
    async (command, name, limit) => {
      const path = filePath(name);
      const descriptor = openSync(path, "r+");
      try {
        ftruncateSync(descriptor, limit);
        const file = await prepare(path, command);
        expect(file.sizeBytes).toBe(limit);
        file.close();
        ftruncateSync(descriptor, limit + 1);
        await expect(prepare(path, command)).rejects.toMatchObject({
          code: "usage_error",
        });
      } finally {
        closeSync(descriptor);
      }
    }
  );

  it("rejects empty, missing, directory and FIFO inputs before opening a stream", async () => {
    const empty = filePath("empty.png", new Uint8Array());
    const directory = nodePath.dirname(empty);
    const fifo = nodePath.join(directory, "pipe.png");
    execFileSync("mkfifo", [fifo]);
    for (const path of [
      empty,
      nodePath.join(directory, "missing.png"),
      directory,
      fifo,
    ]) {
      // eslint-disable-next-line no-await-in-loop -- Each invalid source must fail independently.
      await expect(prepare(path)).rejects.toMatchObject({
        code: "usage_error",
      });
    }
  });

  it.each(["-", "https://example.com/image.png", "file:///tmp/image.png"])(
    "refuses stdin and source URLs %s",
    async (path) => {
      await expect(prepare(path)).rejects.toMatchObject({
        code: "usage_error",
      });
    }
  );

  it.each([
    "",
    " ",
    " bad.png",
    "bad.png ",
    ".",
    "..",
    "dir/image.png",
    "dir\\image.png",
    "bad\u0000.png",
    "bad\u200B.png",
    `${"x".repeat(256)}.png`,
  ])("rejects unsafe display filename %j", async (name) => {
    await expect(
      prepare(filePath(), "chat", { "file-name": name })
    ).rejects.toMatchObject({ code: "usage_error" });
  });

  it("rejects an invalid default basename without silently changing it", async () => {
    const path = filePath(" bad.png");
    await expect(prepare(path)).rejects.toMatchObject({ code: "usage_error" });
    const file = await prepare(path, "chat", { "file-name": "renamed.png" });
    expect(file.fileName).toBe("renamed.png");
    expect(await file.readBytes(signal())).toEqual(bytes);
  });

  it.each([
    ["chat", "readme", undefined, "text/plain"],
    ["chat", ".env", undefined, "text/plain"],
    ["chat", "data.CSV", undefined, "text/csv"],
    ["chat", "notes.markdown", undefined, "text/markdown"],
    ["chat", "raw", " APPLICATION/PDF ", "application/pdf"],
    ["support", "image.JPG", undefined, "image/jpeg"],
    ["support", "movie.mov", undefined, "video/quicktime"],
    ["support", "unknown", "video/mp4", "video/mp4"],
  ])(
    "infers or normalizes %s %s media type",
    async (command, name, hint, expected) => {
      const file = await prepare(
        filePath(name),
        command,
        hint === undefined ? {} : { "media-type": hint }
      );
      expect(file.mediaType).toBe(expected);
    }
  );

  it.each([
    ["chat", "image.png", "image/jpeg"],
    ["chat", "document.pdf", "application/octet-stream"],
    ["chat", "movie.webm", "video/webm"],
    ["support", "unknown", undefined],
    ["support", "document.pdf", "application/pdf"],
    ["support", "image.png", "image/png; charset=utf-8"],
    ["support", "image.png", "\nimage/png\n"],
    ["chat", "note.txt", "\ttext/plain"],
    ["support", "image.png", "image/png\r\nX-Header: x"],
  ])(
    "rejects unsupported or mismatched %s %s media hints",
    async (command, name, hint) => {
      await expect(
        prepare(
          filePath(name),
          command,
          hint === undefined ? {} : { "media-type": hint }
        )
      ).rejects.toMatchObject({ code: "usage_error" });
    }
  );

  it.each(["growth", "truncation", "same-size mutation"])(
    "rejects %s after preparation",
    async (change) => {
      const path = filePath();
      const file = await prepare(path);
      if (change === "growth") {
        appendFileSync(path, bytes);
      } else if (change === "truncation") {
        truncateSync(path, 1);
      } else {
        writeFileSync(path, new Uint8Array(bytes.byteLength));
        utimesSync(path, new Date(), new Date(Date.now() + 2000));
      }
      await expect(file.readBytes(signal())).rejects.toMatchObject({
        code: "upload_file_changed",
      });
    }
  );

  it("detects file changes between streamed chunks", async () => {
    const path = filePath("recording.webm", new Uint8Array(196_608));
    const file = await prepare(path, "support");
    const reader = file.stream(signal()).getReader();
    const first = await reader.read();
    expect(first.value?.byteLength).toBe(65_536);
    appendFileSync(path, bytes);
    await expect(reader.read()).rejects.toMatchObject({
      code: "upload_file_changed",
    });
  });

  it("cancels a buffered read between bounded chunks", async () => {
    const file = await prepare(
      filePath("large.pdf", new Uint8Array(1_048_576))
    );
    const controller = new AbortController();
    const reading = file.readBytes(controller.signal);
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels a 100 MiB streamed file and closes the same descriptor on explicit cleanup", async () => {
    const path = filePath("recording.webm");
    const descriptor = openSync(path, "r+");
    try {
      ftruncateSync(descriptor, 104_857_600);
    } finally {
      closeSync(descriptor);
    }
    const file = await prepare(path, "support");
    const controller = new AbortController();
    const reader = file.stream(controller.signal).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    controller.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    file.close();
    file.close();
    await expect(file.readBytes(signal())).rejects.toMatchObject({
      code: "upload_file_closed",
    });
  });
});
