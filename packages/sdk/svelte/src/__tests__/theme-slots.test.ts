/**
 * `theme.slots` reaches each stock part the way it does in React and Vue:
 * the slot's classes and its `style`, with camelCase style keys, and only
 * on the part the slot names.
 */
import type { ComponentSlots } from '@inth/sdk/ui/theme';
import { render, waitFor } from '@testing-library/svelte';
import { describe, expect, test } from 'vitest';

import type { ConsentManagerOptions } from '../lib/types';
import Fixture from './fixtures/theme-slots-fixture.svelte';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const SLOT = {
	className: 'brand-slot',
	style: { '--slot-mark': 'rgb(1, 2, 3)', backgroundColor: 'rgb(1, 2, 3)' },
};

type Surface = 'banner' | 'dialog' | 'widget';

/** A part of each surface that renders once it is up. */
const READY: Record<Surface, string> = {
	banner: 'consent-banner-card',
	dialog: 'consent-dialog-card',
	widget: 'consent-widget-root',
};

const renderWithSlots = async function renderWithSlots(
	slots: ComponentSlots,
	surface: Surface = 'banner'
): Promise<void> {
	render(Fixture, {
		options: {
			legalLinks: {
				cookiePolicy: { href: 'https://example.test/cookies' },
				privacyPolicy: { href: 'https://example.test/privacy' },
			},
			mode: transportMode({}),
			persistence: false,
			prefetch: policyFixture(),
			theme: { slots },
		} as ConsentManagerOptions,
		surface,
	});
	await waitFor(() => {
		expect(
			document.querySelector(`[data-testid="${READY[surface]}"]`)
		).not.toBeNull();
	});
};

const part = (testId: string): HTMLElement => {
	const element = document.querySelector<HTMLElement>(
		`[data-testid="${testId}"]`
	);
	if (!element) {
		throw new Error(`${testId} did not render`);
	}
	return element;
};

describe('theme.slots in Svelte', () => {
	test.each([
		['consentBanner', 'consent-banner-root', 'banner'],
		['consentBannerCard', 'consent-banner-card', 'banner'],
		['consentBannerHeader', 'consent-banner-header', 'banner'],
		['consentBannerTitle', 'consent-banner-title', 'banner'],
		['consentBannerDescription', 'consent-banner-description', 'banner'],
		['consentBannerFooter', 'consent-banner-footer', 'banner'],
		[
			'consentBannerFooterSubGroup',
			'consent-banner-footer-sub-group',
			'banner',
		],
		['consentBannerTag', 'consent-banner-branding', 'banner'],
		['consentDialog', 'consent-dialog-root', 'dialog'],
		['consentDialogCard', 'consent-dialog-card', 'dialog'],
		['consentDialogHeader', 'consent-dialog-header', 'dialog'],
		['consentDialogTitle', 'consent-dialog-title', 'dialog'],
		['consentDialogContent', 'consent-dialog-content', 'dialog'],
		['consentDialogFooter', 'consent-dialog-footer', 'dialog'],
		['consentWidget', 'consent-widget-root', 'widget'],
		['consentWidgetFooter', 'consent-widget-footer', 'widget'],
		['consentWidgetAccordion', 'consent-widget-accordion', 'widget'],
		['toggle', 'consent-widget-switch-necessary', 'widget'],
	] as const)(
		'%s puts its class and style on %s',
		async (slot, testId, surface) => {
			await renderWithSlots({ [slot]: SLOT }, surface);
			await waitFor(() => part(testId));

			const element = part(testId);
			expect(element.classList).toContain('brand-slot');
			expect(element.style.getPropertyValue('background-color')).toBe(
				'rgb(1, 2, 3)'
			);
			expect(element.style.getPropertyValue('--slot-mark')).toBe(
				'rgb(1, 2, 3)'
			);
		}
	);

	test.each([
		['consentGate', 'consent-gate-placeholder'],
		['consentGateTitle', 'consent-gate-title'],
		['consentGateButton', 'consent-gate-button'],
	] as const)('%s puts its class and style on %s', async (slot, testId) => {
		await renderWithSlots({ [slot]: SLOT });
		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-gate-placeholder"]')
			).not.toBeNull();
		});

		const element = part(testId);
		expect(element.classList).toContain('brand-slot');
		expect(element.style.getPropertyValue('background-color')).toBe(
			'rgb(1, 2, 3)'
		);
		expect(element.style.getPropertyValue('--slot-mark')).toBe('rgb(1, 2, 3)');
	});

	test('consentGateButton styles merge over buttonPrimary', async () => {
		await renderWithSlots({
			buttonPrimary: { className: 'primary-slot', style: { color: 'red' } },
			consentGateButton: SLOT,
		});
		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-gate-button"]')
			).not.toBeNull();
		});

		const button = part('consent-gate-button');
		expect(button.classList).toContain('primary-slot');
		expect(button.classList).toContain('brand-slot');
		expect(button.style.getPropertyValue('color')).toBe('red');
		expect(button.style.getPropertyValue('background-color')).toBe(
			'rgb(1, 2, 3)'
		);
	});

	test('legal links keep only the stock link class', async () => {
		const slots = {
			consentBannerDescription: 'banner-description-slot',
			consentDialogContent: 'dialog-content-slot',
		};
		await renderWithSlots(slots);
		const bannerLink = part('consent-banner-legal-link-privacyPolicy');
		expect(bannerLink.classList).not.toContain('banner-description-slot');
		expect(part('consent-banner-description').classList).toContain(
			'banner-description-slot'
		);
		document.body.innerHTML = '';

		await renderWithSlots(slots, 'dialog');
		// The EU dialog's footer shows the Cookie Policy.
		const dialogLink = part('consent-dialog-legal-link-cookiePolicy');
		expect(dialogLink.classList).not.toContain('dialog-content-slot');
		expect(part('consent-dialog-content').classList).toContain(
			'dialog-content-slot'
		);
	});
});
