/**
 * `@inth/sdk/testing` and how a runtime picks its transport from
 * `projectUrl` and `mode`.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { hosted } from '../modes';
import { createConsentRuntime } from '../runtime';
import { testing } from '../testing';

/** A rule that shows the opt-out notice banner, which no recommended rule does. */
const NOTICE_RULE = {
	id: 'notice-everywhere',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	prompt: 'notice',
} as const;

const runtimeFor = function runtimeFor(overrides: {
	country?: string;
	region?: string;
}) {
	return createConsentRuntime({
		mode: testing(),
		overrides,
		persistence: false,
	});
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('testing()', () => {
	// The recommended pack reaches each prompt type through the location
	// overrides, so tests need no inline policy.
	test.each([
		['an EEA country', { country: 'DE' }, 'opt-in', 'choice'],
		['the UK', { country: 'GB' }, 'opt-in', 'choice'],
		['an unknown location', {}, 'opt-in', 'choice'],
		['a US privacy state', { country: 'US', region: 'CA' }, 'opt-out', 'none'],
		['a country with no rule', { country: 'JP' }, 'none', 'none'],
	])('resolves %s to the %s model', async (_name, overrides, model, prompt) => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = runtimeFor(overrides);

		await runtime.kernel.commands.init();
		const snapshot = runtime.kernel.getSnapshot();

		expect(snapshot.model).toBe(model);
		expect(snapshot.promptRequirement.kind).toBe(prompt);
		expect(fetchSpy).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test('resolves an EEA country to IAB TCF when the provider configures IAB', async () => {
		const transport = testing().transport({
			iabEnabled: true,
			prefetch: {},
			translations: { language: 'en', translations: {} as never },
		});

		const response = await transport.init?.({
			overrides: { country: 'DE' },
		} as never);

		expect(
			(
				response?.policyResolution as
					| { policy?: { model?: string } }
					| undefined
			)?.policy?.model
		).toBe('iab');
	});

	test('resolves an EEA country to IAB TCF with iab, even when the runtime cannot tell', async () => {
		const transport = testing({ iab: true }).transport({
			prefetch: {},
			translations: { language: 'en', translations: {} as never },
		});

		const response = await transport.init?.({
			overrides: { country: 'DE' },
		} as never);

		expect(
			(
				response?.policyResolution as
					| { policy?: { model?: string } }
					| undefined
			)?.policy?.model
		).toBe('iab');
	});

	test('resolves the policy it is given instead of the recommended pack', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			mode: testing({ policy: [NOTICE_RULE] }),
			overrides: { country: 'DE' },
			persistence: false,
		});

		await runtime.kernel.commands.init();
		const snapshot = runtime.kernel.getSnapshot();

		expect(snapshot.model).toBe('opt-out');
		expect(snapshot.promptRequirement.kind).toBe('notice');
		expect(fetchSpy).not.toHaveBeenCalled();
		runtime.dispose();
	});

	test('picks the rule matching the location overrides from the policy', async () => {
		const runtime = createConsentRuntime({
			mode: testing({
				policy: [
					{ ...NOTICE_RULE, id: 'us', match: { countries: ['US'] } },
					{
						id: 'rest',
						match: { fallback: true, isDefault: true },
						model: 'none',
						prompt: 'none',
					},
				],
			}),
			overrides: { country: 'JP' },
			persistence: false,
		});

		await runtime.kernel.commands.init();

		expect(runtime.kernel.getSnapshot().model).toBe('none');
		runtime.dispose();
	});

	test('carries its policy as data, so a config can serialize it', () => {
		expect(
			JSON.parse(JSON.stringify(testing({ policy: NOTICE_RULE })))
		).toEqual({ policy: NOTICE_RULE, type: 'testing' });
	});

	test('throws when the transport is built in a production build', () => {
		vi.stubEnv('NODE_ENV', 'production');

		expect(() => runtimeFor({ country: 'DE' })).toThrow(
			'testing() from @inth/sdk/testing is for tests and does not run in production. Set `projectUrl` on the provider and remove `mode: testing()`.'
		);
	});

	test('needs no projectUrl and ignores one', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			mode: testing(),
			persistence: false,
			projectUrl: 'https://backend.example',
		});

		await runtime.kernel.commands.init();

		expect(fetchSpy).not.toHaveBeenCalled();
		runtime.dispose();
	});
});

describe('projectUrl', () => {
	test('alone selects the hosted backend', async () => {
		const fetchSpy = vi.fn<typeof globalThis.fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			persistence: false,
			projectUrl: 'https://backend.example',
		});
		runtime.start();

		await runtime.kernel.commands.init().catch(() => undefined);

		expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://backend.example/v1/consent/init'
		);
		expect(
			(window as { __inthDebug?: { mode?: string } }).__inthDebug?.mode
		).toBe('hosted');
		runtime.dispose();
	});

	test('hosted() selects the hosted backend, as no mode does', async () => {
		const fetchSpy = vi.fn<typeof globalThis.fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			mode: hosted(),
			persistence: false,
			projectUrl: 'https://backend.example',
		});
		runtime.start();

		await runtime.kernel.commands.init().catch(() => undefined);

		expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://backend.example/v1/consent/init'
		);
		runtime.dispose();
	});

	test('a runtime with no backend URL throws one error that says what to set', () => {
		// @ts-expect-error -- `projectUrl` is required by the type as well.
		expect(() => createConsentRuntime({})).toThrow(
			'`projectUrl` is required. Set it to your Inth project URL, or use `mode: testing()` from a /testing entry in tests.'
		);
		// @ts-expect-error -- `hosted()` still needs the backend URL.
		expect(() => createConsentRuntime({ mode: hosted() })).toThrow(
			'`projectUrl` is required'
		);
	});

	test('a disabled runtime needs no backend URL until it inits', async () => {
		const runtime = createConsentRuntime({
			enabled: false,
			persistence: false,
		});

		const result = await runtime.kernel.commands.init();

		expect(String((result as { error?: unknown }).error)).toContain(
			'`projectUrl` is required'
		);
		runtime.dispose();
	});
});
