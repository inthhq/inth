/**
 * E2E tests for activeUI state transitions.
 *
 * Tests that UI visibility is driven by the `activeUI` enum
 * and transitions correctly between 'none', 'banner', and 'dialog'.
 *
 * Mirrors: packages/sdk/react/src/components/__tests__/active-ui-transitions.e2e.test.tsx
 */

import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import BannerDialogFixture from '../../__tests__/fixtures/banner-dialog-fixture.svelte';
import BannerFixture from '../../__tests__/fixtures/banner-fixture.svelte';
import FullFlowFixture from '../../__tests__/fixtures/full-flow-fixture.svelte';
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
	mode: testOffline(),
};

describe('activeUI Transitions E2E Tests', () => {
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

	test('banner shows on first visit (activeUI becomes banner)', async () => {
		render(BannerFixture, { options: defaultOptions });

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).toBeInTheDocument();
		});
	});

	test('customize opens the options in place, and the banner stays', async () => {
		render(BannerDialogFixture, { options: defaultOptions });

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).toBeInTheDocument();
		});

		const customizeButton = getDefined(
			document.querySelector('[data-testid="consent-banner-customize-button"]')
		);
		await fireEvent.click(customizeButton);

		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-banner-save-button"]')
			).toBeInTheDocument();
		});

		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeInTheDocument();
		expect(
			document.querySelector('[data-testid="consent-dialog-root"]')
		).toBeNull();
	});

	test('save from the options hides all UI', async () => {
		render(BannerDialogFixture, { options: defaultOptions });

		await waitFor(() => {
			const btn = document.querySelector(
				'[data-testid="consent-banner-customize-button"]'
			);
			expect(btn).toBeInTheDocument();
		});
		const customizeButton = getDefined(
			document.querySelector('[data-testid="consent-banner-customize-button"]')
		);
		await fireEvent.click(customizeButton);

		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-banner-save-button"]')
			).toBeInTheDocument();
		});

		const saveButton = getDefined(
			document.querySelector('[data-testid="consent-banner-save-button"]')
		);
		await fireEvent.click(saveButton);

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			const dialog = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			);
			expect(banner).not.toBeInTheDocument();
			expect(dialog).not.toBeInTheDocument();
		});
	});

	test('banner hidden for returning visitor', async () => {
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

	test('trigger appears after consent, opens dialog on click', async () => {
		render(FullFlowFixture, { options: defaultOptions, showWhen: 'always' });

		await waitFor(() => {
			const btn = document.querySelector(
				'[data-testid="consent-banner-accept-button"]'
			);
			expect(btn).toBeInTheDocument();
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

		await waitFor(() => {
			const trigger = document.querySelector(
				'button[aria-label="Open privacy settings"]'
			);
			expect(trigger).toBeInTheDocument();
		});

		const trigger = getDefined(
			document.querySelector('button[aria-label="Open privacy settings"]')
		);
		await fireEvent.click(trigger);

		await waitFor(() => {
			const dialog = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			);
			expect(dialog).toBeInTheDocument();
		});
	});

	test('full lifecycle: banner → customize → save → trigger → dialog', async () => {
		render(FullFlowFixture, { options: defaultOptions, showWhen: 'always' });

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).toBeInTheDocument();
		});

		const customizeButton = getDefined(
			document.querySelector('[data-testid="consent-banner-customize-button"]')
		);
		await fireEvent.click(customizeButton);

		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-banner-save-button"]')
			).toBeInTheDocument();
		});

		const saveButton = getDefined(
			document.querySelector('[data-testid="consent-banner-save-button"]')
		);
		await fireEvent.click(saveButton);

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).not.toBeInTheDocument();
		});

		await waitFor(() => {
			const trigger = document.querySelector(
				'button[aria-label="Open privacy settings"]'
			);
			expect(trigger).toBeInTheDocument();
		});

		const trigger = getDefined(
			document.querySelector('button[aria-label="Open privacy settings"]')
		);
		await fireEvent.click(trigger);

		await waitFor(() => {
			const dialog = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			);
			expect(dialog).toBeInTheDocument();
		});
	});
});
