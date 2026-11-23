/**
 * A page carries only the container its prompt shows (§7): a Drawer site
 * never downloads or inlines the Card or Banner stylesheet, and a Card
 * site inlines no other container's sheet.
 *
 * Each browser test file runs in its own frame with its own module graph,
 * so the frame's resource entries list exactly the modules this file's
 * renders asked for.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ConsentManagerOptions } from '../lib/consent-manager-options.model';
import { testing } from '../lib/testing';
import Fixture from './fixtures/consent-surfaces-fixture.svelte';
import { policyFixture } from './policy-fixture';

// The default buffer keeps 250 entries, fewer than the suite's own modules.
performance.setResourceTimingBufferSize(100_000);

const fetched = (pattern: RegExp): string[] =>
	performance
		.getEntriesByType('resource')
		.map((entry) => entry.name)
		.filter((name) => pattern.test(name));

const inlined = (id: string): boolean =>
	Boolean(document.querySelector(`style[data-inth-styles="${id}"]`));

let mounted: Record<string, unknown> | undefined;

const render = function render(options: ConsentManagerOptions) {
	mounted = mount(Fixture, {
		// No link that opens the dialog: its idle warming would load the
		// options this file checks are left for Customize.
		props: { link: false, options, probe: { snapshot: null } },
		target: document.body,
	});
};

afterEach(async () => {
	if (mounted) {
		await unmount(mounted);
		mounted = undefined;
	}
	// Each test starts from a page that holds no sheet.
	for (const sheet of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		sheet.remove();
	}
});

describe('consent prompt stylesheets', () => {
	test('a Drawer never fetches or inlines the Card or Banner sheet', async () => {
		render({
			consentCategories: ['necessary', 'measurement', 'marketing'],
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-sheets-drawer' }),
			presentation: {
				prompt: { container: { side: 'bottom', type: 'drawer' } },
			},
		} as ConsentManagerOptions);
		await vi.waitFor(
			() => {
				expect(
					document.querySelector('[data-placement="drawer-bottom"]')
				).not.toBeNull();
				expect(document.querySelector('style[data-inth-pending]')).toBeNull();
			},
			{ timeout: 4000 }
		);
		expect(inlined('inth-surface')).toBe(true);
		expect(inlined('inth-drawer')).toBe(true);
		expect(inlined('inth-card')).toBe(false);
		expect(inlined('inth-banner')).toBe(false);
		expect(fetched(/styles\/sheets\/drawer\.js/u)).not.toEqual([]);
		expect(fetched(/styles\/sheets\/(?:card|banner)\.js/u)).toEqual([]);
		// The options' sheets and code wait for Customize.
		expect(fetched(/components\/prompt\/panel\.svelte/u)).toEqual([]);
		expect(inlined('inth-expand')).toBe(false);
	});

	test('a Card inlines no other container sheet and fetches no shared parts', async () => {
		render({
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-sheets-card' }),
		} as ConsentManagerOptions);
		await vi.waitFor(
			() => {
				expect(
					document.querySelector('[data-placement="card-start"]')
				).not.toBeNull();
				expect(document.querySelector('style[data-inth-pending]')).toBeNull();
			},
			{ timeout: 4000 }
		);
		expect(inlined('inth-surface')).toBe(true);
		expect(inlined('inth-card')).toBe(true);
		expect(inlined('inth-banner')).toBe(false);
		expect(inlined('inth-drawer')).toBe(false);
		expect(inlined('inth-parts')).toBe(false);
		// The Drawer test before it fetched the Drawer sheet in this frame.
		expect(fetched(/styles\/sheets\/(?:banner|expand|parts)\.js/u)).toEqual([]);
		// The options' sheets and code wait for Customize.
		expect(fetched(/components\/prompt\/panel\.svelte/u)).toEqual([]);
	});
});
