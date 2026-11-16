import { act } from 'react';

import {
	createConsentClient,
	resetConsentClient,
	setConsentClient,
} from '../native/client';
import type { ConsentClient } from '../native/client';
import { installNativeC15t } from '../native/module';
import type { NativeEventsLike } from '../native/module';
import type {
	CommitIntent,
	ConsentSnapshot,
	TrackingAuthorization,
} from '../protocol';
import type { OptionalConsentCategory } from '../protocol/vocabulary';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import { releaseConsentPresenter } from '../provider/auto-present';
import {
	buildFakeSnapshot,
	createFakeNativeC15t,
	FAKE_BOOTSTRAP,
	FAKE_EVALUATED_AT,
	withExplicitChoice,
} from './fake-native-c15t';

/**
 * The consent a test starts from, or moves to.
 *
 * - `'unset'`: no choice yet. The prompt is owed, and every optional category
 *   is denied until the subject answers.
 * - `'granted'`: a stored choice that grants every optional category.
 * - `'denied'`: a stored choice that denies every optional category.
 * - An object: a stored choice with these categories. A category it leaves
 *   out is denied.
 */
export type TestConsentState =
	| 'unset'
	| 'granted'
	| 'denied'
	| Readonly<Partial<Record<OptionalConsentCategory, boolean>>>;

/** Options for {@link createTestConsentClient}. */
export interface CreateTestConsentClientOptions {
	/**
	 * The consent the native core holds at the start.
	 *
	 * @default 'unset'
	 */
	readonly consent?: TestConsentState;
	/**
	 * Whether the native core has finished starting. While it has not, every
	 * optional category reads `pending` and `useConsent` returns `false`. Call
	 * {@link TestConsentClient.setReady} to finish starting.
	 *
	 * @default true
	 */
	readonly ready?: boolean;
	/**
	 * Whether the binary links the stock native consent screens. Pass `false` to
	 * test an app that draws its own consent UI; the provider then presents
	 * nothing. Render it with `autoPresent={false}`, which is what lets the
	 * provider's types leave out `privacyPolicyURL`.
	 *
	 * @default true
	 */
	readonly nativeUI?: boolean;
	/**
	 * What the platform says about tracking. `'unsupported'` is Android's answer
	 * and an iOS build's without App Tracking Transparency, so nothing asks Apple.
	 * A tracking request answers with this value.
	 *
	 * @default 'unsupported'
	 */
	readonly trackingAuthorization?: TrackingAuthorization;
	/**
	 * Snapshot fields to set over the ones `consent` and `ready` produce, for a
	 * state they do not cover, such as `model: 'opt-out'`.
	 */
	readonly snapshot?: Partial<ConsentSnapshot>;
}

/** A consent screen the simulated native presenter has open. */
export interface TestConsentSession {
	/** The id the presenter returned when it opened. */
	readonly sessionId: string;
	/** What it shows: the owed prompt or the preference center. */
	readonly presentation: 'prompt' | 'preferences';
	/**
	 * `true` when native opened it by itself because a prompt was owed and a
	 * `<ConsentProvider>` presents, `false` when the app called
	 * `presentConsentPrompt()` or `presentPreferences()`.
	 */
	readonly automatic: boolean;
}

/**
 * The simulated native consent screens.
 *
 * Native opens the owed prompt by itself as soon as a presenting
 * `<ConsentProvider>` mounts, and `presentConsentPrompt()` and
 * `presentPreferences()` open a screen at once. Nothing is drawn: answer the
 * open screen with these methods, the way a person would tap it.
 */
export interface TestConsentPrompt {
	/** Whether a consent screen is open. */
	readonly isOpen: boolean;
	/** The open screen, or `null`. */
	readonly current: TestConsentSession | null;
	/**
	 * Tap "Accept all" on the open screen.
	 *
	 * @throws {Error} When no screen is open.
	 */
	readonly acceptAll: () => void;
	/**
	 * Tap "Reject all" on the open screen.
	 *
	 * @throws {Error} When no screen is open.
	 */
	readonly rejectAll: () => void;
	/**
	 * Save these categories from the open screen. A category left out keeps its
	 * stored value, or is off when it has none, and is saved with it, as the
	 * native screen saves every toggle it shows.
	 *
	 * @param consents - The value for each category the person changed.
	 * @throws {Error} When no screen is open.
	 */
	readonly save: (
		consents: Readonly<Partial<Record<OptionalConsentCategory, boolean>>>
	) => void;
	/**
	 * Tap Acknowledge on an open notice. Records the acknowledgement and no
	 * consent, as the native screen does, and ends the session as
	 * `acknowledged`.
	 *
	 * @throws {Error} When no screen is open, or the open one is not a notice.
	 */
	readonly acknowledge: () => void;
	/**
	 * Close the open screen without answering. A prompt that was owed stays owed.
	 *
	 * @throws {Error} When no screen is open.
	 */
	readonly dismiss: () => void;
}

/** What {@link createTestConsentClient} returns. */
export interface TestConsentClient {
	/**
	 * The consent client, built by the same `createConsentClient` an app runs,
	 * over a fake native module. Pass it to `<ConsentProvider client>`. It is
	 * also the app's shared client until {@link TestConsentClient.dispose}, so an
	 * app component that renders its own `<ConsentProvider>` reaches it too.
	 */
	readonly client: ConsentClient;
	/**
	 * What the app's JavaScript committed, in order: `{ action: 'all' }` for
	 * accept all, `{ action: 'necessary' }` for reject all, and
	 * `{ action: 'explicit', consents }` for a per-category save.
	 *
	 * Answers on the simulated native screens ({@link TestConsentClient.prompt})
	 * change consent but are not listed, because the native screens save
	 * without crossing the bridge.
	 */
	readonly commits: readonly CommitIntent[];
	/**
	 * Change consent as if it changed outside JavaScript, such as on a native
	 * screen or after a sync. Hooks that read a category that moved rerender.
	 *
	 * @param state - The consent the native core holds now.
	 */
	readonly setConsent: (state: TestConsentState) => void;
	/**
	 * Finish or restart the native core's start-up. Categories read `pending`
	 * while it is not ready. After `client.reset()`, finishing start-up
	 * resolves the cleared policy again and owes the choice prompt.
	 *
	 * @param ready - `false` to go back to starting. @default true
	 */
	readonly setReady: (ready?: boolean) => void;
	/** The simulated native consent screens. */
	readonly prompt: TestConsentPrompt;
	/**
	 * Detach the client and stop serving the fake native module. Creating
	 * another test client does this for the previous one, so a test only needs
	 * it to check what happens without a native module.
	 */
	readonly dispose: () => void;
}

/** The snapshot fields one {@link TestConsentState} sets. */
const snapshotFor = function snapshotFor(
	base: ConsentSnapshot,
	state: TestConsentState
): ConsentSnapshot {
	const { revision } = base;
	if (state === 'unset') {
		return {
			...base,
			activeUI: 'banner',
			effectivePermissions: {
				experience: false,
				functionality: false,
				marketing: false,
				measurement: false,
				necessary: true,
			},
			explicitChoice: null,
			promptOwedSince: FAKE_EVALUATED_AT,
			promptRequirement: { kind: 'choice', reason: 'missing' },
		};
	}
	const consents = {} as Record<OptionalConsentCategory, boolean>;
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		consents[category] =
			state === 'granted' ||
			(typeof state === 'object' && state[category] === true);
	}
	return withExplicitChoice(base, consents, revision);
};

/** An emitter for the fake module: synchronous, in subscription order. */
const createEventHub = function createEventHub(): {
	readonly events: NativeEventsLike;
	readonly emit: (eventName: string, payload: string) => void;
} {
	const listeners = new Map<string, Set<(payload: string) => void>>();
	return {
		emit: (eventName, payload) => {
			for (const listener of [...(listeners.get(eventName) ?? [])]) {
				listener(payload);
			}
		},
		events: {
			addListener: (eventName, listener) => {
				const set = listeners.get(eventName) ?? new Set();
				set.add(listener);
				listeners.set(eventName, set);
				return {
					remove: () => {
						set.delete(listener);
					},
				};
			},
		},
	};
};

/**
 * Run a change inside React's `act` when the test environment asks for it, as
 * React Native Testing Library does, so the rerender it causes is applied
 * before the next assertion and React prints no act warning.
 */
const inAct = function inAct(change: () => void): void {
	const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
	if (environment.IS_REACT_ACT_ENVIRONMENT === true) {
		act(change);
	} else {
		change();
	}
};

/** The test client whose fake module is installed, so the next one replaces it. */
let active: TestConsentClient | null = null;

/**
 * Create a consent client for unit and component tests, where no native module
 * exists.
 *
 * The client is the real one, built by `createConsentClient` over a fake native
 * core. Hooks, `<ConsentProvider>`, the headless components and the presenter
 * calls run the same code they run in an app. The fake stores each commit the
 * way a native core does, so the hooks rerender with the saved consent.
 *
 * The fake stays installed as the app's native module until the next call or
 * {@link TestConsentClient.dispose}. Call it once per test, such as in
 * `beforeEach`.
 *
 * @param options - The consent and start-up state to begin with.
 * @returns The client and the controls a test drives it with.
 * @example
 * ```tsx
 * import { fireEvent, render, screen } from '@testing-library/react-native';
 * import { ConsentProvider } from '@c15t/react-native';
 * import { createTestConsentClient } from '@c15t/react-native/testing';
 *
 * test('turns analytics on after accept all', async () => {
 *     const consent = createTestConsentClient({ consent: 'unset' });
 *
 *     await render(
 *         <ConsentProvider client={consent.client} autoPresent={false}>
 *             <AnalyticsScreen />
 *         </ConsentProvider>
 *     );
 *     await fireEvent.press(screen.getByText('Accept all'));
 *
 *     expect(await screen.findByText('Analytics on')).toBeTruthy();
 *     expect(consent.commits).toEqual([{ action: 'all' }]);
 * });
 * ```
 */
export const createTestConsentClient = function createTestConsentClient(
	options: CreateTestConsentClientOptions = {}
): TestConsentClient {
	active?.dispose();

	const hub = createEventHub();
	const ready = options.ready ?? true;
	const initial: ConsentSnapshot = {
		...snapshotFor(buildFakeSnapshot(), options.consent ?? 'unset'),
		policyPending: !ready,
		ready,
		...options.snapshot,
	};
	const fake = createFakeNativeC15t({
		bootstrap: { ...FAKE_BOOTSTRAP, nativeUI: options.nativeUI ?? true },
		emit: hub.emit,
		snapshot: initial,
		trackingAuthorization: options.trackingAuthorization,
	});
	const uninstall = installNativeC15t(fake.nativeModule, hub.events);
	const client = createConsentClient(fake.nativeModule, hub.events);
	setConsentClient(client);

	const current = (): ConsentSnapshot => {
		const value = fake.snapshot();
		return typeof value === 'string' ? buildFakeSnapshot() : value;
	};

	const push = (next: ConsentSnapshot): void => {
		inAct(() => {
			fake.pushSnapshot(next);
		});
	};

	const answer = (
		kind: 'committed' | 'acknowledged' | 'dismissed',
		intent?: CommitIntent
	): void => {
		inAct(() => {
			fake.closeSession(kind, intent);
		});
	};

	const prompt: TestConsentPrompt = {
		acceptAll: () => {
			answer('committed', { action: 'all' });
		},
		acknowledge: () => {
			answer('acknowledged');
		},
		get current() {
			return fake.session();
		},
		dismiss: () => {
			answer('dismissed');
		},
		get isOpen() {
			return fake.session() !== null;
		},
		rejectAll: () => {
			answer('committed', { action: 'necessary' });
		},
		save: (consents) => {
			// The native screen saves every toggle it shows, so the commit names
			// each category in scope: the changed ones and the rest as they stand.
			const now = client.getSnapshot();
			const scope = now.consentCategories;
			const shown: Partial<Record<OptionalConsentCategory, boolean>> = {};
			let changed = false;
			for (const category of OPTIONAL_CONSENT_CATEGORIES) {
				if (scope === null || scope.includes(category)) {
					// Untouched toggles start from the stored choice, off when there
					// is none, as the native drafts seed them.
					const seed = now.explicitChoice?.categories[category]?.value ?? false;
					shown[category] = consents[category] ?? seed;
					changed ||= shown[category] !== seed;
				}
			}
			// Save on an unchanged draft with nothing owed closes the screen as
			// dismissed and writes nothing, as both native presenters do.
			if (!changed && now.promptRequirement.kind === 'none') {
				answer('dismissed');
				return;
			}
			answer('committed', { action: 'explicit', consents: shown });
		},
	};

	let disposed = false;
	const handle: TestConsentClient = {
		client,
		commits: fake.commits,
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			// Drop the provider's presenter mirror too, or its native listeners
			// would outlive the test and hear the next client's screens.
			releaseConsentPresenter(client);
			uninstall();
			if (active === handle) {
				active = null;
				resetConsentClient();
			} else {
				client.dispose();
			}
		},
		prompt,
		setConsent: (state) => {
			const before = current();
			push({ ...snapshotFor(before, state), revision: before.revision + 1 });
		},
		setReady: (next = true) => {
			const before = current();
			// After reset() the next init resolves the cleared policy again and
			// owes the choice prompt, as the cores' re-initialization does.
			const cleared = next ? fake.policyBeforeReset() : null;
			push({
				...before,
				...(cleared !== null &&
					before.resolution.status === 'unconfigured' && {
						...cleared,
						activeUI: 'banner',
						promptRequirement: { kind: 'choice', reason: 'missing' },
					}),
				policyPending: !next,
				ready: next,
				revision: before.revision + 1,
			});
		},
	};

	active = handle;
	return handle;
};
