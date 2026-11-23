import { policyRulePresets } from '@inth/sdk-core';
import type {
	KernelTransport,
	PolicyRule,
	ProviderTransportFactory,
} from '@inth/sdk-core';
import { hosted as hostedTransport } from '@inth/sdk-core/transports';
import {
	POLICY_CONTRACT_HEADER,
	POLICY_CONTRACT_VERSION,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import { translations } from '@inth/sdk-translations/en';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
	ConsentClient,
	ConsentClientOptions,
	ConsentUIOptions,
	ScriptTagClientOptions,
	TestingScriptTagOptions,
} from '../consent-client.model';
import { createHostedConsentClient } from '../create-hosted-consent-client';
import { createConsentClient as createHostedClient } from '../hosted';
import { createConsentClient, getEventDispatcher } from '../index';
import { resolveRules } from '../policy-rules';
import { testing } from '../testing';
import { createTestingConsentClient } from '../testing-global';

/** A transport factory that hands the client `transport`. */
const custom = (
	transport: Partial<KernelTransport>
): ProviderTransportFactory =>
	Object.assign(() => transport as KernelTransport, {
		kind: 'custom' as const,
	});

/** A query pair Inth adds to `/v1/consent/init`. */
const INIT_PAIR =
	/^(?:v|contract|country|region|gpc|experiment|journey|journeyScope|stored)=/u;

/** A request URL without the parameters a client adds to `/v1/consent/init`. */
const pathOf = (url: unknown): string => {
	const text = String(url);
	const [base = '', query] = text.split('?');
	if (query === undefined) {
		return text;
	}
	const pairs = query.split('&');
	const kept = pairs.filter((pair) => !INIT_PAIR.test(pair));
	if (kept.length === pairs.length) {
		return text;
	}
	return kept.length > 0 ? `${base}?${kept.join('&')}` : base;
};

const clients: ConsentClient[] = [];

/** `@inth/sdk` with `testing()`, resolving `policy`. */
const createTestingClient = ({
	mode,
	policy,
	...options
}: Omit<ConsentClientOptions, 'mode'> & {
	mode?: ConsentClientOptions['mode'];
	policy?: TestingScriptTagOptions['policy'];
}): ConsentClient =>
	createConsentClient({
		...options,
		mode: mode ?? testing({ policy: resolveRules(policy) }),
	});
const projectUrl = 'https://consent.example.test';
const authoredRule: PolicyRule = {
	...policyRulePresets.europeOptIn(),
	categories: ['measurement', 'marketing'],
	id: 'authored-opt-in',
	match: { isDefault: true },
	scopeMode: 'strict',
};
const policyResolution = resolvePolicyRules({ rules: [authoredRule] });
const uiOptions: ConsentUIOptions = {
	disableAnimation: true,
	shadow: false,
	styles: false,
};

const initResponse = (): Response =>
	Response.json(
		{
			branding: 'inth',
			location: { countryCode: 'DE', regionCode: null },
			policyResolution: writePolicyResolutionWire(policyResolution),
			translations: { language: 'en', translations },
		},
		{
			headers: {
				[POLICY_CONTRACT_HEADER]: String(POLICY_CONTRACT_VERSION),
			},
		}
	);

const saveResponse = (): Response =>
	Response.json({
		recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
		subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
	});

const track = (client: ConsentClient): ConsentClient => {
	clients.push(client);
	return client;
};

const query = (client: ConsentClient, testId: string): HTMLElement => {
	const element = client.ui?.root.querySelector<HTMLElement>(
		`[data-testid="${testId}"]`
	);
	if (!element) {
		throw new Error(`Missing ${testId}`);
	}
	return element;
};

afterEach(() => {
	for (const client of clients.splice(0)) {
		client.dispose();
	}
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; Max-Age=0; path=/`;
		}
	}
	document.body.replaceChildren();
});

describe.each(['hosted', 'testing'] as const)('%s browser entry', (mode) => {
	it('waits for start before requests, persistence and UI mounting', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(initResponse()));
		vi.stubGlobal('fetch', fetchSpy);
		const client = track(
			mode === 'hosted'
				? createHostedClient({ projectUrl, ui: uiOptions })
				: createTestingClient({ policy: [authoredRule], ui: uiOptions })
		);

		expect(client.started).toBe(false);
		expect(client.ui).toBeNull();
		expect(document.querySelector('[data-inth-ui]')).toBeNull();
		expect(localStorage.length).toBe(0);
		expect(document.cookie).toBe('');
		expect(fetchSpy).not.toHaveBeenCalled();

		client.start();
		await client.ready();

		expect(client.mode).toBe(mode);
		expect(client.started).toBe(true);
		// The prompt loads on demand.
		await vi.waitFor(() =>
			expect(query(client, 'consent-banner-root').isConnected).toBe(true)
		);
		expect(fetchSpy).toHaveBeenCalledTimes(mode === 'hosted' ? 1 : 0);
	});

	it('keeps page actions, the preference draft and script gating working', async () => {
		const fetchSpy = vi.fn<typeof fetch>((input) =>
			Promise.resolve(
				String(input).split('?')[0]?.endsWith('/v1/consent/init')
					? initResponse()
					: saveResponse()
			)
		);
		vi.stubGlobal('fetch', fetchSpy);
		for (const category of ['measurement', 'marketing']) {
			const script = document.createElement('script');
			script.type = 'text/plain';
			script.dataset.inthCategory = category;
			script.textContent = `window.${category} = true;`;
			document.body.append(script);
		}
		const client = track(
			mode === 'hosted'
				? createHostedClient({
						projectUrl,
						reloadOnConsentRevoked: false,
						ui: uiOptions,
					})
				: createTestingClient({
						policy: [authoredRule],
						reloadOnConsentRevoked: false,
						ui: uiOptions,
					})
		);
		client.start();
		await client.ready();
		expect(document.querySelector('[data-inth-activated="true"]')).toBeNull();

		const link = document.createElement('a');
		link.href = '#inth-preferences';
		document.body.append(link);
		link.click();
		expect(client.getSnapshot().activeUI).toBe('dialog');
		// The dialog loads on demand.
		const card = await vi.waitFor(() => query(client, 'consent-dialog-card'));
		expect(card.getAttribute('role')).toBe('dialog');
		query(client, 'consent-dialog-category-switch-measurement').click();
		expect(client.has('measurement')).toBe(false);
		const save = query(client, 'consent-dialog-save-button');
		await vi.waitFor(() =>
			expect((save as HTMLButtonElement).disabled).toBe(false)
		);
		save.click();
		await vi.waitFor(() => expect(client.has('measurement')).toBe(true));
		expect(client.has('marketing')).toBe(false);
		expect(client.getSnapshot().activeUI).toBe('none');
		await vi.waitFor(() =>
			expect(
				client.ui?.root.querySelector('[data-testid="consent-dialog-card"]')
			).toBeNull()
		);
		await vi.waitFor(() =>
			expect(
				document.querySelectorAll(
					'[data-inth-category="measurement"][data-inth-activated="true"]'
				)
			).toHaveLength(1)
		);
		expect(
			document.querySelector<HTMLScriptElement>(
				'[data-inth-category="marketing"]'
			)?.type
		).toBe('text/plain');
		const reject = document.createElement('button');
		reject.dataset.inthAction = 'reject';
		document.body.append(reject);
		reject.click();
		expect(client.has('measurement')).toBe(false);
		expect(client.getSnapshot().activeUI).toBe('none');
		expect(
			fetchSpy.mock.calls.every(
				([input]) =>
					mode === 'hosted' &&
					[
						`${projectUrl}/v1/consent/init`,
						`${projectUrl}/v1/consent/records`,
					].includes(pathOf(input))
			)
		).toBe(true);

		client.dispose();
		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(false);
		expect(client.ui).toBeNull();
	});
});

describe('hosted browser entry', () => {
	it('uses the resolved /init policy when authored rules are also supplied', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(initResponse()));
		vi.stubGlobal('fetch', fetchSpy);
		const client = track(
			createHostedClient({
				policy: [policyRulePresets.worldNone()],
				projectUrl,
				ui: false,
			})
		);
		client.start();
		const snapshot = await client.ready();

		expect(fetchSpy.mock.calls.map(([input]) => pathOf(input))).toEqual([
			`${projectUrl}/v1/consent/init`,
		]);
		expect(snapshot.resolution.status).toBe('matched');
		expect(snapshot.policyRule.id).toBe(authoredRule.id);
		expect(snapshot.model).toBe('opt-in');
		expect(snapshot.location?.countryCode).toBe('DE');
		expect(client.has('measurement')).toBe(false);
	});

	it('preserves the hosted factory fetch and init URL, and sends header inputs in the query', async () => {
		const globalFetch = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', globalFetch);
		const fetchSpy = vi.fn<typeof fetch>((input) =>
			Promise.resolve(
				pathOf(input) === '/consent/v1/consent/init'
					? initResponse()
					: saveResponse()
			)
		);
		const client = track(
			createHostedClient({
				mode: hostedTransport({
					fetch: fetchSpy,
					headers: {
						'Accept-Language': 'de',
						Authorization: 'must-not-forward',
						'CF-IPCountry': 'DE',
					},
					initUrl: '/consent/v1/consent/init',
					projectUrl: `${projectUrl}/api/`,
				}),
				ui: false,
			})
		);
		client.start();
		await client.ready();
		await expect(client.acceptAll()).resolves.toMatchObject({ ok: true });

		expect(fetchSpy.mock.calls.map(([input]) => pathOf(input))).toEqual([
			'/consent/v1/consent/init',
			`${projectUrl}/api/v1/consent/records`,
		]);
		const [initInput, init] = fetchSpy.mock.calls[0] ?? [];
		expect([...new Headers(init?.headers)].toSorted()).toEqual([
			['accept', 'application/json'],
			['accept-language', 'de'],
		]);
		expect(
			new URL(String(initInput), projectUrl).searchParams.get('country')
		).toBe('DE');
		expect(globalFetch).not.toHaveBeenCalled();
	});

	it('uses a ready server prefetch without calling /v1/consent/init', async () => {
		const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(saveResponse()));
		vi.stubGlobal('fetch', fetchSpy);
		const client = track(
			createHostedClient({
				prefetch: {
					initialPolicyResolution: policyResolution,
					initialTranslations: { language: 'en', translations },
				},
				projectUrl,
				ui: false,
			})
		);
		client.start();
		expect((await client.ready()).policyRule.id).toBe(authoredRule.id);
		expect(fetchSpy).not.toHaveBeenCalled();
		await client.rejectAll();
		expect(fetchSpy.mock.calls.map(([input]) => pathOf(input))).toEqual([
			`${projectUrl}/v1/consent/records`,
		]);
	});

	it.each(['accept', 'reject', 'save'] as const)(
		'applies and persists the first %s before the backend save settles',
		async (action) => {
			const request = Promise.withResolvers<Response>();
			const fetchSpy = vi.fn<typeof fetch>((input) =>
				String(input).split('?')[0]?.endsWith('/v1/consent/init')
					? Promise.resolve(initResponse())
					: request.promise
			);
			vi.stubGlobal('fetch', fetchSpy);
			const client = track(createHostedClient({ projectUrl, ui: uiOptions }));
			client.start();
			await client.ready();
			if (action === 'save') {
				client.openDialog();
			}
			const actions = {
				accept: () => client.acceptAll(),
				reject: () => client.rejectAll(),
				save: () => client.save({ marketing: false, measurement: true }),
			};
			const saving = actions[action]();
			const measurement = action !== 'reject';
			const marketing = action === 'accept';

			expect(client.has('measurement')).toBe(measurement);
			expect(client.has('marketing')).toBe(marketing);
			expect(client.hasConsented()).toBe(true);
			expect(client.getSnapshot().activeUI).toBe('none');
			expect(
				client.ui?.root.querySelector(
					'[data-testid="consent-banner-root"], [data-testid="consent-dialog-root"]'
				)
			).toBeNull();
			expect(fetchSpy).toHaveBeenCalledOnce();
			await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
			expect(localStorage.getItem('inth')).toContain('measurement');
			request.resolve(saveResponse());
			await expect(saving).resolves.toMatchObject({ ok: true });
			client.dispose();

			const next = track(createHostedClient({ projectUrl, ui: uiOptions }));
			next.start();
			await next.ready();
			expect(next.has('measurement')).toBe(measurement);
			expect(next.has('marketing')).toBe(marketing);
			expect(next.hasConsented()).toBe(true);
			expect(next.getSnapshot().activeUI).toBe('none');
		}
	);
});

describe('testing browser entry', () => {
	it.each([
		['DE', undefined, 'opt-in', false],
		['US', 'CA', 'opt-out', true],
		['JP', undefined, 'none', true],
	] as const)(
		'resolves preset rules for %s/%s without a backend',
		async (country, region, model, measurement) => {
			const fetchSpy = vi.fn<typeof fetch>();
			vi.stubGlobal('fetch', fetchSpy);
			const client = track(
				createTestingClient({
					consentCategories: ['measurement'],
					overrides: { country, region },
					policy: ['europeOptIn', 'usPrivacyStatesOptOut', 'worldNone'],
					ui: false,
				})
			);
			client.start();
			expect((await client.ready()).model).toBe(model);
			expect(client.has('measurement')).toBe(measurement);
			expect(fetchSpy).not.toHaveBeenCalled();
		}
	);

	it('keeps authored factory rules and custom language changes', async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchSpy);
		const client = track(
			createTestingClient({
				consentCategories: ['measurement', 'experience'],
				i18n: {
					messages: { de: { cookieBanner: { title: 'Ihre Privatsphäre' } } },
				},
				mode: testing({
					policy: [
						{
							...authoredRule,
							categories: ['experience'],
							id: 'authored-experience',
						},
					],
				}),
				ui: uiOptions,
			})
		);
		client.start();
		expect((await client.ready()).policyRule.id).toBe('authored-experience');
		expect(client.consentCategories).toEqual(['necessary', 'experience']);
		client.setLanguage('de');
		await vi.waitFor(() =>
			expect(query(client, 'consent-banner-title').textContent).toBe(
				'Ihre Privatsphäre'
			)
		);
		expect(client.getSnapshot().translations?.language).toBe('de');
		await client.save({ experience: true });
		expect(client.has('experience')).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('restores a partial local choice on the next client without a request', async () => {
		const fetchSpy = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchSpy);
		const client = track(
			createTestingClient({ policy: [authoredRule], ui: false })
		);
		client.start();
		await client.ready();
		await expect(
			client.save({ marketing: false, measurement: true })
		).resolves.toMatchObject({ ok: true });
		client.dispose();

		const next = track(
			createTestingClient({ policy: [authoredRule], ui: false })
		);
		next.start();
		await next.ready();
		expect(next.has('measurement')).toBe(true);
		expect(next.has('marketing')).toBe(false);
		expect(next.hasConsented()).toBe(true);
		expect(next.getSnapshot().activeUI).toBe('none');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('sends events to the client scripts once the visitor consents', async () => {
		vi.stubGlobal('fetch', vi.fn<typeof fetch>());
		const capture = vi.fn();
		const client = track(
			createTestingClient({
				policy: [authoredRule],
				scripts: [
					{
						callbackOnly: true,
						category: 'measurement',
						id: 'posthog',
						vendor: 'posthog',
					},
				],
				ui: false,
			})
		);
		client.start();
		await client.ready();
		const events = getEventDispatcher(client.runtime, {
			globals: { posthog: { capture } },
		});
		events.track('search');
		await client.save({ marketing: false, measurement: true });
		events.track('search', { resultCount: 3 });
		expect(capture.mock.calls).toEqual([['search', { resultCount: 3 }]]);
	});
});

const manifest = {
	branding: 'inth' as const,
	revision: '1',
	schemaVersion: 2 as const,
};
const hostedInvalidCases: [string, ScriptTagClientOptions][] = [
	['missing backend', {}],
	['inline manifest', { manifest, projectUrl }],
	['manifest URL', { manifestUrl: '/v1/consent/manifest', projectUrl }],
	['manifest mode', { mode: 'manifest', projectUrl }],
	['testing()', { mode: testing() as never }],
	['custom factory', { mode: custom({}) }],
];
const testingInvalidCases: [string, TestingScriptTagOptions][] = [
	['backend URL', { projectUrl } as never],
	['inline manifest', { manifest } as never],
	['manifest URL', { manifestUrl: '/v1/consent/manifest' } as never],
	['hosted mode', { mode: 'hosted' } as never],
	['manifest mode', { mode: 'manifest' } as never],
];

describe('mode-specific JavaScript configuration', () => {
	it.each(hostedInvalidCases)(
		'rejects %s in the hosted entry before startup',
		(_name, options) => {
			const fetchSpy = vi.fn<typeof fetch>();
			vi.stubGlobal('fetch', fetchSpy);
			expect(() => createHostedConsentClient(options)).toThrow(
				/@inth\/sdk\/hosted/u
			);
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(document.querySelector('[data-inth-ui]')).toBeNull();
		}
	);

	it.each(testingInvalidCases)(
		'rejects %s in the testing script before startup',
		(_name, options) => {
			const fetchSpy = vi.fn<typeof fetch>();
			vi.stubGlobal('fetch', fetchSpy);
			expect(() => createTestingConsentClient(options, {})).toThrow(
				/@inth\/sdk\/testing/u
			);
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(document.querySelector('[data-inth-ui]')).toBeNull();
		}
	);
});
