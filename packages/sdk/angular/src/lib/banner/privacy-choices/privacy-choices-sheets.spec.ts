/**
 * A Privacy Choices page carries only the presentation it shows (§7): a
 * Drawer site never loads or inserts the Card or Bar stylesheet, and a
 * classic site loads no Privacy Choices code at all. Ported from React's
 * `privacy-choices-sheets.test.tsx`; the loaders stand in for the chunk
 * requests a browser would make.
 */
import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ConsentContainer, ConsentPresentation } from '@inth/sdk/engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ALL_CATEGORIES, testLocal } from '../../../__tests__/test-local';
import { ConsentManager } from '../../core/consent-manager';
import { provideInth } from '../../core/provide-inth';
import { ConsentBanner } from '../consent-banner';
import { PRIVACY_CHOICES_LOADERS } from './presentation';
import type { PrivacyChoicesLoaders } from './presentation';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner],
	selector: 'test-pc-sheets-host',
	template: '<inth-consent-banner [disableAnimation]="true" />',
})
class BannerHost {}

const inserted = (id: string): boolean =>
	document.head.querySelector(`style[data-inth-styles="${id}"]`) !== null;

const realPresentation: PrivacyChoicesLoaders['presentation'] = async (
	type
) => {
	switch (type) {
		case 'banner':
			return (await import('./bar')).BAR_PRESENTATION;
		case 'drawer':
			return (await import('./drawer')).DRAWER_PRESENTATION;
		default:
			return (await import('./card')).CARD_PRESENTATION;
	}
};
const realSurface: PrivacyChoicesLoaders['surface'] = async () =>
	(await import('./surface')).PrivacyChoicesSurface;

const root = () =>
	document.querySelector<HTMLElement>('[data-testid="consent-banner-root"]');

/** Mounts the banner with the given loaders, without waiting for the prompt. */
const mountWith = async function mountWith(
	loaders: PrivacyChoicesLoaders,
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
			{ provide: PRIVACY_CHOICES_LOADERS, useValue: loaders },
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
		presentation: vi.fn<PrivacyChoicesLoaders['presentation']>(
			async (type: ConsentContainer['type']) => {
				switch (type) {
					case 'banner':
						return (await import('./bar')).BAR_PRESENTATION;
					case 'drawer':
						return (await import('./drawer')).DRAWER_PRESENTATION;
					default:
						return (await import('./card')).CARD_PRESENTATION;
				}
			}
		),
		surface: vi.fn<PrivacyChoicesLoaders['surface']>(
			async () => (await import('./surface')).PrivacyChoicesSurface
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
			{ provide: PRIVACY_CHOICES_LOADERS, useValue: loaders },
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

describe('Privacy Choices stylesheets', () => {
	test('a classic banner loads no Privacy Choices module or sheet', async () => {
		const loaders = await mount();
		expect(loaders.surface).not.toHaveBeenCalled();
		expect(loaders.presentation).not.toHaveBeenCalled();
		for (const id of ['inth-surface', 'inth-card', 'inth-bar', 'inth-drawer']) {
			expect(inserted(id)).toBe(false);
		}
	});

	test('a Drawer never loads or inserts the Card or Bar sheet', async () => {
		const loaders = await mount({
			prompt: { container: { side: 'bottom', type: 'drawer' } },
		});
		await vi.waitFor(() =>
			expect(
				document.querySelector('[data-placement="drawer-bottom"]')
			).not.toBeNull()
		);
		expect(loaders.presentation.mock.calls).toEqual([['drawer']]);
		expect(inserted('inth-surface')).toBe(true);
		expect(inserted('inth-drawer')).toBe(true);
		expect(inserted('inth-card')).toBe(false);
		expect(inserted('inth-bar')).toBe(false);
		// The classic banner's own sheet stays off the page.
		expect(inserted('inth-banner')).toBe(false);
		// The options' sheets wait for Customize.
		expect(inserted('inth-expand')).toBe(false);
		expect(inserted('inth-privacy-choices-dialog')).toBe(false);
	});

	test('[C1] a failed prompt load is tried again when the prompt is owed again', async () => {
		const surface = vi
			.fn<PrivacyChoicesLoaders['surface']>(realSurface)
			.mockRejectedValueOnce(new Error('chunk failed'));
		const consent = await mountWith(
			{ presentation: vi.fn(realPresentation), surface },
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

	test('[C1] a load a newer one replaced is dropped', async () => {
		let releaseCard: () => void = () => undefined;
		const presentation = vi.fn<PrivacyChoicesLoaders['presentation']>(
			async (type) => {
				if (type === 'card') {
					await new Promise<void>((resolve) => {
						releaseCard = resolve;
					});
				}
				return realPresentation(type);
			}
		);
		const consent = await mountWith(
			{ presentation, surface: vi.fn(realSurface) },
			{ prompt: { container: { type: 'card' } } },
			{ stable: false }
		);
		await vi.waitFor(() => expect(presentation).toHaveBeenCalledWith('card'));
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
