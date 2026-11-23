import { useConsent, useSaveConsents, useSnapshot } from '@inth/react';
import type { KernelConfig } from '@inth/sdk/engine';
import { manifest } from '@inth/sdk/modes';
import {
	readJourneyParams,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { defineConsentConfig } from '../config';
import { InthProvider } from '../inth-provider';
import { testing } from '../testing';
import { MANIFEST_FIXTURE } from './manifest-fixture';
import { policyFixture } from './policy-fixture';

type WindowWithInth = Window & {
	__inthDebug?: {
		version: string;
		pkg: string;
		mode: string;
	};
};

/** A request URL without its query, which carries the consent journey. */
const pathOf = (url: unknown): string => String(url).split('?')[0] ?? '';

const POLICY_RESOLUTION = writePolicyResolutionWire(
	resolvePolicyRules({
		countryCode: null,
		regionCode: null,
		rules: [
			{
				id: 'gdpr',
				match: { fallback: true },
				model: 'opt-in',
				prompt: 'choice',
			},
		],
	})
);

// A save one test leaves queued would replay in the next one.
beforeEach(() => {
	localStorage.clear();
});

describe('InthProvider: projectUrl triggers auto-init', () => {
	test('root reports Next.js adapter identity on window.__inthDebug', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ policyResolution: POLICY_RESOLUTION }), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
		delete (window as WindowWithInth).__inthDebug;

		try {
			const { unmount } = await render(
				<InthProvider
					state={{}}
					config={{ projectUrl: '/api/inth' }}
					persistence={false}
				>
					<div data-testid="probe">ready</div>
				</InthProvider>
			);

			await vi.waitFor(() => {
				// The default mode is manifest().
				expect((window as WindowWithInth).__inthDebug).toMatchObject({
					mode: 'manifest',
					pkg: '@inth/nextjs',
				});
			});
			expect(typeof (window as WindowWithInth).__inthDebug?.version).toBe(
				'string'
			);
			unmount();
		} finally {
			globalThis.fetch = originalFetch;
			delete (window as WindowWithInth).__inthDebug;
		}
	});

	test('root with projectUrl fires kernel.commands.init on mount', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					branding: 'inth',
					location: { countryCode: 'DE', regionCode: null },
					policyResolution: POLICY_RESOLUTION,
					translations: { language: 'en', translations: { common: {} } },
				}),
				{
					headers: { 'content-type': 'application/json' },
					status: 200,
				}
			)
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		const Probe = () => {
			const snap = useSnapshot();
			return (
				<div data-testid="probe">{`${(snap.resolution.status === 'matched' ? snap.resolution.policyId : undefined) ?? 'none'}|${snap.model ?? 'none'}|${snap.activeUI ?? 'null'}`}</div>
			);
		};

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{}}
					config={{ projectUrl: 'http://bench.example.com/api/inth' }}
					persistence={false}
				>
					<Probe />
				</InthProvider>
			);

			// After the init roundtrip completes, policy-derived state updates.
			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|opt-in|banner');
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('a testing() root fires no network call', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response());
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		const Probe = () => {
			const allowed = useConsent('marketing');
			return <div data-testid="probe">{String(allowed)}</div>;
		};

		try {
			const { getByTestId } = await render(
				<InthProvider
					config={{ mode: testing() }}
					state={{}}
					persistence={false}
				>
					<Probe />
				</InthProvider>
			);

			await expect.element(getByTestId('probe')).toHaveTextContent('false');
			// testing() resolves in the browser and saves nowhere.
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('enabled=false skips init and treats consent checks as allowed', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response());
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		const Probe = () => {
			const allowed = useConsent('marketing');
			const snap = useSnapshot();
			return (
				<div data-testid="probe">{`${String(allowed)}|${snap.activeUI ?? 'null'}`}</div>
			);
		};

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{}}
					config={{ projectUrl: 'http://bench.example.com/api/inth' }}
					options={{ enabled: false }}
				>
					<Probe />
				</InthProvider>
			);

			await expect.element(getByTestId('probe')).toHaveTextContent('true|none');
			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe('InthProvider: resolved state reaches first paint', () => {
	test('prepared policy renders without a duplicate browser init', async () => {
		let resolveInit: (value: unknown) => void = () => undefined;
		const fetchSpy = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveInit = (value: unknown) => {
						resolve(
							new Response(JSON.stringify(value), {
								headers: { 'content-type': 'application/json' },
								status: 200,
							})
						);
					};
				})
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		const Probe = () => {
			const snap = useSnapshot();
			return (
				<div data-testid="probe">{`${(snap.resolution.status === 'matched' ? snap.resolution.policyId : undefined) ?? 'none'}|${snap.model ?? 'none'}|${snap.activeUI ?? 'null'}`}</div>
			);
		};

		const state: KernelConfig = policyFixture({}, { id: 'gdpr' });

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={state}
					config={{ projectUrl: 'http://bench.example.com/api/inth' }}
					persistence={false}
				>
					<Probe />
				</InthProvider>
			);

			// First paint carries the prefetched values.
			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|opt-in|banner');

			// Now resolve the slow init. Snapshot should not regress.
			expect(fetchSpy).not.toHaveBeenCalled();
			resolveInit({ policyResolution: POLICY_RESOLUTION });
			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|opt-in|banner');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe('InthProvider: config picks the transport', () => {
	const jsonResponse = (body: unknown) =>
		new Response(JSON.stringify(body), {
			headers: { 'content-type': 'application/json' },
			status: 200,
		});

	const PolicyProbe = () => {
		const snap = useSnapshot();
		const save = useSaveConsents();
		return (
			<div>
				<div data-testid="probe">{`${snap.policyRule.id}|${snap.location?.countryCode ?? 'null'}|${String(!!snap.explicitChoice)}`}</div>
				<button
					type="button"
					data-testid="save"
					onClick={() => {
						void save('all');
					}}
				>
					save
				</button>
			</div>
		);
	};

	test.each([
		[
			'saves post to the backend',
			undefined,
			'https://consent.example.com/v1/consent/records',
			manifest(),
		],
		[
			'with proxy, saves post to the route too',
			true,
			'/api/consent/v1/consent/records',
			manifest(),
		],
	])(
		'routePrefix: init hits the same-origin route, %s',
		async (_name, proxy, saveURL, mode) => {
			const fetchSpy = vi.fn((url: string, _init?: RequestInit) =>
				Promise.resolve(
					url.endsWith('/v1/consent/records')
						? jsonResponse({
								recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
								subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
							})
						: jsonResponse({
								branding: 'inth',
								location: { countryCode: 'DE', regionCode: null },
								policyDecision: {
									country: 'DE',
									fingerprint: policyFixture({}, { id: 'gdpr' })
										.initialPolicyResolution.fingerprints.policy,
									policyId: 'gdpr',
								},
								policyResolution: writePolicyResolutionWire(
									policyFixture({}, { id: 'gdpr' }).initialPolicyResolution
								),
								translations: { language: 'en', translations: { common: {} } },
							})
				)
			);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

			try {
				const { getByTestId } = await render(
					<InthProvider
						state={{}}
						config={defineConsentConfig({
							mode,
							projectUrl: 'https://consent.example.com',
							proxy,
							routePrefix: '/api/consent',
						})}
						// A site declares its categories; with none, the permissive
						// policy asks only for an acknowledgement, not a choice.
						options={{
							consentCategories: [
								'necessary',
								'experience',
								'functionality',
								'marketing',
								'measurement',
							],
						}}
						persistence={false}
					>
						<PolicyProbe />
					</InthProvider>
				);

				await expect
					.element(getByTestId('probe'))
					.toHaveTextContent('gdpr|DE|false');
				await getByTestId('save').click();
				await expect
					.element(getByTestId('probe'))
					.toHaveTextContent('gdpr|DE|true');
				// Every page of the origin shares the browser's save queue, and
				// the kernel resends what another page queued once its init
				// lands: other test files run in pages beside this one. Such a
				// replay carries no journey; this page's requests carry its own.
				const thisPage = () =>
					fetchSpy.mock.calls.filter(
						([url]) => readJourneyParams(String(url)) !== null
					);
				await vi.waitFor(() => {
					expect(thisPage().map(([url]) => pathOf(url))).toEqual([
						'/api/consent/v1/consent/init',
						saveURL,
					]);
				});
				// The init and the save it led to carry one journey.
				const [initJourney, saveJourney] = thisPage().map(([url]) =>
					readJourneyParams(String(url))
				);
				expect(initJourney?.scope).toBe('page');
				expect(saveJourney?.id).toBe(initJourney?.id);
				// Manifest-resolved init issues no snapshot token, so the save
				// asserts the policy it was made against.
				const saveInit = thisPage()[1]?.[1];
				expect(JSON.parse(String(saveInit?.body))).toMatchObject({
					fingerprint: policyFixture({}, { id: 'gdpr' }).initialPolicyResolution
						.fingerprints.policy,
					policyId: 'gdpr',
				});
			} finally {
				globalThis.fetch = originalFetch;
			}
		}
	);

	test("resolve: 'browser': init resolves in the browser from the manifest route", async () => {
		const fetchSpy = vi.fn((url: string) =>
			Promise.resolve(
				url.endsWith('/v1/consent/records')
					? jsonResponse({
							recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
							subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
						})
					: jsonResponse(MANIFEST_FIXTURE)
			)
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{ initialOverrides: { country: 'DE' } }}
					config={defineConsentConfig({
						mode: manifest({ resolve: 'browser' }),
						projectUrl: 'https://consent.example.com',
						routePrefix: '/api/consent',
					})}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);

			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('eu-opt-in|DE|false');
			await getByTestId('save').click();
			await vi.waitFor(() => {
				expect(fetchSpy.mock.calls.map(([url]) => pathOf(url))).toEqual([
					'/api/consent/v1/consent/manifest',
					'https://consent.example.com/v1/consent/records',
				]);
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("resolve: 'browser' asks the backend /init for a country the manifest splits by region", async () => {
		const fetchSpy = vi.fn((url: string) =>
			Promise.resolve(
				pathOf(url).endsWith('/v1/consent/init')
					? jsonResponse({
							branding: 'inth',
							location: { countryCode: 'US', regionCode: 'CA' },
							policyResolution: writePolicyResolutionWire(
								policyFixture({}, { id: 'us-ca-opt-out' })
									.initialPolicyResolution
							),
							translations: { language: 'en', translations: { common: {} } },
						})
					: jsonResponse(MANIFEST_FIXTURE)
			)
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{ initialOverrides: { country: 'US' } }}
					config={defineConsentConfig({
						mode: manifest({ resolve: 'browser' }),
						projectUrl: 'https://consent.example.com',
						routePrefix: '/api/consent',
					})}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);

			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('us-ca-opt-out|US|false');
			expect(fetchSpy.mock.calls.map(([url]) => pathOf(url))).toEqual([
				'/api/consent/v1/consent/manifest',
				'https://consent.example.com/v1/consent/init',
			]);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('projectUrl only: manifest() re-inits against the backend /v1/consent/init', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(
			jsonResponse({
				branding: 'inth',
				location: { countryCode: 'DE', regionCode: null },
				policyResolution: writePolicyResolutionWire(
					policyFixture({}, { id: 'gdpr' }).initialPolicyResolution
				),
				translations: { language: 'en', translations: { common: {} } },
			})
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{}}
					config={defineConsentConfig({
						projectUrl: 'https://consent.example.com',
					})}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);

			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|DE|false');
			expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
				'https://consent.example.com/v1/consent/init'
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('config journey false: neither the init nor the save carries one', async () => {
		const fetchSpy = vi.fn((url: string, _init?: RequestInit) =>
			Promise.resolve(
				pathOf(url).endsWith('/v1/consent/records')
					? jsonResponse({
							recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
							subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
						})
					: jsonResponse({
							branding: 'inth',
							location: { countryCode: 'DE', regionCode: null },
							policyResolution: writePolicyResolutionWire(
								policyFixture({}, { id: 'gdpr' }).initialPolicyResolution
							),
							translations: { language: 'en', translations: { common: {} } },
						})
			)
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{}}
					config={defineConsentConfig({
						journey: false,
						projectUrl: 'https://consent.example.com',
					})}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);
			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|DE|false');
			await getByTestId('save').click();
			await vi.waitFor(() =>
				expect(
					fetchSpy.mock.calls.some(([url]) =>
						pathOf(url).endsWith('/v1/consent/records')
					)
				).toBe(true)
			);
			for (const [url] of fetchSpy.mock.calls) {
				expect(String(url)).not.toContain('journey');
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('a server state with no journey: the save carries none', async () => {
		const fetchSpy = vi.fn((_url: string, _init?: RequestInit) =>
			Promise.resolve(
				jsonResponse({
					recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
					subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
				})
			)
		);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{
						...policyFixture({}, { id: 'gdpr' }),
						journey: null,
					}}
					config={defineConsentConfig({
						projectUrl: 'https://consent.example.com',
					})}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);
			await getByTestId('save').click();
			await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
			expect(pathOf(fetchSpy.mock.calls[0]?.[0])).toBe(
				'https://consent.example.com/v1/consent/records'
			);
			expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain('journey');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test('options.mode still wins over the config', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response());
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
		const init = vi.fn().mockResolvedValue({
			policyResolution: writePolicyResolutionWire(
				policyFixture({}, { id: 'gdpr' }).initialPolicyResolution
			),
		});

		try {
			const { getByTestId } = await render(
				<InthProvider
					state={{}}
					config={defineConsentConfig({
						projectUrl: 'https://consent.example.com',
						routePrefix: '/api/consent',
					})}
					options={{
						mode: Object.assign(() => ({ init }), { kind: 'custom' as const }),
					}}
					persistence={false}
				>
					<PolicyProbe />
				</InthProvider>
			);

			await expect
				.element(getByTestId('probe'))
				.toHaveTextContent('gdpr|null|false');
			expect(init).toHaveBeenCalledTimes(1);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
