---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Swift and Android work only with Inth hosted projects, and `dryRun` replaces offline mode

**Breaking.** The Swift and Android SDKs now work only with Inth hosted
projects. There is one mode: the configuration takes the project URL from your
Inth dashboard and an optional `dryRun`. The removed APIs are gone, with no
aliases.

- Swift: `C15tAppleConfiguration(backendURL: String, dryRun: Bool = false, ...)`.
- Kotlin: `NativeConfig(backendUrl: String, dryRun: Boolean = false, ...)`,
  installed with `C15tAndroid.install(context, config)`.

These URL forms are accepted, and each becomes `https://your-project.inth.app`:

- `https://your-project.inth.app`
- `your-project.inth.app`, because a missing scheme means `https`
- `https://your-project.inth.app/`, because trailing slashes are dropped
- `HTTPS://Your-Project.Inth.App`, because the scheme and host are lowercased

Whitespace around the value is trimmed. Another host, `http`, a port, a path, a query, a fragment, or a
username or password is refused. `C15tApple.install` throws
`C15tAppleInstallationError.invalidBackendURL`, which now carries an
`InthProjectURLError`. `C15tAndroid.install` throws `InthProjectUrlException`.
Both name the rule that failed:

```txt
backendURL must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "https://consent.example.com": the host must be a project host under inth.app.
```

Removed and what to use instead:

| Removed | Replacement |
| --- | --- |
| Swift `C15tAppleConfiguration.Transport` and `transport: .hosted(url)` | `backendURL: "https://your-project.inth.app"` |
| Swift `Transport.selfHosted`, `C15tTransport.selfHosted()` | None. Set `backendURL` to your Inth project URL. |
| Swift `Transport.offline`, `OfflineTransport`, `OfflineTransport.offline()` | `dryRun: true` for development and CI. In production keep `backendURL`. A bundled manifest or an in-code `policy` covers a launch without network. |
| Swift `Transport.disabled` | `dryRun: true` |
| Swift `C15tAppleConfiguration.initURL` | None. The app fetches policy from `backendURL`. |
| Kotlin `NativeConfig(backendUrl = null)`, `OfflineTransport`, manifest key `com.c15t.MODE` | `dryRun = true`, or `com.c15t.DRY_RUN`, for development and CI. In production keep `backendUrl`. `bundledPolicy` or `policy` covers a launch without network. |
| Kotlin `NativeConfig.initUrl`, manifest key `com.c15t.BACKEND_INIT_URL` | None. The app fetches policy from `backendUrl`. |
| Kotlin `C15tAndroid.install(..., transport = ...)`, `C15tAndroid.META_MODE`, `MODE_OFFLINE`, `META_BACKEND_INIT_URL` | None. Custom transports are gone. |

These are no longer public API. They stay in the source as internal API for
c15t's own tests and fixtures: Swift `C15tTransport`, `HostedTransport`,
`HTTPTransport`, `C15tApple.install(CoreConfig)`, `C15t.bootstrap`,
`ConsentCore.bootstrap`, `makeTransport()` and `makeCoreConfiguration()`;
Kotlin `C15tTransport`, `HostedTransport`, `C15t.bootstrap` and the
`ConsentCore` constructor.

Android manifest startup refuses `com.c15t.MODE` and
`com.c15t.BACKEND_INIT_URL`. It logs an error under the `c15t` tag that names
the replacement and leaves the engine uninstalled.

`dryRun` is new, for development and CI. The prompt, storage, SDK gates and
consent signals work as normal. Consent records are dropped, not queued or
sent, and `identify` and `logout` send nothing. A save still reports success,
with `queued` false. The app still fetches policy from `/init` unless it has
an in-code `policy`, and needs no network with a bundled manifest or an
in-code `policy`.

A release build refuses `dryRun` and installs no engine. Swift decides with
`#if DEBUG`, because the SDK compiles with your app, and throws
`C15tAppleInstallationError.dryRunInReleaseBuild`. Android checks at runtime
whether the host app is debuggable and throws `IllegalStateException`. In a
debug build `dryRun` also lets the URL be any `https` URL, or `http` on
`localhost`, `127.0.0.1` or `[::1]`, with a port and a path.

An in-code `policy` now works with the project URL. The device resolves the
rules and never calls `/init`, and consent records go to your Inth project.
Inth rejects a record whose policy the project does not serve, so keep the
rules the same as the project's policy in the dashboard. `policy` does not mix
with a bundled manifest: Kotlin throws, and in Swift the manifest wins.
