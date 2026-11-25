import { readStoredRecords } from '@inth/sdk/modules/persistence';
/**
 * E2E tests for the complete consent flow.
 *
 * Tests the full user journey from first visit through consent management.
 *
 * Mirrors: packages/sdk/react/src/components/__tests__/consent-flow.e2e.test.tsx
 */
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import BannerDialogFixture from '../../__tests__/fixtures/banner-dialog-fixture.svelte';
import BannerFixture from '../../__tests__/fixtures/banner-fixture.svelte';
import DialogFixture from '../../__tests__/fixtures/dialog-fixture.svelte';
import WidgetFixture from '../../__tests__/fixtures/widget-fixture.svelte';
import { testOffline } from '../../__tests__/test-offline';
import type { ConsentManagerOptions } from '../../lib/manager-options.model';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

const defaultOptions: ConsentManagerOptions = {
	// A permissive policy offers only what the site declares.
	consentCategories: [
		'functionality',
		'experience',
		'measurement',
		'marketing',
	],
	mode: testOffline(),
};

describe('Consent Flow E2E Tests', () => {
	beforeEach(() => {
		window.localStorage.clear();
		const cookies = document.cookie.split(';');
		for (const cookie of cookies) {
			const name = cookie.split('=')[0]?.trim();
			if (name) {
				document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
			}
		}
		vi.clearAllMocks();
	});

	describe('First Visit Flow', () => {
		test('should show cookie banner to first-time visitor', async () => {
			render(BannerFixture, { options: defaultOptions });

			await waitFor(() => {
				const banner = document.querySelector(
					'[data-testid="consent-banner-root"]'
				);
				expect(banner).toBeInTheDocument();
			});
		});

		test('should hide banner after accepting all', async () => {
			render(BannerFixture, { options: defaultOptions });

			await waitFor(() => {
				const acceptButton = document.querySelector(
					'[data-testid="consent-banner-accept-button"]'
				);
				expect(acceptButton).toBeInTheDocument();
			});

			const acceptButton = getDefined(
				document.querySelector('[data-testid="consent-banner-accept-button"]')
			);
			await fireEvent.click(acceptButton);

			await waitFor(() => {
				const banner = document.querySelector(
					'[data-testid="consent-banner-root"]'
				);
				expect(banner).not.toBeInTheDocument();
			});
		});

		test('should hide banner after rejecting all', async () => {
			render(BannerFixture, { options: defaultOptions });

			await waitFor(() => {
				const rejectButton = document.querySelector(
					'[data-testid="consent-banner-reject-button"]'
				);
				expect(rejectButton).toBeInTheDocument();
			});

			const rejectButton = getDefined(
				document.querySelector('[data-testid="consent-banner-reject-button"]')
			);
			await fireEvent.click(rejectButton);

			await waitFor(() => {
				const banner = document.querySelector(
					'[data-testid="consent-banner-root"]'
				);
				expect(banner).not.toBeInTheDocument();
			});
		});
	});

	describe('Consent Persistence', () => {
		test('should persist consent to localStorage on accept', async () => {
			render(BannerFixture, { options: defaultOptions });

			await waitFor(() => {
				const acceptButton = document.querySelector(
					'[data-testid="consent-banner-accept-button"]'
				);
				expect(acceptButton).toBeInTheDocument();
			});

			const acceptButton = getDefined(
				document.querySelector('[data-testid="consent-banner-accept-button"]')
			);
			await fireEvent.click(acceptButton);

			await waitFor(() => {
				const stored = window.localStorage.getItem('inth');
				expect(stored).toBeTruthy();
				const consent = readStoredRecords(undefined, Date.now()).records.choice;
				expect(consent?.categories.marketing?.value).toBe(true);
				expect(consent?.version).toBe(3);
			});
		});

		test('should persist reject decision to localStorage', async () => {
			render(BannerFixture, { options: defaultOptions });

			await waitFor(() => {
				const rejectButton = document.querySelector(
					'[data-testid="consent-banner-reject-button"]'
				);
				expect(rejectButton).toBeInTheDocument();
			});

			const rejectButton = getDefined(
				document.querySelector('[data-testid="consent-banner-reject-button"]')
			);
			await fireEvent.click(rejectButton);

			await waitFor(() => {
				const stored = window.localStorage.getItem('inth');
				expect(stored).toBeTruthy();
				const consent = readStoredRecords(undefined, Date.now()).records.choice;
				expect(consent?.version).toBe(3);
				expect(consent?.categories.marketing?.value).toBe(false);
				expect(consent?.categories.measurement?.value).toBe(false);
			});
		});
	});

	describe('Returning Visitor Flow', () => {
		test('should not show banner if user has already consented', async () => {
			const consentData = {
				consentInfo: {
					time: Date.now(),
					type: 'accept-all',
				},
				consents: {
					experience: true,
					functionality: true,
					marketing: true,
					measurement: true,
					necessary: true,
				},
			};
			window.localStorage.setItem('inth', JSON.stringify(consentData));

			render(BannerFixture, { options: defaultOptions });

			await new Promise<void>((resolve) => {
				setTimeout(resolve, 500);
			});

			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).not.toBeInTheDocument();
		});
	});

	describe('Widget Integration', () => {
		test('should render widget with all consent categories', async () => {
			render(WidgetFixture, { options: defaultOptions });

			await waitFor(() => {
				const widget = document.querySelector(
					'[data-testid="consent-widget-root"]'
				);
				expect(widget).toBeInTheDocument();
			});

			await waitFor(() => {
				const switches = document.querySelectorAll('[data-slot="switch"]');
				expect(switches.length).toBeGreaterThan(0);
			});
		});

		test('should have disabled necessary consent toggle', async () => {
			render(WidgetFixture, { options: defaultOptions });

			await waitFor(() => {
				const necessarySwitch = document.querySelector(
					'[data-testid="consent-widget-switch-necessary"]'
				);
				expect(necessarySwitch).toBeInTheDocument();
				expect(necessarySwitch?.getAttribute('data-disabled')).toBe('');
			});
		});
	});

	describe('Dialog Integration', () => {
		test('should show dialog when open prop is true', async () => {
			render(DialogFixture, { open: true, options: defaultOptions });

			await waitFor(() => {
				const dialog = document.querySelector(
					'[data-testid="consent-dialog-root"]'
				);
				expect(dialog).toBeInTheDocument();
			});
		});

		test('should open as a modal dialog', async () => {
			render(DialogFixture, { open: true, options: defaultOptions });

			await waitFor(() => {
				const card = document.querySelector(
					'[data-testid="consent-dialog-card"]'
				);
				expect(card).toBeInTheDocument();
				expect(card?.getAttribute('aria-modal')).toBe('true');
			});
		});

		test('should show the categories inside the dialog', async () => {
			render(DialogFixture, { open: true, options: defaultOptions });

			await waitFor(() => {
				const group = document.querySelector(
					'[data-testid="consent-dialog-category-group"]'
				);
				expect(group).toBeInTheDocument();
			});
		});
	});

	describe('Complete Flow', () => {
		test('should complete full consent flow: banner -> customize in place -> save', async () => {
			render(BannerDialogFixture, { options: defaultOptions });

			await waitFor(() => {
				const banner = document.querySelector(
					'[data-testid="consent-banner-root"]'
				);
				expect(banner).toBeInTheDocument();
			});

			const customizeButton = getDefined(
				document.querySelector(
					'[data-testid="consent-banner-customize-button"]'
				)
			);
			await fireEvent.click(customizeButton);

			await waitFor(() => {
				expect(
					document.querySelector(
						'[data-testid="consent-banner-category-switch-marketing"]'
					)
				).toBeInTheDocument();
			});

			const marketingSwitch = document.querySelector(
				'[data-testid="consent-banner-category-switch-marketing"]'
			);
			await fireEvent.click(getDefined(marketingSwitch));

			const saveButton = getDefined(
				document.querySelector('[data-testid="consent-banner-save-button"]')
			);
			await fireEvent.click(saveButton);

			await waitFor(() => {
				const stored = window.localStorage.getItem('inth');
				expect(stored).toBeTruthy();
				const consent = readStoredRecords(undefined, Date.now()).records.choice;
				expect(consent?.categories.marketing?.value).toBe(true);
			});
		});
	});
});
