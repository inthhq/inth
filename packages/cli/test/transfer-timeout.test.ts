import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { HttpClient } from "../experiments/node/http.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      milliseconds
    );
    return controller.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const api = (
  fetcher: (url: string, init: RequestInit) => Promise<Response>
): ApiClient =>
  new ApiClient(
    new HttpClient(
      fetcher,
      { now: Date.now, sleep: () => Promise.resolve() },
      new AbortController().signal
    ),
    () =>
      Promise.resolve({
        accessToken: () => Promise.resolve("person-token"),
        userInfoEndpoint: () =>
          Promise.resolve("https://api.inth.com/userinfo"),
      })
  );

it("finishes a steadily arriving download after the ordinary request timeout", async () => {
  const client = api((_url, init) =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const timer = setInterval(
              () => controller.enqueue(new Uint8Array([65])),
              10_000
            );
            const finish = setTimeout(() => {
              clearInterval(timer);
              controller.close();
            }, 35_000);
            init.signal?.addEventListener(
              "abort",
              () => {
                clearInterval(timer);
                clearTimeout(finish);
                controller.error(init.signal?.reason);
              },
              { once: true }
            );
          },
        })
      )
    )
  );
  const reading = client.download("/v1/support/attachments/sat_123/content");
  const checked = expect(reading).resolves.toMatchObject({
    bytes: new Uint8Array([65, 65, 65]),
  });
  await vi.advanceTimersByTimeAsync(35_000);
  await checked;
});

it("finishes a chat upload after the ordinary request timeout without retrying", async () => {
  let attempts = 0;
  const client = api((_url, init) => {
    attempts += 1;
    const { promise, resolve, reject } = Promise.withResolvers<Response>();
    const timer = setTimeout(
      () =>
        resolve(Response.json({ data: { id: "aga_ready" }, success: true })),
      35_000
    );
    init.signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(init.signal?.reason);
      },
      { once: true }
    );
    return promise;
  });
  const upload = client.uploadChat('{"fileName":"notes.txt","data":"QQ=="}');
  const checked = expect(upload.then(JSON.parse)).resolves.toMatchObject({
    data: { id: "aga_ready" },
  });
  await vi.advanceTimersByTimeAsync(35_000);
  await checked;
  expect(attempts).toBe(1);
});
