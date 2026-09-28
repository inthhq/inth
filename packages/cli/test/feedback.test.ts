import { describe, expect, it, vi } from "vitest";

import { run } from "../experiments/node/commands.ts";
import { parseArguments } from "../src/arguments.ts";
import { NativeApi } from "../src/native/native-api.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";

const request = buildResourceRequest(
  parseArguments([
    "feedback",
    "--category",
    "bug",
    "--surface",
    "cli",
    "--message",
    "Command failed",
  ])
);
const result = (status: number, body: string) => ({
  body,
  ok: status < 400,
  requestId: "feedback-request",
  status,
});

describe("feedback submission", () => {
  it("returns a quota error through the command HTTP layer without waiting for Retry-After", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        { error: { code: "RATE_LIMITED" }, success: false },
        {
          headers: {
            "Retry-After": "3600",
            "X-Request-Id": "feedback-quota",
          },
          status: 429,
        }
      )
    );
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("INTH_DEV_API_ORIGIN", "");
    vi.stubEnv("INTH_DEV_DASHBOARD_ORIGIN", "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    try {
      await expect(
        run(
          [
            "feedback",
            "--category",
            "bug",
            "--message",
            "Test report",
            "--json",
            "--token",
            "inth_test",
          ],
          controller.signal
        )
      ).rejects.toMatchObject({
        code: "RATE_LIMITED",
        requestId: "feedback-quota",
        status: 429,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        "https://api.inth.com/v1/feedback",
        expect.objectContaining({ method: "POST" })
      );
    } finally {
      clearTimeout(timeout);
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it("preserves the report across an OAuth refresh and a duplicate submission", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(result(401, '{"success":false}'))
      .mockResolvedValueOnce(
        result(
          201,
          '{"success":true,"data":{"reference":"FDB-123","alreadySubmitted":false}}'
        )
      )
      .mockResolvedValueOnce(
        result(
          200,
          '{"success":true,"data":{"reference":"FDB-123","alreadySubmitted":true}}'
        )
      );
    const accessToken = vi
      .fn()
      .mockResolvedValueOnce("expired")
      .mockResolvedValue("refreshed");
    const api = new NativeApi({ get: vi.fn(), post, send: vi.fn() }, () => ({
      accessToken,
      userInfoEndpoint: vi.fn(),
    }));
    const first = await api.execute(request.path, request.method, request.body);
    const duplicate = await api.execute(
      request.path,
      request.method,
      request.body
    );
    expect(JSON.parse(first.body).data).toEqual({
      alreadySubmitted: false,
      reference: "FDB-123",
    });
    expect(JSON.parse(duplicate.body).data).toEqual({
      alreadySubmitted: true,
      reference: "FDB-123",
    });
    expect(post.mock.calls).toEqual([
      ["https://api.inth.com/v1/feedback", "expired", request.body],
      ["https://api.inth.com/v1/feedback", "refreshed", request.body],
      ["https://api.inth.com/v1/feedback", "refreshed", request.body],
    ]);
    expect(accessToken).toHaveBeenCalledWith("expired", false);
  });

  it.each([
    [500, "INTERNAL_ERROR", null],
    [429, "RATE_LIMITED", "RATE_LIMITED"],
  ] as const)(
    "returns HTTP %s with its request ID without resubmitting",
    async (status, code, apiCode) => {
      const post = vi.fn().mockResolvedValue(
        result(
          status,
          JSON.stringify({
            error: { code, message: "private report" },
            success: false,
          })
        )
      );
      const auth = vi.fn();
      const api = new NativeApi(
        { get: vi.fn(), post, send: vi.fn() },
        auth,
        "inth_fixture"
      );
      await expect(
        api.execute(request.path, request.method, request.body)
      ).rejects.toMatchObject({
        apiCode,
        message: expect.not.stringContaining("private report"),
        requestId: "feedback-request",
        status,
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(auth).not.toHaveBeenCalled();
    }
  );
});
