import type { ConsentKernel } from '@inth/sdk/engine';
import { useContext, useEffect } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentWidget } from '~/components/preferences';
import { KernelContext } from '~/context';
import { useOptOutState } from '~/hooks';

import { testing } from '../../../testing';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'us-opt-out',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

let kernel: ConsentKernel;
const Capture = () => {
	const value = useContext(KernelContext);
	const optOutState = useOptOutState();
	useEffect(() => {
		if (value) {
			kernel = value;
		}
	}, [value]);
	return (
		<output data-testid="opt-out-hook">{JSON.stringify(optOutState)}</output>
	);
};

describe('consent widget opt-out parity', () => {
	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on opt-in save', async () => {
		const fixture = policyFixture(
			{ functionality: true, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: testing({ policy: [OPT_OUT_RULE] }),
					persistence: false,
					prefetch: {
						...fixture,
						initialRecords: {
							...fixture.initialRecords,
							optOut: {
								heldBy: 'device',
								method: 'button',
								recordedAt: now - 1000,
								rights: ['sale', 'share'],
							},
						},
						now,
					},
					theme: {
						slots: {
							consentWidgetOptOutStatus: 'brand-opt-out-status',
						},
					},
				}}
			>
				<Capture />
				<ConsentWidget />
			</InthProvider>
		);

		const status = page.getByTestId('consent-widget-opt-out-status');
		await expect.element(status).toBeVisible();
		await expect.element(status).toHaveAttribute('role', 'status');
		await expect.element(status).toHaveTextContent('Opt-out request honored');
		expect(
			document.querySelector('[data-testid="consent-widget-opt-out-status"]')
				?.classList
		).toContain('brand-opt-out-status');

		await expect
			.element(page.getByTestId('opt-out-hook'))
			.toHaveTextContent('"honored":true');
		await expect
			.element(page.getByTestId('opt-out-hook'))
			.toHaveTextContent('"via":"request"');

		const marketing = page.getByTestId('consent-widget-switch-marketing');
		const measurement = page.getByTestId('consent-widget-switch-measurement');
		const functionality = page.getByTestId(
			'consent-widget-switch-functionality'
		);
		await expect.element(marketing).toHaveAttribute('aria-checked', 'false');
		await expect.element(marketing).not.toBeDisabled();
		await expect.element(measurement).toHaveAttribute('aria-checked', 'false');
		await expect.element(functionality).toHaveAttribute('aria-checked', 'true');
		expect(
			document.querySelector(
				'[data-testid="consent-widget-restriction-marketing"]'
			)
		).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(
				kernel.getSnapshot().explicitChoice?.categories.marketing?.value
			).toBe(false);
		});
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		// Turning marketing on and saving lifts the device opt-out.
		await marketing.click();
		await expect.element(marketing).toHaveAttribute('aria-checked', 'true');
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut).toBeNull();
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(
			document.querySelector('[data-testid="consent-widget-opt-out-status"]')
		).toBeNull();

		unmount();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const fixture = policyFixture(
			{ functionality: false, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: testing({ policy: [OPT_OUT_RULE] }),
					overrides: { gpc: true },
					persistence: false,
					prefetch: {
						...fixture,
						initialPrivacySignals: { gpc: true },
						initialRecords: {
							...fixture.initialRecords,
							optOut: {
								heldBy: 'device',
								method: 'gpc',
								recordedAt: now - 1000,
								rights: ['sale', 'share'],
							},
						},
						now,
					},
				}}
			>
				<Capture />
				<ConsentWidget />
			</InthProvider>
		);

		const status = page.getByTestId('consent-widget-opt-out-status');
		await expect.element(status).toHaveAttribute('role', 'status');
		await expect
			.element(status)
			.toHaveTextContent('Opt-out preference signal honored');
		await expect
			.element(page.getByTestId('opt-out-hook'))
			.toHaveTextContent('"lock":"gpc-active"');

		for (const category of ['marketing', 'measurement'] as const) {
			const sw = document.querySelector<HTMLButtonElement>(
				`[data-testid="consent-widget-switch-${category}"]`
			);
			const notice = document.querySelector<HTMLElement>(
				`[data-testid="consent-widget-restriction-${category}"]`
			);
			expect(sw).not.toBeNull();
			expect(notice).not.toBeNull();
			expect(sw?.disabled).toBe(true);
			expect(sw?.getAttribute('aria-checked')).toBe('false');
			expect(sw?.getAttribute('aria-describedby')).toBe(notice?.id);
			expect(notice?.textContent).toContain('Global Privacy Control');

			// Pointer and keyboard attempts leave the switch off.
			sw?.click();
			sw?.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: ' ' })
			);
			sw?.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
			);
			expect(sw?.getAttribute('aria-checked')).toBe('false');
		}

		expect(
			document.querySelector(
				'[data-testid="consent-widget-restriction-functionality"]'
			)
		).toBeNull();

		// Untouched save does not grant locked categories.
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(
				kernel.getSnapshot().explicitChoice?.categories.marketing?.value
			).toBe(false);
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);

		// Accept all grants unlocked categories without granting locked ones.
		await page.getByTestId('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().effectivePermissions.functionality).toBe(
				true
			);
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).not.toBe(true);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.measurement?.value
		).not.toBe(true);

		unmount();
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: testing({ policy: [OPT_OUT_RULE] }),
					persistence: false,
					prefetch: {
						...fixture,
						initialRecords: {
							optOut: {
								heldBy: 'person',
								method: 'button',
								recordedAt: now - 1000,
								rights: ['sale', 'share'],
							},
						},
						now,
					},
				}}
			>
				<Capture />
				<ConsentWidget />
			</InthProvider>
		);

		await expect
			.element(page.getByTestId('consent-widget-opt-out-status'))
			.toHaveTextContent('Opt-out request honored');
		await expect
			.element(page.getByTestId('opt-out-hook'))
			.toHaveTextContent('"lock":"held-by-account"');

		const marketing = page.getByTestId('consent-widget-switch-marketing');
		const notice = document.querySelector<HTMLElement>(
			'[data-testid="consent-widget-restriction-marketing"]'
		);
		expect(notice).not.toBeNull();
		expect(notice?.textContent).toContain('account');
		await expect.element(marketing).not.toBeDisabled();
		await expect.element(marketing).toHaveAttribute('aria-checked', 'false');
		await expect
			.element(marketing)
			.toHaveAttribute('aria-describedby', notice?.id ?? '');

		// The switch stays usable and stages a toggle on.
		await marketing.click();
		await expect.element(marketing).toHaveAttribute('aria-checked', 'true');
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		unmount();
	});
});
