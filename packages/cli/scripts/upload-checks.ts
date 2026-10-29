import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

export const verifyUploads = async (fixture: string): Promise<void> => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "inth-native-uploads-")
  );
  const document = Buffer.alloc(20_971_520);
  for (let index = 0; index < document.length; index += 1) {
    document[index] = index % 256;
  }
  await writeFile(path.join(directory, "document.pdf"), document);
  const recording = await open(
    path.join(directory, "recording.webm"),
    "wx",
    0o600
  );
  await recording.truncate(104_857_600);
  await recording.write(Buffer.from([0, 0x80, 0xff]), 0, 3, 0);
  await recording.close();
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(
    path.join(directory, "recording.webm")
  )) {
    digest.update(chunk);
  }
  const expectedDigest = digest.digest("hex");
  let chatPosts = 0;
  let messagePosts = 0;
  let messageBody = "";
  let limits = 0;
  let puts = 0;
  let intents = 0;
  let finalizes = 0;
  let transferred = 0;
  const failures: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://fixture.invalid");
      if (url.pathname === "/storage" || url.pathname === "/cancel-storage") {
        assert.equal(request.method, "PUT");
        for (const header of ["authorization", "cookie", "referer"]) {
          assert.equal(request.headers[header], undefined);
        }
        assert.equal(request.headers["content-type"], "video/webm");
        assert.equal(request.headers["content-length"], "104857600");
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          hash.update(chunk);
        }
        if (url.pathname === "/storage") {
          puts += 1;
          transferred = size;
          assert.equal(size, 104_857_600);
          assert.equal(hash.digest("hex"), expectedDigest);
          request.socket.destroy();
          return;
        }
        response.end();
        return;
      }
      assert.equal(request.headers.authorization, "Bearer native-upload-token");
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const source = Buffer.concat(chunks).toString();
      const body = JSON.parse(source);
      response.setHeader("Content-Type", "application/json");
      if (url.pathname === "/chat-rate-limit") {
        limits += 1;
        response.writeHead(429, { "Retry-After": "0" });
        response.end("{}");
        return;
      }
      assert.equal(url.searchParams.get("organizationId"), "org_native");
      if (url.pathname === "/v1/agent-chats") {
        messagePosts += 1;
        if (messagePosts === 1) {
          messageBody = source;
        }
        assert.equal(source, messageBody);
        assert.equal(body.message, "");
        assert.deepEqual(body.attachmentIds, ["aga_second", "aga_first"]);
        assert.match(body.clientMessageId, /^[\da-f-]{36}$/u);
        let messageStatus = 202;
        if (messagePosts === 1) {
          messageStatus = 401;
        }
        if (messagePosts === 2) {
          messageStatus = 429;
        }
        response.writeHead(messageStatus, { "Retry-After": "0" });
        response.end("{}");
        return;
      }
      if (url.pathname === "/v1/agent-chat-attachments") {
        chatPosts += 1;
        assert.equal(request.method, "POST");
        assert.equal(body.mediaType, "application/pdf");
        assert.deepEqual(Buffer.from(body.data, "base64"), document);
        response.end(
          JSON.stringify({
            data: {
              attachment: {
                downloadUrl: "/v1/agent-chat-attachments/aga_native/content",
                fileName: "document.pdf",
                id: "aga_native",
                mediaType: "application/pdf",
                sizeBytes: document.length,
              },
              organizationId: "org_native",
            },
            success: true,
          })
        );
        return;
      }
      const attachment = {
        downloadUrl: "/v1/support/attachments/sat_123/content",
        fileName: "recording.webm",
        id: "sat_123",
        mediaType: "video/webm",
        sizeBytes: 104_857_600,
        status: "uploading",
      };
      if (url.pathname === "/v1/support/attachments") {
        intents += 1;
        assert.equal(
          body.clientAttachmentId,
          intents === 1
            ? "b8dde372-1324-4d2e-a15a-fd3761964299"
            : "65c07b5a-2e96-43b0-9c73-feced0a76530"
        );
        response.end(
          JSON.stringify({
            data: {
              attachment,
              upload: {
                expiresAt: new Date(Date.now() + 900_000).toISOString(),
                mediaType: "video/webm",
                method: "PUT",
                url: "https://vercel.com/api/blob/?pathname=support%2Fattachments%2Fsat_123.webm&vercel-blob-delegation=private-delegation&vercel-blob-signature=private-signature",
              },
            },
            success: true,
          })
        );
      } else if (url.pathname === "/v1/support/attachments/sat_123/finalize") {
        finalizes += 1;
        assert.equal(puts, 1);
        response.end(
          JSON.stringify({
            data: { attachment: { ...attachment, status: "ready" } },
            success: true,
          })
        );
      } else {
        throw new Error(`Unexpected upload fixture path ${url.pathname}`);
      }
    } catch (error) {
      if (request.url !== "/cancel-storage") {
        failures.push(
          error instanceof Error ? error.message : "Upload fixture failed"
        );
      }
      response.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- Check the Node TCP address before passing its port to the fixture.
    assert.ok(address && typeof address !== "string");
    const child = spawn(
      fixture,
      [`http://127.0.0.1:${address.port}`, directory],
      { env: { ...process.env, INTH_TELEMETRY_DISABLED: "1" } }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    const [code] = await once(child, "exit");
    clearTimeout(timer);
    assert.equal(code, 0, stderr || stdout);
    assert.match(stdout, /upload-test passed/u);
    assert.deepEqual(failures, []);
    assert.equal(chatPosts, 1);
    assert.equal(messagePosts, 3);
    assert.equal(limits, 1);
    assert.equal(puts, 1);
    assert.equal(finalizes, 1);
    assert.equal(intents, 2);
    assert.equal(transferred, 104_857_600);
    assert.doesNotMatch(
      stdout + stderr,
      /private-signature|private-delegation|native-upload-token/u
    );
    const receiptPath = path.join(directory, "receipt.json");
    const receipt = JSON.parse(await readFile(receiptPath, "utf-8"));
    assert.equal(receipt.stage, "ready");
    assert.equal(receipt.attachmentId, "sat_123");
    assert.doesNotMatch(
      JSON.stringify(receipt),
      /vercel-blob|native-upload-token/u
    );
    if (process.platform !== "win32") {
      const saved = await stat(receiptPath);
      // eslint-disable-next-line no-bitwise -- Verify private receipt permissions.
      assert.equal(saved.mode & 0o777, 0o600);
    }
  } finally {
    server.closeAllConnections();
    const closed = once(server, "close");
    server.close();
    await closed;
    await rm(directory, { force: true, recursive: true });
  }
};
