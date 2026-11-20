/**
 * The `/v1` hosted transport between init and save: which policy decision a
 * save asserts when inits overlap, are retried or carry other inputs.
 */
import type { InitOutput } from '@inth/sdk-schema/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	iabRule,
	matchedResolution,
} from '../../../__tests__/fixtures/kernel-fixtures';
import { createV1HostedTransport } from '../hosted';
import { KEY, recordAnswer } from './fixtures';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** What the backend answers a save of a `sub_` subject. */
const SAVED = recordAnswer(undefined);

/** A request URL's query parameters. */
const queryOf = (url: unknown): URLSearchParams =>
	new URL(String(url), 'http://inth.test').searchParams;

/** A request URL without its query string. */
const withoutQuery = (url: unknown): string => String(url).split('?')[0] ?? '';

const REALISTIC_INIT_OUTPUT = {
	branding: 'inth',
	cmpId: 28,
	customVendors: [
		{
			id: 'internal-analytics',
			legIntPurposes: [2],
			name: 'Internal Analytics',
			privacyPolicyUrl: 'https://example.com/privacy',
			purposes: [1, 7],
			usesCookies: true,
		},
	],
	gvl: {
		features: {},
		gvlSpecificationVersion: 3,
		lastUpdated: '2026-01-01T00:00:00Z',
		purposes: {},
		specialFeatures: {},
		specialPurposes: {},
		stacks: {},
		tcfPolicyVersion: 4,
		vendorListVersion: 42,
		vendors: {},
	},
	location: { countryCode: 'DE', regionCode: 'BE' },
	policyResolution: {
		...matchedResolution(
			iabRule({ id: 'de-iab', scopeMode: 'strict' }),
			'region'
		),
		version: 1,
	},
	policySnapshotToken: 'snapshot-token',
	translations: {
		language: 'de',
		translations: {
			common: {
				acceptAll: 'Alle akzeptieren',
				customize: 'Anpassen',
				rejectAll: 'Alle ablehnen',
				save: 'Speichern',
			},
			consentGate: {
				actionButton: 'Einstellungen oeffnen',
				title: 'Cookie-Einstellungen',
			},
			consentManagerDialog: {
				description: 'Verwalten Sie Ihre Praeferenzen.',
				title: 'Datenschutzeinstellungen',
			},
			consentTypes: {
				experience: {
					description: 'Personalisierte Funktionen.',
					title: 'Erlebnis',
				},
				functionality: {
					description: 'Verbesserte Websitefunktionen.',
					title: 'Funktionalitaet',
				},
				marketing: {
					description: 'Personalisierte Werbung.',
					title: 'Marketing',
				},
				measurement: {
					description: 'Nutzungsmessung.',
					title: 'Analyse',
				},
				necessary: {
					description: 'Erforderliche Cookies.',
					title: 'Notwendig',
				},
			},
			cookieBanner: {
				description: 'Waehlen Sie aus, welche Cookies verwendet werden.',
				title: 'Cookies verwalten',
			},
			legalLinks: {
				cookiePolicy: 'Cookie-Richtlinie',
				privacyPolicy: 'Datenschutz',
				termsOfService: 'Nutzungsbedingungen',
			},
		},
	},
} satisfies InitOutput;

describe('initialData', () => {
	test('consumes a prefetched init once and keeps the decision assertion', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(SAVED), { status: 200 })
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify(REALISTIC_INIT_OUTPUT), { status: 200 })
			);
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			headers: { 'sec-gpc': '1' },
			initUrl: '/internal/consent/init',
			initialData: Promise.resolve({ init: REALISTIC_INIT_OUTPUT }),
			projectUrl: 'https://api.example.com/inth',
		});

		const first = await transport.init?.({ overrides: {}, user: null });
		expect(first?.policyResolution).toMatchObject({
			policyId: REALISTIC_INIT_OUTPUT.policyResolution.policyId,
		});
		expect(fetchSpy).not.toHaveBeenCalled();

		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'iab',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});
		const [saveURL, saveInit] = fetchSpy.mock.calls[0] ?? [];
		expect(saveURL).toBe('https://api.example.com/inth/v1/consent/records');
		expect(JSON.parse((saveInit as RequestInit).body as string)).toMatchObject({
			country: 'DE',
			fingerprint: REALISTIC_INIT_OUTPUT.policyResolution.fingerprints.policy,
			gpc: true,
			policyId: 'de-iab',
		});

		// The second init goes to the network: the prefetch is single-use.
		await transport.init?.({ overrides: {}, user: null });
		expect(withoutQuery(fetchSpy.mock.calls[1]?.[0])).toBe(
			'/internal/consent/init'
		);
	});

	test('falls back to the fetch when the prefetch resolved empty or rejected', async () => {
		for (const initialData of [
			Promise.resolve(undefined),
			Promise.reject(new Error('offline')),
		]) {
			const fetchSpy = vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(REALISTIC_INIT_OUTPUT), { status: 200 })
				);
			const transport = createV1HostedTransport({
				fetch: fetchSpy as unknown as typeof globalThis.fetch,
				initialData,
				projectUrl: 'https://api.example.com/inth',
			});
			// oxlint-disable-next-line no-await-in-loop -- sequential cases keep the failing input readable.
			await transport.init?.({ overrides: {}, user: null });
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		}
	});
});

describe('GPC in decision assertions', () => {
	test('uses the GPC value the resolver reported when no explicit header is configured', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						...REALISTIC_INIT_OUTPUT,
						resolvedPrivacySignals: { gpc: true },
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify(SAVED), { status: 200 })
			);
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/api/inth/init',
			projectUrl: 'https://api.example.com/inth',
		});

		await transport.init?.({ overrides: {}, user: null });
		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'iab',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});

		const [, saveInit] = fetchSpy.mock.calls[1] ?? [];
		expect(JSON.parse((saveInit as RequestInit).body as string)).toMatchObject({
			gpc: true,
			policyId: 'de-iab',
		});
	});
});

describe('init context', () => {
	test('sends the kernel overrides as query parameters on init', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify(REALISTIC_INIT_OUTPUT), { status: 200 })
			);
		const transport = createV1HostedTransport({
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/api/inth/init',
			projectUrl: 'https://api.example.com/inth',
		});

		const result = await transport.init?.({
			overrides: { country: 'FR', gpc: true, language: 'fr', region: 'IDF' },
			user: null,
		});
		// A backend that echoes nothing back still yields the requested GPC.
		expect(result?.resolvedOverrides?.gpc).toBe(true);

		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		const query = queryOf(url);
		expect(query.get('country')).toBe('FR');
		expect(query.get('region')).toBe('IDF');
		expect(query.get('gpc')).toBe('1');
		// Accept-Language is CORS-safelisted, so the language stays a header.
		expect((init as RequestInit).headers).toEqual({
			accept: 'application/json',
			'accept-language': 'fr',
		});
	});
});

describe('decisionInputs seed', () => {
	test('a save before init resolves still carries the seeded assertion', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(SAVED), { status: 200 }));
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			decisionInputs: {
				country: 'DE',
				fingerprint: 'seeded-fingerprint',
				gpc: false,
				language: 'de',
				policyId: 'de-seeded',
				region: null,
			},
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});

		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'opt-in',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});
		const [, saveInit] = fetchSpy.mock.calls[0] ?? [];
		expect(JSON.parse((saveInit as RequestInit).body as string)).toMatchObject({
			country: 'DE',
			fingerprint: 'seeded-fingerprint',
			language: 'de',
			policyId: 'de-seeded',
		});
	});

	test('the seed is ignored without assertDecisionInputs', async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(SAVED), { status: 200 }));
		const transport = createV1HostedTransport({
			decisionInputs: {
				country: 'DE',
				fingerprint: 'seeded-fingerprint',
				language: 'de',
				policyId: 'de-seeded',
				region: null,
			},
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			projectUrl: 'https://api.example.com/inth',
		});
		await transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'opt-in',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});
		const [, saveInit] = fetchSpy.mock.calls[0] ?? [];
		expect(
			JSON.parse((saveInit as RequestInit).body as string)
		).not.toHaveProperty('policyId');
	});
});

describe('save waits for an in-flight init', () => {
	test('a save issued while init is pending carries that init decision', async () => {
		const initGate = Promise.withResolvers<undefined>();
		const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
			if (withoutQuery(url).endsWith('/init')) {
				await initGate.promise;
				return new Response(JSON.stringify(REALISTIC_INIT_OUTPUT), {
					status: 200,
				});
			}
			return new Response(JSON.stringify(SAVED), { status: 200 });
		});
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});

		const initPromise = transport.init?.({ overrides: {}, user: null });
		const savePromise = transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'opt-in',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});
		await Promise.resolve();
		expect(fetchSpy.mock.calls.map(([url]) => withoutQuery(url))).toEqual([
			'/internal/consent/init',
		]);

		initGate.resolve(undefined);
		await Promise.all([initPromise, savePromise]);
		const saveCall = fetchSpy.mock.calls.find(([url]) =>
			String(url).endsWith('/v1/consent/records')
		);
		if (!saveCall) {
			throw new Error('save was not sent');
		}
		expect(
			JSON.parse((saveCall[1] as RequestInit).body as string)
		).toMatchObject({
			fingerprint: REALISTIC_INIT_OUTPUT.policyResolution.fingerprints.policy,
			policyId: 'de-iab',
		});
	});
});

describe('assertion state across overlapping inits', () => {
	const savePayload = {
		choice: { categories: {}, version: 3 },
		confirmed: { actionAt: 1700000000000, categories: {} },
		consentAction: 'all',
		consents: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		idempotencyKey: KEY,
		model: 'opt-in',
		overrides: {},
		policySnapshotToken: null,
		subject: { subjectId: 'sub_test' },
		subjectId: 'sub_test',
		uiSource: 'banner',
		user: null,
	} as const;

	test('an older init finishing last does not overwrite the newer decision', async () => {
		const gates = [
			Promise.withResolvers<undefined>(),
			Promise.withResolvers<undefined>(),
		];
		let initCalls = 0;
		const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
			if (withoutQuery(url).endsWith('/init')) {
				const index = initCalls;
				initCalls += 1;
				await gates[index]?.promise;
				return new Response(
					JSON.stringify({
						...REALISTIC_INIT_OUTPUT,
						policyResolution: {
							...REALISTIC_INIT_OUTPUT.policyResolution,
							fingerprints: {
								...REALISTIC_INIT_OUTPUT.policyResolution.fingerprints,
								policy: `fp-${index}`,
							},
							policyId: `policy-${index}`,
						},
					}),
					{ status: 200 }
				);
			}
			return new Response(JSON.stringify(SAVED), { status: 200 });
		});
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});

		const first = transport.init?.({
			overrides: { country: 'DE' },
			user: null,
		});
		const second = transport.init?.({
			overrides: { country: 'FR' },
			user: null,
		});
		gates[1]?.resolve(undefined);
		await second;
		gates[0]?.resolve(undefined);
		await first;

		await transport.save?.(savePayload);
		const saveCall = fetchSpy.mock.calls.find(([url]) =>
			String(url).endsWith('/v1/consent/records')
		);
		if (!saveCall) {
			throw new Error('save was not sent');
		}
		expect(
			JSON.parse((saveCall[1] as RequestInit).body as string)
		).toMatchObject({ fingerprint: 'fp-1', policyId: 'policy-1' });
	});

	test('a save refuses to post unbound when the awaited init failed', async () => {
		const fetchSpy = vi.fn().mockImplementation((url: string) => {
			if (withoutQuery(url).endsWith('/init')) {
				return Promise.resolve(new Response('nope', { status: 503 }));
			}
			return Promise.resolve(
				new Response(JSON.stringify(SAVED), { status: 200 })
			);
		});
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});

		const initPromise = transport.init?.({ overrides: {}, user: null });
		const savePromise = transport.save?.(savePayload);
		await expect(initPromise).rejects.toThrow();
		await expect(savePromise).rejects.toThrow(/policy decision/u);
		expect(
			fetchSpy.mock.calls.some(([url]) =>
				String(url).endsWith('/v1/consent/records')
			)
		).toBe(false);
	});
});

describe('re-init with different inputs', () => {
	const savePayload = {
		choice: { categories: {}, version: 3 },
		confirmed: { actionAt: 1700000000000, categories: {} },
		consentAction: 'all',
		consents: {
			experience: false,
			functionality: false,
			marketing: false,
			measurement: false,
			necessary: true,
		},
		idempotencyKey: KEY,
		model: 'opt-in',
		overrides: {},
		policySnapshotToken: null,
		subject: { subjectId: 'sub_test' },
		subjectId: 'sub_test',
		uiSource: 'banner',
		user: null,
	} as const;

	const createGatedInit = function createGatedInit() {
		const gates: PromiseWithResolvers<undefined>[] = [];
		let initCalls = 0;
		const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
			if (withoutQuery(url).endsWith('/init')) {
				const index = initCalls;
				initCalls += 1;
				const gate = Promise.withResolvers<undefined>();
				gates.push(gate);
				await gate.promise;
				return new Response(
					JSON.stringify({
						...REALISTIC_INIT_OUTPUT,
						policyResolution: {
							...REALISTIC_INIT_OUTPUT.policyResolution,
							fingerprints: {
								...REALISTIC_INIT_OUTPUT.policyResolution.fingerprints,
								policy: `fp-${index}`,
							},
							policyId: `policy-${index}`,
						},
					}),
					{ status: 200 }
				);
			}
			return new Response(JSON.stringify(SAVED), { status: 200 });
		});
		return { fetchSpy, gates };
	};

	const savedAssertion = function savedAssertion(
		fetchSpy: ReturnType<typeof vi.fn>
	) {
		const saveCall = fetchSpy.mock.calls.find(([url]) =>
			String(url).endsWith('/v1/consent/records')
		);
		if (!saveCall) {
			throw new Error('save was not sent');
		}
		return JSON.parse((saveCall[1] as RequestInit).body as string);
	};

	test('a save during a re-init for other inputs waits for the new decision', async () => {
		const { fetchSpy, gates } = createGatedInit();
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});
		const first = transport.init?.({
			overrides: { country: 'DE' },
			user: null,
		});
		await vi.waitFor(() => expect(gates).toHaveLength(1));
		gates[0]?.resolve(undefined);
		await first;

		const second = transport.init?.({
			overrides: { country: 'FR' },
			user: null,
		});
		const save = transport.save?.(savePayload);
		await vi.waitFor(() => expect(gates).toHaveLength(2));
		expect(
			fetchSpy.mock.calls.some(([url]) =>
				String(url).endsWith('/v1/consent/records')
			)
		).toBe(false);
		gates[1]?.resolve(undefined);
		await Promise.all([second, save]);
		expect(savedAssertion(fetchSpy)).toMatchObject({ policyId: 'policy-1' });
	});

	test('a save waiting on one init also waits for a newer one started meanwhile', async () => {
		const { fetchSpy, gates } = createGatedInit();
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});
		const first = transport.init?.({
			overrides: { country: 'DE' },
			user: null,
		});
		const save = transport.save?.(savePayload);
		await vi.waitFor(() => expect(gates).toHaveLength(1));
		const second = transport.init?.({
			overrides: { country: 'FR' },
			user: null,
		});
		await vi.waitFor(() => expect(gates).toHaveLength(2));
		gates[0]?.resolve(undefined);
		await first;
		gates[1]?.resolve(undefined);
		await Promise.all([second, save]);
		expect(savedAssertion(fetchSpy)).toMatchObject({ policyId: 'policy-1' });
	});
});

describe('removing an override', () => {
	test('drops the remembered decision so a failed re-init refuses the save', async () => {
		let initCalls = 0;
		const fetchSpy = vi.fn().mockImplementation((url: string) => {
			if (withoutQuery(url).endsWith('/init')) {
				initCalls += 1;
				return Promise.resolve(
					initCalls === 1
						? new Response(JSON.stringify(REALISTIC_INIT_OUTPUT), {
								status: 200,
							})
						: new Response('nope', { status: 503 })
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify(SAVED), { status: 200 })
			);
		});
		const transport = createV1HostedTransport({
			assertDecisionInputs: true,
			fetch: fetchSpy as unknown as typeof globalThis.fetch,
			initUrl: '/internal/consent/init',
			projectUrl: 'https://api.example.com/inth',
		});
		await transport.init?.({ overrides: { country: 'DE' }, user: null });
		const reinit = transport.init?.({ overrides: {}, user: null });
		const save = transport.save?.({
			choice: { categories: {}, version: 3 },
			confirmed: { actionAt: 1700000000000, categories: {} },
			consentAction: 'all',
			consents: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			idempotencyKey: KEY,
			model: 'opt-in',
			overrides: {},
			policySnapshotToken: null,
			subject: { subjectId: 'sub_test' },
			subjectId: 'sub_test',
			uiSource: 'banner',
			user: null,
		});
		await expect(reinit).rejects.toThrow();
		await expect(save).rejects.toThrow(/policy decision/u);
		expect(
			fetchSpy.mock.calls.some(([url]) =>
				String(url).endsWith('/v1/consent/records')
			)
		).toBe(false);
	});
});
