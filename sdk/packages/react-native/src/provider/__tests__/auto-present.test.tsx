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
	resetNativeStub,
	setAppState,
} from '../../__tests__/helpers/react-native-stub';
import { resetConsentClient } from '../../native/client';
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

/** A fake whose presenter answers like the native host: one open session at a time. */
const bootFake = function bootFake(snapshot: ConsentSnapshot): {
	readonly fake: FakeNativeModule;
	readonly present: ReturnType<typeof vi.fn>;
	readonly close: () => void;
} {
	const fake = createFakeNativeModule({ snapshot });
	let open = false;
	const present = vi.fn((_url: string) => {
		const status = open ? 'already-presented' : 'presented';
		open = true;
		return Promise.resolve(JSON.stringify({ sessionId: 's1', status }));
	});
	fake.presentConsentPrompt = present;
	return {
		close: () => {
			open = false;
		},
		fake,
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

	test('must be HTTPS', () => {
		bootFake(owed);
		const message = captureErrorMessage(() =>
			renderTree(
				<ConsentProvider privacyPolicyURL="http://example.com/privacy">
					<span />
				</ConsentProvider>
			)
		);

		expect(message).toContain('HTTPS');
	});
});
