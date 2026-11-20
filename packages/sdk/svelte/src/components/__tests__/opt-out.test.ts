import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, test } from 'vitest';

import WidgetFixture from '../../__tests__/fixtures/widget-fixture.svelte';
import { policyFixture } from '../../__tests__/policy-fixture';
import { testOffline } from '../../__tests__/test-offline';
import type { ConsentContextValue } from '../../lib/context.svelte';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'svelte-us-opt-out',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const part = <ElementType extends HTMLElement = HTMLElement>(testId: string) =>
	document.querySelector<ElementType>(`[data-testid="${testId}"]`);

describe('Svelte consent widget opt-out parity', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on opt-in save', async () => {
		const fixture = policyFixture(
			{ functionality: true, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		render(WidgetFixture, {
			capture: (value) => {
				context = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
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
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(status.classList).toContain('brand-opt-out-status');
		expect(context.state.optOutState).toMatchObject({
			honored: true,
			lock: null,
			via: 'request',
		});

		const marketing = part<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const measurement = part<HTMLButtonElement>(
			'consent-widget-switch-measurement'
		);
		const functionality = part<HTMLButtonElement>(
			'consent-widget-switch-functionality'
		);
		expect(marketing?.getAttribute('aria-checked')).toBe('false');
		expect(marketing?.disabled).toBe(false);
		expect(measurement?.getAttribute('aria-checked')).toBe('false');
		expect(functionality?.getAttribute('aria-checked')).toBe('true');
		expect(part('consent-widget-restriction-marketing')).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.explicitChoice?.categories.marketing?.value).toBe(
				false
			);
		});
		expect(context.snapshot.optOut).not.toBeNull();
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);

		// Turning measurement on while marketing stays off keeps the opt-out and lets measurement stand.
		expect(measurement?.disabled).toBe(false);
		await fireEvent.click(measurement as Element);
		await waitFor(() => {
			expect(measurement?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.effectivePermissions.measurement).toBe(true);
		});
		expect(context.snapshot.optOut).not.toBeNull();
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);

		// Turning marketing on and saving lifts the device opt-out.
		await fireEvent.click(marketing as Element);
		await waitFor(() => {
			expect(marketing?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.optOut).toBeNull();
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(true);
		expect(part('consent-widget-opt-out-status')).toBeNull();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const fixture = policyFixture(
			{ functionality: false, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		render(WidgetFixture, {
			capture: (value) => {
				context = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
				overrides: { gpc: true },
				persistence: false,
				prefetch: {
					...fixture,
					initialOverrides: { gpc: true },
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
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(context.state.optOutState.lock).toBe('gpc-active');

		await Promise.all(
			(['marketing', 'measurement'] as const).map(async (category) => {
				const sw = part<HTMLButtonElement>(`consent-widget-switch-${category}`);
				const notice = part(`consent-widget-restriction-${category}`);
				expect(sw?.disabled).toBe(true);
				expect(sw?.getAttribute('aria-checked')).toBe('false');
				expect(sw?.getAttribute('aria-describedby')).toBe(notice?.id);
				expect(notice?.textContent).toContain('Global Privacy Control');

				await fireEvent.click(sw as Element);
				await fireEvent.keyDown(sw as Element, { key: ' ' });
				await fireEvent.keyDown(sw as Element, { key: 'Enter' });
				expect(sw?.getAttribute('aria-checked')).toBe('false');
			})
		);

		expect(part('consent-widget-restriction-functionality')).toBeNull();

		// Untouched save does not grant locked categories.
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.explicitChoice?.categories.marketing?.value).toBe(
				false
			);
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.effectivePermissions.measurement).toBe(false);

		// Accept all grants unlocked categories without granting locked ones.
		await fireEvent.click(
			part('consent-widget-footer-accept-all-button') as Element
		);
		await waitFor(() => {
			expect(context.snapshot.effectivePermissions.functionality).toBe(true);
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.effectivePermissions.measurement).toBe(false);
		expect(
			context.snapshot.explicitChoice?.categories.marketing?.value
		).not.toBe(true);
		expect(
			context.snapshot.explicitChoice?.categories.measurement?.value
		).not.toBe(true);
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		render(WidgetFixture, {
			capture: (value) => {
				context = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
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
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(context.state.optOutState.lock).toBe('held-by-account');

		const marketing = part<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const notice = part('consent-widget-restriction-marketing');
		expect(marketing?.disabled).toBe(false);
		expect(marketing?.getAttribute('aria-checked')).toBe('false');
		expect(marketing?.getAttribute('aria-describedby')).toBe(notice?.id);
		expect(notice?.textContent).toContain('account');
		expect(part('consent-widget-restriction-measurement')).toBeNull();

		await fireEvent.click(marketing as Element);
		await waitFor(() => {
			expect(marketing?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.optOut?.heldBy).toBe('person');
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
	});
});
