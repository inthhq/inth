import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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

describe('ConsentDialogTrigger', () => {
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

	test('showWhen="never" does not render trigger', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'never',
		});

		// Accept banner first to transition to activeUI='none'
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

		await new Promise<void>((resolve) => {
			setTimeout(resolve, 300);
		});
		const trigger = document.querySelector(
			'button[aria-label="Open privacy settings"]'
		);
		expect(trigger).not.toBeInTheDocument();
	});

	test('showWhen="always" shows trigger when activeUI is none', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'always',
		});

		// Accept to dismiss banner
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
			const trigger = document.querySelector(
				'button[aria-label="Open privacy settings"]'
			);
			expect(trigger).toBeInTheDocument();
		});
	});

	test('trigger remains available while banner is showing', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'always',
		});

		await waitFor(() => {
			const banner = document.querySelector(
				'[data-testid="consent-banner-root"]'
			);
			expect(banner).toBeInTheDocument();
		});

		// Trigger should not be visible while banner is showing
		const trigger = document.querySelector(
			'button[aria-label="Open privacy settings"]'
		);
		expect(trigger).toBeInTheDocument();
	});

	test('opens dialog through native button activation', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'always',
		});

		// Accept to get to trigger state
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
			const trigger = document.querySelector(
				'button[aria-label="Open privacy settings"]'
			);
			expect(trigger).toBeInTheDocument();
		});

		const trigger = getDefined(
			document.querySelector('button[aria-label="Open privacy settings"]')
		);
		await fireEvent.click(trigger, { detail: 0 });

		await waitFor(() => {
			expect(
				document.querySelector('button[aria-label="Open privacy settings"]')
			).not.toBeInTheDocument();
			const dialog = document.querySelector(
				'[data-testid="consent-dialog-root"]'
			);
			expect(dialog).toBeInTheDocument();
		});
	});

	test('Enter after a drag still opens the dialog; the click ending the drag does not', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'always',
		});
		await fireEvent.click(
			await waitFor(() =>
				getDefined(
					document.querySelector('[data-testid="consent-banner-accept-button"]')
				)
			)
		);
		const trigger = await waitFor(() =>
			getDefined(
				document.querySelector<HTMLElement>(
					'button[aria-label="Open privacy settings"]'
				)
			)
		);

		// jsdom has no PointerEvent; a MouseEvent carries the coordinates.
		const pointer = (type: string, clientX: number) =>
			fireEvent(
				trigger,
				new MouseEvent(type, { bubbles: true, button: 0, clientX })
			);
		await pointer('pointerdown', 0);
		await pointer('pointermove', 40);
		await pointer('pointerup', 40);
		await fireEvent.click(trigger, { detail: 1 });
		expect(
			document.querySelector('[data-testid="consent-dialog-root"]')
		).not.toBeInTheDocument();

		// A keyboard press fires a click with `detail` 0 and no pointer first.
		await fireEvent.click(trigger, { detail: 0 });
		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-root"]')
			).toBeInTheDocument();
		});
	});

	test('has correct aria-label', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'always',
		});

		// Accept to get trigger visible
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
			const trigger = document.querySelector(
				'[data-testid="consent-dialog-trigger"]'
			);
			expect(trigger).toBeInTheDocument();
			expect(trigger?.getAttribute('aria-label')).toBe('Open privacy settings');
		});
	});

	test('showWhen="after-consent" waits until the banner is answered', async () => {
		render(FullFlowFixture, {
			options: defaultOptions,
			showWhen: 'after-consent',
		});

		const acceptButton = await waitFor(() =>
			getDefined(
				document.querySelector('[data-testid="consent-banner-accept-button"]')
			)
		);
		expect(
			document.querySelector('[data-testid="consent-dialog-trigger"]')
		).not.toBeInTheDocument();

		await fireEvent.click(acceptButton);

		await waitFor(() => {
			expect(
				document.querySelector('[data-testid="consent-dialog-trigger"]')
			).toBeInTheDocument();
		});
	});

	test('takes its accessible name from the trigger translations', async () => {
		render(FullFlowFixture, {
			options: {
				...defaultOptions,
				i18n: {
					detectBrowserLanguage: false,
					locale: 'en',
					messages: { en: { trigger: { label: 'Privacy choices' } } },
				},
			},
			showWhen: 'always',
		});

		await waitFor(() => {
			expect(
				document
					.querySelector('[data-testid="consent-dialog-trigger"]')
					?.getAttribute('aria-label')
			).toBe('Privacy choices');
		});
	});
});
