/**
 * Content blockers drop requests whose URL names a consent banner or dialog.
 * A shipped SDK file's name can reach the browser as a URL: Astro emits one
 * script per component named after its file, Vite's dev server serves package
 * files at their own paths, and a lazy import becomes a chunk named after its
 * module. So shipped files use the neutral names the SDK already has: prompt
 * for the banner, panel for the dialog, preferences for the widget.
 *
 * The pattern is the one the acceptance suite blocks with
 * (`internals/fixtures/acceptance/src/examples.test.ts`).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

const BLOCKED =
	/(?:consent[-_](?:banner|dialog|widget|manager)|cookie[-_]banner)/iu;

/** Test, story, fixture and tooling files never reach an app's browser. */
const NOT_SHIPPED =
	/\/(?:__tests__|test|fixtures|playground|docs|scripts|type-tests)\/|\.(?:test|spec|stories|test-d|type-test)\.[a-z]+$|\.(?:md|mdx|json)$/u;

/**
 * Files that matched before this check existed. Most are named after a
 * public import path (`@inth/nuxt/components/consent-banner`, Angular's
 * secondary entry points, the `ui` CSS modules), so renaming them is an API
 * change. Shrink this list; never add to it.
 */
const KNOWN = new Set([
	'packages/sdk/angular/consent-dialog-trigger/src/consent-dialog-trigger.ts',
	'packages/sdk/angular/consent-dialog-trigger/src/dev-tools-icon.ts',
	'packages/sdk/angular/consent-dialog-trigger/src/public-api.ts',
	'packages/sdk/angular/consent-dialog/src/consent-dialog-options.model.ts',
	'packages/sdk/angular/consent-dialog/src/consent-dialog.ts',
	'packages/sdk/angular/consent-dialog/src/opt-out-confirmation-panel.ts',
	'packages/sdk/angular/consent-dialog/src/opt-out-confirmation.ts',
	'packages/sdk/angular/consent-dialog/src/public-api.ts',
	'packages/sdk/angular/consent-widget/src/consent-vendor-list.ts',
	'packages/sdk/angular/consent-widget/src/consent-widget.ts',
	'packages/sdk/angular/consent-widget/src/public-api.ts',
	'packages/sdk/angular/consent-widget/src/widget-sheets.ts',
	'packages/sdk/angular/iab/src/iab-consent-banner.ts',
	'packages/sdk/angular/iab/src/iab-consent-dialog.ts',
	'packages/sdk/angular/src/lib/core/consent-manager.ts',
	'packages/sdk/angular/src/lib/dialog/consent-dialog-link.ts',
	'packages/sdk/angular/testing/src/consent-banner-harness.ts',
	'packages/sdk/angular/testing/src/consent-dialog-harness.ts',
	'packages/sdk/angular/testing/src/consent-dialog-trigger-harness.ts',
	'packages/sdk/angular/testing/src/consent-widget-harness.ts',
	'packages/sdk/angular/testing/src/iab-consent-banner-harness.ts',
	'packages/sdk/angular/testing/src/iab-consent-dialog-harness.ts',
	'packages/sdk/nextjs/src/components/consent-dialog-link.ts',
	'packages/sdk/nuxt/src/components/consent-banner.ts',
	'packages/sdk/nuxt/src/components/consent-dialog-link.ts',
	'packages/sdk/nuxt/src/components/consent-dialog-trigger.ts',
	'packages/sdk/nuxt/src/components/consent-manager.ts',
	'packages/sdk/nuxt/src/components/consent-widget.ts',
	'packages/sdk/nuxt/src/components/iab-consent-banner.ts',
	'packages/sdk/nuxt/src/components/iab-consent-dialog.ts',
	'packages/sdk/react/src/index-parts/consent-banner.ts',
	'packages/sdk/react/src/index-parts/consent-dialog-link.ts',
	'packages/sdk/react/src/index-parts/consent-dialog-trigger.ts',
	'packages/sdk/react/src/index-parts/consent-dialog.ts',
	'packages/sdk/tanstack-start/src/components/consent-dialog-link.ts',
	'packages/sdk/ui/src/styles/components/consent-banner.module.css',
	'packages/sdk/ui/src/styles/components/consent-dialog.module.css',
	'packages/sdk/ui/types/styles/components/consent-banner.module.css.d.ts',
	'packages/sdk/ui/types/styles/components/consent-dialog.module.css.d.ts',
	'packages/sdk/vue/src/runtime/components/consent-dialog-link.vue',
]);

const shipped = execFileSync('git', ['ls-files', 'packages/sdk'], {
	cwd: root,
	encoding: 'utf8',
})
	.split('\n')
	.filter(
		(file) =>
			/\.(?:[cm]?[jt]sx?|vue|svelte|astro|css)$/u.test(file) &&
			!NOT_SHIPPED.test(file)
	);

test('no new shipped SDK file is named the way content blockers filter', () => {
	const named = shipped.filter((file) => BLOCKED.test(file));
	expect(named.filter((file) => !KNOWN.has(file))).toEqual([]);
});

test('every known exception still exists, so the list only shrinks', () => {
	expect([...KNOWN].filter((file) => !shipped.includes(file))).toEqual([]);
});
