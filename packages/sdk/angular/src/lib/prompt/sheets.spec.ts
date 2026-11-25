/**
 * A page carries only the container it shows (§7): a Drawer site never
 * loads or inserts the Card or Banner stylesheet, and a page that owes no
 * choice loads no prompt code at all. Ported from React's
 * `consent-banner-sheets.test.tsx`; the loaders stand in for the chunk
 * requests a browser would make.
 */
import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
	ConsentContainer,
	ConsentPresentation,
	PolicyRule,
} from '@inth/sdk/engine';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { offlineMode } from '../../__tests__/fixtures/transport-mode';
import { ALL_CATEGORIES, testLocal } from '../../__tests__/test-local';
import { ConsentManager } from '../core/consent-manager';
import { provideInth } from '../core/provide-inth';
import { ConsentBanner } from './prompt';
import { PROMPT_LOADERS } from './prompt-loaders';
import type { PromptLoaders } from './prompt-loaders';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-prompt-sheets-host',
	template: '<inth-consent-banner [disableAnimation]="true" />',
})
class BannerHost {}

const inserted = (id: string): boolean =>
	document.head.querySelector(`style[data-inth-styles="${id}"]`) !== null;

const realContainer: PromptLoaders['container'] = async (type) => {
	switch (type) {
		case 'banner':
			return (await import('./strip')).BANNER_CONTAINER;
		case 'drawer':
			return (await import('./drawer-container')).DRAWER_CONTAINER;
		default:
			return (await import('./card-container')).CARD_CONTAINER;
	}
};
const realSurface: PromptLoaders['surface'] = async () =>
	(await import('./prompt-surface')).PromptSurface;

const root = () =>
	document.querySelector<HTMLElement>('[data-testid="consent-banner-root"]');

/** Mounts the banner with the given loaders, without waiting for the prompt. */
const mountWith = async function mountWith(
	loaders: PromptLoaders,
	presentation: ConsentPresentation,
	{ stable = true } = {}
) {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				mode: testLocal(),
				persistence: false,
				presentation,
			}),
			{ provide: PROMPT_LOADERS, useValue: loaders },
		],
	});
	const fixture = TestBed.createComponent(BannerHost);
	if (stable) {
		await fixture.whenStable();
	} else {
		fixture.detectChanges();
	}
	return TestBed.inject(ConsentManager);
};

const mount = async function mount(presentation?: ConsentPresentation) {
	const loaders = {
		container: vi.fn<PromptLoaders['container']>(
			async (type: ConsentContainer['type']) => {
				switch (type) {
					case 'banner':
						return (await import('./strip')).BANNER_CONTAINER;
					case 'drawer':
						return (await import('./drawer-container')).DRAWER_CONTAINER;
					default:
						return (await import('./card-container')).CARD_CONTAINER;
				}
			}
		),
		surface: vi.fn<PromptLoaders['surface']>(
			async () => (await import('./prompt-surface')).PromptSurface
		),
	};
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...ALL_CATEGORIES],
				mode: testLocal(),
				persistence: false,
				presentation,
			}),
			{ provide: PROMPT_LOADERS, useValue: loaders },
		],
	});
	const fixture = TestBed.createComponent(BannerHost);
	await fixture.whenStable();
	await vi.waitFor(
		() =>
			expect(
				document.querySelector('[data-testid="consent-banner-root"]')
			).not.toBeNull(),
		{ timeout: 4000 }
	);
	return loaders;
};

afterEach(() => {
	TestBed.resetTestingModule();
	document.body.replaceChildren();
	for (const style of document.head.querySelectorAll(
		'style[data-inth-styles]'
	)) {
		style.remove();
	}
});

describe('consent prompt stylesheets', () => {
	test('a page that owes no choice loads no container', async () => {
		const loaders = {
			container: vi.fn<PromptLoaders['container']>(realContainer),
			surface: vi.fn<PromptLoaders['surface']>(realSurface),
		};
		TestBed.configureTestingModule({
			providers: [
				provideInth({
					consentCategories: [...ALL_CATEGORIES],
					// An opt-out policy with no prompt owes no choice.
					mode: offlineMode([
						{
							id: 'no-prompt',
							match: { fallback: true, isDefault: true },
							model: 'opt-out',
							prompt: 'none',
							rights: ['disclosure', 'preferences', 'opt-out'],
						} as PolicyRule,
					]),
					persistence: false,
				}),
				{ provide: PROMPT_LOADERS, useValue: loaders },
			],
		});
		const fixture = TestBed.createComponent(BannerHost);
		await fixture.whenStable();
		expect(TestBed.inject(ConsentManager).activeUI()).toBe('none');
		expect(loaders.surface).not.toHaveBeenCalled();
		expect(loaders.container).not.toHaveBeenCalled();
		for (const id of [
			'inth-surface',
			'inth-card',
			'inth-banner',
			'inth-drawer',
		]) {
			expect(inserted(id)).toBe(false);
		}
	});

	test('a Drawer never loads or inserts the Card or Banner sheet', async () => {
		const loaders = await mount({
			prompt: { container: { side: 'bottom', type: 'drawer' } },
		});
		await vi.waitFor(() =>
			expect(
				document.querySelector('[data-placement="drawer-bottom"]')
			).not.toBeNull()
		);
		expect(loaders.container.mock.calls).toEqual([['drawer']]);
		expect(inserted('inth-surface')).toBe(true);
		expect(inserted('inth-drawer')).toBe(true);
		expect(inserted('inth-card')).toBe(false);
		expect(inserted('inth-banner')).toBe(false);
		// The shared parts' sheet belongs to the widget and the IAB banner.
		expect(inserted('inth-parts')).toBe(false);
		// The options' sheets wait for Customize.
		expect(inserted('inth-expand')).toBe(false);
		expect(inserted('inth-dialog')).toBe(false);
	});

	test('[C1] a failed prompt load is tried again when the prompt is owed again', async () => {
		const surface = vi
			.fn<PromptLoaders['surface']>(realSurface)
			.mockRejectedValueOnce(new Error('chunk failed'));
		const consent = await mountWith(
			{ container: vi.fn(realContainer), surface },
			{ prompt: { container: { type: 'card' } } }
		);
		await vi.waitFor(() => expect(surface).toHaveBeenCalledTimes(1));
		await TestBed.inject(ApplicationRef).whenStable();
		expect(root()).toBeNull();
		consent.setActiveUI('none');
		await TestBed.inject(ApplicationRef).whenStable();
		expect(surface).toHaveBeenCalledTimes(1);
		consent.setActiveUI('banner');
		await vi.waitFor(() => expect(root()).not.toBeNull(), { timeout: 4000 });
		expect(surface).toHaveBeenCalledTimes(2);
	});

	test("the prompt renders only once its container's code is in, and holds the app unstable until then", async () => {
		// A server render waits for the app to be stable, and hydration renders
		// over the server's markup: the prompt must never render, or suspend,
		// without its container.
		let releaseCard: () => void = () => undefined;
		const container = vi.fn<PromptLoaders['container']>(async (type) => {
			await new Promise<void>((resolve) => {
				releaseCard = resolve;
			});
			return realContainer(type);
		});
		const surface = vi.fn<PromptLoaders['surface']>(realSurface);
		await mountWith(
			{ container, surface },
			{ prompt: { container: { type: 'card' } } },
			{ stable: false }
		);
		await vi.waitFor(() => expect(container).toHaveBeenCalledWith('card'));
		await vi.waitFor(() => expect(surface).toHaveBeenCalled());
		let stable = false;
		void TestBed.inject(ApplicationRef)
			.whenStable()
			// oxlint-disable-next-line promise/prefer-await-to-then -- Records when it settles.
			.then(() => {
				stable = true;
			});
		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});
		expect(root()).toBeNull();
		expect(stable).toBe(false);
		releaseCard();
		await TestBed.inject(ApplicationRef).whenStable();
		await vi.waitFor(() => expect(root()).not.toBeNull(), { timeout: 4000 });
		expect(root()?.getAttribute('data-placement')).toBe('card-start');
		expect(inserted('inth-card')).toBe(true);
	});

	test('[C1] a load a newer one replaced is dropped', async () => {
		let releaseCard: () => void = () => undefined;
		const container = vi.fn<PromptLoaders['container']>(async (type) => {
			if (type === 'card') {
				await new Promise<void>((resolve) => {
					releaseCard = resolve;
				});
			}
			return realContainer(type);
		});
		const consent = await mountWith(
			{ container, surface: vi.fn(realSurface) },
			{ prompt: { container: { type: 'card' } } },
			{ stable: false }
		);
		await vi.waitFor(() => expect(container).toHaveBeenCalledWith('card'));
		await consent.updateOptions({
			presentation: {
				prompt: { container: { side: 'bottom', type: 'drawer' } },
			},
		});
		await vi.waitFor(
			() =>
				expect(
					document.querySelector('[data-placement="drawer-bottom"]')
				).not.toBeNull(),
			{ timeout: 4000 }
		);
		releaseCard();
		await TestBed.inject(ApplicationRef).whenStable();
		expect(
			document.querySelectorAll('[data-testid="consent-banner-root"]')
		).toHaveLength(1);
		expect(
			document.querySelector('[data-placement="drawer-bottom"]')
		).not.toBeNull();
		expect(inserted('inth-card')).toBe(false);
	});
});
