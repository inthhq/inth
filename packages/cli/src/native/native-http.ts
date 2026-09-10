/* eslint-disable no-await-in-loop -- HTTP retries and cancellable polling waits must be sequential. */
import { setTimeout } from "node:timers/promises";

import type { Clock, OAuthResponse, OAuthTransport } from "../auth-types.ts";
import { CliError } from "../cli-error.ts";
import { diagnosticStep } from "../error-diagnostics.ts";
import { HttpError } from "../http-error.ts";
import type { ApiTransport } from "./native-api.ts";
import { httpDate } from "./native-bindings.ts";
import {
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
const checkedBody = async (response: OAuthResponse): Promise<string> => {
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.body;
};
const invalid = (response: OAuthResponse): Error => {
  const error = new HttpError(response.status, "", response.requestId);
  return new CliError(
    "invalid_response",
    `inth returned an invalid response.${error.requestId ? ` Request ID: ${error.requestId}` : ""}`,
    response.status,
    error.requestId
  );
};
// Keep each header record exact. Scriptc stringifies absent optional record fields as "undefined".
const fetchBody = (
  url: string,
  fields: string,
  token: string,
  json: boolean,
  method: string,
  signal: AbortSignal
): Promise<Response> => {
  if (json && token) {
    return fetch(url, {
      // eslint-disable-next-line unicorn/no-invalid-fetch-options -- Callers validate methods before passing a body.
      body: fields,
      headers: {
        Accept: "application/json",
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
        Accept: "application/json",
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
    method = fields === null ? "GET" : "POST"
  ): Promise<OAuthResponse> => {
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
        AbortSignal.timeout(Math.ceil(Math.min(30_000, remaining))),
      ]);
      let response: Response;
      let body: string;
      try {
        response =
          fields === null
            ? await fetch(url, {
                headers: token
                  ? {
                      Accept: "application/json",
                      Authorization: `Bearer ${token}`,
                    }
                  : {},
                method,
                redirect: "error",
                signal: timeout,
              })
            : await fetchBody(url, fields, token, json, method, timeout);
        diagnosticStep("http_response");
        body = await response.text();
      } catch {
        signal.throwIfAborted();
        throw new Error(
          "Could not reach inth. Check your connection and try again."
        );
      }
      const result: OAuthResponse = {
        body,
        ok: response.ok,
        requestId: response.headers.get("X-Request-Id"),
        retryAfter: response.headers.get("Retry-After") ?? undefined,
        status: response.status,
      };
      if (!retryRateLimit || result.status !== 429 || attempt >= 3) {
        return result;
      }
      const delay = retryDelay(
        response.headers.get("Retry-After"),
        clock.now()
      );
      if (clock.now() + delay >= deadline) {
        return result;
      }
      if (delay > 2_147_483_647) {
        throw await responseError(result);
      }
      await clock.sleep(delay);
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
    error: (response) => responseError(response),
    form: (url, fields, deadline) =>
      request(url, fields.toString(), deadline, ""),
    get: (url, token) => request(url, null, Number.POSITIVE_INFINITY, token),
    post: (url, token, body) =>
      request(url, body, Number.POSITIVE_INFINITY, token, true),
    request: (url, deadline) => request(url, null, deadline, ""),
    send: (url, token, method, body) =>
      request(url, body ?? null, Number.POSITIVE_INFINITY, token, true, method),
    tokens: async (response, previousRefreshToken) => {
      diagnosticStep("oauth_tokens");
      const body = await checkedBody(response);
      try {
        return parseTokens(body, previousRefreshToken);
      } catch {
        throw invalid(response);
      }
    },
  };
};
