import { evaluateConsent } from '@inth/sdk/engine';
import type { ConsentKernel } from '@inth/sdk/engine';
import { useContext, useEffect } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import type { ComponentFixtureOptions as InthProviderOptions } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { KernelContext } from '~/context';

import { testing } from '../../../testing';
import { StackItem } from '../atoms/stack-item';
import { IABConsentDialog } from '../iab-consent-dialog';

const getDefined = <Value,>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		clear: () => {
			store = {};
		},
		getItem: (key: string) => store[key] || null,
		removeItem: (key: string) => {
			Reflect.deleteProperty(store, key);
		},
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
});

// Mock GVL with multiple vendors
const mockGVL = {
	features: {
		1: { description: '', id: 1, illustrations: [], name: 'Match data' },
	},
	gvlSpecificationVersion: 3,
	lastUpdated: '2024-01-15T16:00:23Z',
	purposes: {
		1: {
			description: '',
			id: 1,
			illustrations: [],
			name: 'Store and/or access information on a device',
		},
		10: {
			description: '',
			id: 10,
			illustrations: [],
			name: 'Develop and improve services',
		},
		2: {
			description: '',
			id: 2,
			illustrations: [],
			name: 'Use limited data to select advertising',
		},
		7: {
			description: '',
			id: 7,
			illustrations: [],
			name: 'Measure advertising performance',
		},
		9: {
			description: '',
			id: 9,
			illustrations: [],
			name: 'Understand audiences through statistics',
		},
	},
	specialFeatures: {
		1: { description: '', id: 1, illustrations: [], name: 'Geolocation' },
	},
	specialPurposes: {
		1: { description: '', id: 1, illustrations: [], name: 'Security' },
	},
	stacks: {
		1: {
			description: '',
			id: 1,
			name: 'Advertising',
			purposes: [2, 7],
			specialFeatures: [],
		},
	},
	tcfPolicyVersion: 5,
	vendorListVersion: 142,
	vendors: {
		1: {
			cookieMaxAgeSeconds: 31536000,
			cookieRefresh: true,
			features: [1],
			flexiblePurposes: [],
			id: 1,
			legIntPurposes: [7, 9, 10],
			name: 'Exponential Interactive',
			purposes: [1, 2],
			specialFeatures: [],
			specialPurposes: [1],
			urls: [{ langId: 'en', privacy: 'https://vendor1.com/privacy' }],
			usesCookies: true,
			usesNonCookieAccess: false,
		},
		10: {
			cookieMaxAgeSeconds: 31536000,
			cookieRefresh: true,
			features: [],
			flexiblePurposes: [],
			id: 10,
			legIntPurposes: [2, 7, 9, 10],
			name: 'Index Exchange',
			purposes: [1],
			specialFeatures: [],
			specialPurposes: [1],
			urls: [{ langId: 'en', privacy: 'https://indexexchange.com/privacy' }],
			usesCookies: true,
			usesNonCookieAccess: false,
		},
		755: {
			cookieMaxAgeSeconds: 63072000,
			cookieRefresh: true,
			features: [1],
			flexiblePurposes: [2, 7, 9, 10],
			id: 755,
			legIntPurposes: [],
			name: 'Google Advertising Products',
			purposes: [1, 2, 7, 9, 10],
			specialFeatures: [1],
			specialPurposes: [1],
			urls: [{ langId: 'en', privacy: 'https://policies.google.com/privacy' }],
			usesCookies: true,
			usesNonCookieAccess: true,
		},
	},
};

globalThis.fetch = vi.fn(() =>
	Promise.resolve(
		new Response(JSON.stringify(mockGVL), {
			headers: { 'Content-Type': 'application/json' },
			status: 200,
		})
	)
) as typeof fetch;

const defaultIABOptions: InthProviderOptions = {
	iab: {
		cmpId: 160,
		cmpVersion: 1,
		gvl: mockGVL,
	},
	mode: testing(),
	prefetch: policyFixture(undefined, {
		categories: undefined,
		id: 'iab_test',
		model: 'iab',
		prompt: 'choice',
		scopeMode: 'strict',
	}),
};

describe('IAB preference item interactions', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
		delete (window as { __tcfapi?: unknown }).__tcfapi;
	});

	// TCF policy check 14: Features always carry the standard explanation and no control.
	test('lists vendor features with the standard Features text and no switch', async () => {
		render(
			<InthProvider options={defaultIABOptions}>
				<IABConsentDialog open />
			</InthProvider>
		);

		const vendorsTab = await vi.waitFor(
			() => {
				const el = Array.from(
					document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
				).find((button) =>
					button.textContent?.toLowerCase().includes('vendor')
				);
				expect(el).toBeDefined();
				return getDefined(el);
			},
			{ timeout: 5000 }
		);
		await userEvent.click(vendorsTab);
		const vendor = await vi.waitFor(
			() => {
				const el = Array.from(
					document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
				).find((element) =>
					element.textContent?.includes('Exponential Interactive')
				);
				expect(el).toBeDefined();
				return getDefined(el);
			},
			{ timeout: 5000 }
		);
		await userEvent.click(
			getDefined(
				vendor.querySelector<HTMLElement>(
					'[data-slot="preference-item-trigger"]'
				)
			)
		);

		const standard = await vi.waitFor(
			() => {
				const el = vendor.querySelector<HTMLElement>(
					'[data-testid$="-features-standard-text"]'
				);
				expect(el).toBeInstanceOf(HTMLElement);
				return getDefined(el);
			},
			{ timeout: 5000 }
		);
		// The mock GVL has no standard texts, so the translated standard text shows.
		expect(standard.textContent).toBe(
			'These means of processing can be used solely in pursuit of one or several purposes for which you are given a choice in this notice.'
		);
		const features = getDefined(standard.parentElement);
		expect(features.textContent).toContain('Match data');
		expect(features.querySelector('[role="switch"], input, button')).toBeNull();
	});
	test('should keep vendor details collapsed until expanded and allow consent toggle separately', async () => {
		render(
			<InthProvider options={defaultIABOptions}>
				<IABConsentDialog open />
			</InthProvider>
		);

		const vendorsTab = await vi.waitFor(
			() => {
				const el = Array.from(
					document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
				).find((button) =>
					button.textContent?.toLowerCase().includes('vendor')
				);
				expect(el).toBeDefined();
				return getDefined(el);
			},
			{ timeout: 5000 }
		);

		await userEvent.click(vendorsTab);

		const vendorHeader = await vi.waitFor(
			() => {
				const el = Array.from(
					document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
				).find((element) =>
					element.textContent?.includes('Exponential Interactive')
				);
				expect(el).toBeDefined();
				return getDefined(el);
			},
			{ timeout: 5000 }
		);

		const content = vendorHeader.querySelector(
			'[data-slot="preference-item-content"]'
		);
		expect(content?.getAttribute('aria-hidden')).toBe('true');

		const consentSwitch = vendorHeader.querySelector('[role="switch"]');
		expect(consentSwitch).toBeInstanceOf(HTMLElement);
		if (!consentSwitch) {
			throw new Error('Expected vendor switch to exist');
		}

		await userEvent.click(consentSwitch);

		await vi.waitFor(() => {
			expect(consentSwitch.getAttribute('aria-checked')).toBe('true');
			expect(content?.getAttribute('aria-hidden')).toBe('true');
		});

		const expandTrigger = vendorHeader.querySelector(
			'[data-slot="preference-item-trigger"]'
		) as HTMLElement | null;
		expect(expandTrigger).toBeInstanceOf(HTMLElement);
		if (!expandTrigger) {
			throw new Error('Expected vendor expand trigger to exist');
		}

		await userEvent.click(expandTrigger);

		await vi.waitFor(() => {
			expect(content?.getAttribute('aria-hidden')).toBe('false');
		});
	});

	// Regression: the refresh note was hardcoded English.
	test('shows the max age with the translated refresh note', async () => {
		render(
			<InthProvider
				options={{
					...defaultIABOptions,
					i18n: {
						locale: 'en',
						messages: {
							en: {
								iab: {
									preferenceCenter: {
										vendorList: { maxAgeRefreshes: '(renewed)' },
									},
								},
							},
						},
					},
				}}
			>
				<IABConsentDialog open />
			</InthProvider>
		);

		const vendorsTab = await vi.waitFor(
			() => {
				const el = Array.from(
					document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
				).find((button) =>
					button.textContent?.toLowerCase().includes('vendor')
				);
				return getDefined(el);
			},
			{ timeout: 5000 }
		);
		await userEvent.click(vendorsTab);

		const vendorHeader = await vi.waitFor(
			() =>
				getDefined(
					Array.from(
						document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
					).find((element) =>
						element.textContent?.includes('Exponential Interactive')
					)
				),
			{ timeout: 5000 }
		);
		await userEvent.click(
			getDefined(
				vendorHeader.querySelector<HTMLElement>(
					'[data-slot="preference-item-trigger"]'
				)
			)
		);

		await vi.waitFor(() => {
			expect(vendorHeader.textContent).toContain('Max Age: 365d (renewed)');
		});
	});

	test('links each vendor to the privacy policy its GVL entry declares', async () => {
		render(
			<InthProvider options={defaultIABOptions}>
				<IABConsentDialog open />
			</InthProvider>
		);
		const vendorsTab = await vi.waitFor(() =>
			getDefined(
				Array.from(
					document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
				).find((button) => button.textContent?.toLowerCase().includes('vendor'))
			)
		);
		await userEvent.click(vendorsTab);
		const vendorRow = await vi.waitFor(() =>
			getDefined(
				Array.from(
					document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
				).find((element) => element.textContent?.includes('Index Exchange'))
			)
		);

		await userEvent.click(
			getDefined(
				vendorRow.querySelector<HTMLElement>(
					'[data-slot="preference-item-trigger"]'
				)
			)
		);

		const policyLink = await vi.waitFor(() =>
			getDefined(
				Array.from(vendorRow.querySelectorAll('a')).find(
					(link) => link.textContent === 'Privacy Policy'
				)
			)
		);
		expect(policyLink.getAttribute('href')).toBe(
			'https://indexexchange.com/privacy'
		);
	});

	test('shows no link for a vendor URL that is not absolute http(s)', async () => {
		const gvl = {
			...mockGVL,
			vendors: {
				...mockGVL.vendors,
				10: {
					...mockGVL.vendors[10],
					deviceStorageDisclosureUrl: 'data:text/html,hi',
					urls: [
						{
							langId: 'en',
							legIntClaim: '//evil.test',
							// oxlint-disable-next-line no-script-url -- Unsafe vendor URLs exercise the link filter.
							privacy: 'javascript:alert(1)',
						},
					],
				},
			},
		};
		render(
			<InthProvider
				options={{
					...defaultIABOptions,
					iab: { ...defaultIABOptions.iab, gvl },
				}}
			>
				<IABConsentDialog open />
			</InthProvider>
		);
		const vendorsTab = await vi.waitFor(() =>
			getDefined(
				Array.from(
					document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
				).find((button) => button.textContent?.toLowerCase().includes('vendor'))
			)
		);
		await userEvent.click(vendorsTab);
		const vendorRow = await vi.waitFor(() =>
			getDefined(
				Array.from(
					document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
				).find((element) => element.textContent?.includes('Index Exchange'))
			)
		);

		await userEvent.click(
			getDefined(
				vendorRow.querySelector<HTMLElement>(
					'[data-slot="preference-item-trigger"]'
				)
			)
		);

		await vi.waitFor(() =>
			expect(vendorRow.textContent).toContain('Uses Cookies')
		);
		expect(vendorRow.querySelectorAll('a')).toHaveLength(0);
	});
});

describe('IAB vendors tab with publisher restrictions', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
		delete (window as { __tcfapi?: unknown }).__tcfapi;
	});

	const findVendorRow = (name: string) =>
		vi.waitFor(
			() => {
				const row = Array.from(
					document.querySelectorAll<HTMLElement>('[id^="vendor-"]')
				).find((element) => element.textContent?.includes(name));
				expect(row).toBeDefined();
				return getDefined(row);
			},
			{ timeout: 5000 }
		);

	test.each([
		['without restrictions', undefined, false],
		[
			'when purpose 7 requires legitimate interest',
			[{ purposeId: 7, restrictionType: 2 as const, vendorIds: [755] }],
			true,
		],
	])(
		'vendor 755 objection control %s',
		async (_name, publisherRestrictions, objectable) => {
			render(
				<InthProvider
					options={{
						...defaultIABOptions,
						iab: { ...defaultIABOptions.iab, publisherRestrictions },
					}}
				>
					<IABConsentDialog open />
				</InthProvider>
			);
			// Vendor 755 declares only consent purposes. Requiring legitimate
			// interest for purpose 7 gives the visitor a right to object.
			const vendorsTab = await vi.waitFor(
				() =>
					getDefined(
						Array.from(
							document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
						).find((tab) => tab.textContent?.toLowerCase().includes('vendor'))
					),
				{ timeout: 5000 }
			);
			await userEvent.click(vendorsTab);
			const row = await findVendorRow('Google Advertising Products');
			// The objection sits in the row's content, mounted on first open.
			await userEvent.click(
				getDefined(
					row.querySelector<HTMLElement>(
						'[data-slot="preference-item-trigger"]'
					)
				)
			);
			await vi.waitFor(() =>
				expect(
					row.querySelector('[data-slot="preference-item-content"]')
						?.childElementCount
				).toBeGreaterThan(0)
			);
			expect(row.querySelector('button[aria-pressed]') !== null).toBe(
				objectable
			);
		}
	);
});

describe('IAB purposes tab with publisher restrictions', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
		delete (window as { __tcfapi?: unknown }).__tcfapi;
	});

	test('a purpose left with only legitimate interest offers the objection, and it denies the vendor', async () => {
		const probe: { kernel: ConsentKernel | null } = { kernel: null };
		const KernelProbe = () => {
			const kernel = useContext(KernelContext);
			useEffect(() => {
				probe.kernel = kernel;
			}, [kernel]);
			return null;
		};
		// Vendors 1 and 10 declare purpose 7 for legitimate interest; the
		// restriction moves vendor 755 there too, so no vendor uses consent.
		render(
			<InthProvider
				options={{
					...defaultIABOptions,
					iab: {
						...defaultIABOptions.iab,
						publisherRestrictions: [
							{ purposeId: 7, restrictionType: 2, vendorIds: [755] },
						],
					},
				}}
			>
				<KernelProbe />
				<IABConsentDialog open />
			</InthProvider>
		);
		// Purpose 7 sits in stack 1 with purpose 2. Stack content mounts when
		// the stack first opens.
		const trigger = (testId: string) =>
			vi.waitFor(
				() =>
					getDefined(
						document.querySelector<HTMLElement>(
							`[data-testid="${testId}"] [data-slot="preference-item-trigger"]`
						),
						`Missing ${testId} trigger`
					),
				{ timeout: 5000 }
			);
		await userEvent.click(await trigger('stack-item-1'));
		const purposeRow = await vi.waitFor(
			() => {
				const row = document.querySelector<HTMLElement>(
					'[data-testid="purpose-item-7"]'
				);
				expect(row).not.toBeNull();
				return getDefined(row);
			},
			{ timeout: 5000 }
		);
		// A consent switch here would change nothing the vendors rely on.
		expect(
			purposeRow.querySelector(
				'[role="switch"][aria-label="Measure advertising performance"]'
			)
		).toBeNull();

		const button = (label: string) =>
			getDefined(
				Array.from(document.querySelectorAll('button')).find(
					(element) => element.textContent?.trim() === label
				),
				`Missing ${label} button`
			);
		// The fixture policy scopes no optional category, so gate on the TC
		// signals alone.
		const target = {
			category: 'necessary' as const,
			iabPurposes: [7],
			vendorId: 755,
		};
		const gate = () =>
			evaluateConsent(target, getDefined(probe.kernel).getSnapshot());

		await userEvent.click(button('Accept All'));
		await vi.waitFor(() => expect(gate()).toBe(true), { timeout: 5000 });

		await userEvent.click(await trigger('purpose-item-7'));
		const objection = await vi.waitFor(() =>
			getDefined(
				document.querySelector<HTMLButtonElement>(
					'[data-testid="purpose-item-7"] button[aria-pressed]'
				),
				'Missing objection control'
			)
		);
		await userEvent.click(objection);
		await userEvent.click(button('Save Settings'));
		await vi.waitFor(() => expect(gate()).toBe(false), { timeout: 5000 });
	});
});

describe('IAB stack switch without an objection handler', () => {
	test('reflects and sets consent for purposes with no consent basis', async () => {
		const onToggle = vi.fn();
		render(
			<InthProvider options={defaultIABOptions}>
				<StackItem
					consents={{}}
					onToggle={onToggle}
					onVendorClick={vi.fn()}
					onVendorToggle={vi.fn()}
					stack={{
						description: '',
						id: 1,
						name: 'Advertising',
						purposes: [
							{
								description: '',
								hasConsentBasis: false,
								id: 7,
								illustrations: [],
								name: 'Measure advertising performance',
								vendors: [],
							},
						],
					}}
					vendorConsents={{}}
				/>
			</InthProvider>
		);
		// With no objection control to fall back on, the rows keep their
		// consent switch, so the stack switch must cover them too.
		const stackSwitch = await vi.waitFor(() =>
			getDefined(
				document.querySelector<HTMLElement>(
					'[role="switch"][aria-label="Advertising"]'
				)
			)
		);
		expect(stackSwitch.getAttribute('aria-checked')).toBe('false');
		await userEvent.click(stackSwitch);
		expect(onToggle).toHaveBeenCalledWith(7, true);
	});
});

describe('IAB vendors tab with Google ad tech providers', () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
		delete (window as { __tcfapi?: unknown }).__tcfapi;
	});

	test('lists each provider with its privacy policy and a consent switch', async () => {
		const gvlFetch = globalThis.fetch;
		globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
			String(input).startsWith('https://lists.example/ac')
				? Promise.resolve(
						Response.json({
							providers: {
								'89': {
									id: 89,
									name: 'Example Ad Tech',
									policyUrl: 'https://ads.example/privacy',
								},
							},
						})
					)
				: gvlFetch(input)
		) as typeof fetch;
		try {
			render(
				<InthProvider
					options={{
						...defaultIABOptions,
						iab: {
							...defaultIABOptions.iab,
							additionalConsent: {
								providers: [89],
								url: 'https://lists.example/ac',
							},
						},
					}}
				>
					<IABConsentDialog open />
				</InthProvider>
			);

			const vendorsTab = await vi.waitFor(
				() => {
					const el = Array.from(
						document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
					).find((button) =>
						button.textContent?.toLowerCase().includes('vendor')
					);
					return getDefined(el);
				},
				{ timeout: 5000 }
			);
			await userEvent.click(vendorsTab);

			const row = await vi.waitFor(
				() => getDefined(document.getElementById('ad-tech-provider-89')),
				{ timeout: 5000 }
			);
			expect(row.textContent).toContain('Example Ad Tech');
			expect(row.querySelector('a')?.getAttribute('href')).toBe(
				'https://ads.example/privacy'
			);
			expect(document.body.textContent).toContain(
				'Google Ad Tech Providers (1)'
			);

			const providerSwitch = getDefined(
				row.querySelector<HTMLElement>('[role="switch"]')
			);
			expect(providerSwitch.getAttribute('aria-label')).toBe(
				'Consent for Example Ad Tech'
			);
			await userEvent.click(providerSwitch);
			await vi.waitFor(() => {
				expect(providerSwitch.getAttribute('aria-checked')).toBe('true');
			});
		} finally {
			globalThis.fetch = gvlFetch;
		}
	});
});
