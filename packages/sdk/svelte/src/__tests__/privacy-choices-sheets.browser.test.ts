/**
 * A Privacy Choices page carries only the presentation it shows (§7): a
 * Drawer site never downloads or inlines the Card or Bar stylesheet, and a
 * classic site downloads no Privacy Choices sheet at all.
 *
 * Each browser test file runs in its own frame with its own module graph,
 * so the frame's resource entries list exactly the modules this file's
 * renders asked for.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { testing } from '../lib/testing';
import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/privacy-choices-fixture.svelte';
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
});

describe('Privacy Choices stylesheets', () => {
	test('a classic banner loads no Privacy Choices sheet', async () => {
		render({
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-sheets-classic' }),
		} as ConsentManagerOptions);
		await vi.waitFor(() =>
			expect(
				document.querySelector('[data-testid="consent-banner-root"]')
			).not.toBeNull()
		);
		expect(
			fetched(/styles\/sheets\/(?:surface|card|bar|drawer|expand)\.js/u)
		).toEqual([]);
		expect(fetched(/privacy-choices-prompt\/panel\.svelte/u)).toEqual([]);
		expect(inlined('inth-surface')).toBe(false);
	});

	test('a Drawer never fetches or inlines the Card or Bar sheet', async () => {
		render({
			consentCategories: ['necessary', 'measurement', 'marketing'],
			mode: testing(),
			persistence: false,
			prefetch: policyFixture(undefined, { id: 'pc-sheets-drawer' }),
			presentation: {
				design: 'privacy-choices',
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
		expect(inlined('inth-bar')).toBe(false);
		expect(fetched(/styles\/sheets\/drawer\.js/u)).not.toEqual([]);
		expect(fetched(/styles\/sheets\/(?:card|bar)\.js/u)).toEqual([]);
		// The options' sheets and code wait for Customize.
		expect(fetched(/privacy-choices-prompt\/panel\.svelte/u)).toEqual([]);
		expect(inlined('inth-expand')).toBe(false);
	});
});
