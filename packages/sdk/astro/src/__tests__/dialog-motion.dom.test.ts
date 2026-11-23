/**
 * `disableAnimation` reaches the dialog island.
 *
 * The integration option and `<ConsentDialog disableAnimation>` both end
 * up in the options the dialog adapter mounts with, the prop winning. The
 * Vue case opens the real island. Svelte has no case here: Vitest resolves
 * `svelte` to its server build, where `mount()` throws.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { boot } from '../client';
import type { AstroConsentClient } from '../client';
// Vite compiles each island's whole component tree on first import. Static
// imports do it while this file loads, so no test timeout covers it.
import * as reactPanelSurface from '../components/islands/panel-surface';
import * as vuePanelSurface from '../components/islands/panel-surface.vue';
import { resolveOptions } from '../integration';
import type { InthAstroOptions } from '../inth-options.model';
import { testing as testingMode } from '../testing';
import { buildProviderProps } from '../ui/build-provider-props';
import { reactDialogAdapter } from '../ui/react';
import {
	registerDialogAdapter,
	registerDialogSurface,
	resetDialogRegistriesForTest,
} from '../ui/register-dialog-adapter';
import type { ConsentDialogContext } from '../ui/register-dialog-adapter';
import { vueDialogAdapter } from '../ui/vue';
// The Vue adapter imports its plugin on first mount. Importing it here
// compiles it while this file loads, outside any test timeout.
import '@inth/vue/vue-plugin';

import { testRule } from './policy-fixture';
import { ISLAND_RENDER_TIMEOUT } from './react-dialog-island';

const cleanup: (() => Promise<void> | void)[] = [];

// jsdom has no `matchMedia`.
beforeAll(() => {
	window.matchMedia ??= (query: string) =>
		({
			addEventListener: () => undefined,
			addListener: () => undefined,
			dispatchEvent: () => false,
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: () => undefined,
			removeListener: () => undefined,
		}) as MediaQueryList;
});

afterEach(async () => {
	for (const step of cleanup.splice(0).reverse()) {
		// oxlint-disable-next-line no-await-in-loop -- Tear down in reverse mount order.
		await step();
	}
	resetDialogRegistriesForTest();
	(window as unknown as Record<string, unknown>).__inthAstroConfig = undefined;
	localStorage.clear();
});

/**
 * Put the markup `<ConsentDialog disableAnimation={...} />` renders on
 * the page.
 *
 * @param disableAnimation - The `data-disable-animation` value, or
 * `undefined` for none.
 */
const renderDialogHost = function renderDialogHost(
	disableAnimation: 'true' | 'false' | undefined
): void {
	const host = document.createElement('div');
	host.setAttribute('data-inth-dialog-host', 'preferences');
	if (disableAnimation !== undefined) {
		host.setAttribute('data-disable-animation', disableAnimation);
	}
	document.body.append(host);
	cleanup.push(() => host.remove());
};

const bootClient = function bootClient(
	options: Partial<InthAstroOptions>
): AstroConsentClient {
	const client = boot(
		resolveOptions({
			mode: testingMode({
				policy: [testRule],
			}),
			...options,
		})
	);
	cleanup.push(() => {
		client.dispose();
		document.getElementById('inth-dialog-host')?.remove();
	});
	return client;
};

/** Open the dialog through a stand-in adapter and return what it got. */
const openWithRecordingAdapter = async function openWithRecordingAdapter(
	options: Partial<InthAstroOptions>
): Promise<ConsentDialogContext> {
	const mount = vi.fn((_context: ConsentDialogContext) =>
		Promise.resolve({ close: () => undefined, destroy: () => undefined })
	);
	registerDialogAdapter('svelte', () =>
		Promise.resolve({ mount, name: 'svelte' })
	);
	await bootClient(options).openDialog();
	const context = mount.mock.calls[0]?.[0];
	if (!context) {
		throw new Error('The dialog adapter was never mounted.');
	}
	return context;
};

describe('disableAnimation on the dialog island', () => {
	it.each([
		{ attribute: undefined, expected: undefined, option: undefined },
		{ attribute: undefined, expected: true, option: true },
		{ attribute: 'true', expected: true, option: undefined },
		{ attribute: 'false', expected: false, option: true },
	] as const)(
		'is $expected with integration option $option and prop $attribute',
		async ({ attribute, expected, option }) => {
			renderDialogHost(attribute);
			const context = await openWithRecordingAdapter({
				disableAnimation: option,
			});
			expect(context.options.disableAnimation).toBe(expected);
			expect(
				buildProviderProps(context.runtime, context.options).options
					.disableAnimation
			).toBe(expected);
		}
	);
});

describe.each(['react', 'vue'] as const)('the %s dialog island', (ui) => {
	it.each([
		{ disableAnimation: true, expected: 'off' },
		{ disableAnimation: undefined, expected: null },
	] as const)(
		'marks its backdrop data-animation=$expected when disableAnimation is $disableAnimation',
		async ({ disableAnimation, expected }) => {
			renderDialogHost(undefined);
			if (ui === 'react') {
				registerDialogAdapter('react', () =>
					Promise.resolve(reactDialogAdapter)
				);
				registerDialogSurface('react', () =>
					Promise.resolve(reactPanelSurface)
				);
			} else {
				registerDialogAdapter('vue', () => Promise.resolve(vueDialogAdapter));
				registerDialogSurface('vue', () => Promise.resolve(vuePanelSurface));
			}
			await bootClient({ disableAnimation, ui }).openDialog();
			// The stock sheet turns the dialog's motion off from this
			// attribute, as it does the banner's.
			const backdrop = await vi.waitFor(() => {
				const found = document.querySelector(
					'[data-testid="consent-dialog-root"]'
				);
				expect(found).not.toBeNull();
				return found as HTMLElement;
			}, ISLAND_RENDER_TIMEOUT);
			expect(backdrop.getAttribute('data-animation')).toBe(expected);
		}
	);
});
