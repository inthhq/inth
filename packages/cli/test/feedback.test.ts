import { describe, expect, it, vi } from "vitest";

import { parseArguments } from "../src/arguments.ts";
import { NativeApi } from "../src/native/native-api.ts";
import { buildResourceRequest } from "../src/resource-commands.ts";
import { checkFeedbackIds } from "./fixtures/feedback.ts";

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
  it(
    "generates a stable UUID per invocation for flags and JSON bodies",
    checkFeedbackIds
  );
  it("preserves the report and submission ID across an OAuth refresh and a duplicate submission", async () => {
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
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
  ] as const)(
    "returns HTTP %s with its request ID without resubmitting",
    async (status, code) => {
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
        apiCode: code,
        message: expect.not.stringContaining("private report"),
        requestId: "feedback-request",
        status,
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(auth).not.toHaveBeenCalled();
    }
  );
});
