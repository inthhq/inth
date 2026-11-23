/**
 * A Privacy Choices page carries only the presentation it shows (§7): a
 * Drawer site never loads or inserts the Card or Bar stylesheet, and a
 * classic site loads no Privacy Choices code at all. Ported from React's
 * `privacy-choices-sheets.test.tsx`; the loaders stand in for the chunk
 * requests a browser would make.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ConsentContainer, ConsentPresentation } from '@inth/sdk/engine';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ALL_CATEGORIES, testLocal } from '../../../__tests__/test-local';
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
			design: 'privacy-choices',
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
});
