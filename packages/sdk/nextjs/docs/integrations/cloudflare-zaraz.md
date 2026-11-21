---
title: Cloudflare Zaraz
description: Sync Inth consent categories to Cloudflare Zaraz purposes with the
  callback-only cloudflareZaraz bridge.
seoTitle: Cloudflare Zaraz consent with Inth
seoDescription: Connect Inth consent permissions to Cloudflare Zaraz purposes so
  each Zaraz tool runs only while its mapped category is allowed.
icon: cloudflare-web-analytics
group: integrations
---

The `cloudflareZaraz` bridge syncs Inth consent permissions to Cloudflare Zaraz purposes without loading a script.

## Configure Cloudflare Zaraz

Update your Zaraz dashboard first so Zaraz defers to Inth:

1. Enable Consent Management and create purposes for the Inth categories you use.
2. Assign a purpose to every tool that requires consent. Zaraz runs tools without a purpose regardless of consent.
3. Disable automatic display of the Zaraz consent modal so Inth owns the UI.
4. Disable **Automatic Pageview Tracking**, and automatic SPA pageviews if your app tracks routes itself.
5. Copy the purpose IDs, not the purpose names, for the mapping below.

Zaraz keeps its own consent cookie, so an automatic pageview can fire with a prior visit's grant before Inth applies current permissions. With automatic pageviews off, send the first pageview from `onReady`, which runs after the first sync. Audit custom DOM-ready, timer, and click triggers in Zaraz because they can still fire before the bridge starts. See Cloudflare's [purpose assignment](https://developers.cloudflare.com/zaraz/consent-management/) and [pageview settings](https://developers.cloudflare.com/zaraz/reference/settings/) docs.

| Package manager | Command                          |
| :-------------- | :------------------------------- |
| npm             | `npm install @inth/integrations` |
| pnpm            | `pnpm add @inth/integrations`    |
| yarn            | `yarn add @inth/integrations`    |
| bun             | `bun add @inth/integrations`     |

```ts title="src/consent-scripts.ts"
import { cloudflareZaraz } from '@inth/integrations/cloudflare-zaraz';

// Zaraz provides this global after its loader runs.
declare const zaraz: { track: (event: string) => void };

export const scripts = [
	cloudflareZaraz({
		purposes: {
			measurement: ['your-measurement-purpose-id'],
			marketing: ['your-marketing-purpose-id'],
		},
		onReady: () => {
			zaraz.track('Pageview');
		},
	}),
];
```

Register one bridge per app. Keep Zaraz's own loader and dashboard tools when following the steps below, and remove standalone loaders or separate `@inth/integrations` helpers for tools Zaraz already runs. If Zaraz auto-injection is off, [load Zaraz manually](https://developers.cloudflare.com/zaraz/advanced/load-zaraz-manually/) once.

## Register the scripts

Complete your [framework quickstart](https://inth.com/docs/frameworks) first, and remove the vendor's original snippet, SDK initializer, or tag manager entry so the vendor loads only through Inth.

The vendor guides put helpers in `src/consent-scripts.ts`. If your quickstart already defines a `scripts` array, add the helper to that array instead. Pass `scripts` to your existing Inth provider below rather than mounting a second provider.

**Next.js**

Add `scripts` to `inth.config.ts`, next to `next.config.ts`:

```ts title="inth.config.ts"
import { defineConsentConfig } from '@inth/nextjs';
import { scripts } from './src/consent-scripts';

export default defineConsentConfig({ scripts });
```

Keep your existing options, such as `mode` and `routePrefix`, in the same call. `InthProvider` reads this file in the browser for App Router, Pages Router, and static export, so your layout keeps passing only `state`. See [Next.js scripts and embeds](../frameworks/next/scripts.md).

**TanStack Start**

Import `scripts` in your root route and pass them as a top-level prop on your existing `InthProvider`. Keep the loader from the [TanStack Start quickstart](https://inth.com/docs/frameworks/tanstack-start/quickstart):

```tsx title="src/routes/__root.tsx"
import { scripts } from '../consent-scripts';

<InthProvider state={consent} scripts={scripts}>
```

Import vendor helpers in the root route module, not in a server function, because script configurations carry callbacks that cannot be serialized. See [TanStack Start scripts](https://inth.com/docs/frameworks/tanstack-start/scripts).

**React**

Pass `scripts` alongside `mode` in your existing `InthProvider` options:

```tsx title="src/consent.tsx"
import { scripts } from './consent-scripts';

<InthProvider options={{ mode, scripts }}>
```

`mode` is the `manifest()` value from the [React quickstart](https://inth.com/docs/frameworks/react/quickstart). Keep your banner, dialog, and preferences link inside the provider. See [React scripts and embeds](https://inth.com/docs/frameworks/react/scripts).

**Nuxt**

Register `scripts` under `inth` in `app/app.config.ts`. Adjust the import path to match where you created `consent-scripts.ts`:

```ts title="app/app.config.ts"
import { scripts } from '../src/consent-scripts';

export default defineAppConfig({
  inth: { scripts },
});
```

The Nuxt module merges this over `nuxt.config.ts` and starts one script loader in the browser after hydration. Keep `scripts` out of `nuxt.config.ts`, which serializes to JSON and strips vendor callbacks. See [Nuxt scripts and embeds](https://inth.com/docs/frameworks/nuxt/scripts).

**Vue**

Pass `scripts` to your existing `inth` plugin registration in `src/main.ts`:

```ts title="src/main.ts"
import { inth, manifest } from '@inth/vue/vue-plugin';
import { scripts } from './consent-scripts';

app.use(inth, {
  mode: manifest(),
  scripts,
});
```

Keep your existing `mode` and other options. The plugin owns the script loader, so do not call `createScriptLoader` from a component. See [Vue scripts and embeds](https://inth.com/docs/frameworks/vue/scripts).

**Astro**

Export `scripts` from the client entrypoint `src/inth.client.ts` created in the [Astro quickstart](https://inth.com/docs/frameworks/astro/quickstart). If it already exports scripts, merge the arrays. Leave `astro.config.mjs` unchanged.

```ts title="src/inth.client.ts"
import type { InthClientOptionsExtension } from '@inth/astro';
import { scripts } from './consent-scripts';

export default { scripts } satisfies InthClientOptionsExtension;
```

Do not place vendor helpers in `astro.config.mjs`, which serializes options into the page and drops callbacks. The integration attaches this client entrypoint to the shared runtime across pages and `ClientRouter` navigation.

**Svelte**

Import `scripts` in the component that renders your existing provider and pass them as a top-level prop:

```svelte title="src/App.svelte"
<script lang="ts">
  import { InthProvider, manifest } from '@inth/svelte';
  import { scripts } from './consent-scripts';
</script>

<InthProvider mode={manifest()} {scripts}>
  <!-- Keep your application, consent UI and preferences link here. -->
</InthProvider>
```

Keep the styles and consent UI from the [Svelte quickstart](https://inth.com/docs/frameworks/svelte/quickstart). The provider owns and disposes the script loader.

**SvelteKit**

Pass `scripts` to your existing `InthProvider` in the root layout. Keep the handle and layout load from the [SvelteKit quickstart](https://inth.com/docs/frameworks/sveltekit/quickstart):

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { InthProvider } from '@inth/svelte/kit';
  import { scripts } from '../consent-scripts';

  let { children, data } = $props();
</script>

<InthProvider state={data.consent} {scripts}>
  {@render children()}
  <!-- Keep your consent UI and preferences link here. -->
</InthProvider>
```

Import vendor helpers in the layout component, not in `+layout.server.ts`, because server load functions cannot return callbacks. Prerendered, static, and SPA pages use the same `scripts` prop. If you pass an external `runtime`, register `scripts` when creating that runtime instead.

**Angular**

Pass `scripts` to your existing `provideInth()` call in `src/app/app.config.ts`, next to `mode`:

```ts title="src/app/app.config.ts"
import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideInth } from '@inth/angular';

import { scripts } from '../consent-scripts';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideInth({
			// Keep the mode and other options from your quickstart.
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
			scripts,
		}),
	],
};
```

Keep your mode, styles, and consent UI from the [Angular quickstart](https://inth.com/docs/frameworks/angular/quickstart). Keep `provideInth()` in `app.config.ts`, which the server config merges, rather than in a server-only file. See [Angular scripts](https://inth.com/docs/frameworks/angular/scripts).

**HTML**

`@inth/integrations` helpers are ES modules that require a bundler. On a plain HTML page using the Inth script tag, paste the vendor's snippet inside an inert `<script type="text/plain">` element:

```html
<script type="text/plain" data-inth-category="measurement">
  // The vendor's snippet, unchanged
</script>
```

Use the category listed for the vendor on this page. Inth runs the snippet once that category is allowed and reloads the page on withdrawal. Helper options such as `loadMode` do not apply to pasted snippets. See [HTML scripts](https://inth.com/docs/frameworks/html/scripts).

**JavaScript**

Pass `scripts` to `init()` from `@inth/sdk`, alongside `mode`:

```ts
import { init, manifest } from '@inth/sdk';
import { scripts } from './consent-scripts';

const consent = init({
  mode: manifest(),
  scripts,
});
```

With `createConsentRuntime` from `@inth/sdk/runtime`, pass `scripts` there instead. If you construct a kernel manually, attach one loader from `@inth/sdk/modules/script-loader`. See [JavaScript scripts](https://inth.com/docs/frameworks/javascript/scripts).

## Options

| Option             | Default  | Behavior                                                                                                                                            |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purposes`         | Required | Maps Inth categories to Zaraz purpose ID arrays. Throws on an empty mapping, a blank ID, surrounding whitespace, or an ID mapped to two categories. |
| `hideBuiltInModal` | `true`   | Hides the Zaraz modal if visible. Also disable auto-display in Zaraz.                                                                               |
| `sendQueuedEvents` | `true`   | Calls `zaraz.consent.sendQueuedEvents()` when a purpose changes from denied to allowed. Set `false` to discard pre-consent queued pageviews.        |
| `onReady`          | None     | Runs once after the first successful sync, even when every purpose is denied.                                                                       |
| `onError`          | None     | Receives sync errors.                                                                                                                               |

## Loading and revocation

`cloudflareZaraz` registers a callback-only script under `necessary` with `alwaysLoad`, so the bridge runs on every page. That does not make the underlying tools necessary; each tool stays gated by its Zaraz purpose.

The vendor slug is `cloudflare-zaraz`. Declare it in your vendor list to show a switch in the preference dialog; turning it off denies every purpose mapped to an optional category regardless of category grants. See [vendor consent](./overview.md#vendor-switches-and-cookie-cleanup).

When the Zaraz consent API is ready, the bridge reads `zaraz.consent.getAll()` and sets each returned purpose to `true` only when its mapped category is allowed in Inth's effective permissions, including policy rules. The bridge sets unmapped purposes to `false`. If the API is not ready yet, the bridge listens for `zarazConsentAPIReady` without polling. On later changes, it calls `zaraz.consent.set()` only for changed values and replays queued events for newly allowed purposes via `zaraz.consent.sendQueuedEvents()`. Revocation sets purposes to `false` and replays nothing. Zaraz only returns purposes attached to enabled tools, so an ID absent from `getAll()` receives no grant.

* **Errors and retries.** If a Zaraz call throws, `onReady` waits and the bridge retries on the next consent change or readiness event. Without `onError`, errors surface to the script loader's debug events or the browser's error handler. A failed revocation can leave a prior grant active, and a retried replay can send a queued event twice.
* **Disposal and IAB.** Disposing the loader detaches the bridge without revoking purposes or stopping running tools. The bridge maps categories to purposes only and does not translate IAB TCF choices.

## Verify Cloudflare Zaraz

Test with isolated destinations. `getAll()` confirms what the bridge sent, while destination network requests confirm each tool respected it:

1. Load the page in a private window with an opt-in policy. Confirm the bridge adds no script element, `zaraz.consent.getAll()` returns `false` for every purpose, the Zaraz modal stays hidden, and no gated tool sends requests.
2. Click Reject and reload. Confirm every purpose remains `false`.
3. Open Privacy settings and allow `measurement`. Without reloading, confirm measurement purposes turn `true`, the queued pageview replays, measurement tools fire, and marketing tools stay silent.
4. Revoke `measurement` and save. Confirm Inth reloads the page and every purpose starts `false`.
5. In the console, grant a denied purpose with `zaraz.consent.set()`, then reload. Confirm the bridge resets it to `false` before `onReady` runs.

[Cloudflare Web Analytics](./cloudflare-web-analytics.md) is a separate product with its own helper. See the [consent verification guide](../guides/verify-consent.md) for navigation and hosting checks.
