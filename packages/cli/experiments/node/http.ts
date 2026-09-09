import { setTimeout } from "node:timers/promises";

import { z } from "zod";

import type { Clock } from "../../src/auth-types.ts";
import { CliError } from "../../src/cli-error.ts";
/* eslint-disable no-await-in-loop -- Retry-After requires sequential requests and waits. */
import { HttpError } from "../../src/http-error.ts";

export { HttpError } from "../../src/http-error.ts";

export type { Clock } from "../../src/auth-types.ts";
export const systemClock = (signal: AbortSignal): Clock => ({
  now: () => Date.now(),
  sleep: async (milliseconds) => {
    await setTimeout(milliseconds, undefined, { signal });
  },
});
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const oauthErrorSchema = z.union([
  z.object({ error: z.string() }).transform((value) => value.error),
  z
    .object({ error: z.object({ code: z.string() }) })
    .transform((value) => value.error.code),
]);

export const retryDelay = (value: string | null, now: number): number => {
  if (value === null) {
    return 1000;
  }
  const seconds = Number(value);
  if (value.trim() !== "" && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 1000;
};

export class HttpClient {
  readonly clock: Clock;
  private readonly fetcher: Fetch;
  private readonly signal: AbortSignal;
  private readonly retryRateLimit: boolean;
  constructor(
    fetcher: Fetch,
    clock: Clock,
    signal: AbortSignal,
    retryRateLimit = true
  ) {
    this.retryRateLimit = retryRateLimit;
    this.fetcher = fetcher;
    this.clock = clock;
    this.signal = signal;
  }
  async request(
    url: string,
    init: RequestInit = {},
    deadline = Number.POSITIVE_INFINITY
  ): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      this.signal.throwIfAborted();
      const remaining = deadline - this.clock.now();
      if (remaining <= 0) {
        throw new Error(
          "The approval code expired. Run `inth login` to start again."
        );
      }
      let response: Response;
      try {
        response = await this.fetcher(url, {
          ...init,
          redirect: "error",
          signal: AbortSignal.any([
            this.signal,
            AbortSignal.timeout(Math.ceil(Math.min(30_000, remaining))),
          ]),
        });
      } catch {
        this.signal.throwIfAborted();
        throw new Error(
          "Could not reach inth. Check your connection and try again."
        );
      }
      if (!this.retryRateLimit || response.status !== 429 || attempt >= 3) {
        return response;
      }
      const delay = retryDelay(
        response.headers.get("Retry-After"),
        this.clock.now()
      );
      if (this.clock.now() + delay >= deadline) {
        return response;
      }
      // Release the connection before waiting, including for non-JSON error pages.
      // Node timers overflow above this limit. Never retry earlier than Retry-After.
      if (delay > 2_147_483_647) {
        throw await this.error(response);
      }
      await response.body?.cancel();
      await this.clock.sleep(delay);
    }
  }
  form(
    url: string,
    fields: URLSearchParams,
    deadline?: number
  ): Promise<Response> {
    return this.request(
      url,
      {
        body: fields.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
      deadline
    );
  }
  async error(response: Response): Promise<HttpError> {
    this.signal.throwIfAborted();
    const parsed = oauthErrorSchema.safeParse(
      await response.json().catch(() => null)
    );
    return new HttpError(
      response.status,
      parsed.success ? parsed.data : "",
      response.headers.get("X-Request-Id")
    );
  }
  async json<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    if (!response.ok) {
      throw await this.error(response);
    }
    const id = new HttpError(
      response.status,
      "",
      response.headers.get("X-Request-Id")
    ).requestId;
    const invalid = (): CliError =>
      new CliError(
        "invalid_response",
        `inth returned an invalid response.${id ? ` Request ID: ${id}` : ""}`,
        response.status,
        id
      );
    const value = await response.json().catch(() => {
      throw invalid();
    });
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw invalid();
    }
    return parsed.data;
  }
}
