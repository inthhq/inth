/* eslint-disable no-await-in-loop -- HTTP retries and cancellable polling waits must be sequential. */
import { setTimeout } from "node:timers/promises";

import type { Clock, OAuthResponse, OAuthTransport } from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import { readDownload } from "../download.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import type { ApiTransport } from "./native-api.ts";
import { httpDate } from "./native-bindings.ts";
import {
  invalidResponse,
  parseDevice,
  parseDiscovery,
  parseTokens,
  responseError,
} from "./native-protocol.ts";

export const retryDelay = (value: string | null, now: number): number => {
  if (value === null) {
    return 1000;
  }
  const seconds = Number(value);
  if (value.trim() !== "" && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = httpDate(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 1000;
};
export const nativeClock = (signal: AbortSignal): Clock => ({
  now: () => Date.now(),
  sleep: async (milliseconds) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      await setTimeout(Math.min(25, deadline - Date.now()));
    }
    signal.throwIfAborted();
  },
});
const retryComplete = (
  status: number,
  attempt: number,
  enabled: boolean
): boolean => !enabled || status !== 429 || attempt >= 3;
const checkedBody = async (response: OAuthResponse): Promise<string> => {
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.body;
};
const invalid = (response: OAuthResponse): Error =>
  invalidResponse(response, "inth returned an invalid response.");
// Keep each header record exact. Scriptc stringifies absent optional record fields as "undefined".
const fetchBody = (
  url: string,
  fields: string,
  token: string,
  json: boolean,
  method: string,
  signal: AbortSignal,
  accept: string
): Promise<Response> => {
  if (json && token) {
    return fetch(url, {
      // eslint-disable-next-line unicorn/no-invalid-fetch-options -- Callers validate methods before passing a body.
      body: fields,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method,
      redirect: "error",
      signal,
    });
  }
  if (json) {
    return fetch(url, {
      // eslint-disable-next-line unicorn/no-invalid-fetch-options -- Callers validate methods before passing a body.
      body: fields,
      headers: {
        Accept: accept,
        "Content-Type": "application/json",
      },
      method,
      redirect: "error",
      signal,
    });
  }
  return fetch(url, {
    // eslint-disable-next-line unicorn/no-invalid-fetch-options -- Form requests use POST.
    body: fields,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method,
    redirect: "error",
    signal,
  });
};
const readResponse = async (
  response: Response,
  binary: boolean,
  accept: string,
  signal: AbortSignal
): Promise<OAuthResponse> => {
  if (binary && response.ok) {
    const download = await readDownload(response, accept, signal);
    return {
      body: "",
      bytes: download.bytes,
      contentType: download.contentType,
      ok: response.ok,
      requestId: download.requestId,
      status: response.status,
    };
  }
  return {
    body: await response.text(),
    ok: response.ok,
    requestId: response.headers.get("X-Request-Id"),
    retryAfter: response.headers.get("Retry-After") ?? undefined,
    status: response.status,
  };
};
export const nativeHttp = (
  signal: AbortSignal,
  clock: Clock,
  retryRateLimit = true
): OAuthTransport & ApiTransport => {
  const request = async (
    url: string,
    fields: string | null,
    deadline: number,
    token: string,
    json = false,
    method = fields === null ? "GET" : "POST",
    accept = "application/json",
    binary = false,
    once = false,
    requestTimeout = 30_000
  ): Promise<OAuthResponse> => {
    let waited = 0;
    for (let attempt = 0; ; attempt += 1) {
      diagnosticStep("http_request");
      signal.throwIfAborted();
      const remaining = deadline - clock.now();
      if (remaining <= 0) {
        throw new Error(
          "The approval code expired. Run `inth login` to start again."
        );
      }
      const timeout = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.ceil(Math.min(requestTimeout, remaining))),
      ]);
      let result: OAuthResponse;
      try {
        const response =
          fields === null
            ? await fetch(url, {
                headers: token
                  ? {
                      Accept: accept,
                      Authorization: `Bearer ${token}`,
                    }
                  : {},
                method,
                redirect: "error",
                signal: timeout,
              })
            : await fetchBody(
                url,
                fields,
                token,
                json,
                method,
                timeout,
                accept
              );
        diagnosticStep("http_response");
        result = await readResponse(response, binary, accept, timeout);
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof CliError) {
          throw error;
        }
        // eslint-disable-next-line preserve-caught-error -- Upstream errors may contain credentials or response content.
        throw new Error(
          "Could not reach inth. Check your connection and try again."
        );
      }
      if (retryComplete(result.status, attempt, retryRateLimit && !once)) {
        return result;
      }
      const delay = retryDelay(result.retryAfter ?? null, clock.now());
      if (clock.now() + delay >= deadline) {
        return result;
      }
      if (delay > 2_147_483_647) {
        throw await responseError(result);
      }
      if (waited + delay > 30_000) {
        return result;
      }
      await clock.sleep(delay);
      waited += delay;
    }
  };
  return {
    clock,
    device: async (response) => {
      diagnosticStep("oauth_device");
      const body = await checkedBody(response);
      try {
        return parseDevice(body);
      } catch {
        throw invalid(response);
      }
    },
    discovery: async (response) => {
      diagnosticStep("oauth_discovery");
      const body = await checkedBody(response);
      try {
        return parseDiscovery(body);
      } catch {
        throw invalid(response);
      }
    },
    download: (url, token, accept = "*/*") =>
      request(
        url,
        null,
        Number.POSITIVE_INFINITY,
        token,
        true,
        "GET",
        accept,
        true,
        false,
        300_000
      ),
    error: (response) => responseError(response),
    form: (url, fields, deadline) =>
      request(url, fields.toString(), deadline, ""),
    get: (url, token) => request(url, null, Number.POSITIVE_INFINITY, token),
    post: (url, token, body) =>
      request(url, body, Number.POSITIVE_INFINITY, token, true),
    putImage: async (url, token, bytes, mediaType) => {
      signal.throwIfAborted();
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
      try {
        const response = await fetch(url, {
          body: new Uint8Array(bytes),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Type": mediaType,
          },
          method: "PUT",
          redirect: "error",
          signal: timeout,
        });
        return await readResponse(response, false, "application/json", timeout);
      } catch {
        signal.throwIfAborted();
        throw new CliError(
          "mutation_outcome_unknown",
          "The image write outcome is unknown. Check the account or organization image before another upload."
        );
      }
    },
    request: (url, deadline) => request(url, null, deadline, ""),
    send: (
      url,
      token,
      method,
      body,
      accept = "application/json",
      once = false
    ) =>
      request(
        url,
        body ?? null,
        Number.POSITIVE_INFINITY,
        token,
        true,
        method,
        accept,
        false,
        once
      ),
    tokens: async (response, previousRefreshToken) => {
      diagnosticStep("oauth_tokens");
      const body = await checkedBody(response);
      try {
        return parseTokens(body, previousRefreshToken);
      } catch {
        throw invalid(response);
      }
    },
    uploadChat: (url, token, body) =>
      request(
        url,
        body,
        Number.POSITIVE_INFINITY,
        token,
        true,
        "POST",
        "application/json",
        false,
        true,
        300_000
      ),
  };
};
