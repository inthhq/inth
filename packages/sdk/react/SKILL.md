---
name: inth-react
description: Set up, customize or debug Inth consent management with @inth/react. Use when the project is a React app, such as Vite or React Router, or when a task mentions a cookie banner, consent dialog, GDPR or CCPA prompts, blocking analytics until consent, Google Consent Mode or IAB TCF.
---

# Inth with @inth/react

The Markdown under `./docs` matches the installed version. Read it before writing code instead of guessing APIs from memory. Migrating an existing c15t app? Follow [Migrate from c15t](./docs/migrate-from-c15t.md).

## Before writing code

1. Find the framework, router, rendering mode (server, static, cached or single-page) and host in the project. Check the framework config and route files for settings that prerender or cache pages.
2. Pick the matching row in [Choose your setup](./docs/concepts/choose-your-setup.md).
3. Follow that guide from start to finish: [React](./docs/frameworks/react/quickstart.md).

## Rules

- Install with `npm install @inth/react`. Keep every Inth package on the same release.
- `projectUrl` is the user's Inth project URL. It is public configuration. Never invent one; ask for it or read it from the environment.
- Register analytics, pixels and embeds through Inth and remove the vendor's own loader or plugin. With a bundler, use `@inth/integrations` helpers and `ConsentGate`. On a plain HTML page, change the vendor's `<script>` to `type="text/plain"` with `data-inth-category`. A banner does not block code loaded elsewhere.
- Gate features on the current permission. Never save a consent choice on page load or from code; only a visitor action records one.
- Use `testing()` from the package's `/testing` subpath in tests and local development: it resolves policies in code with no network requests and throws in production builds.
- Keep one consent provider or root for the whole app, mounted outside route-level components.

## Customize with the smallest change

Copy and languages use i18n configuration. Where the banner sits uses `container` (a Card, Banner or Drawer), `edgeStyle` and `blockUntilChoice`, on `ConsentBanner`, in `presentation.prompt` or from the policy's `surface`. Colors, type, radius and spacing use theme tokens. One part of a component uses slots. Different markup uses the headless API. Keep a `PrivacyChoicesLink` in the footer so visitors can reopen the dialog.
Start at [Customization overview](./docs/customization/overview.md).

## Finish with a check

A visible banner proves nothing. In a production build, confirm vendor requests are absent before consent, a rejection survives a reload, and preferences reopen. Follow [Verify consent before shipping](./docs/guides/verify-consent.md). If something fails, start with [Troubleshooting](./docs/guides/troubleshooting.md).

`./AGENTS.md` lists every bundled page.
