---
packages:
  '@c15t/react-native': minor
  '@c15t/cli': minor
---

### Mobile works only with Inth hosted projects, and `dryRun` replaces offline mode

**Breaking.** `@c15t/react-native` and the mobile commands in `@c15t/cli` now
work only with Inth hosted projects. There is one mode, so `mode` and `initURL`
are gone, with no aliases. Each removed option fails with an error that names
its replacement. Web packages and web `c15t setup` are unchanged.

`backendURL` is required and must be the project URL from your Inth dashboard.
These forms are accepted, and each becomes `https://your-project.inth.app`:

- `https://your-project.inth.app`
- `your-project.inth.app`, because a missing scheme means `https`
- `https://your-project.inth.app/`, because trailing slashes are dropped
- `HTTPS://Your-Project.Inth.App`, because the scheme and host are lowercased

Whitespace around the value is trimmed. Another host, `http`, a port, a path, a query, a fragment, or a
username or password is refused at prebuild, in the CLI and again at native
startup:

```txt
backendURL must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "https://consent.example.com": the host must be a project host under inth.app.
```

Removed options and what to use instead:

| Removed | Replacement |
| --- | --- |
| Expo `mode: 'hosted'`, `Info.plist` `com.c15t.backend.mode` | Remove it. Hosted is the only mode. Set `backendURL`. |
| Expo `mode: 'selfHosted'` | None. Set `backendURL` to your Inth project URL. |
| Expo `mode: 'offline'`, Android `com.c15t.MODE` | `dryRun: true` for development and CI. In production keep `backendURL`. `bundleManifest`, `policyResource` or an in-code `policy` covers a launch without network. |
| Expo `mode: 'custom'` | `autoBootstrap: false`. The native app installs c15t before React Native starts. Custom transports are gone. |
| Expo `initURL`, `Info.plist` `com.c15t.backend.initUrl`, Android `com.c15t.BACKEND_INIT_URL` | None. The app fetches policy from `backendURL`. |
| `c15t setup hosted`, `self-hosted`, `offline` and `custom` in a mobile project, and `--mode` | Remove the mode and pass your Inth project URL as `--backend-url`. |

Expo prebuild deletes the retired native keys it used to write. In a bare app,
remove them by hand. iOS refuses to start c15t while one is present and logs
`C15T_CONFIGURATION_RETIRED` with the replacement. Android logs an error under
the `c15t` tag. A refused project URL logs `C15T_CONFIGURATION_BACKEND_URL` on
iOS.

`dryRun` is a new boolean for development and CI: `dryRun` in the Expo plugin,
`com.c15t.dryRun` in `Info.plist` and `com.c15t.DRY_RUN` in Android metadata.
The prompt, storage, SDK gates and consent signals work as normal. Consent
records are dropped, not queued or sent, and identity calls send nothing. A
save still reports success, with `queued` false. The app still fetches policy
from `/init` unless it has an in-code `policy`, and needs no network with a
bundled manifest or an in-code `policy`.

A release build refuses `dryRun` and does not start c15t. iOS decides at
compile time and logs `C15T_CONFIGURATION_DRY_RUN`. Android checks at launch
whether the app is debuggable. Prebuild cannot see the build type, so the
plugin writes the flag and warns once. In a debug build `dryRun` also lets
`backendURL` be any `https` URL, or `http` on `localhost`, `127.0.0.1` or
`[::1]`, with a port and a path.

An in-code `policy` now works with `backendURL`. The device resolves the rules
and never calls `/init`, and consent records go to your Inth project. Inth
rejects a record whose policy the project does not serve, so keep the rules
the same as the project's policy in the dashboard. `policy` is still refused
beside `policyResource`, `bundleManifest` or `iab`.

CLI changes: `c15t setup` checks `--backend-url` with the same rule and writes
the normal form. `c15t mobile-manifest` does too, and takes a new `--dry-run`
flag for a build with `dryRun` on, which accepts the relaxed URL forms.
