# Authentication and credential storage

[Back to the CLI guide](../README.md)

## Browser sign-in

The CLI fetches [OAuth discovery](https://api.inth.com/.well-known/oauth-authorization-server) and uses its device, token, and revocation endpoints. It does not derive those paths from the API origin or assume that the issuer is on the API host.

Device authorization requests use `client_id=inth-cli`, scopes `openid profile email offline_access organizations.read organizations.write projects.read projects.write members.read members.write api-keys.read api-keys.write code-audit.read code-audit.write inbox.read inbox.write billing.read`, and `resource=https://api.inth.com`. The CLI prints the user code, opens `verification_uri_complete`, and waits at the advertised interval. `authorization_pending` keeps polling; each `slow_down` adds five seconds to subsequent intervals. Refusal stops login. Expiry asks the person to run `inth login` again, avoiding an unattended loop of new approval sessions. Ctrl+C cancels requests and waits.

A login rejected with `400 invalid_scope` means the OAuth server refused the requested scopes. Check the deployed `inth-cli` registration and its allowed scopes. Discovery advertising a scope does not mean the client registration allows it. The CLI preserves the saved sign-in on this failure.

Sign-ins made before the capability policy need a fresh `inth login`. Refreshing an old token cannot add scopes. A `403 INSUFFICIENT_SCOPE` response produces the CLI error `insufficient_scope` with sign-in guidance. Other 403 responses remain `access_denied`. Organization API keys have a fixed capability set and cannot gain scopes through login. `whoami` reports the API's `scopes` array; if a user token lacks `organizations.read`, it explains that organization access was not granted.

Every device-token and refresh request includes the API resource. Saved credentials contain `access_token`, `refresh_token`, and `expires_at` as Unix milliseconds. The client refreshes within 60 seconds of expiry or once after a 401. It saves every replacement refresh token before returning the access token. A filesystem lock serializes credential changes across CLI processes, including logout, so parallel commands do not race token rotation. `invalid_grant` clears the saved sign-in and asks for login again. Ambiguous network failures are not automatically retried with a rotating refresh token.

Logout sends the refresh token to the discovered revocation endpoint, then clears local credentials. If revocation fails, it still clears local credentials and reports that remote sign-out needs checking in the dashboard. An unavailable OS store is an error; the CLI never falls back to plaintext token files.

All requests reject redirects. Authenticated API requests must stay under `https://api.inth.com/v1/`. HTTP 429 responses honor `Retry-After` seconds or HTTP dates, with at most three retries. Errors include the response's `X-Request-Id` when available. Raw response bodies and supplied keys are excluded from error messages.

## Credential storage

The Scriptc build uses macOS Security framework calls directly, with Keychain service `com.inth.cli.scriptc`, account `oauth`, and private state under `~/Library/Application Support/inth-scriptc`. It writes organization preferences atomically with owner-only permissions. This preserves existing native sessions and keeps them separate from Node/yao sessions.

For Node and yao-pkg, [`@napi-rs/keyring`](https://github.com/Brooooooklyn/keyring-node) accesses the current user's platform credential store. The service is `com.inth.cli` and the account is `oauth`. Tokens live in macOS Keychain, Windows Credential Manager, or the Linux keyring backend. Linux needs a functioning user credential service; use `INTH_TOKEN` on headless machines without one.

The Node/yao experiments store only locks and organization preferences under these home-directory locations:

- macOS: `~/Library/Application Support/inth`
- Windows: `~/AppData/Local/inth`
- Linux: `~/.local/state/inth`

On POSIX systems, those directories use mode `0700` and preference files use `0600`. Credentials inherit the platform store's per-user access controls rather than file permissions. Project directories receive only `.inth/project.json` when explicitly linked.

### Repeated macOS Keychain prompts

Choose **Always Allow** to authorize the current executable persistently; **Allow** grants one access. Local builds use ad hoc signing by default. When the executable changes, its Keychain identity changes too, so earlier approval may not apply. This is separate from the saved organization preference.

For trust across changed builds, install a code-signing certificate and build with the same identity:

```sh
security find-identity -v -p codesigning
INTH_CODESIGN_IDENTITY="Apple Development: Your Name (TEAMID)" pnpm --filter @inth/cli build
```

The build signs the primary binary with identifier `com.inth.cli`, verifies the signature, then copies the legacy entry paths. The first move from ad hoc to certificate signing may need one new **Always Allow** approval. The setting does not create a certificate, change Keychain access controls, or grant other programs access to CLI tokens. Without an installed certificate, use the built `dist/inth` between rebuilds; `dev` rebuilds first.

Apple documents [Keychain prompt choices](https://support.apple.com/en-md/guide/keychain-access/kyca1243/mac) and [how code identity changes affect authorization](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements). Manual `auth refresh` uses one credential read under the refresh lock; a refresh still updates the stored tokens afterward.

## Passkeys

The browser approval page can use the dashboard's existing passkey sign-in. Compiling the CLI does not add passkey authentication or make its bearer tokens device-bound. The browser performs authentication and approval; the OS credential store protects the resulting tokens.
