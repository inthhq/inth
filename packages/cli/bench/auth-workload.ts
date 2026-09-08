/* eslint-disable require-await -- The simulated server and clock implement asynchronous production contracts. */
import type { AuthFlow } from "../src/auth-flow.ts";
import type { AuthStore, OAuthResponse } from "../src/auth-types.ts";

export const check = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};
export class AuthScenario {
  time = 1_000_000;
  position = 0;
  waits: number[] = [];
  async sleep(ms: number): Promise<void> {
    this.time += ms;
    this.waits.push(ms);
  }
  next(url: string, fields: URLSearchParams): OAuthResponse {
    const step = this.position;
    this.position += 1;
    if (step === 0) {
      check(
        url === "https://api.inth.com/.well-known/oauth-authorization-server",
        "Wrong discovery request."
      );
      return {
        body: '{"issuer":"https://dashboard.example/auth","device_authorization_endpoint":"https://dashboard.example/device","token_endpoint":"https://dashboard.example/token","revocation_endpoint":"https://dashboard.example/revoke"}',
        ok: true,
        requestId: null,
        status: 200,
      };
    }
    check(fields.get("client_id") === "inth-cli", "Missing client ID.");
    if (step < 6) {
      check(
        fields.get("resource") === "https://api.inth.com",
        "Missing resource."
      );
    }
    let body = "";
    let status = 200;
    if (step === 1) {
      check(
        url === "https://dashboard.example/device" &&
          fields.get("scope") ===
            "openid profile email offline_access organizations.read organizations.write projects.read projects.write members.read members.write api-keys.read api-keys.write code-audit.read code-audit.write inbox.read inbox.write billing.read",
        "Wrong device request."
      );
      body =
        '{"device_code":"bench-device","user_code":"BENCH","verification_uri":"https://dashboard.example/approve","verification_uri_complete":"https://dashboard.example/approve?code=BENCH","expires_in":600,"interval":5}';
    } else if (step >= 2 && step <= 4) {
      check(
        url === "https://dashboard.example/token" &&
          fields.get("grant_type") ===
            "urn:ietf:params:oauth:grant-type:device_code" &&
          fields.get("device_code") === "bench-device",
        "Wrong poll."
      );
      if (step < 4) {
        body =
          step === 2
            ? '{"error":"authorization_pending"}'
            : '{"error":"slow_down"}';
        status = 400;
      } else {
        body =
          '{"access_token":"bench-first","refresh_token":"bench-refresh-first","expires_in":900,"token_type":"Bearer"}';
      }
    } else if (step === 5) {
      check(
        url === "https://dashboard.example/token" &&
          fields.get("grant_type") === "refresh_token" &&
          fields.get("refresh_token") === "bench-refresh-first",
        "Wrong refresh."
      );
      body =
        '{"access_token":"bench-second","refresh_token":"bench-refresh-second","expires_in":900,"token_type":"Bearer"}';
    } else {
      check(
        step === 6 &&
          url === "https://dashboard.example/revoke" &&
          fields.get("token") === "bench-refresh-second" &&
          fields.get("token_type_hint") === "refresh_token",
        "Wrong revocation."
      );
    }
    return { body, ok: status === 200, requestId: null, status };
  }
}
export const workload = async (
  auth: AuthFlow,
  store: AuthStore,
  scenario: AuthScenario
): Promise<void> => {
  const start = performance.now();
  await auth.login({
    show: async (device) => {
      check(device.user_code === "BENCH", "Wrong user code.");
    },
  });
  const login = performance.now();
  const access = await auth.accessToken("bench-first");
  const refresh = performance.now();
  await auth.logout();
  const logout = performance.now();
  check(access === "bench-second", "Refresh failed.");
  check((await store.read()) === null, "Logout did not clear credentials.");
  check(
    scenario.position === 7 && scenario.waits.join(",") === "5000,5000,10000",
    "Incomplete workload."
  );
  console.log(
    JSON.stringify({
      cycle_ms: logout - start,
      login_ms: login - start,
      logout_ms: logout - refresh,
      refresh_ms: refresh - login,
    })
  );
};
