/**
 * The provider presents the native prompt when one is owed: once per owed
 * prompt, never while the core is not ready, and not at all with
 * `autoPresent={false}`.
 */

import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	captureErrorMessage,
	createFakeNativeModule,
	flushPromises,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import type { FakeNativeModule } from '../../__tests__/helpers/fake-native';
import {
	emitNativeEvent,
	resetNativeStub,
	setAppState,
} from '../../__tests__/helpers/react-native-stub';
import { getConsentClient, resetConsentClient } from '../../native/client';
import { presentConsentPrompt } from '../../native/presenter';
import type { ConsentSnapshot } from '../../protocol';
import { ConsentProvider } from '../consent-provider';

const URL = 'https://example.com/privacy';

const owed = buildSnapshot({
	promptRequirement: { kind: 'choice', reason: 'missing' },
	resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
	revision: 1,
});

const answered = buildSnapshot({
	promptRequirement: { kind: 'none' },
	resolution: { fingerprint: 'policy-a', policyId: 'p', status: 'matched' },
	revision: 2,
});

/** Send the outcome native sends when a session closes. */
const emitOutcome = function emitOutcome(
	sessionId: string,
	kind: 'committed' | 'acknowledged' | 'dismissed' | 'unavailable' = 'dismissed'
): void {
	emitNativeEvent(
		'onConsentPresenterOutcome',
		JSON.stringify({ kind, revision: 1, sessionId })
	);
};

/**
 * A fake whose presenter answers like the native host: one open session at a
 * time, named by what it shows, and an outcome when it closes.
 */
const bootFake = function bootFake(snapshot: ConsentSnapshot): {
	readonly fake: FakeNativeModule;
	readonly present: ReturnType<typeof vi.fn>;
	readonly close: (kind?: 'committed' | 'dismissed') => void;
	readonly openPreferences: () => void;
} {
	const fake = createFakeNativeModule({ snapshot });
	let open: {
		readonly id: string;
		readonly presentation: 'prompt' | 'preferences';
	} | null = null;
	let sessions = 0;
	const present = vi.fn((_url: string) => {
		if (open !== null) {
			return Promise.resolve(
				JSON.stringify({
					presentation: open.presentation,
					sessionId: open.id,
					status: 'already-presented',
				})
			);
		}
		sessions += 1;
		open = { id: `s${sessions}`, presentation: 'prompt' };
		return Promise.resolve(
			JSON.stringify({
				presentation: 'prompt',
				sessionId: open.id,
				status: 'presented',
			})
		);
	});
	fake.presentConsentPrompt = present;
	return {
		close: (kind = 'dismissed') => {
			const closed = open;
			open = null;
			if (closed !== null) {
				emitOutcome(closed.id, kind);
			}
		},
		fake,
		openPreferences: () => {
			sessions += 1;
			open = { id: `p${sessions}`, presentation: 'preferences' };
		},
		present,
	};
};

const App = ({ children }: { readonly children?: ReactNode }): ReactNode => (
	<ConsentProvider privacyPolicyURL={URL}>{children}</ConsentProvider>
);

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
});

describe('auto-present', () => {
	test('presents an owed prompt once, under strict mode', async () => {
		const { present } = bootFake(owed);
		const tree = renderTree(
			<StrictMode>
				<App />
			</StrictMode>
		);
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(1);
		expect(present).toHaveBeenCalledWith(URL);
		tree.unmount();
	});

	test('stays quiet while a stored choice is valid', async () => {
		const { present } = bootFake(answered);
		const tree = renderTree(<App />);
		await flushPromises();

		expect(present).not.toHaveBeenCalled();
		tree.unmount();
	});

	test('waits until the core is ready and the policy resolved', async () => {
		const { fake, present } = bootFake(
			buildSnapshot({ ...owed, policyPending: true, ready: false, revision: 0 })
		);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).not.toHaveBeenCalled();

		fake.pushSnapshot(owed);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('does not present a dismissed prompt again for the same requirement', async () => {
		const { close, fake, present } = bootFake(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		close();

		// An unrelated revision, a remount and a return to the foreground.
		fake.pushSnapshot({ ...owed, revision: 2 });
		tree.rerender(
			<App>
				<span />
			</App>
		);
		setAppState('background');
		setAppState('active');
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('presents again after a policy change', async () => {
		const { close, fake, present } = bootFake(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		close();

		fake.pushSnapshot(answered);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		fake.pushSnapshot(
			buildSnapshot({
				promptRequirement: { kind: 'choice', reason: 'policy-changed' },
				resolution: {
					fingerprint: 'policy-b',
					policyId: 'p',
					status: 'matched',
				},
				revision: 3,
			})
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('presents again when a stored choice expires', async () => {
		const { fake, present } = bootFake(answered);
		const tree = renderTree(<App />);
		await flushPromises();

		fake.pushSnapshot(
			buildSnapshot({
				...owed,
				promptRequirement: { kind: 'choice', reason: 'expired' },
				revision: 3,
			})
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('a manual call racing auto-present opens one session', async () => {
		const { present } = bootFake(owed);
		const manual = presentConsentPrompt(URL);
		const tree = renderTree(<App />);
		await flushPromises();

		const session = await manual;
		expect(present).toHaveBeenCalledTimes(2);
		expect(session.status).toBe('presented');
		// The auto-present call was answered `already-presented` and is not retried.
		await present.mock.results[1]?.value;
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('retries on return to the foreground after native refused', async () => {
		const { fake, present } = bootFake(owed);
		present.mockImplementationOnce(() =>
			Promise.reject(new Error('no foreground window'))
		);
		fake.presentConsentPrompt = present;
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('a nested provider does not present a second time', async () => {
		const { present } = bootFake(owed);
		const tree = renderTree(
			<App>
				<ConsentProvider privacyPolicyURL={URL}>
					<span />
				</ConsentProvider>
			</App>
		);
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});
});

describe('changes while the native call is pending', () => {
	/** A fake whose presenter answers only when the test says so. */
	const bootPending = function bootPending(snapshot: ConsentSnapshot): {
		readonly fake: FakeNativeModule;
		readonly present: ReturnType<typeof vi.fn>;
		readonly settle: () => void;
	} {
		const fake = createFakeNativeModule({ snapshot });
		const waiting: (() => void)[] = [];
		const present = vi.fn(
			(_url: string) =>
				new Promise<string>((resolve) => {
					waiting.push(() =>
						resolve(JSON.stringify({ sessionId: 's1', status: 'presented' }))
					);
				})
		);
		fake.presentConsentPrompt = present;
		return {
			fake,
			present,
			settle: () => {
				for (const answer of waiting.splice(0)) {
					answer();
				}
			},
		};
	};

	test('owed A, none, owed A while the call is pending: A is asked for again once that session closes', async () => {
		const { fake, present, settle } = bootPending(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// The prompt is answered and owed again, all before native answered.
		fake.pushSnapshot(answered);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 3 });
		await flushPromises();
		settle();
		await flushPromises();
		// Session s1 is on screen; nothing is asked while it is.
		expect(present).toHaveBeenCalledTimes(1);

		emitOutcome('s1', 'committed');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		settle();
		await flushPromises();
		tree.unmount();
	});

	test('a requirement that changes while the prompt opens is shown by that session', async () => {
		const { fake, present, settle } = bootPending(owed);
		const tree = renderTree(<App />);
		await flushPromises();

		fake.pushSnapshot(
			buildSnapshot({
				promptRequirement: { kind: 'choice', reason: 'policy-changed' },
				resolution: {
					fingerprint: 'policy-b',
					policyId: 'p',
					status: 'matched',
				},
				revision: 2,
			})
		);
		await flushPromises();
		settle();
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// The person dismissed the session, which showed the new requirement.
		emitOutcome('s1');
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('the same prompt still owed after the call settles is not presented twice', async () => {
		const { fake, present, settle } = bootPending(owed);
		const tree = renderTree(<App />);
		await flushPromises();

		fake.pushSnapshot({ ...owed, revision: 2 });
		await flushPromises();
		settle();
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});
});

describe('native failures', () => {
	test('a refused URL is reported once and not offered again', async () => {
		const { fake, present } = bootFake(owed);
		present.mockImplementation(() =>
			Promise.reject(
				Object.assign(new Error('refused'), {
					code: 'C15T_PRESENTER_INVALID_URL',
				})
			)
		);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain('cannot show');

		// Neither a foreground nor a new owed prompt retries the same URL.
		setAppState('background');
		setAppState('active');
		fake.pushSnapshot(
			buildSnapshot({
				promptRequirement: { kind: 'choice', reason: 'policy-changed' },
				resolution: {
					fingerprint: 'policy-b',
					policyId: 'p',
					status: 'matched',
				},
				revision: 2,
			})
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		error.mockRestore();
		tree.unmount();
	});

	test('a transient failure warns once per owed prompt and keeps retrying', async () => {
		const { present } = bootFake(owed);
		present.mockImplementation(() =>
			Promise.reject(
				Object.assign(new Error('no window'), {
					code: 'C15T_PRESENTER_UNAVAILABLE',
				})
			)
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		setAppState('background');
		setAppState('active');
		await flushPromises();
		setAppState('background');
		setAppState('active');
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(3);
		expect(
			warn.mock.calls.filter((call) =>
				String(call[0]).includes('could not open')
			)
		).toHaveLength(1);
		warn.mockRestore();
		tree.unmount();
	});
});

describe('a binary without the stock native screens', () => {
	/**
	 * What a `c15t.nativeUI=false` build's handshake reports. #130 teaches the
	 * parser the flag; this branch's parser predates it, so the test sets the
	 * parsed field the way that parser will.
	 */
	const withoutNativeUI = function withoutNativeUI(): void {
		Object.assign(getConsentClient().bootstrap, { nativeUI: false });
	};

	test('presents nothing and needs no privacy-policy URL', async () => {
		const { fake, present } = bootFake(owed);
		withoutNativeUI();
		const tree = renderTree(
			// @ts-expect-error -- the types still require it; the build is only known at runtime.
			<ConsentProvider>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		setAppState('background');
		setAppState('active');
		fake.pushSnapshot({ ...owed, revision: 3 });
		await flushPromises();
		expect(present).not.toHaveBeenCalled();
		tree.unmount();
	});

	test('a URL it would refuse does not throw either', () => {
		const { present } = bootFake(owed);
		withoutNativeUI();
		expect(() =>
			renderTree(
				<ConsentProvider privacyPolicyURL="http://example.com/privacy">
					<span />
				</ConsentProvider>
			).unmount()
		).not.toThrow();
		expect(present).not.toHaveBeenCalled();
	});

	test('a rejection saying the screens are excluded is reported once and never retried', async () => {
		const { fake, present } = bootFake(owed);
		present.mockImplementation(() =>
			Promise.reject(
				Object.assign(new Error('excluded'), {
					code: 'C15T_NATIVE_UI_EXCLUDED',
				})
			)
		);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// Neither a foreground nor a new owed prompt asks again.
		setAppState('background');
		setAppState('active');
		fake.pushSnapshot(
			buildSnapshot({
				promptRequirement: { kind: 'choice', reason: 'policy-changed' },
				resolution: {
					fingerprint: 'policy-b',
					policyId: 'p',
					status: 'matched',
				},
				revision: 2,
			})
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain('nativeUI=false');
		expect(warn).not.toHaveBeenCalled();
		error.mockRestore();
		warn.mockRestore();
		tree.unmount();
	});
});

describe('episodes', () => {
	test('the same owed prompt presents again after nothing was owed', async () => {
		const { close, fake, present } = bootFake(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		close();
		fake.pushSnapshot(answered);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 3 });
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('turning autoPresent on presents an already owed prompt', async () => {
		const { present } = bootFake(owed);
		const tree = renderTree(
			<ConsentProvider
				autoPresent={false}
				privacyPolicyURL={URL}
			>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		expect(present).not.toHaveBeenCalled();

		tree.rerender(
			<ConsentProvider
				autoPresent
				privacyPolicyURL={URL}
			>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});
});

describe('the native owed-prompt identifier', () => {
	const owedSince = (revision: number, since: number): ConsentSnapshot =>
		buildSnapshot({ ...owed, promptOwedSince: since, revision });

	test('the same prompt owed again reaches JavaScript as one update and is presented', async () => {
		const { close, fake, present } = bootFake(owedSince(1, 1));
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);
		close();

		// Native answered, owed nothing, and owed the same prompt again; the bridge
		// delivered only the last state, so JavaScript never saw the moment between.
		fake.pushSnapshot(owedSince(4, 4));
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('an unrelated revision of the same owed prompt is not presented again', async () => {
		const { close, fake, present } = bootFake(owedSince(1, 1));
		const tree = renderTree(<App />);
		await flushPromises();
		close();

		fake.pushSnapshot(owedSince(2, 1));
		setAppState('background');
		setAppState('active');
		await flushPromises();

		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('a binary without the identifier keeps telling prompts apart by transitions', async () => {
		const { close, fake, present } = bootFake(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		close();

		// The same coalesced update from an older binary: nothing marks it as new.
		fake.pushSnapshot({ ...owed, revision: 4 });
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// It still sees a transition it observes.
		fake.pushSnapshot(answered);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 6 });
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});
});

describe('what native says is on screen', () => {
	test('an owed prompt that meets open preferences is presented once they close', async () => {
		const { close, openPreferences, present } = bootFake(owed);
		openPreferences();
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// Native answered already-presented for the preferences session: nothing shown.
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		// The person closes preferences without saving; the prompt is still owed.
		close('dismissed');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('a session an older binary does not name is waited on, then decided again', async () => {
		const fake = createFakeNativeModule({ snapshot: owed });
		const present = vi.fn(() =>
			Promise.resolve(
				JSON.stringify({ sessionId: 'x1', status: 'already-presented' })
			)
		);
		fake.presentConsentPrompt = present;
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		present.mockImplementation(() =>
			Promise.resolve(JSON.stringify({ sessionId: 's2', status: 'presented' }))
		);
		emitOutcome('x1');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});

	test('a URL native refused is not retried, and a corrected URL is', async () => {
		const { present } = bootFake(owed);
		const refused = 'https://refused.example/privacy';
		const shown = present.getMockImplementation();
		present.mockImplementation((url: string) =>
			url === refused
				? Promise.reject(
						Object.assign(new Error('refused'), {
							code: 'C15T_PRESENTER_INVALID_URL',
						})
					)
				: (shown?.(url) as Promise<string>)
		);
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const tree = renderTree(
			<ConsentProvider privacyPolicyURL={refused}>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		setAppState('background');
		setAppState('active');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		tree.rerender(
			<ConsentProvider privacyPolicyURL={URL}>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		expect(present).toHaveBeenLastCalledWith(URL);
		error.mockRestore();
		tree.unmount();
	});

	test('a session that closes while the app opted out is still heard', async () => {
		const { close, present } = bootFake(owed);
		const tree = renderTree(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		tree.rerender(
			<ConsentProvider autoPresent={false}>
				<span />
			</ConsentProvider>
		);
		close('dismissed');
		await flushPromises();
		tree.rerender(<App />);
		await flushPromises();
		// The person dismissed it, so turning auto-present back on does not reopen it.
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});

	test('preferences that close while the app opted out leave the prompt owed', async () => {
		const { close, openPreferences, present } = bootFake(owed);
		openPreferences();
		const tree = renderTree(<App />);
		await flushPromises();
		tree.rerender(
			<ConsentProvider autoPresent={false}>
				<span />
			</ConsentProvider>
		);
		close('dismissed');
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(1);

		tree.rerender(<App />);
		await flushPromises();
		expect(present).toHaveBeenCalledTimes(2);
		tree.unmount();
	});
});

describe('autoPresent={false}', () => {
	test('presents nothing by itself', async () => {
		const { fake, present } = bootFake(owed);
		const tree = renderTree(
			<ConsentProvider autoPresent={false}>
				<span />
			</ConsentProvider>
		);
		await flushPromises();
		fake.pushSnapshot({ ...owed, revision: 2 });
		setAppState('background');
		setAppState('active');
		await flushPromises();

		expect(present).not.toHaveBeenCalled();
		tree.unmount();
	});

	test('leaves the manual presenter working', async () => {
		const { present } = bootFake(owed);
		const tree = renderTree(
			<ConsentProvider autoPresent={false}>
				<span />
			</ConsentProvider>
		);
		await flushPromises();

		await expect(presentConsentPrompt(URL)).resolves.toEqual({
			presentation: 'prompt',
			sessionId: 's1',
			status: 'presented',
		});
		expect(present).toHaveBeenCalledTimes(1);
		tree.unmount();
	});
});

describe('privacyPolicyURL', () => {
	test('is required while the provider presents', () => {
		bootFake(owed);
		const message = captureErrorMessage(() =>
			renderTree(
				// @ts-expect-error -- the types require it; this is the untyped caller.
				<ConsentProvider>
					<span />
				</ConsentProvider>
			)
		);

		expect(message).toContain('privacyPolicyURL');
		expect(message).toContain('autoPresent={false}');
	});

	test.each([
		'http://example.com/privacy',
		'https://example.com:bad',
		'https://[',
		'https://example.com/privacy ',
	])('refuses %j at render, before native is asked', (url) => {
		const { present } = bootFake(owed);
		const message = captureErrorMessage(() =>
			renderTree(
				<ConsentProvider privacyPolicyURL={url}>
					<span />
				</ConsentProvider>
			)
		);

		expect(message).toContain('absolute HTTPS privacyPolicyURL');
		expect(message).toContain(JSON.stringify(url));
		expect(present).not.toHaveBeenCalled();
	});
});
