# Angular compatibility apps

Angular CLI apps that pin the oldest Angular `@c15t/angular` supports. `@c15t/angular` is built with Angular 22 and ships partial compilation output (the Angular Package Format), which the app's own Angular linker turns into code at build time. An API added after the floor fails at the user's build, not ours, and so does partial output the floor's linker cannot read.

| Workspace | Angular | Angular CLI | Why this floor |
| --- | --- | --- | --- |
| `angular-20` | 20.0.7 | 20.0.6 | `REQUEST` and `provideZonelessChangeDetection()` are in `@angular/core` from Angular 20, and the stable signal APIs the package uses (`linkedSignal`, `afterRenderEffect`, signal queries) are stable from 20 |

Each app is a starter smoke target in `internals/fixtures/acceptance/src/starter-targets.ts`, so CI builds it for production whenever `@c15t/angular` or its dependencies change, then checks the server-rendered banner, Accept across a reload, and the preference dialog:

```bash
STARTER_TARGET=angular-20 bun run --cwd internals/fixtures/acceptance test:starters
```

The app renders on the server with `provideC15tServer()` from `@c15t/angular/ssr` and serves the consent route from `server.ts`, so the banner is in the first HTML response. It reads the backend URL from `C15T_BACKEND_URL` at runtime.

`prebuild` runs `install-package.mjs`, which copies the built `package.json` and `dist/` of `@c15t/angular` over the workspace link, as an install from npm would. Through the link, the package's imports would resolve the Angular 22 in `packages/angular/node_modules` instead of this app's Angular 20.

Raising the Angular peer range in `packages/angular/package.json` means raising the pin here, and the other way round. Using an Angular API added in 21 or later moves the floor for every user, so weigh it against the share of installs still below it.
