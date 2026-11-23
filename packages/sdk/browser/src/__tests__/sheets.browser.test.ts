/**
 * A page carries only the container it shows (§7): a Drawer site never
 * loads or adds the Card or Banner stylesheet, and a page that owes no
 * choice loads no prompt code at all. Ported from `@inth/react`'s sheet
 * tests.
 *
 * Each browser test file runs in its own frame with its own module graph,
 * so the frame's resource entries list exactly the modules this file's
 * pages asked for: the ESM build's on-demand chunks, served as source.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	$,
	all,
	startConsentPage,
	stopConsentPages,
} from './fixtures/consent-ui';

// The default buffer keeps 250 entries, fewer than the suite's own modules.
performance.setResourceTimingBufferSize(100_000);

const fetched = (pattern: RegExp): string[] =>
	performance
		.getEntriesByType('resource')
		.map((entry) => entry.name)
		.filter((name) => pattern.test(name));

const added = (id: string): boolean =>
	all(`style[data-inth-styles="${id}"]`).length > 0;

afterEach(() => {
	stopConsentPages();
});

describe('surface stylesheets', () => {
	test('a page that owes no choice loads no prompt module', async () => {
		await startConsentPage({ dialog: false, region: 'us-opt-out' });
		await new Promise((resolve) => {
			setTimeout(resolve, 200);
		});
		expect($('consent-banner-root')).toBeNull();
		expect(fetched(/ui\/prompt\/(?!prompt\.)/u)).toEqual([]);
		expect(
			fetched(/styles\/sheets\/(?:surface|card|banner|drawer)\.js/u)
		).toEqual([]);
		expect(all('style[data-inth-styles]')).toHaveLength(0);
	});

	test('a Drawer never loads or adds the Card or Banner sheet', async () => {
		// No dialog, as in the React suite, so nothing warms the options.
		await startConsentPage({
			container: { side: 'bottom', type: 'drawer' },
			dialog: false,
		});
		await vi.waitFor(
			() =>
				expect(all('[data-placement="drawer-bottom"]').length).toBeGreaterThan(
					0
				),
			{ timeout: 4000 }
		);
		expect(added('inth-surface')).toBe(true);
		expect(added('inth-drawer')).toBe(true);
		expect(added('inth-card')).toBe(false);
		expect(added('inth-banner')).toBe(false);
		expect(fetched(/styles\/sheets\/drawer\.js/u)).not.toEqual([]);
		expect(
			fetched(/styles\/sheets\/(?:card|banner)(?:-deferred)?\.js/u)
		).toEqual([]);
		expect(fetched(/ui\/prompt\/(?:card|banner)\.ts/u)).toEqual([]);
		// The options' code and sheets wait for Customize.
		expect(fetched(/ui\/prompt\/panel\.ts/u)).toEqual([]);
		expect(added('inth-expand')).toBe(false);
	});
});
