import { firstTabbable } from '@inth/sdk/ui/utils';
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ensureSurfaceStyles } from '../lib/surface-styles';
import Fixture from './fixtures/pending-sheets-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

/**
 * On a page without the stock surfaces' stylesheets, the surfaces insert a
 * rule that hides them until the sheet text lands, so nothing paints
 * unstyled. The initial focus of a blocking banner and of the dialog runs
 * as the surface mounts, inside that window: it has to land anyway, and
 * stay where it landed once the sheet arrives. jsdom has no layout, so
 * this runs in a real browser, which refuses focus on an element that
 * `visibility: hidden` takes out of rendering.
 */

const HOLD_ID = 'test-hold';

let mounted: Record<string, unknown> | undefined;

/** A deferred sheet whose text arrives when the test says so. */
const holdSheet = function holdSheet() {
	let release!: (css: string) => void;
	const text = new Promise<string>((resolve) => {
		release = resolve;
	});
	ensureSurfaceStyles([{ css: '', id: HOLD_ID, load: () => text }], undefined);
	return release;
};

const holdElement = () =>
	document.head.querySelector<HTMLStyleElement>(
		`style[data-inth-styles="${HOLD_ID}"]`
	);

/** Whether the surface is kept off the screen, by any CSS means. */
const hidden = (target: HTMLElement) =>
	!target.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true });

const mountSurface = function mountSurface(surface: 'banner' | 'dialog') {
	mounted = mount(Fixture, {
		props: {
			options: {
				disableAnimation: true,
				mode: transportMode({}),
				persistence: false,
				prefetch: policyFixture(),
			},
			surface,
		},
		target: document.body,
	});
};

const element = function element(testId: string) {
	return vi.waitFor(() => {
		const found = document.querySelector<HTMLElement>(
			`[data-testid="${testId}"]`
		);
		expect(found, testId).not.toBeNull();
		return found as HTMLElement;
	});
};

afterEach(async () => {
	if (mounted) {
		await unmount(mounted);
		mounted = undefined;
	}
	for (const sheet of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		sheet.remove();
	}
	(document.activeElement as HTMLElement | null)?.blur();
});

describe('focus while a surface sheet loads', () => {
	test('a blocking banner takes focus before its sheet lands, and keeps it after', async () => {
		const release = holdSheet();
		mountSurface('banner');
		const card = await element('consent-banner-card');

		// Hidden, not painted unstyled, while the sheet is on its way.
		expect(holdElement()?.hasAttribute('data-inth-pending')).toBe(true);
		expect(hidden(card)).toBe(true);

		// A blocking banner is a modal: focus starts on it.
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(card);
		});

		// Keyboard users reach its buttons meanwhile.
		const accept = await element('consent-banner-accept-button');
		accept.focus();
		expect(document.activeElement).toBe(accept);

		release(':root{--inth-test-hold:1}');
		await vi.waitFor(() => {
			expect(holdElement()?.hasAttribute('data-inth-pending')).toBe(false);
		});
		expect(hidden(card)).toBe(false);
		// Nothing moves focus once the sheet lands.
		expect(document.activeElement).toBe(accept);
	});

	test('the dialog focuses its first control before its sheet lands, and keeps it after', async () => {
		const release = holdSheet();
		mountSurface('dialog');
		const root = await element('consent-dialog-root');
		const card = await element('consent-dialog-card');

		expect(holdElement()?.hasAttribute('data-inth-pending')).toBe(true);
		expect(hidden(card)).toBe(true);

		const first = firstTabbable(root);
		expect(first, 'the dialog has a tabbable control').toBeDefined();
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(first);
		});

		release(':root{--inth-test-hold:1}');
		await vi.waitFor(() => {
			expect(holdElement()?.hasAttribute('data-inth-pending')).toBe(false);
		});
		expect(hidden(card)).toBe(false);
		expect(document.activeElement).toBe(first);
	});
});
