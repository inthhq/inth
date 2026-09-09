# Set up hosted c15t with an agent

An agent can provision Inth and integrate c15t using an existing CLI browser sign-in or an approved auth.md connection. The agent needs access to the application's source files and permission to make the requested changes.

For an auth.md credential, first complete [agent sign-in](agent-auth-integration.md) with `organizations.read,organizations.write,projects.read,projects.write`. Successful sign-in selects that connection for the API commands below. This requires the server's CLI rollout. Human account verification and permission approval happen in the browser.

## Check access

```sh
inth auth status --json
inth whoami --json
inth org list --json
```

`auth status` checks local credential presence. `whoami` checks server access and reports granted scopes. When no browser session exists, a person runs `inth login` in a terminal once. The agent then continues with JSON commands. Do not rerun `login --json` to test a saved session; that command cannot start browser approval.

`INTH_TOKEN` and `--token` select an organization API key instead of the saved browser session. A key can manage projects in its organization but cannot create an organization. Browser sign-in provides the existing `organizations.write` and `projects.write` path; no new agent protocol is needed to use it.

## Select or create an organization

Reuse an organization returned by `org list` when it is the intended destination. To create one:

```sh
inth org create --name "Acme" --slug acme --json
```

The ID is at `data.data.id` in the CLI JSON result. Creation does not change the CLI default. Pass that ID explicitly to organization-scoped commands so setup does not depend on another project's local link or the developer's default organization.

Read subsequent pages when `data.pagination.hasMore` is true. On an uncertain creation result, check for the intended organization before retrying. See [agent usage](../AGENT-USAGE.md) for creation conflicts and recovery.

## Create and inspect the hosted project

```sh
inth region list --json
inth project list --organization <organization-id> --json
inth project create --organization <organization-id> \
  --name Website --region <region-id> \
  --branding c15t --trusted-origins '["example.com","localhost:3000"]' --json
inth project get <project-id> --json
```

Choose a region returned by `region list` and the actual site hosts and local development port. Trusted origins use hosts, optional ports and supported wildcard hosts, not full page URLs. Reuse an existing intended project when resuming setup. Do not automatically repeat project creation after a timeout or server failure; inspect `project list` first.

Both project creation and lookup return:

- `data.data.id`, the project ID.
- `data.data.consent.backendUrl`, the hosted backend URL.
- `data.data.consent.trustedOrigins`, the permitted site hosts.
- `data.data.dashboardUrl`, the dashboard link.

Use the returned `backendUrl` verbatim. If `consent` or `backendUrl` is null, stop the application configuration step and inspect provisioning. Do not guess an instance hostname. To update origins, supply the full intended list, preserving existing sites:

```sh
inth project update <project-id> \
  --trusted-origins '["example.com","www.example.com","localhost:3000"]' --json
```

Project lookup and update take a project ID and do not accept `--organization`.

## Integrate the application

Detect the framework and installed c15t version from the application. Read the matching package's bundled docs, or the [React](https://c15t.com/docs/frameworks/react/quickstart), [Next.js](https://c15t.com/docs/frameworks/next/quickstart) or [JavaScript](https://c15t.com/docs/frameworks/javascript/quickstart) guide. Follow the installed version's API.

Install the appropriate package, add its stylesheet to the app's CSS entrypoint, and configure hosted mode with the returned backend URL. Mount the consent provider, banner and dialog, and include a way to reopen privacy preferences. The public browser configuration needs the consent backend URL. Never put the CLI's OAuth tokens or organization management API keys in frontend code or public environment variables.

Inventory analytics, pixels, embeds and tracking already present in the app. Use the available c15t integration helpers and remove duplicate unmanaged script loading. Configure consent categories for the integrations actually used. Existing applications need targeted edits; a scaffold alone does not move their scripts behind consent.

For a first installation, the [c15t setup tool](https://c15t.com/docs/cli/commands/setup) can help scaffold the app. Check its exact installed version and supported flags before automating it. This guide's verification used manual installation from the bundled React docs, not the interactive scaffolder.

## Verify before deployment

Test in a clean browser session, with a local test script instead of sending events to a real analytics account:

1. Hosted initialization succeeds from the configured site origin.
2. Optional tracking stays blocked before consent and after rejection.
3. Accepting loads the permitted script and stores the choice successfully on the hosted backend.
4. Reloading retains the choice without another approval prompt.
5. Privacy preferences reopen. Revoking consent reaches the backend and prevents tracking on the next load.

Wait for successful backend responses, not just the banner closing. Client persistence can make a failed hosted save appear successful. Run the app's build and existing checks, then deploy through the user's authorized deployment workflow. Deployment access is separate from Inth authentication.

The [browser smoke check](../experiments/c15t-setup/README.md) repeats these checks against a disposable hosted project. It passed on 9 September 2026 with the existing native CLI browser session and c15t 2.2.1. The run covered project creation and lookup, backend initialization, three successful consent writes, persistence and script gating. It did not test a new user's sign-up, the c15t scaffolder, Next.js integration or production deployment.
