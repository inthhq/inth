/**
 * Runtime options pass through `provideC15t()` to `@inth/sdk/runtime`:
 * scripts, the network blocker, persistence, clear-on-revocation,
 * callbacks and GPP. Ports of the Vue adapter's script-loader,
 * plugin-network-blocker, policy-runtime and gpp tests.
 */
import { ChangeDetectionStrategy, Component, CSP_NONCE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../__tests__/fixtures/transport-mode';
import { TEST_OPT_IN_RULE, testOptions } from '../../__tests__/test-local';
import { ConsentManager } from './consent-manager';
import type { C15tOptions, C15tProviderOptions } from './options';
import { provideC15t } from './provide-c15t';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'test-app',
	template: '<main>App</main>',
})
class TestApp {}

/** Boot an app with `provideC15t()` and wait for its policy. */
const boot = async function boot(options: Partial<C15tOptions> = {}) {
	TestBed.configureTestingModule({
		providers: [
			provideC15t({
				...testOptions(),
				// jsdom cannot reload the page a revocation would reload.
				reloadOnConsentRevoked: false,
				...options,
			} as C15tProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(TestApp);
	await fixture.whenStable();
	const consent = TestBed.inject(ConsentManager);
	await vi.waitFor(() => expect(consent.hasPolicy()).toBe(true));
	return { consent, fixture };
};

const inserted = (src: string) =>
	document.querySelectorAll(`script[src="${src}"]`).length;

afterEach(() => {
	TestBed.resetTestingModule();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.head
		.querySelectorAll('script[src]')
		.forEach((element) => element.remove());
});

describe('scripts', () => {
	test('a gated script loads on a grant and unloads on withdrawal', async () => {
		const { consent } = await boot({
			scripts: [
				{ category: 'measurement', id: 'analytics', src: '/analytics.js' },
				{
					alwaysLoad: true,
					category: 'necessary',
					id: 'ops',
					src: '/ops.js',
				},
			],
		});
		await vi.waitFor(() => expect(inserted('/ops.js')).toBe(1));
		expect(inserted('/analytics.js')).toBe(0);

		await consent.saveConsents('all');
		await vi.waitFor(() => expect(inserted('/analytics.js')).toBe(1));

		await consent.saveConsents('necessary');
		await vi.waitFor(() => expect(inserted('/analytics.js')).toBe(0));
		expect(inserted('/ops.js')).toBe(1);
	});

	test('destroying the app removes its scripts', async () => {
		const { consent } = await boot({
			scripts: [
				{ category: 'measurement', id: 'analytics', src: '/analytics.js' },
			],
		});
		await consent.saveConsents('all');
		await vi.waitFor(() => expect(inserted('/analytics.js')).toBe(1));
		TestBed.resetTestingModule();
		await vi.waitFor(() => expect(inserted('/analytics.js')).toBe(0));
	});

	test("scripts carry Angular's CSP_NONCE unless nonce is set", async () => {
		const scripts = [
			{
				alwaysLoad: true,
				category: 'necessary' as const,
				id: 'ops',
				src: '/ops.js',
			},
		];
		const nonceOf = () =>
			document.querySelector<HTMLScriptElement>('script[src="/ops.js"]')?.nonce;

		TestBed.configureTestingModule({
			providers: [{ provide: CSP_NONCE, useValue: 'from-angular' }],
		});
		await boot({ scripts });
		await vi.waitFor(() => expect(nonceOf()).toBe('from-angular'));

		TestBed.resetTestingModule();
		document.head
			.querySelectorAll('script[src]')
			.forEach((element) => element.remove());
		TestBed.configureTestingModule({
			providers: [{ provide: CSP_NONCE, useValue: 'from-angular' }],
		});
		await boot({ nonce: 'from-options', scripts });
		await vi.waitFor(() => expect(nonceOf()).toBe('from-options'));
	});
});

describe('networkBlocker', () => {
	const TRACKER = 'https://tracker.example/collect';

	const stubNetwork = () => {
		const network = vi.fn((_input: RequestInfo | URL) =>
			Promise.resolve(new Response('{}', { status: 503 }))
		);
		vi.stubGlobal('fetch', network);
		return () =>
			network.mock.calls.filter(([input]) => String(input).startsWith(TRACKER));
	};

	test('blocks requests matching its rules until the category is allowed', async () => {
		const trackerCalls = stubNetwork();
		const onRequestBlocked = vi.fn();
		const { consent } = await boot({
			networkBlocker: {
				logBlockedRequests: false,
				onRequestBlocked,
				rules: [{ category: 'measurement', domain: 'tracker.example' }],
			},
		});
		await vi.waitFor(async () =>
			expect((await window.fetch(TRACKER)).status).toBe(451)
		);
		expect(trackerCalls()).toHaveLength(0);
		expect(onRequestBlocked).toHaveBeenCalledWith(
			expect.objectContaining({ url: TRACKER })
		);

		await consent.saveConsents('all');
		expect((await window.fetch(TRACKER)).status).toBe(503);
		expect(trackerCalls()).toHaveLength(1);
	});

	test('networkBlocker: false leaves fetch alone', async () => {
		const trackerCalls = stubNetwork();
		await boot({ networkBlocker: false });
		expect((await window.fetch(TRACKER)).status).toBe(503);
		expect(trackerCalls()).toHaveLength(1);
	});
});

describe('persistence', () => {
	const storageKey = 'angular-runtime-options';

	afterEach(() => {
		localStorage.removeItem(storageKey);
		document.cookie = `${storageKey}=; Max-Age=0; Path=/`;
	});

	test('stores a choice under storageConfig and restores it in the next app', async () => {
		const { consent } = await boot({
			persistence: true,
			storageConfig: { storageKey },
		});
		await consent.saveConsents('all');
		await vi.waitFor(() =>
			expect(localStorage.getItem(storageKey)).not.toBeNull()
		);
		TestBed.resetTestingModule();

		const next = await boot({
			persistence: true,
			storageConfig: { storageKey },
		});
		expect(next.consent.has('measurement')).toBe(true);
		expect(next.consent.activeUI()).toBe('none');
	});

	test('persistence: false stores nothing', async () => {
		const { consent } = await boot({
			persistence: false,
			storageConfig: { storageKey },
		});
		await consent.saveConsents('all');
		expect(localStorage.getItem(storageKey)).toBeNull();
	});
});

test('clearOnRevocation clears the configured storage when permission is revoked', async () => {
	const { consent } = await boot({
		clearOnRevocation: {
			measurement: { localStorage: ['analytics:visitor'] },
		},
	});
	await consent.saveConsents('all');
	localStorage.setItem('analytics:visitor', 'visitor');
	localStorage.setItem('application:setting', 'keep');
	try {
		await consent.saveConsents('necessary');
		await vi.waitFor(() =>
			expect(localStorage.getItem('analytics:visitor')).toBeNull()
		);
		expect(localStorage.getItem('application:setting')).toBe('keep');
	} finally {
		localStorage.removeItem('analytics:visitor');
		localStorage.removeItem('application:setting');
	}
});

describe('callbacks', () => {
	test('a notice dismissal records no choice; a save calls each callback once', async () => {
		const onChoiceRecorded = vi.fn();
		const onPermissionsChanged = vi.fn();
		const onSurfaceShown = vi.fn();
		const { consent } = await boot({
			callbacks: { onChoiceRecorded, onPermissionsChanged, onSurfaceShown },
			mode: offlineMode([
				{ ...TEST_OPT_IN_RULE, model: 'opt-out', prompt: 'notice' },
			]),
		});
		await vi.waitFor(() =>
			expect(onSurfaceShown).toHaveBeenCalledWith(
				expect.objectContaining({ surface: 'banner' })
			)
		);
		// Resolving the policy at init changed the permissions once.
		onPermissionsChanged.mockClear();
		await consent.dismissNotice();
		expect(onChoiceRecorded).not.toHaveBeenCalled();
		expect(onPermissionsChanged).not.toHaveBeenCalled();

		await consent.saveConsents('necessary');
		expect(onChoiceRecorded).toHaveBeenCalledOnce();
		expect(onPermissionsChanged).toHaveBeenCalledOnce();
		expect(onChoiceRecorded.mock.calls[0]?.[0]).not.toHaveProperty('type');

		consent.setActiveUI('dialog');
		expect(onSurfaceShown).toHaveBeenLastCalledWith(
			expect.objectContaining({ surface: 'dialog' })
		);
	});

	test('updateOptions swaps callbacks without a new runtime', async () => {
		const first = vi.fn();
		const next = vi.fn();
		const { consent } = await boot({
			callbacks: { onChoiceRecorded: first },
		});
		const { runtime } = consent;
		await consent.updateOptions({ callbacks: { onChoiceRecorded: next } });
		await consent.saveConsents('all');
		expect(first).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledOnce();
		expect(consent.runtime).toBe(runtime);
	});
});

describe('gpp', () => {
	type GPPWindow = Window & {
		__gpp?: (command: string, callback: (data: unknown) => void) => void;
	};
	const gppWindow = window as GPPWindow;
	const ping = (): { cmpStatus?: string } | undefined => {
		let data: { cmpStatus?: string } | undefined;
		gppWindow.__gpp?.('ping', (result) => {
			data = result as { cmpStatus?: string };
		});
		return data;
	};

	beforeAll(async () => {
		// Load the chunk once so the negative case can't pass on a slow import.
		await import('@inth/sdk/iab/gpp');
	}, 30_000);

	afterEach(() => {
		delete gppWindow.__gpp;
	});

	test('installs __gpp once the runtime starts and removes it with the app', async () => {
		await boot({ gpp: true });
		await vi.waitFor(() =>
			expect(ping()).toMatchObject({ cmpStatus: 'loaded' })
		);
		TestBed.resetTestingModule();
		expect(gppWindow.__gpp).toBeUndefined();
	});

	test('gpp options reach createGPP, whose errors reach onError', async () => {
		const onError = vi.fn();
		// Neither 1 nor a registered CMP ID, so createGPP rejects it.
		await boot({ callbacks: { onError }, gpp: { cmpId: 0 } });
		await vi.waitFor(() =>
			expect(onError).toHaveBeenCalledWith({
				error: expect.stringContaining('cmpId'),
			})
		);
		expect(gppWindow.__gpp).toBeUndefined();
	});

	test('without gpp no __gpp is installed', async () => {
		await boot();
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(gppWindow.__gpp).toBeUndefined();
	});
});
