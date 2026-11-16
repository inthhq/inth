/**
 * A build without the stock native screens says when it will collect no
 * consent: an IAB configuration no custom screen can disclose, and, in
 * development, a prompt nothing renders.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	buildSnapshot,
	createFakeNativeModule,
	FAKE_BOOTSTRAP,
	renderTree,
} from '../../__tests__/helpers/fake-native';
import { resetNativeStub } from '../../__tests__/helpers/react-native-stub';
import { ConsentPrompt } from '../../headless/consent-prompt';
import type { ConsentSnapshot } from '../../protocol';
import { ConsentProvider } from '../../provider/consent-provider';
import { getConsentClient, resetConsentClient } from '../client';
import {
	UNCLAIMED_PROMPT_MS,
	watchWithoutNativeUI,
} from '../without-native-ui';

const WITHOUT_UI = { ...FAKE_BOOTSTRAP, nativeUI: false };

const restrictedIAB = (): ConsentSnapshot =>
	buildSnapshot({
		iab: {
			acceptAll: null,
			committed: null,
			customVendors: [],
			disclosure: null,
			editable: false,
			gvl: null,
			headlessUnsupported: ['publisher-restrictions'],
		},
		model: 'iab',
		promptRequirement: { kind: 'none', reason: null },
	} as Partial<ConsentSnapshot>);

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers();
	warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	resetConsentClient();
	resetNativeStub();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const unclaimedWarnings = (): unknown[][] =>
	warn.mock.calls.filter((call) =>
		String(call[0]).includes('a consent prompt has been owed')
	);

describe('a build without the stock native screens', () => {
	test('reports an IAB configuration no custom screen can disclose', () => {
		createFakeNativeModule({
			bootstrap: WITHOUT_UI,
			snapshot: restrictedIAB(),
		});
		const client = getConsentClient();
		client.getSnapshot();

		expect(error).toHaveBeenCalledTimes(1);
		expect(String(error.mock.calls[0]?.[0])).toContain(
			'publisher-restrictions cannot be disclosed by a custom screen'
		);
	});

	test('says nothing about IAB in a build with the stock screens', () => {
		createFakeNativeModule({ snapshot: restrictedIAB() });
		getConsentClient().getSnapshot();

		expect(error).not.toHaveBeenCalled();
	});

	test('warns in development when an owed prompt goes unrendered', () => {
		createFakeNativeModule({
			bootstrap: WITHOUT_UI,
			snapshot: buildSnapshot(),
		});
		getConsentClient();

		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS - 1);
		expect(unclaimedWarnings()).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(unclaimedWarnings()).toHaveLength(1);
		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS * 3);
		expect(unclaimedWarnings()).toHaveLength(1);
	});

	test('stays quiet while a ConsentPrompt is mounted', () => {
		createFakeNativeModule({
			bootstrap: WITHOUT_UI,
			snapshot: buildSnapshot(),
		});
		renderTree(
			<ConsentProvider>
				<ConsentPrompt>{() => null}</ConsentPrompt>
			</ConsentProvider>
		);

		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS * 2);
		expect(unclaimedWarnings()).toHaveLength(0);
	});

	test('warns once the last prompt surface unmounts while the prompt is still owed', () => {
		createFakeNativeModule({
			bootstrap: WITHOUT_UI,
			snapshot: buildSnapshot(),
		});
		const tree = renderTree(
			<ConsentProvider>
				<ConsentPrompt>{() => null}</ConsentPrompt>
			</ConsentProvider>
		);
		// The timer fires while the prompt is claimed, so nothing is said yet.
		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS * 2);
		expect(unclaimedWarnings()).toHaveLength(0);

		// The screen goes away; nothing in the snapshot changes.
		tree.unmount();
		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS - 1);
		expect(unclaimedWarnings()).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(unclaimedWarnings()).toHaveLength(1);
	});

	test('stays quiet in production and with the stock screens', () => {
		const snapshot = buildSnapshot();
		const stop = watchWithoutNativeUI(
			{ getSnapshot: () => snapshot, subscribe: () => () => undefined },
			true
		);
		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS * 2);
		stop();

		createFakeNativeModule({ snapshot });
		getConsentClient();
		vi.advanceTimersByTime(UNCLAIMED_PROMPT_MS * 2);

		expect(unclaimedWarnings()).toHaveLength(0);
	});
});
