// @vitest-environment-options { "url": "https://app.example.com/" }
/**
 * The web client: the browser engine from `@inth/sdk/engine`, read through the
 * React Native snapshot contract.
 *
 * Everything here runs the real runtime, kernel and persistence in jsdom. The
 * policy comes from `offline()` rules, or from a stubbed `fetch` that answers
 * `/init` the way a project does, so the mapping is checked against what the
 * engine actually produces rather than a hand-written kernel snapshot.
 */

import { createOfflineTransport, offline } from '@inth/sdk/transports';
import { act } from 'react';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';

import { flushPromises, renderTree } from '../../__tests__/helpers/fake-native';
import { ConsentBanner } from '../../components';
import type { ConsentClient } from '../../native/client';
import { getConsentClient, resetConsentClient } from '../../native/client.web';
import {
	claimPrompt,
	UNCLAIMED_PROMPT_MS,
} from '../../native/without-native-ui';
import { ConsentClientContext, InthProvider } from '../../provider';
import {
	createWebConsentClient,
	WEB_CONFIGURATION_DRY_RUN_CODE,
} from '../consent-client.web';
import { webOptionsFromManifest } from '../expo-extra.web';

const PROJECT = 'https://your-project.inth.app';

/** A permissive policy asks about the categories the app declares. */
const CATEGORIES = ['measurement', 'marketing'] as const;

const OPTIONS = { consentCategories: CATEGORIES, projectUrl: PROJECT };

const OPT_IN = [
	{
		id: 'everywhere',
		match: { fallback: true, isDefault: true },
		model: 'opt-in',
		prompt: 'choice',
	},
] as const;

const offlineMode = () =>
	offline({ acknowledgeNoRecords: true, policyRules: [...OPT_IN] as never });

const clients: ConsentClient[] = [];

const webClient = function webClient(
	...args: Parameters<typeof createWebConsentClient>
): ConsentClient {
	const client = createWebConsentClient(...args);
	clients.push(client);
	return client;
};

/** Subscribe the way a mounted hook does, which starts the engine. */
const started = async function started(
	client: ConsentClient
): Promise<() => void> {
	const stop = client.subscribe(
		(snapshot) => snapshot.revision,
		() => undefined
	);
	await flushPromises();
	return stop;
};

const clearStorage = function clearStorage(): void {
	localStorage.clear();
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
};

// Node 25 and later define a global `localStorage` that stays undefined
// without `--localstorage-file` and hides jsdom's. The engine under test
// persists through the browser's storage, so hand it jsdom's.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom !== undefined && globalThis.localStorage === undefined) {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: dom.window.localStorage,
	});
}

beforeEach(() => {
	clearStorage();
});

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	resetConsentClient();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	clearStorage();
});

describe('createWebConsentClient', () => {
	test('reads nothing from the browser before the first subscriber', () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });

		expect(client.getSnapshot()).toMatchObject({
			policyPending: true,
			ready: false,
		});
		expect(client.decision('measurement')).toBe('pending');
		expect(client.bootstrap).toMatchObject({
			nativeUI: false,
			subjectId: null,
		});
		expect(localStorage.length).toBe(0);
	});

	test('maps a resolved opt-in policy onto the native snapshot shape', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const snapshot = client.getSnapshot();
		expect(snapshot).toMatchObject({
			activeUI: 'banner',
			error: null,
			gppString: null,
			iab: null,
			iabMarketingPurposes: null,
			model: 'opt-in',
			policyPending: false,
			promptRequirement: { kind: 'choice' },
			ready: true,
			resolution: { policyId: 'everywhere', status: 'matched' },
		});
		expect(snapshot.resolution.fingerprint).toEqual(expect.any(String));
		expect(snapshot.promptOwedSince).toBe(snapshot.revision);
		expect(snapshot.consentCategories).toEqual([
			'necessary',
			'measurement',
			'marketing',
		]);
		expect(snapshot.subject?.subjectId).toEqual(expect.any(String));
		expect(snapshot.subject).not.toHaveProperty('identityProvider');
		expect(snapshot.overrides).toEqual({
			country: null,
			gpc: null,
			language: expect.any(String),
			region: null,
		});
		expect(client.isAllowed('necessary')).toBe(true);
		expect(client.decision('measurement')).toBe('denied');
		// Repeated reads on unchanged state hand out the same object.
		expect(client.getSnapshot()).toBe(snapshot);
	});

	test('records a choice that a later page load reads back from storage', async () => {
		const first = webClient(OPTIONS, { mode: offlineMode() });
		await started(first);

		const result = await first.commit({ action: 'all' });

		expect(result).toMatchObject({ delivered: true, ok: true, queued: false });
		expect(result.confirmed).toContain('measurement');
		expect(first.decision('measurement')).toBe('granted');
		expect(first.getSnapshot()).toMatchObject({
			promptOwedSince: null,
			promptRequirement: { kind: 'none' },
		});
		first.dispose();

		const reloaded = webClient(OPTIONS, { mode: offlineMode() });
		await started(reloaded);

		expect(reloaded.decision('measurement')).toBe('granted');
		expect(reloaded.getSnapshot().explicitChoice).not.toBeNull();
	});

	test('saves exactly the categories an explicit intent names', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const { revision } = client.getSnapshot();
		const result = await client.commit({
			action: 'explicit',
			consents: { measurement: true },
			revision,
		});

		expect(result.ok).toBe(true);
		expect(result.confirmed).toEqual(['measurement']);
		expect(client.decision('measurement')).toBe('granted');
		expect(client.decision('marketing')).toBe('denied');
	});

	test('refuses intents the native cores refuse, with their reasons', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);
		const stale = client.getSnapshot().revision - 1;

		await expect(
			client.commit({
				action: 'explicit',
				consents: { measurement: true },
				revision: stale,
			})
		).resolves.toMatchObject({ ok: false, reason: 'concurrent-change' });
		await expect(
			client.commit({
				action: 'explicit',
				consents: { analytics: true } as never,
			})
		).resolves.toMatchObject({ ok: false, reason: 'invalid-intent' });
		await expect(
			client.commit({
				action: 'iab',
				choices: {} as never,
				consents: {},
			})
		).resolves.toMatchObject({ ok: false, reason: 'iab-unavailable' });
		expect(client.decision('measurement')).toBe('denied');
	});

	test('reset withdraws the choice and keeps the subject id', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);
		await client.commit({ action: 'all' });
		const subject = client.getSnapshot().subject?.subjectId;

		await client.reset();

		expect(client.decision('measurement')).toBe('denied');
		expect(client.getSnapshot().promptRequirement.kind).toBe('choice');
		expect(client.getSnapshot().subject?.subjectId).toBe(subject);
	});

	test('notifies a subscriber only when its slice moved', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);
		const onMarketing = vi.fn();
		client.subscribe(
			(snapshot) => snapshot.effectivePermissions.marketing,
			onMarketing
		);

		await client.commit({
			action: 'explicit',
			consents: { measurement: true },
		});
		expect(onMarketing).not.toHaveBeenCalled();

		await client.commit({ action: 'all' });
		expect(onMarketing).toHaveBeenCalledTimes(1);
	});

	test('answers the device-only features the way a device without them does', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);
		await client.commit({ action: 'all' });

		expect(client.getTrackingAuthorization()).toBe('unsupported');
		expect(client.refreshTrackingAuthorization()).toBe('unsupported');
		expect(client.isTrackingAllowed('marketing')).toBe(true);
		expect(client.getWebViewConsent()).toBeNull();
		await expect(client.requestTrackingAuthorization()).rejects.toMatchObject({
			code: 'INTH_TRACKING_UNSUPPORTED',
		});
	});

	test('a production bundle refuses dryRun and answers deny-all', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const client = webClient(
			{ dryRun: true, projectUrl: 'http://localhost:8787' },
			{ production: true }
		);
		await started(client);

		expect(error).toHaveBeenCalledWith(
			expect.stringContaining(WEB_CONFIGURATION_DRY_RUN_CODE)
		);
		expect(client.getSnapshot()).toMatchObject({
			error: { code: WEB_CONFIGURATION_DRY_RUN_CODE },
			ready: false,
		});
		expect(client.decision('measurement')).toBe('pending');
		await expect(client.commit({ action: 'all' })).resolves.toMatchObject({
			ok: false,
			reason: 'not-bootstrapped',
		});
	});

	test('refuses a projectUrl that is not an Inth project unless dryRun is on', () => {
		expect(() =>
			webClient({ projectUrl: 'https://consent.example.com' })
		).toThrowError(/project host under inth\.app/u);
		expect(() =>
			webClient(
				{ dryRun: true, projectUrl: 'http://localhost:8787' },
				{ mode: offlineMode(), production: false }
			)
		).not.toThrowError();
	});
});

describe('the missing-prompt warning on web', () => {
	const watchOwedPrompt = async function watchOwedPrompt(
		claimed: boolean
	): Promise<unknown[][]> {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		// Fake timers before the client exists: the watcher arms its timer at
		// creation.
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const client = webClient(OPTIONS, {
				mode: offlineMode(),
				production: false,
			});
			const release = claimed ? claimPrompt(client) : () => undefined;
			const stop = client.subscribe(
				(snapshot) => snapshot.revision,
				() => undefined
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(client.getSnapshot().promptRequirement.kind).toBe('choice');
			await vi.advanceTimersByTimeAsync(UNCLAIMED_PROMPT_MS * 2);
			stop();
			release();
			return warn.mock.calls;
		} finally {
			vi.useRealTimers();
			warn.mockRestore();
		}
	};

	test('warns when nothing renders the owed prompt', async () => {
		expect(await watchOwedPrompt(false)).toHaveLength(1);
	});

	test('stays quiet while a surface claims the owed prompt', async () => {
		expect(await watchOwedPrompt(true)).toEqual([]);
	});
});

describe('the owed prompt on web', () => {
	test('a policy switch owes a new prompt', async () => {
		const client = webClient(OPTIONS, {
			mode: offline({
				acknowledgeNoRecords: true,
				policyRules: [
					{
						id: 'germany',
						match: { countries: ['DE'] },
						model: 'opt-out',
						prompt: 'choice',
					},
					...OPT_IN,
				] as never,
			}),
		});
		await started(client);
		const before = client.getSnapshot();
		expect(before.promptRequirement.kind).toBe('choice');

		await client.setOverrides({ country: 'DE' });
		await flushPromises();

		const after = client.getSnapshot();
		expect(after.resolution.policyId).toBe('germany');
		expect(after.resolution.fingerprint).not.toBe(
			before.resolution.fingerprint
		);
		expect(after.promptRequirement.kind).toBe('choice');
		expect(after.promptOwedSince).not.toBe(before.promptOwedSince);
	});
});

describe('delivery on web', () => {
	test('an explicit save that names nothing reports nothing delivered', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const empty = await client.commit({ action: 'explicit', consents: {} });
		const rejected = await client.commit({ action: 'necessary' });

		expect(empty).toMatchObject({ confirmed: [], delivered: false, ok: true });
		// Reject all records every category in scope, so it is sent.
		expect(rejected.confirmed.length).toBeGreaterThan(0);
		expect(rejected.delivered).toBe(true);
	});

	test('a commit reports its own revision when another change lands meanwhile', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const first = client.commit({ action: 'all' });
		const second = client.commit({ action: 'necessary' });
		const [one, two] = await Promise.all([first, second]);

		expect(one.revision).not.toBeNull();
		expect(two.revision).not.toBeNull();
		expect(one.revision).not.toBe(two.revision);
	});

	test('an explicit intent whose consents are an array is refused', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const result = await client.commit({
			action: 'explicit',
			consents: [],
		} as never);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-intent' });
	});

	test.each([null, undefined])(
		'a %s intent is refused, not thrown',
		async (intent) => {
			const client = webClient(OPTIONS, { mode: offlineMode() });
			await started(client);

			await expect(client.commit(intent as never)).resolves.toMatchObject({
				ok: false,
				reason: 'invalid-intent',
			});
		}
	);

	test('a bulk intent with a field it does not take is refused', async () => {
		const client = webClient(OPTIONS, { mode: offlineMode() });
		await started(client);

		const result = await client.commit({
			action: 'all',
			consents: { marketing: false },
		} as never);

		expect(result).toMatchObject({ ok: false, reason: 'invalid-intent' });
		expect(client.decision('marketing')).toBe('denied');
	});

	test('a save under the none model reports nothing delivered', async () => {
		const client = webClient(OPTIONS, {
			mode: offline({
				acknowledgeNoRecords: true,
				policyRules: [
					{
						id: 'nothing-to-ask',
						match: { fallback: true, isDefault: true },
						model: 'none',
						prompt: 'none',
					},
				] as never,
			}),
		});
		await started(client);
		expect(client.getSnapshot().model).toBe('none');

		const result = await client.commit({ action: 'all' });

		expect(result).toMatchObject({
			delivered: false,
			ok: true,
			revision: null,
		});
	});
});

describe('dryRun on web', () => {
	test('fetches the policy from /init and sends no consent record', async () => {
		const init = await createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [...OPT_IN] as never,
		}).init({ overrides: {}, user: null });
		const fetch = vi.fn((url: string | URL | Request) =>
			Promise.resolve(
				String(url).includes('/init')
					? new Response(JSON.stringify(init), {
							headers: { 'content-type': 'application/json' },
							status: 200,
						})
					: new Response('{}', { status: 200 })
			)
		);
		vi.stubGlobal('fetch', fetch);

		const client = webClient(
			{
				consentCategories: CATEGORIES,
				dryRun: true,
				projectUrl: 'http://localhost:8787',
			},
			{ production: false }
		);
		await started(client);
		await flushPromises();

		expect(client.getSnapshot()).toMatchObject({
			policyPending: false,
			ready: true,
			resolution: { policyId: 'everywhere' },
		});
		const result = await client.commit({ action: 'all' });
		await client.identify('user-1');

		expect(result).toMatchObject({ delivered: false, ok: true, queued: false });
		expect(client.decision('measurement')).toBe('granted');
		const urls = fetch.mock.calls.map(([url]) => String(url));
		expect(urls.length).toBeGreaterThan(0);
		expect(
			urls.every((url) =>
				url.startsWith('http://localhost:8787/v1/consent/init')
			)
		).toBe(true);
	});

	test('sends the property lowercase, as the native cores do', async () => {
		const init = await createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [...OPT_IN] as never,
		}).init({ overrides: {}, user: null });
		const fetch = vi.fn((url: string | URL | Request) =>
			Promise.resolve(
				new Response(
					JSON.stringify(String(url).includes('/init') ? init : {}),
					{
						headers: { 'content-type': 'application/json' },
						status: 200,
					}
				)
			)
		);
		vi.stubGlobal('fetch', fetch);
		const client = webClient(
			{
				consentCategories: CATEGORIES,
				projectUrl: PROJECT,
				property: ' Com.Acme.App ',
			},
			{ production: false }
		);
		await started(client);

		await client.commit({ action: 'all' });
		await flushPromises();

		const saves = fetch.mock.calls.filter(
			([, request]) => (request as RequestInit | undefined)?.method === 'POST'
		);
		expect(saves).not.toHaveLength(0);
		for (const [, request] of saves) {
			const body = JSON.parse(String((request as RequestInit).body));
			expect(body.property).toBe('com.acme.app');
		}
	});

	test('keeps a forced GPC signal when the app clears its GPC override', async () => {
		const init = await createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [...OPT_IN] as never,
		}).init({ overrides: {}, user: null });
		const fetch = vi.fn((_url: string | URL | Request) =>
			Promise.resolve(
				new Response(JSON.stringify(init), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				})
			)
		);
		vi.stubGlobal('fetch', fetch);
		const client = webClient(
			{
				consentCategories: CATEGORIES,
				dryRun: true,
				forceGPC: true,
				projectUrl: 'http://localhost:8787',
			},
			{ production: false }
		);
		await started(client);

		await client.setOverrides({ gpc: null });
		await flushPromises();

		const last = new URL(String(fetch.mock.calls.at(-1)?.[0]));
		expect(last.searchParams.get('gpc')).toBe('1');
		expect(client.getSnapshot().privacySignals.gpc.active).toBe(true);
	});

	test('sends a forced GPC signal with the first /init request', async () => {
		const init = await createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [...OPT_IN] as never,
		}).init({ overrides: {}, user: null });
		const fetch = vi.fn((_url: string | URL | Request) =>
			Promise.resolve(
				new Response(JSON.stringify(init), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				})
			)
		);
		vi.stubGlobal('fetch', fetch);

		const client = webClient(
			{
				consentCategories: CATEGORIES,
				dryRun: true,
				forceGPC: true,
				projectUrl: 'http://localhost:8787',
			},
			{ production: false }
		);
		await started(client);
		await flushPromises();

		// A browser's GET /init carries the GPC override in the query string.
		const first = new URL(String(fetch.mock.calls[0]?.[0]));
		expect(first.pathname).toBe('/v1/consent/init');
		expect(first.searchParams.get('gpc')).toBe('1');
		expect(client.getSnapshot().privacySignals.gpc.active).toBe(true);
	});
});

describe('webOptionsFromManifest', () => {
	test('reads extra.inth from the JSON text Expo inlines', () => {
		expect(
			webOptionsFromManifest(
				JSON.stringify({
					extra: {
						inth: {
							consentCategories: ['measurement'],
							dryRun: false,
							enableAppTrackingTransparency: true,
							forceGPC: false,
							projectUrl: PROJECT,
							property: null,
						},
					},
					name: 'App',
				})
			)
		).toEqual({
			consentCategories: ['measurement'],
			dryRun: false,
			forceGPC: false,
			projectUrl: PROJECT,
			property: null,
		});
	});

	test('answers null for a config without the plugin', () => {
		expect(webOptionsFromManifest(undefined)).toBeNull();
		expect(webOptionsFromManifest('{"extra":{}}')).toBeNull();
		expect(webOptionsFromManifest('not json')).toBeNull();
	});
});

describe('the shared provider on web', () => {
	test('renders the React Native banner over the web client and records the choice', async () => {
		const init = await createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [...OPT_IN] as never,
		}).init({ overrides: {}, user: null });
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string | URL | Request) =>
				Promise.resolve(
					String(url).includes('/init')
						? new Response(JSON.stringify(init), {
								headers: { 'content-type': 'application/json' },
								status: 200,
							})
						: new Response('{}', { status: 200 })
				)
			)
		);
		// The client a web bundle's provider builds, handed in through the
		// context a nested provider reuses.
		const client = webClient(
			{
				consentCategories: CATEGORIES,
				dryRun: true,
				projectUrl: 'http://localhost:8787',
			},
			{ production: false }
		);

		const tree = renderTree(
			<ConsentClientContext.Provider value={client}>
				<InthProvider autoPresent={false}>
					<ConsentBanner />
				</InthProvider>
			</ConsentClientContext.Provider>
		);
		await act(async () => {
			await flushPromises();
		});

		const accept = [
			...tree
				.container()
				.querySelectorAll<HTMLElement>('[data-rn-role="button"]'),
		].find((node) => /accept/iu.test(node.textContent ?? ''));
		expect(accept).toBeDefined();

		await act(async () => {
			accept?.click();
			await flushPromises();
		});

		expect(client.decision('measurement')).toBe('granted');
		tree.unmount();
	});

	test('names the Expo config plugin when the app config has no extra.inth', () => {
		expect(() => getConsentClient()).toThrowError(
			/extra\.inth[\s\S]*"@inth\/react-native"/u
		);
	});
});
