/**
 * A fake native core plus a render harness.
 *
 * The fake records call counts rather than verifying interactions, so the
 * tests can assert the properties that actually matter here: how often the
 * bridge crossed into native, and whether a render happened at all.
 */

import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { vi } from 'vite-plus/test';

import type { NativeInthTurboModule } from '../../native/get-native-inth';
import type { NativeAutoPresentSettings } from '../../native/presenter';
import { NATIVE_INTH_MODULE_NAME } from '../../protocol';
import type { ConsentSnapshot, TrackingAuthorization } from '../../protocol';
import {
	buildFakeSnapshot,
	createFakeNativeInth,
	FAKE_BOOTSTRAP,
} from '../../testing/create-fake-native-inth';
import type { FakeTrackingReply } from '../../testing/create-fake-native-inth';
import { emitNativeEvent, setNativeModule } from './react-native-stub';

// React only permits `act` when the environment says a test drives it.
(
	globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Handshake payload the fake module reports by default. */
export { FAKE_BOOTSTRAP };

/**
 * What the fake hands back from one `requestTrackingAuthorization()` call.
 *
 * `code` makes the call reject instead, which is how an Android request and an iOS build with
 * no prompt string both look to JavaScript.
 */
export type TrackingRequestReply = FakeTrackingReply;

/**
 * Build a snapshot with realistic defaults.
 *
 * @param overrides - Fields to replace, shallow over the defaults.
 * @returns A snapshot the client accepts.
 */
export const buildSnapshot = buildFakeSnapshot;

/**
 * The TurboModule double, with the counters the tests read.
 */
export interface FakeNativeModule extends NativeInthTurboModule {
	/** Times `getBootstrap()` was called. */
	bootstrapCalls: number;
	/** Times `getSnapshot()` was called. */
	snapshotCalls: number;
	/** Intent strings handed to `commit()`, in order. */
	commitIntents: string[];
	/** Override strings handed to `setOverrides()`, in order. */
	overrideCalls: string[];
	/** Times `dismissNotice()` was called. */
	dismissCalls: number;
	/** Times `refresh()` was called. */
	refreshCalls: number;
	/** External ids handed to `identify()`. */
	identifyCalls: string[];
	/** Times `logout()` was called. */
	logoutCalls: number;
	/** Times `reset()` was called. */
	resetCalls: number;
	/** Times `getTrackingAuthorization()` was called. */
	trackingReadCalls: number;
	/** Times `requestTrackingAuthorization()` or its options form was called. */
	trackingRequestCalls: number;
	/** Options passed to `requestTrackingAuthorizationWithOptions`, in order; `null` for the plain call. */
	trackingRequestOptions: (string | null)[];
	/** Serve a new snapshot and emit the `snapshot` event for it. */
	pushSnapshot: (snapshot: ConsentSnapshot) => void;
	/** Serve unreadable text as the next snapshot payload. */
	pushUnreadableSnapshot: (raw: string) => void;
	/** Serve a different platform tracking arm from the next read. */
	setTrackingAuthorization: (status: TrackingAuthorization) => void;
	/** Serve `answeredAt` (epoch ms) with the tracking arm, or leave it out with `null`. */
	setTrackingAnsweredAt: (answeredAt: number | null) => void;
	/** Make the next tracking request reject, the way a build without the plist key does. */
	rejectTrackingRequestWith: (code: string, message: string) => void;
	/**
	 * Serve this payload from the next tracking request.
	 *
	 * `stage` and `presentation` are optional the way they are on the wire, so a test can
	 * send the shape an older binary sends and prove the reader still understands it.
	 */
	setTrackingRequestReply: (reply: TrackingRequestReply) => void;
	/**
	 * Serve these payloads, in order, from the next tracking requests.
	 *
	 * A journey that pauses for additional information asks more than once, and the whole
	 * point of those tests is that the second answer differs from the first.
	 */
	queueTrackingRequestReplies: (
		replies: readonly TrackingRequestReply[]
	) => void;
	/** Payloads handed back by `requestTrackingAuthorization()`, in order. */
	trackingRequestPayloads: string[];
	/** Replace the bootstrap payload served by the next handshake. */
	setBootstrap: (payload: unknown) => void;
	/** Make `commit()` resolve with text that is not a `CommitResult`. */
	failCommitWith: (raw: string) => void;
	/** Settings handed to `configureAutoPresent()`, parsed, in order. */
	autoPresentSettings: NativeAutoPresentSettings[];
	/** The last settings native was sent, or `null` before any. */
	readonly autoPresent: NativeAutoPresentSettings | null;
}

/**
 * Report a session native put on screen, the way both hosts do.
 *
 * @param sessionId - The session.
 * @param presentation - What it shows.
 * @param automatic - Native opened it by itself.
 */
export const emitPresented = function emitPresented(
	sessionId: string,
	presentation: 'prompt' | 'preferences' = 'prompt',
	automatic = true
): void {
	emitNativeEvent(
		'onConsentPresenterPresented',
		JSON.stringify({ automatic, presentation, sessionId })
	);
};

/**
 * Report a session's outcome, the way both hosts do.
 *
 * @param sessionId - The session that closed.
 * @param kind - How it ended.
 * @param revision - The core's revision then.
 */
export const emitOutcome = function emitOutcome(
	sessionId: string,
	kind:
		| 'committed'
		| 'acknowledged'
		| 'dismissed'
		| 'unavailable' = 'dismissed',
	revision = 1
): void {
	emitNativeEvent(
		'onConsentPresenterOutcome',
		JSON.stringify({ kind, revision, sessionId })
	);
};

/**
 * Create a fake module and register it under the real module name.
 *
 * @param options - Snapshot and bootstrap payload to serve at first.
 * @returns The fake module, already registered.
 */
export const createFakeNativeModule = function createFakeNativeModule(
	options: {
		readonly snapshot?: ConsentSnapshot;
		readonly bootstrap?: unknown;
	} = {}
): FakeNativeModule {
	const initial = options.snapshot ?? buildSnapshot();
	// The shared fake core, with the two behaviours these tests drive by hand turned
	// off: a commit changes nothing until the test pushes a snapshot, and nothing
	// presents until the test reports it.
	const core = createFakeNativeInth({
		applyCommits: false,
		autoPresents: false,
		bootstrap: options.bootstrap,
		emit: emitNativeEvent,
		snapshot: initial,
	});
	const native = core.nativeModule;
	core.failCommitWith(
		JSON.stringify({
			confirmed: [],
			ok: true,
			queued: false,
			revision: initial.revision,
			subjectId: 'sub-1',
		})
	);

	const fake = {
		addListener: vi.fn(),
		get autoPresent(): NativeAutoPresentSettings | null {
			return fake.autoPresentSettings.at(-1) ?? null;
		},
		autoPresentSettings: core.autoPresentSettings,
		bootstrapCalls: 0,
		closeConsentPresenter: () => Promise.resolve(),
		commit: vi.fn((intent: string) => {
			fake.commitIntents.push(intent);

			return native.commit(intent);
		}),
		commitIntents: [] as string[],
		configureAutoPresent: vi.fn((settings: string) =>
			native.configureAutoPresent(settings)
		),
		dismissCalls: 0,
		dismissNotice: vi.fn(() => {
			fake.dismissCalls += 1;
		}),
		failCommitWith: core.failCommitWith,
		getBootstrap: vi.fn(() => {
			fake.bootstrapCalls += 1;

			return native.getBootstrap();
		}),
		getSnapshot: vi.fn(() => {
			fake.snapshotCalls += 1;

			return native.getSnapshot();
		}),
		getTrackingAuthorization: vi.fn(() => {
			fake.trackingReadCalls += 1;

			return native.getTrackingAuthorization();
		}),
		getWebViewConsent: vi.fn(() => native.getWebViewConsent()),
		identify: vi.fn((externalId: string, identityToken: string | null) => {
			fake.identifyCalls.push(externalId);

			return native.identify(externalId, identityToken);
		}),
		identifyCalls: [] as string[],
		logout: vi.fn(() => {
			fake.logoutCalls += 1;

			return native.logout();
		}),
		logoutCalls: 0,
		overrideCalls: [] as string[],
		presentConsentPrompt: () =>
			Promise.reject(new Error('Native presenter requires native core')),
		presentPreferences: () =>
			Promise.reject(new Error('Native presenter requires native core')),
		pushSnapshot: (next: ConsentSnapshot) => {
			core.pushSnapshot(next);
		},
		pushUnreadableSnapshot: (raw: string) => {
			core.pushSnapshot(raw, 99);
		},
		queueTrackingRequestReplies: (replies: readonly TrackingRequestReply[]) => {
			core.tracking.queue.push(...replies);
		},
		refresh: vi.fn(() => {
			fake.refreshCalls += 1;

			return native.refresh();
		}),
		refreshCalls: 0,
		rejectTrackingRequestWith: (code: string, message: string) => {
			core.tracking.fallback = { code, message };
		},
		removeListeners: vi.fn(),
		requestTrackingAuthorization: vi.fn(() => {
			fake.trackingRequestCalls += 1;
			fake.trackingRequestOptions.push(null);

			return native.requestTrackingAuthorization();
		}),
		// The options form answers the same way, through whatever the test installed as
		// the plain method, and records the options it was given.
		requestTrackingAuthorizationWithOptions: vi.fn((requestOptions: string) => {
			const answer = fake.requestTrackingAuthorization();
			fake.trackingRequestOptions[fake.trackingRequestOptions.length - 1] =
				requestOptions;
			return answer;
		}),
		reset: vi.fn(() => {
			fake.resetCalls += 1;

			return native.reset();
		}),
		resetCalls: 0,
		setBootstrap: core.setBootstrap,
		setOverrides: vi.fn((overrides: string) => {
			fake.overrideCalls.push(overrides);

			return native.setOverrides(overrides);
		}),
		setTrackingAnsweredAt: core.setTrackingAnsweredAt,
		setTrackingAuthorization: core.setTrackingAuthorization,
		setTrackingRequestReply: (reply: TrackingRequestReply) => {
			core.tracking.fallback = reply;
		},
		snapshotCalls: 0,
		trackingReadCalls: 0,
		trackingRequestCalls: 0,
		trackingRequestOptions: [] as (string | null)[],
		trackingRequestPayloads: core.tracking.payloads,
	};

	setNativeModule(NATIVE_INTH_MODULE_NAME, fake);

	return fake as unknown as FakeNativeModule;
};

/**
 * Run a function that must throw and hand back the error.
 *
 * Vitest forbids `expect` inside a `catch`, and `toThrow(matcher)` only checks
 * one fragment at a time. Returning the error keeps assertions on custom error
 * fields readable.
 *
 * @param run - The call expected to throw.
 * @returns The thrown error.
 * @throws {Error} When the call did not throw.
 */
export const captureError = function captureError(run: () => unknown): Error {
	try {
		run();
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}

	throw new Error('expected the call to throw, and it did not');
};

/**
 * Run a function that must throw and hand back its message.
 *
 * @param run - The call expected to throw.
 * @returns The thrown message.
 * @throws {Error} When the call did not throw.
 */
export const captureErrorMessage = function captureErrorMessage(
	run: () => unknown
): string {
	return captureError(run).message;
};

/**
 * Render a tree with `react-dom`, wrapped in `act`.
 *
 * Deliberately small. These tests assert render counts and native call counts,
 * not queries, so a testing library would only add a dependency.
 *
 * @param element - Tree to render.
 * @returns A handle to rerender and unmount.
 */
export const renderTree = function renderTree(
	element: ReactElement
): RenderHandle {
	const container = document.createElement('div');

	document.body.append(container);

	const root: Root = createRoot(container);

	act(() => {
		root.render(element);
	});

	return {
		container: () => container,
		rerender: (next: ReactElement) => {
			act(() => {
				root.render(next);
			});
		},
		text: () => container.textContent ?? '',
		unmount: () => {
			act(() => {
				root.unmount();
			});

			container.remove();
		},
	};
};

/** What {@link renderTree} returns. */
export interface RenderHandle {
	/**
	 * The node the tree renders into, for the rare test that has to reach a real
	 * element, such as one that dispatches a click.
	 */
	container: () => HTMLElement;
	/** Text content of the rendered tree. */
	text: () => string;
	/** Render a different element into the same root. */
	rerender: (element: ReactElement) => void;
	/** Unmount and detach the container. */
	unmount: () => void;
}

/**
 * Apply a change and let React flush the effects it triggers.
 *
 * @param mutate - The change to apply.
 */
export const flush = function flush(mutate: () => void): void {
	act(() => {
		mutate();
	});
};

/**
 * Let queued promise callbacks run, then flush React.
 *
 * @returns Resolves once React has applied the resulting updates.
 */
export const flushPromises = async function flushPromises(): Promise<void> {
	await act(async () => {
		// A macrotask boundary, not one microtask: `AccessibilityInfo` answers
		// asynchronously, and a platform read that settles outside `act` has its
		// update applied at the *next* boundary, which would land in the middle of
		// whatever the test drives next.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
	});
};
