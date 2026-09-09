import { describe, expect, it } from "vitest";

import { agentEnvironment } from "../src/agent-environment.ts";
import { parseAgentDiscovery, checkAgentClaim } from "../src/agent-protocol.ts";
import { apiUrl } from "../src/api-options.ts";

const api = "https://auth-test.api.localhost";
const dashboard = "https://auth-test.dashboard.localhost";

describe("local auth.md configuration", () => {
  it("keeps production defaults and separates local accounts by both origins", () => {
    expect(agentEnvironment().account).toBe("auth.md");
    const local = agentEnvironment(api, dashboard, "agent");
    expect(local.account).not.toBe("auth.md");
    expect(agentEnvironment(api, `${dashboard}:444`, "agent").account).not.toBe(
      local.account
    );
    expect(agentEnvironment(`${api}:444`, dashboard, "agent").account).not.toBe(
      local.account
    );
  });

  it.each([
    [api, undefined, "agent"],
    [undefined, dashboard, "agent"],
    [api, dashboard, "browser"],
    ["https://api.inth.com", dashboard, "agent"],
    [api, "https://evil.example", "agent"],
    ["https://localhost.evil.example", dashboard, "agent"],
    ["http://localhost:4000", dashboard, "agent"],
    ["https://user:password@localhost", dashboard, "agent"],
    [`${api}/other`, dashboard, "agent"],
    [`${api}?target=production`, dashboard, "agent"],
  ])(
    "rejects unsafe or incomplete overrides",
    (apiOrigin, dashboardOrigin, mode) => {
      expect(() => agentEnvironment(apiOrigin, dashboardOrigin, mode)).toThrow(
        "Local testing requires"
      );
    }
  );

  it("pins discovery, approval links and API requests to the selected worktree", () => {
    const environment = agentEnvironment(api, dashboard, "agent");
    const issuer = `${dashboard}/api/auth`;
    const discovery = {
      agent_auth: {
        claim_endpoint: `${issuer}/agent/identity/claim`,
        identity_endpoint: `${issuer}/agent/identity`,
        identity_types_supported: ["service_auth"],
      },
      issuer,
      revocation_endpoint: `${issuer}/oauth2/revoke`,
      token_endpoint: `${issuer}/oauth2/token`,
    };
    expect(
      parseAgentDiscovery(JSON.stringify(discovery), environment).issuer
    ).toBe(issuer);
    expect(() => parseAgentDiscovery(JSON.stringify(discovery))).toThrow();
    expect(() =>
      parseAgentDiscovery(
        JSON.stringify({
          ...discovery,
          token_endpoint: "https://inth.com/api/auth/oauth2/token",
        }),
        environment
      )
    ).toThrow();
    const claim = {
      expires_in: 600,
      interval: 5,
      user_code: "123456",
      verification_uri: `${dashboard}/dashboard/agent-auth/claim`,
    };
    expect(checkAgentClaim(claim, environment)).toEqual(claim);
    expect(() =>
      checkAgentClaim(
        {
          ...claim,
          verification_uri: "https://inth.com/dashboard/agent-auth/claim",
        },
        environment
      )
    ).toThrow();
    expect(apiUrl("/v1/organizations", undefined, environment.apiOrigin)).toBe(
      `${api}/v1/organizations`
    );
    expect(() =>
      apiUrl(
        "https://api.inth.com/v1/organizations",
        undefined,
        environment.apiOrigin
      )
    ).toThrow();
  });
});
