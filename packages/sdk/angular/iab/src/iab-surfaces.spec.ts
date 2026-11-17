/**
 * The IAB banner and dialog in a real application: saving, failure and
 * retry, Google Additional Consent, and the blanket actions.
 */
import { createConsentKernel, deferInitGvl } from '@c15t/core';
import type { ConsentKernel } from '@c15t/core';
import { createIAB } from '@c15t/iab';
import { resolvePolicyRules } from '@c15t/schema/types';
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { decodeTCString } from '../../../iab/src/tcf/tc-string';
import { bootClient } from '../../src/__tests__/conformance-app';
import { transportMode } from '../../src/__tests__/fixtures/transport-mode';
import { settle } from '../../src/__tests__/test-local';
import type { C15tProviderOptions } from '../../src/lib/core/options';
import { IABConsentBanner } from './iab-consent-banner';
import { IABConsentDialog } from './iab-consent-dialog';

type Surface = 'iab-consent-banner' | 'iab-consent-dialog';

const iabPolicy = () =>
	resolvePolicyRules({
		countryCode: 'DE',
		regionCode: null,
		rules: [
			{ id: 'iab', match: { isDefault: true }, model: 'iab', prompt: 'choice' },
		],
	});

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
	document.body.replaceChildren();
});

/** Boot the surface, as the conformance fixture does. */
const boot = async (surface: Surface, options: C15tProviderOptions) => {
	const container = document.createElement('div');
	document.body.append(container);
	const app = await bootClient(
		container,
		{ disableAnimation: true, persistence: false, ...options },
		{
			entries: [
				surface === 'iab-consent-banner'
					? { component: IABConsentBanner }
					: { component: IABConsentDialog, inputs: { open: true } },
			],
		}
	);
	onTestFinished(() => {
		app.destroy();
		container.remove();
	});
	const kernel = (): ConsentKernel => app.consent.kernel();
	return { app, kernel };
};

const query = (selector: string) =>
	document.querySelector<HTMLButtonElement>(selector);

const actionButton = (surface: Surface, action: string) =>
	query(
		surface === 'iab-consent-banner'
			? `[data-testid="iab-consent-banner-${action}-button"]`
			: `[data-testid="iab-consent-dialog-root"] [data-action="${action}"]`
	);

describe('deferred vendor list', () => {
	test.each(
		(['iab-consent-banner', 'iab-consent-dialog'] as const).flatMap((surface) =>
			(['accept', 'reject'] as const).map((action) => ({ action, surface }))
		)
	)(
		'restores $surface after a deferred $action fails and allows a retry',
		async ({ action, surface }) => {
			let rejectLoad!: (error: Error) => void;
			const fetch = vi
				.fn()
				.mockImplementationOnce(
					() =>
						// oxlint-disable-next-line promise/avoid-new -- The test rejects the load by hand.
						new Promise<Response>((_resolve, reject) => {
							rejectLoad = reject;
						})
				)
				.mockImplementation(() => Promise.resolve(Response.json(completeGVL)));
			vi.stubGlobal('fetch', fetch);
			const { kernel } = await boot(surface, {
				iab: { cmpId: 28 },
				mode: transportMode({}),
				prefetch: {
					initialIab: {
						cmpId: 28,
						enabled: true,
						...deferInitGvl({ gvl: completeGVL }, '/vendor-list'),
					},
					initialPolicyResolution: iabPolicy(),
				},
			});
			await vi.waitFor(() => {
				expect(fetch).toHaveBeenCalledTimes(1);
				expect(actionButton(surface, action)?.disabled).toBe(false);
			});
			if (surface === 'iab-consent-dialog') {
				kernel().set.activeUI('dialog');
			}
			actionButton(surface, action)?.click();
			// The surface closes on the click and comes back because the vendor
			// list failed before anything was recorded.
			expect(kernel().getSnapshot().activeUI).toBe('none');
			rejectLoad(new Error('offline'));
			await settle();
			expect(kernel().getSnapshot().activeUI).toBe(
				surface === 'iab-consent-banner' ? 'banner' : 'dialog'
			);
			expect(kernel().getSnapshot().iab?.authority).toBeNull();
			await vi.waitFor(() =>
				expect(actionButton(surface, action)).not.toBeNull()
			);
			actionButton(surface, action)?.click();
			await vi.waitFor(() =>
				expect(kernel().getSnapshot().iab?.authority?.tcString).toBeTruthy()
			);
			expect(kernel().getSnapshot().activeUI).toBe('none');
			expect(fetch).toHaveBeenCalledTimes(2);
		}
	);

	test.each(['iab-consent-banner', 'iab-consent-dialog'] as const)(
		'a slow %s save does not close a reopened dialog',
		async (surface) => {
			let finish!: () => void;
			const save = vi.fn(async () => {
				// oxlint-disable-next-line promise/avoid-new -- The test finishes the save by hand.
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
				return { ok: true };
			});
			const { kernel } = await boot(surface, {
				iab: { cmpId: 28, gvl: completeGVL },
				mode: transportMode({ save }),
				prefetch: { initialPolicyResolution: iabPolicy() },
			});
			await vi.waitFor(() =>
				expect(actionButton(surface, 'accept')).not.toBeNull()
			);
			actionButton(surface, 'accept')?.click();
			await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
			kernel().set.activeUI('none');
			kernel().set.activeUI('dialog');
			finish();
			await settle();
			expect(kernel().getSnapshot().activeUI).toBe('dialog');
		}
	);

	test('closing a reopened dialog supersedes a pending deferred save', async () => {
		let rejectLoad!: (error: Error) => void;
		const fetch = vi.fn(
			() =>
				// oxlint-disable-next-line promise/avoid-new -- The test rejects the load by hand.
				new Promise<Response>((_resolve, reject) => {
					rejectLoad = reject;
				})
		);
		vi.stubGlobal('fetch', fetch);
		const { kernel } = await boot('iab-consent-dialog', {
			iab: { cmpId: 28 },
			mode: transportMode({}),
			prefetch: {
				initialIab: {
					cmpId: 28,
					enabled: true,
					...deferInitGvl({ gvl: completeGVL }, '/vendor-list'),
				},
				initialPolicyResolution: iabPolicy(),
			},
		});
		const accept = () => actionButton('iab-consent-dialog', 'accept');
		await vi.waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(accept()?.disabled).toBe(false);
		});
		kernel().set.activeUI('dialog');
		accept()?.click();
		expect(kernel().getSnapshot().activeUI).toBe('none');
		// The visitor reopens the dialog and closes it while the vendor list
		// is still loading.
		kernel().set.activeUI('dialog');
		await vi.waitFor(() =>
			expect(query('[data-testid="iab-consent-dialog-close"]')).not.toBeNull()
		);
		query('[data-testid="iab-consent-dialog-close"]')?.click();
		// Nothing is recorded yet, so closing the dialog leaves the owed banner.
		expect(kernel().getSnapshot().activeUI).toBe('banner');
		rejectLoad(new Error('offline'));
		await settle();
		// The failed save does not bring the dialog back over the banner.
		expect(kernel().getSnapshot().activeUI).toBe('banner');
	});
});

describe('Google Additional Consent', () => {
	const adTechProviders = [
		{
			id: 89,
			name: 'Example Ad Tech',
			policyUrl: 'https://ads.example/privacy',
		},
		{ id: 2577, name: 'Other Ad Tech', policyUrl: 'https://other.example/p' },
	];

	test('a provider switch in the dialog writes the CMP selection and saving encodes it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve(
					Response.json({
						providers: Object.fromEntries(
							adTechProviders.map((provider) => [String(provider.id), provider])
						),
					})
				)
			)
		);
		const { kernel } = await boot('iab-consent-dialog', {
			iab: {
				additionalConsent: {
					providers: adTechProviders.map(({ id }) => id),
					url: 'https://lists.example/ac',
				},
				cmpId: 28,
				gvl: completeGVL,
			},
			mode: transportMode({}),
			prefetch: { initialPolicyResolution: iabPolicy() },
		});
		const providerSwitch = (id: number) =>
			query(`[id$="-ad-tech-provider-${id}"] [role="switch"]`);

		await vi.waitFor(() =>
			expect(kernel().getSnapshot().iab?.adTechProviders).toHaveLength(2)
		);
		kernel().set.activeUI('dialog');

		const vendorsTab = () =>
			[...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
				(tab) => tab.textContent?.includes('Vendors')
			);
		await vi.waitFor(() => expect(vendorsTab()).toBeDefined());
		vendorsTab()?.click();
		await vi.waitFor(() => expect(providerSwitch(89)).not.toBeNull());

		providerSwitch(89)?.click();
		await vi.waitFor(() =>
			expect(kernel().getSnapshot().iab?.adTechProviderConsents?.['89']).toBe(
				true
			)
		);
		await vi.waitFor(() =>
			expect(providerSwitch(89)?.getAttribute('aria-checked')).toBe('true')
		);

		// The AC string lists a provider as consented only with purposes 1, 3
		// and 4. Those switches live under stacks on the purposes tab, so set
		// them on the selection the dialog saves from.
		kernel().set.iab({
			purposeConsents: {
				...kernel().getSnapshot().iab?.purposeConsents,
				1: true,
				3: true,
				4: true,
			},
		});

		actionButton('iab-consent-dialog', 'customize')?.click();
		await vi.waitFor(() =>
			expect(kernel().getSnapshot().iab?.authority?.addtlConsent).toBe(
				'2~89~dv.2577'
			)
		);
	});
});

describe('blanket actions', () => {
	const selectionOf = (kernel: ConsentKernel) => {
		const { iab } = kernel.getSnapshot();
		return {
			purposeConsents: iab?.purposeConsents,
			purposeLegitimateInterests: iab?.purposeLegitimateInterests,
			specialFeatureOptIns: iab?.specialFeatureOptIns,
			vendorConsents: iab?.vendorConsents,
			vendorLegitimateInterests: iab?.vendorLegitimateInterests,
		};
	};

	const decoded = async (tcString: string | null | undefined) => {
		if (!tcString) {
			throw new Error('Expected a TC string');
		}
		const value = await decodeTCString(tcString);
		return {
			purposeConsents: value.purposeConsents,
			purposeLegitimateInterests: value.purposeLegitimateInterests,
			specialFeatureOptIns: value.specialFeatureOptIns,
			vendorConsents: value.vendorConsents,
			vendorLegitimateInterests: value.vendorLegitimateInterests,
		};
	};

	/** What a visitor records by clicking the surface. */
	const recordThroughClick = async (
		surface: Surface,
		action: 'accept' | 'reject'
	) => {
		const { kernel } = await boot(surface, {
			iab: { cmpId: 28, gvl: completeGVL },
			mode: transportMode({}),
			prefetch: { initialPolicyResolution: iabPolicy() },
		});
		await vi.waitFor(() =>
			expect(actionButton(surface, action)?.disabled).toBe(false)
		);
		actionButton(surface, action)?.click();
		await vi.waitFor(() =>
			expect(kernel().getSnapshot().iab?.authority?.tcString).toBeTruthy()
		);
		return {
			selection: selectionOf(kernel()),
			tcString: kernel().getSnapshot().iab?.authority?.tcString,
		};
	};

	/** What the handle records when called directly, as React does. */
	const recordThroughHandle = async (action: 'accept' | 'reject') => {
		const kernel = createConsentKernel({
			initialIab: { cmpId: 28, enabled: true, gvl: completeGVL },
			initialPolicyResolution: iabPolicy(),
		});
		const handle = createIAB({
			cmpId: 28,
			gvl: completeGVL,
			kernel,
			persistence: false,
		});
		onTestFinished(() => {
			handle.dispose();
			kernel.dispose();
		});
		await handle.whenReady();
		if (action === 'accept') {
			handle.acceptAll();
		} else {
			handle.rejectAll();
		}
		await handle.save();
		return {
			selection: selectionOf(kernel),
			tcString: kernel.getSnapshot().iab?.authority?.tcString,
		};
	};

	test.each([
		['iab-consent-banner', 'accept'],
		['iab-consent-banner', 'reject'],
		['iab-consent-dialog', 'accept'],
		['iab-consent-dialog', 'reject'],
	] as const)(
		'%s records %s all exactly as the IAB handle does',
		async (surface, action) => {
			const expected = await recordThroughHandle(action);
			const clicked = await recordThroughClick(surface, action);

			expect(clicked.selection).toEqual(expected.selection);
			expect(await decoded(clicked.tcString)).toEqual(
				await decoded(expected.tcString)
			);
		}
	);

	test.each(['iab-consent-banner', 'iab-consent-dialog'] as const)(
		'reject all on %s refuses Purpose 1',
		async (surface) => {
			const clicked = await recordThroughClick(surface, 'reject');
			expect(clicked.selection.purposeConsents?.[1]).toBe(false);
			const choices = await decoded(clicked.tcString);
			expect(Object.values(choices.purposeConsents)).not.toContain(true);
			expect(Object.values(choices.vendorConsents)).not.toContain(true);
		}
	);
});

describe('banner to dialog', () => {
	const bootPair = async () => {
		const container = document.createElement('div');
		document.body.append(container);
		const app = await bootClient(
			container,
			{
				disableAnimation: true,
				iab: { cmpId: 28, gvl: completeGVL },
				mode: transportMode({}),
				persistence: false,
				prefetch: { initialPolicyResolution: iabPolicy() },
			},
			{
				entries: [
					{ component: IABConsentBanner },
					{ component: IABConsentDialog },
				],
			}
		);
		onTestFinished(() => {
			app.destroy();
			container.remove();
		});
		return app;
	};

	const selectedTab = () =>
		document
			.querySelector('[role="tab"][aria-selected="true"]')
			?.textContent?.trim();

	test('customize opens the dialog on the purposes tab', async () => {
		const app = await bootPair();
		await vi.waitFor(() =>
			expect(
				query('[data-testid="iab-consent-banner-customize-button"]')
			).not.toBeNull()
		);
		query('[data-testid="iab-consent-banner-customize-button"]')?.click();
		await vi.waitFor(() =>
			expect(query('[data-testid="iab-consent-dialog-root"]')).not.toBeNull()
		);
		expect(app.consent.activeUI()).toBe('dialog');
		expect(selectedTab()).toMatch(/^Purposes/u);
	});

	test('the partners link opens the dialog on the vendor list', async () => {
		await bootPair();
		await vi.waitFor(() =>
			expect(
				query('[data-testid="iab-consent-banner-partners-link"]')
			).not.toBeNull()
		);
		query('[data-testid="iab-consent-banner-partners-link"]')?.click();
		await vi.waitFor(() => expect(selectedTab()).toMatch(/^Vendors/u));
		await vi.waitFor(() =>
			expect(document.querySelectorAll('[id*="-vendor-"]').length).toBe(
				Object.keys(completeGVL.vendors).length
			)
		);
	});

	test('Escape closes the dialog and the close button returns to the banner', async () => {
		const app = await bootPair();
		await vi.waitFor(() =>
			expect(
				query('[data-testid="iab-consent-banner-customize-button"]')
			).not.toBeNull()
		);
		query('[data-testid="iab-consent-banner-customize-button"]')?.click();
		await vi.waitFor(() =>
			expect(query('[data-testid="iab-consent-dialog-card"]')).not.toBeNull()
		);
		query('[data-testid="iab-consent-dialog-card"]')?.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		// Nothing is recorded yet, so the banner is owed again.
		expect(app.consent.activeUI()).toBe('banner');
	});
});
