import type * as Engine from '@inth/sdk/engine';
import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk/engine';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { translations as enTranslations } from '@inth/sdk/translations/en';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import type { Component, ComponentPublicInstance } from 'vue';

import {
	ConsentBanner,
	ConsentDialogLink,
	ConsentDialogTrigger,
	ConsentManager,
	OptOutConfirmation,
	useOptOut,
} from '../index';
import { consentConfigKey } from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';
import type { VueConsentKernelContext } from './test-kernel';

const reload = vi.hoisted(() => vi.fn());
// oxlint-disable-next-line anti-slop/no-module-mocking -- jsdom cannot perform navigation on `window.location.reload`. The factory returns the real module and records the reload instead.
vi.mock('@inth/sdk/engine', async (importOriginal) => {
	const actual = await importOriginal<typeof Engine>();
	return {
		...actual,
		watchRevocationReload: (options: Engine.RevocationReloadOptions) =>
			actual.watchRevocationReload({ ...options, reload }),
	};
});

const query = <Element extends HTMLElement>(testId: string) =>
	document.querySelector<Element>(`[data-testid="${testId}"]`);

const noticeRule = (): PolicyRule => ({
	...policyRulePresets.usPrivacyStatesOptOut(),
	prompt: 'notice',
});

const buildInit = function buildInit(
	rule: PolicyRule,
	location: { countryCode: string | null; regionCode: string | null } = {
		countryCode: 'US',
		regionCode: 'CA',
	}
): InitOutput {
	return {
		branding: 'inth',
		location,
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({
				countryCode: location.countryCode,
				regionCode: location.regionCode,
				rules: [rule],
			})
		),
		translations: { language: 'en', translations: enTranslations },
	} as InitOutput;
};

let mounted: {
	context: VueConsentKernelContext;
	wrapper: VueWrapper<ComponentPublicInstance>;
} | null = null;

const mockFetch = function mockFetch(): typeof fetch {
	return vi.fn(
		() =>
			new Response(JSON.stringify({ ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
	) as unknown as typeof fetch;
};

const mountTree = async function mountTree(
	component: Component,
	options: {
		rule?: PolicyRule;
		location?: { countryCode: string | null; regionCode: string | null };
		gpc?: boolean;
		optOutLink?: Engine.OptOutLinkVariant;
		config?: Partial<ConsentConfig>;
		start?: boolean;
	} = {}
) {
	const rule = options.rule ?? noticeRule();
	const base = {
		consentCategories: [
			'necessary',
			'functionality',
			'marketing',
			'measurement',
		],
		customFetch: mockFetch(),
		disableAnimation: true,
		domain: 'consent.example',
		hideBranding: true,
		presentation: options.optOutLink
			? { optOutLink: options.optOutLink }
			: undefined,
		projectUrl: 'https://consent.example',
		reloadOnConsentRevoked: false,
	} as ConsentConfig & { overrides?: { gpc: boolean } };
	if (options.gpc) {
		base.overrides = { gpc: true };
	}
	const config: ConsentConfig = { ...base, ...options.config };
	const context = createVueConsentKernelContext({
		config,
		prefetch: buildInit(rule, options.location),
	});
	if (options.gpc) {
		context.kernel.set.privacySignals({ gpc: true });
	}
	if (options.start) {
		context.start();
	}
	const wrapper = mount(component, {
		attachTo: document.body,
		global: {
			provide: {
				[consentConfigKey as symbol]: config,
				[symbolKernelContext as symbol]: context,
				[symbolKernel as symbol]: context.kernel,
				[symbolSnapshot as symbol]: context.snapshot,
				[symbolInit as symbol]: context.init,
				[symbolActiveUI as symbol]: context.activeUI,
				[symbolConsent as symbol]: context.storedConsent,
			},
		},
	});
	await flushPromises();
	mounted = { context, wrapper };
	return context;
};

const unmountCurrent = async function unmountCurrent(): Promise<void> {
	if (!mounted) {
		return;
	}
	const current = mounted;
	mounted = null;
	closeOptOutConfirmation(current.context.kernel);
	const { element } = current.wrapper;
	current.wrapper.unmount();
	element?.remove();
	current.context.dispose();
	await flushPromises();
};

afterEach(async () => {
	await unmountCurrent();
	reload.mockClear();
	localStorage.clear();
	sessionStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	document.body.innerHTML = '';
});

describe('one-step opt-out and confirmation view in Vue', () => {
	test('opts out in one click from the banner link and opens confirmation with one button', async () => {
		const context = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentBanner, { disableAnimation: true }),
					h(ConsentManager, { disableAnimation: true }),
				],
			})
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		const optOutLink = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(optOutLink.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(optOutLink.querySelector('svg')).toBeNull();

		optOutLink.click();
		await flushPromises();

		const snapshot = context.kernel.getSnapshot();
		expect(snapshot.optOut?.method).toBe('button');
		expect(snapshot.effectivePermissions.marketing).toBe(false);
		expect(snapshot.effectivePermissions.measurement).toBe(false);
		expect(snapshot.effectivePermissions.functionality).toBe(true);
		expect(query('consent-dialog-root')).toBeNull();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		const root = query('opt-out-confirmation-root') as HTMLElement;
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const status = query('opt-out-confirmation-status');
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent?.trim()).toBe('Opt-out request honored');
		expect(query('opt-out-confirmation-description')?.textContent).toContain(
			'not sell or share'
		);
		const buttons = [...root.querySelectorAll('button')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent?.trim()).toBe('Done');
		expect(
			query('opt-out-confirmation-preferences-link')?.textContent?.trim()
		).toBe('Manage preferences');
	});

	test('Done closes and restores focus, Escape closes, preferences link opens dialog, and re-opening records nothing new', async () => {
		const context = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentDialogLink, { right: 'opt-out' }),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{ rule: policyRulePresets.usPrivacyStatesOptOut() }
		);

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		const link = query<HTMLButtonElement>(
			'consent-dialog-link'
		) as HTMLButtonElement;
		link.focus();
		expect(document.activeElement).toBe(link);
		link.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-done-button')).not.toBeNull()
		);
		expect(context.kernel.getSnapshot().optOut?.method).toBe('button');

		query<HTMLButtonElement>('opt-out-confirmation-done-button')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Re-opening when already opted out records nothing new.
		const recordedAt = context.kernel.getSnapshot().optOut?.recordedAt;
		const onRecorded = vi.fn();
		context.kernel.events.on('opt-out:recorded', onRecorded);

		link.focus();
		link.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(context.kernel.getSnapshot().optOut?.recordedAt).toBe(recordedAt);

		// Escape closes and returns focus.
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Preferences link opens full preference center.
		link.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-preferences-link')).not.toBeNull()
		);
		query<HTMLAnchorElement>('opt-out-confirmation-preferences-link')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
	});

	test('shows GPC signal wording when opted out via Global Privacy Control', async () => {
		const CustomButton = defineComponent({
			setup() {
				const optOut = useOptOut();
				return () =>
					h(
						'button',
						{
							'data-testid': 'custom-opt-out',
							onClick: () => {
								void optOut();
							},
							type: 'button',
						},
						'Opt out'
					);
			},
		});

		const context = await mountTree(
			defineComponent({
				render: () => [
					h(CustomButton),
					h(OptOutConfirmation, { disableAnimation: true }),
				],
			}),
			{ gpc: true, optOutLink: 'privacy-choices', start: true }
		);

		expect(context.kernel.getSnapshot().optOut?.method).toBe('gpc');
		const onRecorded = vi.fn();
		context.kernel.events.on('opt-out:recorded', onRecorded);

		query<HTMLButtonElement>('custom-opt-out')?.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Your Privacy Choices'
		);
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
	});

	test('falls back to opening preferences under a non-opt-out rule', async () => {
		const context = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentDialogLink, { right: 'opt-out' }),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{
				location: { countryCode: 'DE', regionCode: null },
				rule: policyRulePresets.europeOptIn(),
			}
		);

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		query<HTMLButtonElement>('consent-dialog-link')?.click();
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().optOut).toBeNull();
	});

	test.each([
		['do-not-sell', 'Do Not Sell or Share My Personal Information', false],
		['privacy-choices', 'Your Privacy Choices', true],
		['california-privacy-choices', 'Your California Privacy Choices', true],
	] as [Engine.OptOutLinkVariant, string, boolean][])(
		'renders optOutLink=%s with exact title and icon=%s',
		async (optOutLink, expectedTitle, expectIcon) => {
			await mountTree(
				defineComponent({
					render: () => [
						h(ConsentBanner, { disableAnimation: true }),
						h(ConsentDialogLink, { right: 'opt-out' }),
					],
				}),
				{ optOutLink }
			);

			await vi.waitFor(() =>
				expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
			);
			const bannerLink = query('consent-banner-right-link-opt-out');
			const dialogLink = query('consent-dialog-link');

			expect(bannerLink?.textContent?.trim()).toBe(expectedTitle);
			expect(dialogLink?.textContent?.trim()).toBe(expectedTitle);
			expect(
				Boolean(bannerLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(
				Boolean(dialogLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(Boolean(bannerLink?.querySelector('svg'))).toBe(expectIcon);
			expect(Boolean(dialogLink?.querySelector('svg'))).toBe(expectIcon);
		}
	);

	test('wires the floating trigger to opt out and hides it while confirmation is open', async () => {
		const context = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentDialogTrigger),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{
				config: { triggerShowWhen: 'always' },
				rule: policyRulePresets.usPrivacyStatesOptOut(),
			}
		);

		await vi.waitFor(() =>
			expect(query('consent-dialog-trigger')).not.toBeNull()
		);
		const trigger = query<HTMLButtonElement>(
			'consent-dialog-trigger'
		) as HTMLButtonElement;
		expect(trigger.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);

		trigger.click();
		await flushPromises();
		expect(context.kernel.getSnapshot().optOut?.method).toBe('button');
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('consent-dialog-trigger')).toBeNull();

		query<HTMLButtonElement>('opt-out-confirmation-done-button')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() =>
			expect(query('consent-dialog-trigger')).not.toBeNull()
		);
	});

	test('useOptOut triggers opt-out and binds all theme slots on OptOutConfirmation', async () => {
		const CustomButton = defineComponent({
			setup() {
				const optOut = useOptOut();
				return () =>
					h(
						'button',
						{
							'data-testid': 'custom-opt-out',
							onClick: () => {
								void optOut();
							},
							type: 'button',
						},
						'Opt out'
					);
			},
		});

		await mountTree(
			defineComponent({
				render: () => [
					h(CustomButton),
					h(ConsentManager, { disableAnimation: true }),
					h(OptOutConfirmation, { disableAnimation: true }),
				],
			}),
			{
				config: {
					theme: {
						slots: {
							optOutConfirmation: 'slot-root',
							optOutConfirmationCard: 'slot-card',
							optOutConfirmationDescription: 'slot-description',
							optOutConfirmationDoneButton: 'slot-done',
							optOutConfirmationFooter: 'slot-footer',
							optOutConfirmationHeader: 'slot-header',
							optOutConfirmationOverlay: 'slot-overlay',
							optOutConfirmationPreferencesLink: 'slot-prefs',
							optOutConfirmationStatus: 'slot-status',
							optOutConfirmationTitle: 'slot-title',
						},
					},
				},
			}
		);

		query<HTMLButtonElement>('custom-opt-out')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(
			document.querySelectorAll('[data-testid="opt-out-confirmation-root"]')
		).toHaveLength(1);
		expect(
			query('opt-out-confirmation-root')?.classList.contains('slot-root')
		).toBe(true);
		expect(
			query('opt-out-confirmation-card')?.classList.contains('slot-card')
		).toBe(true);
		expect(
			query('opt-out-confirmation-header')?.classList.contains('slot-header')
		).toBe(true);
		expect(
			query('opt-out-confirmation-title')?.classList.contains('slot-title')
		).toBe(true);
		expect(
			query('opt-out-confirmation-status')?.classList.contains('slot-status')
		).toBe(true);
		expect(
			query('opt-out-confirmation-description')?.classList.contains(
				'slot-description'
			)
		).toBe(true);
		expect(
			query('opt-out-confirmation-footer')?.classList.contains('slot-footer')
		).toBe(true);
		expect(
			query('opt-out-confirmation-done-button')?.classList.contains('slot-done')
		).toBe(true);
		expect(
			query('opt-out-confirmation-preferences-link')?.classList.contains(
				'slot-prefs'
			)
		).toBe(true);
		expect(
			query('opt-out-confirmation-overlay')?.classList.contains('slot-overlay')
		).toBe(true);
	});

	test('replays an early tap on the opt-out link as a durable opt-out', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<div data-testid="consent-banner-root" data-model="opt-out" data-prompt="notice"><button type="button" data-action="right" data-right="opt-out">Do Not Sell or Share My Personal Information</button></div>';
		document.body.append(container);
		// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		container
			.querySelector<HTMLButtonElement>('[data-right="opt-out"]')
			?.click();
		container.remove();

		const context = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentBanner, { disableAnimation: true }),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{ start: true }
		);

		await vi.waitFor(() =>
			expect(context.kernel.getSnapshot().optOut?.method).toBe('button')
		);
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(context.kernel.getSnapshot().effectivePermissions.measurement).toBe(
			false
		);
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
	});

	test('defers confirmation across a revocation reload, shows it once on the next load, and not on the load after that', async () => {
		const onBeforeReload = vi.fn();
		const first = await mountTree(
			defineComponent({
				render: () => [
					h(ConsentBanner, { disableAnimation: true }),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{
				config: {
					callbacks: { onBeforeConsentRevocationReload: onBeforeReload },
					reloadOnConsentRevoked: true,
				},
				start: true,
			}
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();

		// Does not flash on the old document before reload.
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');
		await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(query('opt-out-confirmation-root')).toBeNull();

		const recorded = first.kernel.getSnapshot().optOut;
		expect(recorded).not.toBeNull();

		// Tear down the first document mount before simulating the reload.
		await unmountCurrent();
		reload.mockClear();

		// Next load after reload: opens once with the honored status, clears the
		// marker, records nothing again, and does not reload again.
		const second = await mountTree(
			defineComponent({
				render: () => [h(ConsentManager, { disableAnimation: true })],
			}),
			{
				config: {
					initialRecords: { optOut: recorded ?? undefined },
					reloadOnConsentRevoked: true,
				},
				start: true,
			}
		);
		const onRecorded = vi.fn();
		second.kernel.events.on('opt-out:recorded', onRecorded);

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out request honored'
		);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		expect(onRecorded).not.toHaveBeenCalled();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();

		await unmountCurrent();

		// Load after that: marker is cleared, so confirmation does not reopen.
		await mountTree(
			defineComponent({
				render: () => [h(ConsentManager, { disableAnimation: true })],
			}),
			{
				config: {
					initialRecords: { optOut: recorded ?? undefined },
					reloadOnConsentRevoked: true,
				},
				start: true,
			}
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(query('opt-out-confirmation-root')).toBeNull();
	});

	test.each(['privacy-choices', 'california-privacy-choices'] as const)(
		'opens the dialog and records nothing from banner link, footer link and trigger when optOutLink=%s',
		async (optOutLink) => {
			const context = await mountTree(
				defineComponent({
					render: () => [
						h(ConsentBanner, { disableAnimation: true }),
						h(ConsentDialogLink, { right: 'opt-out' }),
						h(ConsentDialogTrigger),
						h(ConsentManager, { disableAnimation: true }),
					],
				}),
				{
					config: { triggerShowWhen: 'always' },
					optOutLink,
				}
			);

			await vi.waitFor(() =>
				expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
			);
			query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();
			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(context.kernel.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			context.kernel.set.activeUI('none');
			await vi.waitFor(() => expect(query('consent-dialog-root')).toBeNull());

			query<HTMLButtonElement>('consent-dialog-link')?.click();
			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(context.kernel.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			context.kernel.set.activeUI('none');
			await vi.waitFor(() =>
				expect(query('consent-dialog-trigger')).not.toBeNull()
			);

			query<HTMLButtonElement>('consent-dialog-trigger')?.click();
			await vi.waitFor(() =>
				expect(query('consent-dialog-root')).not.toBeNull()
			);
			expect(context.kernel.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();
		}
	);

	test('keeps useOptOut opting out in one step even when optOutLink is privacy-choices', async () => {
		const CustomButton = defineComponent({
			setup() {
				const optOut = useOptOut();
				return () =>
					h(
						'button',
						{
							'data-testid': 'custom-opt-out',
							onClick: () => {
								void optOut();
							},
							type: 'button',
						},
						'Opt out'
					);
			},
		});

		const context = await mountTree(
			defineComponent({
				render: () => [
					h(CustomButton),
					h(ConsentManager, { disableAnimation: true }),
				],
			}),
			{ optOutLink: 'privacy-choices' }
		);

		query<HTMLButtonElement>('custom-opt-out')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(context.kernel.getSnapshot().optOut?.method).toBe('button');
		expect(query('consent-dialog-root')).toBeNull();
	});
});
