# Hosted c15t browser smoke check

Verify that the CLI's returned project configuration works with a real c15t React application. This uses a saved CLI sign-in, a hosted backend and a fresh browser context. It creates test consent records but does not create or delete projects, change CLI defaults, or send analytics to third parties.

Use a disposable project. Create it with the existing CLI, using an organization you own and a region returned by `inth region list --json`:

```sh
inth project create --organization <organization-id> \
  --name c15t-setup-check --region <region-id> \
  --branding c15t --trusted-origins '["localhost:4173"]' --json
```

Save `data.data.id` from the response. On a retry, reuse that project. For an existing disposable project, add `localhost:4173` to its trusted origins while preserving its other entries.

Install the fixture's pinned dependencies from this directory and run it with the project ID:

```sh
npm install --ignore-scripts --no-audit --no-fund
npm run verify -- --project <project-id>
```

The fixture is outside the pnpm workspace package globs and adds no dependencies to the shipped CLI. The default browser is an installed Google Chrome. For Playwright's Chromium, install it with `./node_modules/.bin/playwright install chromium`, then pass `--browser chromium`.

Pass `--cli /absolute/path/to/inth` to test a specific native build. The fixture invokes `project get --json` through that executable, reads the returned `consent.backendUrl`, builds the test page in memory, serves only on `127.0.0.1:4173`, and shuts down the browser and server afterward. Port 4173 must be free.

The check fails if hosted initialization or a consent write fails, the preferences do not persist, or the local measurement script loads without consent. It waits for each hosted consent write before reloading. Its JSON result includes the checked behaviors and backend response status codes. No authentication credentials enter the browser.

Delete only the disposable project you created when finished:

```sh
inth project delete <project-id> --json
```

The fixture proves the React client can use a CLI-provisioned backend. It does not install c15t into a customer's app, test framework-specific routing, or verify a particular analytics vendor integration. Follow the [setup guide](../../docs/c15t-setup.md) for those application steps.
