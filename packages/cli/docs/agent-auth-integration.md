# Auth.md sign-in

The CLI supports Inth's WorkOS auth.md `service_auth` flow. A person approves the requested permissions in their browser, then the agent uses a separate saved credential for CLI commands.

General API access requires the accompanying monorepo changes, migration `0060_auth_md_scopes`, and the `rollout-auth-md-cli` flag enabled for the approving account. Until that deployment, the existing server supports only `organizations.read` through `inth auth organizations`.

## Approve a connection

Before registration, tell the person that Inth will receive their email address and the requested permissions. Use `--yes` only after they agree. For hosted c15t setup:

```sh
inth auth start --email user@example.com \
  --scopes organizations.read,organizations.write,projects.read,projects.write \
  --yes --json
```

The result contains `data.verificationUri`, `data.userCode`, the requested scopes and expiry times. Give the person the link and six-digit code. They sign in or create an account and approve on Inth's page. Passwords and email verification codes stay in their browser.

When the server provides `verification_uri_complete`, the CLI uses that link. The approval page displays the code for comparison, so the person can authorize without typing it again. Older servers retain manual approval-code entry. This approval code is separate from the email verification code used to sign in.

```sh
inth login --complete --wait --json
```

Run this command in a background terminal as soon as you have shown the link. It waits at the server's polling interval and returns one final `authenticated` result after approval, selecting this connection for later commands. The person does not need to tell the agent that they finished. The default timeout is 600 seconds; `--timeout` accepts 1 to 3600 seconds. Timeout or cancellation preserves the pending claim, so the same command can resume in another process. Without `--wait`, completion still checks once. The claim token, access token and identity assertion are stored in the OS credential store and never printed.

The default scope is `organizations.read`. Supply a comma-separated subset of the capabilities listed by `inth --help --json`. The server persists that set, shows it during approval and enforces both the granted scopes and the person's current organization role. Write permissions take effect immediately. Permissions to create API keys or spend credits must be requested explicitly; keys created during a session have their own lifetime.

## Use the approved credential

```sh
inth auth status --json
inth org create --name Example --slug example --json
inth org list --json
inth region list --json
inth project create --organization <organization-id> \
  --name Website --region <region-id> \
  --trusted-origins '["https://example.com"]' --json
```

Successful sign-in saves the selected connection, including for raw `inth api` requests. Explicit `--auth browser` or `--auth agent` overrides it for one command. API keys also override the saved selection; an explicit `--auth agent` combined with `--token` or `INTH_TOKEN` is rejected. A missing, expired or insufficient agent grant never falls back to browser credentials. Logout keeps the connection selection. A later interactive browser login selects the browser connection.

See [hosted c15t setup](c15t-setup.md) for the application integration and consent verification steps. Account verification and permission approval require the person. The agent can then provision and configure the resources covered by the grant.

## Expiry and recovery

Access tokens last 15 minutes. The CLI renews them using the identity assertion within 60 seconds of expiry or once after an API returns 401. Renewal preserves the original assertion expiry, one hour after approval. After that window, start a new human-approved connection.

```sh
# Replace an expired six-digit code within the 24-hour registration window.
inth auth retry --json

# Explicitly renew an active credential.
inth auth refresh --json

# Revoke and remove the selected agent credential.
inth logout --json
```

A `claim_uncertain` error means a single-use exchange may have succeeded without a usable response. The CLI will not replay it. Log out of agent mode and start a new claim. `slow_down` increases the interval; HTTP 429 respects `Retry-After` before another poll. Invalid assertions require a new claim.

The upgraded server advertises `identity_assertion_revocation_supported` in `agent_auth`. Logout uses that extension to revoke the registration, blocking renewal and every token issued for it. Older servers revoke only the saved access token. Logout always removes local secrets and reports remote revocation failures. Removing a pending local claim does not approve it; its server-side registration expires.

## Test against a local API

Use the companion monorepo worktree's Portless HTTPS origins:

```sh
export INTH_DEV_API_ORIGIN=https://auth-md-cli-access.api.localhost
export INTH_DEV_DASHBOARD_ORIGIN=https://auth-md-cli-access.dashboard.localhost
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm --filter @inth/cli inth auth start --email dev@inth.com \
  --scopes organizations.read,organizations.write,projects.read,projects.write \
  --yes --json
```

Both origins must be local HTTPS addresses. After sign-in completes, resource commands use the saved connection. Before completion, use `--auth agent` to inspect the local pending sign-in. Local credentials and defaults are separated from production and from other origin pairs. Discovery and approval links must match the configured Dashboard origin. The API needs the local database wrapper and `INTH_LOCAL_AUTH_MD_CLI=true`; see the monorepo's `docs/auth-md-cli.md` for startup commands. Clear the two `INTH_DEV_*` variables to return to production.

## Protocol and storage

Discovery comes from `https://api.inth.com/.well-known/oauth-authorization-server`. The CLI validates the Inth issuer and HTTPS endpoints before sending credentials. API requests remain restricted to the Inth API. It never parses Markdown to derive endpoints.

Native credentials use service `com.inth.cli.scriptc`, account `auth.md`, and a separate `agent.lock`. Node and yao use service `com.inth.cli`, account `auth.md`, with a separate lock directory. Browser OAuth remains in account `oauth`. There is no plaintext credential fallback.

[WorkOS auth.md](https://workos.com/auth-md) and [Better Auth Agent Auth](https://better-auth.com/docs/plugins/agent-auth) are distinct protocols. This CLI implements the auth.md claim and assertion flow. It does not implement Better Auth's agent key registration and signed-request protocol. The monorepo keeps that plugin and repairs its public discovery routing separately.

## Run the browser E2E test

Start the companion local API and dashboard as described above. Install Chromium once with `pnpm --filter @inth/cli exec playwright install chromium`. Then run:

```sh
INTH_E2E_API_LOG=/tmp/inth-auth-md-api-local.log \
  pnpm --filter @inth/cli test:e2e:agent
```

Keep both `INTH_DEV_*` origins and `NODE_EXTRA_CA_CERTS` set. The test requires the local API's terminal OTP delivery and reads only newly appended OTP lines. Use a dedicated dev instance without other simultaneous OTP requests. It fails if these prerequisites are missing. It does not contact production or read a real inbox.

Playwright drives the real dashboard and API. A compiled test entry point uses the CLI's argument parser, authentication command handler, HTTP transport, connection selection, and OS keychain adapters. Each run creates a unique local fixture account and separate credential entry, then removes its credentials. The fixture user remains in the local database. This tests the native authentication path across processes; it does not launch the shipping CLI entry point or exercise unrelated resource commands.

The test checks email prefill, rejection of an incorrect email code, no extra terms screen or second approval-code input, explicit human approval, cancellation and resume, one final JSON result, `whoami` using the saved connection, and logout without credential fallback. Traces and screenshots are retained on failure under `packages/cli/test-results`.

Unit tests cover polling intervals, rate limits, timeouts, concurrent completion, ambiguous exchanges and selection precedence. The normal native suite also compiles and checks the polling loop and saved connection state. Those tests run in CI; the browser test requires the companion local services and runs separately.
