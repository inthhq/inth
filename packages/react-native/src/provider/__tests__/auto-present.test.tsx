/**
 * The native `ConsentPrompt` decides when a prompt is owed and presents it.
 * The provider only hands native its settings and mirrors what native reports
 * on screen. When a prompt opens, and that it never opens twice or for an app
 * that opted out, is tested against native: `ConsentHostAutoPresentTest`
 * (Kotlin) and `ConsentHostTests` (Swift).
 */

import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	captureErrorMessage,
	createFakeNativeModule,
	emitOutcome,
	emitPresented,
	flushPromises,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import {
	emitNativeEvent,
	resetNativeStub,
	setAppState,
} from '../../__tests__/helpers/react-native-stub';
import { getConsentClient, resetConsentClient } from '../../native/client';
import {
	presentConsentPrompt,
	presentPreferences,
} from '../../native/presenter';
import { isConsentScreenBusy } from '../auto-present';
import { ConsentProvider } from '../consent-provider';

const URL = 'https://example.com/privacy';

const owed = buildSnapshot({
	promptRequirement: { kind: 'choice', reason: 'missing' },
	resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
	revision: 1,
});

const on = { autoPresent: true, privacyPolicyURL: URL };
const off = { autoPresent: false, privacyPolicyURL: URL };

const App = ({ children }: { readonly children?: ReactNode }): ReactNode => (
	<ConsentProvider privacyPolicyUrl={URL}>{children}</ConsentProvider>
);

const rejectWith = (code: string): Promise<never> =>
	Promise.reject(Object.assign(new Error(code), { code }));

afterEach(() => {
	vi.restoreAllMocks();
	resetConsentClient();
	resetNativeStub();
});

describe('the settings native is told', () => {
	test('on by default, with the URL', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(<App />);
		await flushPromises();
		expect(fake.autoPresentSettings).toStrictEqual([on]);
		tree.unmount();
		expect(fake.autoPresent).toStrictEqual(off);
	});

	test('autoPresent={false} turns it off', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		expect(fake.autoPresentSettings).toStrictEqual([
			{ autoPresent: false, privacyPolicyURL: null },
		]);
		tree.unmount();
	});

	test('strict mode ends on, and unmounting turns it off', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(
			<StrictMode>
				<App />
			</StrictMode>
		);
		await flushPromises();
		expect(fake.autoPresent).toStrictEqual(on);
		tree.unmount();
		expect(fake.autoPresent).toStrictEqual(off);
	});

	test('a nested provider sends nothing', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(
			<App>
				<ConsentProvider autoPresent={false}>
					<span />
				</ConsentProvider>
			</App>
		);
		await flushPromises();
		expect(fake.autoPresentSettings).toStrictEqual([on]);
		tree.unmount();
	});

	test('turning autoPresent on, and a new URL, reach native', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		tree.rerender(<App />);
		await flushPromises();
		expect(fake.autoPresent).toStrictEqual(on);
		const next = 'https://example.org/privacy';
		tree.rerender(<ConsentProvider privacyPolicyUrl={next} />);
		await flushPromises();
		expect(fake.autoPresent).toStrictEqual({
			autoPresent: true,
			privacyPolicyURL: next,
		});
		tree.unmount();
	});

	test('JavaScript decides nothing: no owed prompt is asked for, however often it changes', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const present = vi.fn(() =>
			Promise.resolve(JSON.stringify({ sessionId: 's1', status: 'presented' }))
		);
		fake.presentConsentPrompt = present;
		const tree = renderTree(<App />);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 2 });
		fake.pushSnapshot(buildSnapshot({ promptRequirement: { kind: 'none' } }));
		fake.pushSnapshot({ ...owed, revision: 4 });
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).not.toHaveBeenCalled();
		expect(fake.autoPresentSettings).toStrictEqual([on]);
		tree.unmount();
	});
});

describe('what native reports on screen', () => {
	test('a presented session is busy until its own outcome', async () => {
		createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(<App />);
		await flushPromises();
		const client = getConsentClient();
		expect(isConsentScreenBusy(client)).toBe(false);

		emitPresented('a');
		expect(isConsentScreenBusy(client)).toBe(true);
		// The outcome of a session it replaced does not clear the one on screen.
		emitPresented('b', 'prompt');
		emitOutcome('a');
		expect(isConsentScreenBusy(client)).toBe(true);
		emitOutcome('b', 'committed');
		expect(isConsentScreenBusy(client)).toBe(false);
		tree.unmount();
	});

	test("a session the app's own call finds open is busy too", async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		fake.presentPreferences = () =>
			Promise.resolve(
				JSON.stringify({
					presentation: 'preferences',
					sessionId: 'p1',
					status: 'presented',
				})
			);
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		await presentPreferences(URL);
		expect(isConsentScreenBusy(getConsentClient())).toBe(true);
		emitOutcome('p1');
		expect(isConsentScreenBusy(getConsentClient())).toBe(false);
		tree.unmount();
	});

	test('a session that closes while the app opted out is still heard', async () => {
		createFakeNativeModule({ snapshot: owed });
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		emitPresented('s1', 'prompt', false);
		tree.unmount();
		emitOutcome('s1');
		expect(isConsentScreenBusy(getConsentClient())).toBe(false);
	});

	test('could-not-present is a development note, said once', async () => {
		createFakeNativeModule({ snapshot: owed });
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		const payload = JSON.stringify({
			code: 'INTH_PRESENTER_UNAVAILABLE',
			message: 'no window yet',
		});
		emitNativeEvent('onConsentPresenterUnavailable', payload);
		emitNativeEvent('onConsentPresenterUnavailable', payload);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain('could not show');
		tree.unmount();
	});
});

describe('native refusals', () => {
	test('a refused URL is reported once, in every build', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		fake.configureAutoPresent = vi.fn(() =>
			rejectWith('INTH_PRESENTER_INVALID_URL')
		);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		tree.rerender(<App />);
		await flushPromises();
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain(
			'refused privacyPolicyUrl'
		);
		tree.unmount();
	});

	test('a binary without the stock screens is reported once', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		fake.configureAutoPresent = vi.fn((settings: string) =>
			(JSON.parse(settings) as { autoPresent: boolean }).autoPresent
				? rejectWith('INTH_NATIVE_UI_EXCLUDED')
				: Promise.resolve()
		);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		tree.unmount();
		renderTree(<App />).unmount();
		await flushPromises();
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain('nativeUI=false');
	});
});

/**
 * A JavaScript update over a binary built before native auto-present: the
 * method is missing. Nothing presents by itself, the app is told once in every
 * build, and the manual presenter still works.
 */
describe('an older binary without configureAutoPresent', () => {
	const older = function older() {
		const fake = createFakeNativeModule({ snapshot: owed });
		Reflect.deleteProperty(fake, 'configureAutoPresent');
		const present = vi.fn(() =>
			Promise.resolve(JSON.stringify({ sessionId: 's1', status: 'presented' }))
		);
		fake.presentConsentPrompt = present;
		return { fake, present };
	};

	test('fails soft: an error once, no prompt by itself, manual still works', async () => {
		const { fake, present } = older();
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(
			<StrictMode>
				<App />
			</StrictMode>
		);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 2 });
		await flushPromises();
		expect(present).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain(
			'predates native auto-present'
		);

		await presentConsentPrompt(URL);
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('an app that opted out hears nothing about it', async () => {
		older();
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(<ConsentProvider autoPresent={false} />);
		await flushPromises();
		expect(error).not.toHaveBeenCalled();
		tree.unmount();
	});
});

describe('a binary without the stock native screens', () => {
	/** What a `inth.nativeUI=false` build's handshake reports. */
	const withoutNativeUI = function withoutNativeUI(): void {
		Object.assign(getConsentClient().bootstrap, { nativeUI: false });
	};

	test('turns auto-present off and needs no privacy-policy URL', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		withoutNativeUI();
		const tree = renderTree(
			// @ts-expect-error -- the types still require it; the build is only known at runtime.
			<ConsentProvider>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		expect(fake.autoPresentSettings).toStrictEqual([
			{ autoPresent: false, privacyPolicyURL: null },
		]);
		tree.unmount();
	});

	test('a URL it would refuse does not throw either', () => {
		createFakeNativeModule({ snapshot: owed });
		withoutNativeUI();
		expect(() =>
			renderTree(
				<ConsentProvider privacyPolicyUrl="http://example.com/privacy">
					<span />
				</ConsentProvider>
			).unmount()
		).not.toThrow();
	});
});

describe('privacyPolicyUrl', () => {
	test('is required while the provider presents', () => {
		createFakeNativeModule({ snapshot: owed });
		const message = captureErrorMessage(() =>
			renderTree(
				// @ts-expect-error -- the types require it; this is the untyped caller.
				<ConsentProvider>
					<span />
				</ConsentProvider>
			)
		);

		expect(message).toContain('privacyPolicyUrl');
		expect(message).toContain('autoPresent={false}');
	});

	test.each([
		'http://example.com/privacy',
		'https://example.com:bad',
		'https://[',
		'https://example.com/privacy ',
	])('refuses %j at render, before native is told', (url) => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const message = captureErrorMessage(() =>
			renderTree(
				<ConsentProvider privacyPolicyUrl={url}>
					<span />
				</ConsentProvider>
			)
		);

		expect(message).toContain('absolute HTTPS privacyPolicyUrl');
		expect(message).toContain(JSON.stringify(url));
		expect(fake.autoPresentSettings).toStrictEqual([]);
	});
});
