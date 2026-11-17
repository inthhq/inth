/**
 * `@c15t/core/testing` and how a runtime picks its transport from
 * `backendURL`, `mode` and `testing`.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { createConsentRuntime } from '../runtime';
import { withoutNetwork } from '../testing';

const runtimeFor = function runtimeFor(overrides: {
	country?: string;
	region?: string;
}) {
	return createConsentRuntime({
		overrides,
		persistence: false,
		testing: withoutNetwork(),
		windowDebug: false,
	});
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('withoutNetwork()', () => {
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
		const transport = withoutNetwork().transport({
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

	test('throws when the transport is built in a production build', () => {
		vi.stubEnv('NODE_ENV', 'production');

		expect(() => runtimeFor({ country: 'DE' })).toThrow(
			'withoutNetwork() from @c15t/core/testing is for tests and does not run in production. Set `backendURL` on the provider instead.'
		);
	});

	test('wins over backendURL', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			backendURL: 'https://backend.example',
			persistence: false,
			testing: withoutNetwork(),
			windowDebug: false,
		});

		await runtime.kernel.commands.init();

		expect(fetchSpy).not.toHaveBeenCalled();
		runtime.dispose();
	});
});

describe('backendURL', () => {
	test('alone selects the hosted backend', async () => {
		const fetchSpy = vi.fn<typeof globalThis.fetch>(() =>
			Promise.reject(new Error('offline'))
		);
		vi.stubGlobal('fetch', fetchSpy);
		const runtime = createConsentRuntime({
			backendURL: 'https://backend.example',
			persistence: false,
		});
		runtime.start();

		await runtime.kernel.commands.init().catch(() => undefined);

		expect(String(fetchSpy.mock.calls[0]?.[0]).split('?')[0]).toBe(
			'https://backend.example/init'
		);
		expect((window as { c15t?: { mode?: string } }).c15t?.mode).toBe('hosted');
		runtime.dispose();
	});

	test('a runtime with no backend URL, mode or testing value throws', () => {
		expect(() => createConsentRuntime({})).toThrow('`backendURL` is required');
	});
});
