/**
 * A Privacy Choices page carries only the presentation it shows (§7): a
 * Drawer site never loads or adds the Card or Bar stylesheet, and a
 * classic site loads no Privacy Choices code at all. Ported from
 * `@inth/react`'s `privacy-choices-sheets.test.tsx`.
 *
 * Each browser test file runs in its own frame with its own module graph,
 * so the frame's resource entries list exactly the modules this file's
 * pages asked for: the ESM build's on-demand chunks, served as source.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	$,
	all,
	startPrivacyChoicesPage,
	stopPrivacyChoicesPages,
} from './fixtures/privacy-choices';

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
	stopPrivacyChoicesPages();
});

describe('Privacy Choices stylesheets', () => {
	test('a classic banner loads no Privacy Choices module', async () => {
		await startPrivacyChoicesPage({
			container: null,
			design: null,
			dialog: false,
		});
		await vi.waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect(fetched(/ui\/privacy-choices\/(?!pc-import)/u)).toEqual([]);
		expect(fetched(/styles\/sheets\/(?:surface|card|bar|drawer)\.js/u)).toEqual(
			[]
		);
		expect(all('style[data-inth-styles]')).toHaveLength(0);
	});

	test('a Drawer never loads or adds the Card or Bar sheet', async () => {
		// No dialog, as in the React suite, so nothing warms the options.
		await startPrivacyChoicesPage({
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
		expect(added('inth-bar')).toBe(false);
		expect(fetched(/styles\/sheets\/drawer\.js/u)).not.toEqual([]);
		expect(fetched(/styles\/sheets\/(?:card|bar)(?:-deferred)?\.js/u)).toEqual(
			[]
		);
		expect(fetched(/ui\/privacy-choices\/(?:card|bar)\.ts/u)).toEqual([]);
		// The options' code and sheets wait for Customize.
		expect(fetched(/ui\/privacy-choices\/panel\.ts/u)).toEqual([]);
		expect(added('inth-expand')).toBe(false);
	});
});
