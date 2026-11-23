# Inth × Nuxt Vapor example

Inth in a Nuxt 4.6 app with [Vue Vapor](https://nuxt.com/blog/v4-6) turned
on. Every page and component in `app/` is a Vapor component
(`<script setup vapor>`). The Inth components stay on the virtual DOM and
render inside them through Nuxt's Vapor interop:

- `app/app.vue` mounts `InthProvider` and `ConsentDialogLink`.
- `app/components/video-embed.vue` passes its default and `placeholder` slots
  to `ConsentGate`.
- `app/components/consent-prompt.vue` is a headless banner built on the
  composables, used on `/headless` in place of `InthProvider`.
- `app/pages/privacy.vue` renders `ConsentWidget`.

Vapor needs Vue 3.6, which is a release candidate, so this example pins
`vue@3.6.0-rc.10` and `nuxt@4.6.0`. The rest of the repository stays on Vue
3.5.

```bash
bun install
bun run --cwd internals/fixtures/nuxt-vapor dev
```

Open `/consent-example`. Without a backend URL the demo uses a self-hosted
`@c15t/backend` at `/api/self-host` with an embedded PGlite database, the same
setup as `internals/fixtures/nuxt`. The route uses `defineEventHandler` from
`nuxt/server`, whose event carries a standard `Request` for the backend
handler. A production build needs `DATABASE_URL`, or set
`NUXT_PUBLIC_INTH_PROJECT_URL` to a hosted backend.

## Nuxt 5 preview

`INTH_NUXT_FUTURE=1` builds with `future.compatibilityVersion: 5`,
`experimental.early404` and `experimental.prerenderErrorPages`:

```bash
INTH_NUXT_FUTURE=1 bun run --cwd internals/fixtures/nuxt-vapor build
```

## Tests

The `nuxt-vapor` and `nuxt-vapor-future` targets in `internals/fixtures/acceptance` run the
shared consent journeys against both builds:

```bash
EXAMPLE_TARGET=nuxt-vapor,nuxt-vapor-future bun run --cwd internals/fixtures/acceptance test
```
