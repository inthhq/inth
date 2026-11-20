import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager, provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentWidget } from '@inth/angular/consent-widget';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	resolvePolicyRules,
} from '@inth/sdk/schema/types';
import type { PolicyRule } from '@inth/sdk/schema/types';
import { afterEach, describe, expect, test } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'angular-us-opt-out',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
};
const RESOLUTION = resolvePolicyRules({
	countryCode: 'US',
	regionCode: 'CA',
	rules: [OPT_OUT_RULE],
});

const choiceRecord = (values: Record<string, boolean>, confirmedAt: number) => {
	const basis = {
		fingerprint: createPolicyRuleFingerprints(normalizePolicyRule(OPT_OUT_RULE))
			.choice,
		kind: 'choice-v1' as const,
	};
	return {
		categories: Object.fromEntries(
			Object.entries(values).map(([category, value]) => [
				category,
				{ basis, confirmedAt, value },
			])
		),
		version: 3 as const,
	};
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'test-opt-out-widget-host',
	template: '<inth-consent-widget />',
})
class WidgetHost {}

afterEach(() => {
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

const boot = async (options: Partial<InthProviderOptions>) => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: offlineMode([OPT_OUT_RULE]),
				persistence: false,
				...options,
			} as InthProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(WidgetHost);
	await fixture.whenStable();
	fixture.detectChanges();
	return { consent: TestBed.inject(ConsentManager), fixture };
};

const part = <ElementType extends HTMLElement = HTMLElement>(
	root: HTMLElement,
	testId: string
) => root.querySelector<ElementType>(`[data-testid="${testId}"]`);

/** The element with `testId`, which the test expects to be rendered. */
const required = <ElementType extends HTMLElement = HTMLElement>(
	root: HTMLElement,
	testId: string
): ElementType => {
	const element = part<ElementType>(root, testId);
	expect.assert(element, `${testId} is not rendered`);
	return element;
};

describe('Angular consent widget opt-out parity', () => {
	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on opt-in save', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			prefetch: {
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					choice: choiceRecord(
						{ functionality: true, marketing: true, measurement: true },
						now - 2000
					),
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
		});
		const root = fixture.nativeElement as HTMLElement;

		const status = required(root, 'consent-widget-opt-out-status');
		expect(status).not.toBeNull();
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(status.classList).toContain('brand-opt-out-status');
		expect(consent.optOutState()).toMatchObject({
			honored: true,
			lock: null,
			via: 'request',
		});

		const marketing = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-marketing'
		);
		const measurement = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-measurement'
		);
		const functionality = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-functionality'
		);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.disabled).toBe(false);
		expect(measurement.getAttribute('aria-checked')).toBe('false');
		expect(functionality.getAttribute('aria-checked')).toBe('true');
		expect(part(root, 'consent-widget-restriction-marketing')).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).toBe(false);

		// Turning measurement on while marketing stays off keeps the opt-out and lets measurement stand.
		expect(measurement?.disabled).toBe(false);
		measurement?.click();
		fixture.detectChanges();
		expect(measurement?.getAttribute('aria-checked')).toBe('true');
		part(root, 'consent-widget-footer-save-button')?.click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(true);

		// Turning marketing on and saving lifts the device opt-out.
		marketing.click();
		fixture.detectChanges();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()).toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(true);
		expect(part(root, 'consent-widget-opt-out-status')).toBeNull();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			overrides: { gpc: true },
			prefetch: {
				initialOverrides: { gpc: true },
				initialPolicyResolution: RESOLUTION,
				initialPrivacySignals: { gpc: true },
				initialRecords: {
					choice: choiceRecord(
						{ functionality: false, marketing: true, measurement: true },
						now - 2000
					),
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
				},
				now,
			},
		});
		const root = fixture.nativeElement as HTMLElement;

		const status = required(root, 'consent-widget-opt-out-status');
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(consent.optOutState().lock).toBe('gpc-active');

		for (const category of ['marketing', 'measurement'] as const) {
			const sw = required<HTMLButtonElement>(
				root,
				`consent-widget-switch-${category}`
			);
			const notice = required(root, `consent-widget-restriction-${category}`);
			expect(sw.disabled).toBe(true);
			expect(sw.getAttribute('aria-checked')).toBe('false');
			expect(sw.getAttribute('aria-describedby')).toBe(notice.id);
			expect(notice.textContent).toContain('Global Privacy Control');

			sw.click();
			sw.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: ' ' })
			);
			sw.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
			);
			fixture.detectChanges();
			expect(sw.getAttribute('aria-checked')).toBe('false');
		}

		expect(part(root, 'consent-widget-restriction-functionality')).toBeNull();

		// Untouched save does not grant locked categories.
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).not.toBe(
			true
		);

		// Accept all grants unlocked categories without granting locked ones.
		required(root, 'consent-widget-footer-accept-all-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.effectivePermissions().functionality).toBe(true);
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).not.toBe(
			true
		);
		expect(consent.explicitChoice()?.categories.measurement?.value).not.toBe(
			true
		);
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			prefetch: {
				initialPolicyResolution: RESOLUTION,
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
		});
		const root = fixture.nativeElement as HTMLElement;

		expect(
			required(root, 'consent-widget-opt-out-status').textContent?.trim()
		).toBe('Opt-out request honored');
		expect(consent.optOutState().lock).toBe('held-by-account');

		const marketing = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-marketing'
		);
		const notice = required(root, 'consent-widget-restriction-marketing');
		expect(marketing.disabled).toBe(false);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.getAttribute('aria-describedby')).toBe(notice.id);
		expect(notice.textContent).toContain('account');
		expect(part(root, 'consent-widget-restriction-measurement')).toBeNull();

		marketing.click();
		fixture.detectChanges();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()?.heldBy).toBe('person');
		expect(consent.effectivePermissions().marketing).toBe(false);
	});
});
