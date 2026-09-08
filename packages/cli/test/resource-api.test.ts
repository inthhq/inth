import { describe, expect, it } from "vitest";

import { ApiClient } from "../experiments/node/api.ts";
import { Auth } from "../experiments/node/auth.ts";
import { chooseOrganization } from "../src/organizations.ts";
import {
  credentials,
  metadata,
  tokens,
  MemoryStore,
  setup,
} from "./fixtures.ts";

const organization = {
  id: "org_later",
  name: "Later",
  role: "owner",
  slug: "later",
};
const page = (
  hasMore: boolean,
  nextCursor: string | null,
  data = [organization]
) =>
  Response.json({ data, pagination: { hasMore, nextCursor }, success: true });

const keyClient = (responses: Response[]) => {
  const f = setup(responses);
  return {
    ...f,
    api: new ApiClient(
      f.http,
      () => {
        throw new Error("Unexpected credentials");
      },
      "inth_fixture"
    ),
  };
};

describe("resource API transport", () => {
  it.each(["PATCH", "DELETE", "POST"])(
    "preserves %s and its body across a single token refresh",
    async (method) => {
      const f = setup(
        [
          new Response(null, { status: 401 }),
          Response.json(metadata),
          Response.json(tokens),
          Response.json({ success: true }),
        ],
        new MemoryStore({ ...credentials, expires_at: 2_000_000 })
      );
      const api = new ApiClient(f.http, () =>
        Promise.resolve(new Auth(f.http, f.store))
      );
      const body =
        method === "PATCH" ? '{"status":"resolved","version":"3"}' : undefined;
      await api.execute("/v1/inbox/item_123", method, body);
      expect(f.server.calls[0]?.init).toMatchObject({ body, method });
      expect(f.server.calls[3]?.init).toMatchObject({
        body,
        headers: { Authorization: "Bearer access-secret" },
        method,
      });
      expect(f.store.value?.refresh_token).toBe("refresh-secret");
      expect(f.server.calls).toHaveLength(4);
    }
  );
  it.each([401, 409, 500])(
    "does not replay mutations after HTTP %s with an API key",
    async (status) => {
      const f = keyClient([
        Response.json(
          {
            error: { code: "CONFLICT", message: "private-body" },
            success: false,
          },
          { headers: { "X-Request-Id": "write-id" }, status }
        ),
      ]);
      await expect(
        f.api.execute("/v1/api-keys/key_123/roll", "POST")
      ).rejects.toMatchObject({
        message: expect.not.stringContaining("private-body"),
        requestId: "write-id",
        status,
      });
      expect(f.server.calls).toHaveLength(1);
    }
  );
  it("returns delayed scan acceptance, key secrets, and empty responses without alteration", async () => {
    const accepted = {
      data: {
        preparationId: "prep_123",
        repositoryId: "repo_123",
        status: "starting",
      },
      success: true,
    };
    const secret = {
      data: { id: "key_123", key: "inth_new_secret" },
      success: true,
    };
    const f = keyClient([
      Response.json(accepted, { status: 202 }),
      Response.json(secret, { status: 201 }),
      new Response(null, { status: 204 }),
    ]);
    expect(
      JSON.parse(
        await f.api.execute(
          "/v1/code-audit/scans",
          "POST",
          '{"repositoryId":"repo_123"}'
        )
      )
    ).toEqual(accepted);
    expect(
      JSON.parse(await f.api.execute("/v1/api-keys", "POST", '{"name":"CI"}'))
    ).toEqual(secret);
    expect(await f.api.execute("/v1/projects/prj_123", "DELETE")).toBe("");
  });
  it("keeps explicit organization queries ahead of the CLI default on raw writes", async () => {
    const f = keyClient([Response.json({ success: true })]);
    await f.api.execute(
      "/v1/projects?organizationId=org_explicit",
      "POST",
      '{"name":"Web","region":"eu"}',
      "org_default"
    );
    expect(f.server.calls[0]?.url).toBe(
      "https://api.inth.com/v1/projects?organizationId=org_explicit"
    );
  });
});

describe("organization pagination", () => {
  it("finds memberships beyond the first page for login and switching", async () => {
    const first = { ...organization, id: "org_first", slug: "first" };
    const f = keyClient([page(true, "opaque+/=", [first]), page(false, null)]);
    const organizations = await f.api.organizations();
    expect(organizations).toEqual([first, organization]);
    expect(f.server.calls.map((call) => call.url)).toEqual([
      "https://api.inth.com/v1/organizations?limit=100",
      "https://api.inth.com/v1/organizations?limit=100&cursor=opaque%2B%2F%3D",
    ]);
    expect(
      await chooseOrganization(organizations, "later", undefined, {
        interactive: false,
        select: () => {
          throw new Error("Unexpected prompt");
        },
      })
    ).toBe("org_later");
  });
  it("rejects missing pagination metadata with the server request ID", async () => {
    const f = keyClient([
      Response.json(
        { data: [organization], success: true },
        { headers: { "X-Request-Id": "page-id" } }
      ),
    ]);
    await expect(f.api.organizations()).rejects.toMatchObject({
      code: "invalid_response",
      requestId: "page-id",
    });
  });
  it("stops on repeated or absent continuation cursors", async () => {
    const repeated = keyClient([page(true, "same"), page(true, "same")]);
    await expect(repeated.api.organizations()).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(repeated.server.calls).toHaveLength(2);
    const missing = keyClient([page(true, null)]);
    await expect(missing.api.organizations()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
