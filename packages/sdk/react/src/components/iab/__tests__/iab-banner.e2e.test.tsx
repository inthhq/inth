/**
 * IAB Banner E2E Tests
 *
 * Browser-based tests for IAB TCF 2.4 compliant banner.
 *
 * These tests run in Vitest browser mode and test the full IAB consent flow.
 * The mock GVL is passed directly via config.iab.gvl to bypass network fetching.
 */

import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser/context';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { IABConsentDialog } from '~/components/iab-panel';
import { IABConsentBanner } from '~/components/iab-prompt';

import {
	clearConsentState,
	defaultProviderIABOptions,
	getStoredConsent,
	waitForElement,
	waitForElementRemoved,
} from './e2e-setup';

describe('IAB Banner E2E Tests', () => {
	beforeEach(() => {
		clearConsentState();
		vi.clearAllMocks();
	});

	describe('Banner Display Requirements (IAB Appendix B)', () => {
		test('should show IAB banner with correct initial display', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await waitForElement('[data-testid="iab-consent-banner-card"]');

			expect(
				document.querySelector('[data-testid="iab-consent-banner-card"]')
			).toBeInTheDocument();
			expect(
				document.querySelector('[data-testid="iab-consent-banner-header"]')
			).toBeInTheDocument();
			expect(
				document.querySelector('[data-testid="iab-consent-banner-footer"]')
			).toBeInTheDocument();
		});

		test('should display partner/vendor count from GVL', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await waitForElement('[data-testid="iab-consent-banner-card"]');

			const bannerText =
				document.querySelector('[data-testid="iab-consent-banner-header"]')
					?.textContent || '';

			// Should contain a number (partner count)
			expect(bannerText).toMatch(/\d+/u);
		});

		test('should display purpose summary with stack grouping', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await waitForElement('[data-testid="iab-consent-banner-card"]');

			const header = document.querySelector(
				'[data-testid="iab-consent-banner-header"]'
			);
			expect(header).toBeInTheDocument();
		});

		test('should display legitimate interest notice', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await waitForElement('[data-testid="iab-consent-banner-card"]');

			const bannerText =
				document.querySelector('[data-testid="iab-consent-banner-header"]')
					?.textContent || '';

			expect(bannerText.toLowerCase()).toContain('legitimate');
		});
	});

	describe('Banner CTA Requirements', () => {
		test('should have Accept, Reject, and Customize buttons', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			await waitForElement('[data-testid="iab-consent-banner-card"]');

			expect(
				document.querySelector(
					'[data-testid="iab-consent-banner-accept-button"]'
				)
			).toBeInTheDocument();
			expect(
				document.querySelector(
					'[data-testid="iab-consent-banner-reject-button"]'
				)
			).toBeInTheDocument();
			expect(
				document.querySelector(
					'[data-testid="iab-consent-banner-customize-button"]'
				)
			).toBeInTheDocument();
		});
	});

	describe('Banner Actions', () => {
		test('should accept all via banner and close', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			const acceptButton = await waitForElement(
				'[data-testid="iab-consent-banner-accept-button"]'
			);

			await userEvent.click(acceptButton);

			await waitForElementRemoved('[data-testid="iab-consent-banner-card"]');

			await vi.waitFor(
				() => {
					const consent = getStoredConsent();
					expect(consent).toBeTruthy();
				},
				{ timeout: 1000 }
			);
		});

		test('should reject all via banner and close', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			const rejectButton = await waitForElement(
				'[data-testid="iab-consent-banner-reject-button"]'
			);

			await userEvent.click(rejectButton);

			await waitForElementRemoved('[data-testid="iab-consent-banner-card"]');

			const consent = await vi.waitFor(
				() => {
					const stored = getStoredConsent();
					expect(stored).not.toBeNull();
					return stored;
				},
				{ timeout: 2000 }
			);
			expect(consent?.choice?.categories.marketing?.value).toBe(false);
		});

		test('should open preference center from banner', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			const customizeButton = await waitForElement(
				'[data-testid="iab-consent-banner-customize-button"]'
			);

			await userEvent.click(customizeButton);

			await waitForElement('[data-testid="iab-consent-dialog-root"]');
		});
	});

	describe('Banner Accessibility', () => {
		test('should have ARIA labels', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			const banner = await waitForElement(
				'[data-testid="iab-consent-banner-card"]'
			);

			// The default non-blocking banner is a labelled region.
			expect(banner.getAttribute('role')).toBe('region');

			expect(banner.getAttribute('aria-label')).toBeTruthy();
		});

		test('should be keyboard accessible', async () => {
			render(
				<InthProvider options={defaultProviderIABOptions}>
					<IABConsentBanner />
					<IABConsentDialog />
				</InthProvider>
			);

			const rejectButton = await waitForElement(
				'[data-testid="iab-consent-banner-reject-button"]'
			);
			const customizeButton = document.querySelector(
				'[data-testid="iab-consent-banner-customize-button"]'
			) as HTMLElement;
			const acceptButton = document.querySelector(
				'[data-testid="iab-consent-banner-accept-button"]'
			) as HTMLElement;

			rejectButton.focus();
			expect(document.activeElement).toBe(rejectButton);

			customizeButton.focus();
			expect(document.activeElement).toBe(customizeButton);

			acceptButton.focus();
			expect(document.activeElement).toBe(acceptButton);
		});
	});
});
