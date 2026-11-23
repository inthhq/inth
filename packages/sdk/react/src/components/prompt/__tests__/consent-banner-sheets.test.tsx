/**
 * A page carries only the container it shows (§7): a Drawer site never
 * downloads or inlines the Card or Banner stylesheet, and a page with no
 * choice owed downloads no container at all.
 *
 * Each browser test file runs in its own frame with its own module graph,
 * so the frame's resource entries list exactly the modules this file's
 * renders asked for.
 */
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentBanner } from '~/components/prompt';

import { testing } from '../../../testing';

// The default buffer keeps 250 entries, fewer than the suite's own modules.
performance.setResourceTimingBufferSize(100_000);

const fetched = (pattern: RegExp): string[] =>
	performance
		.getEntriesByType('resource')
		.map((entry) => entry.name)
		.filter((name) => pattern.test(name));

const inlined = (id: string): boolean =>
	Boolean(
		document.querySelector(
			`style[href~="${id}"], style[data-href~="${id}"], style[data-inth-styles="${id}"]`
		)
	);

describe('consent banner stylesheets', () => {
	test('a page that owes no choice loads no container', async () => {
		await render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(undefined, {
						id: 'pc-sheets-none',
						model: 'none',
						prompt: 'none',
					}),
				}}
			>
				<ConsentBanner disableAnimation />
			</InthProvider>
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 300);
		});
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();
		expect(fetched(/components\/prompt\/(?:card|banner|drawer)\.tsx/u)).toEqual(
			[]
		);
	});

	test('a Drawer never fetches or inlines the Card or Banner sheet', async () => {
		await render(
			<InthProvider
				options={{
					consentCategories: ['necessary', 'measurement', 'marketing'],
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(undefined, { id: 'pc-sheets-drawer' }),
					presentation: {
						prompt: { container: { side: 'bottom', type: 'drawer' } },
					},
				}}
			>
				<ConsentBanner disableAnimation />
			</InthProvider>
		);
		await vi.waitFor(
			() =>
				expect(
					document.querySelector('[data-placement="drawer-bottom"]')
				).toBeInTheDocument(),
			{ timeout: 4000 }
		);
		expect(inlined('inth-surface')).toBe(true);
		expect(inlined('inth-drawer')).toBe(true);
		expect(inlined('inth-card')).toBe(false);
		expect(inlined('inth-banner')).toBe(false);
		expect(fetched(/styles\/sheets\/drawer\.js/u)).not.toEqual([]);
		expect(fetched(/styles\/sheets\/(?:card|banner)(?:-deferred)?\.js/u)).toEqual(
			[]
		);
		expect(fetched(/prompt\/(?:card|banner)\.tsx/u)).toEqual([]);
		// The options' sheets wait for Customize.
		expect(fetched(/prompt\/panel\.tsx/u)).toEqual([]);
		expect(inlined('inth-expand')).toBe(false);
	});
});
