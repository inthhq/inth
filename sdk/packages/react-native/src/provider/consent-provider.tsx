/**
 * The provider: the one place that attaches JavaScript to the native instance
 * already running in the binary.
 *
 * It creates nothing. The native core was booted from a launch hook on iOS and
 * Android, hydration may already be done, and the subject id already exists.
 * The provider reads the handshake once, publishes the client, and gets out of
 * the way.
 *
 * It holds two pieces of app-wide work. A foreground listener re-reads the
 * platform tracking answer, because the Settings app changes it without telling
 * a running process. And unless the app opts out, it presents the native consent
 * prompt when one is owed. Both belong here rather than in a hook so they happen
 * once per app.
 */

import type { ReactNode } from 'react';
import { useContext, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { isSnapshotReady } from '../lib/selectors';
import { getConsentClient } from '../native/client';
import {
	onConsentPresenterOutcome,
	presentPreferences,
	sessionPrivacyPolicyURL,
	setBeforeConsentPrompt,
} from '../native/presenter';
import {
	assertPrivacyPolicyURL,
	attachAutoPresent,
	linksNativeUI,
	presentOwedPrompt,
	recordConsentPresenter,
	selectOwedPromptKey,
} from './auto-present';
import { ConsentClientContext } from './consent-context';
import {
	ConsentSafeAreaContext,
	useConsentSafeAreaInsets,
} from './safe-area-context';
import type { ConsentSafeAreaInsets } from './safe-area-context';
import {
	cancelSequence,
	checkTrackingAtLaunch,
	createSequenceToken,
	requestSequencedTracking,
	requestTrackingBeforeConsent,
} from './tracking-sequence';
import type { ConsentTrackingRequest } from './tracking-sequence';

/**
 * Whether the provider presents the native consent prompt by itself.
 *
 * On by default. The provider then needs the app's privacy-policy URL, which the
 * prompt links to. With `autoPresent={false}` nothing opens until the app calls
 * {@link presentConsentPrompt} or {@link presentPreferences}.
 */
export type ConsentProviderPromptProps =
	// The opt-out comes first on purpose. TypeScript reports a failed union
	// against its last member, so `<ConsentProvider>` with no props is told that
	// `privacyPolicyURL` is missing rather than that `autoPresent` is.
	| {
			/** Present nothing by itself. The manual presenter APIs work as before. */
			readonly autoPresent: false;
			/** Unused while `autoPresent` is `false`. */
			readonly privacyPolicyURL?: string;
	  }
	| {
			/**
			 * Present the native prompt once the core is ready and a prompt is owed,
			 * once per owed prompt. A stored choice that is still valid shows nothing;
			 * a new policy or an expired choice prompts again.
			 *
			 * @default true
			 */
			readonly autoPresent?: boolean;
			/** The app's HTTPS privacy-policy URL, linked from the prompt. */
			readonly privacyPolicyURL: string;
	  };

/**
 * Props for {@link ConsentProvider}.
 */
export type ConsentProviderProps = ConsentProviderBaseProps &
	ConsentProviderPromptProps;

/**
 * Props {@link ConsentProvider} takes whether or not it presents the prompt.
 */
export interface ConsentProviderBaseProps {
	/** The app subtree that may read consent. */
	readonly children?: ReactNode;
	/**
	 * The system-reserved bands to lay the consent surfaces outside of.
	 *
	 * Pass the live measurement, not a constant, so rotation and the collapsing
	 * iOS home indicator re-measure without a remount. A host already running
	 * `react-native-safe-area-context` reads these from `useSafeAreaInsets()`
	 * and hands them over; a host that measures nothing gets a reserved floor
	 * instead, documented on {@link useConsentSafeArea}.
	 *
	 * @example
	 * ```tsx
	 * import { useSafeAreaInsets } from 'react-native-safe-area-context';
	 *
	 * const insets = useSafeAreaInsets();
	 *
	 * <ConsentProvider safeAreaInsets={insets}>
	 *     <Root />
	 * </ConsentProvider>;
	 * ```
	 */
	readonly safeAreaInsets?: ConsentSafeAreaInsets;
	/**
	 * When to ask for App Tracking Transparency on iOS.
	 *
	 * Runs only when the app enabled it (`enableAppTrackingTransparency` in the
	 * Expo plugin, or `NSUserTrackingUsageDescription` in `Info.plist`) and Apple
	 * has not been answered yet. Android has no such alert, so this does nothing
	 * there. Apple's answer never changes stored consent.
	 *
	 * - `afterConsent`: the prompt first, then Apple's alert once the prompt has
	 *   closed, and only while marketing is granted. Saving marketing as granted
	 *   later in settings asks then.
	 * - `beforeConsent`: Apple's alert first, then the prompt.
	 * - `manual`: nothing automatic.
	 *
	 * @default 'afterConsent'
	 */
	readonly trackingRequest?: ConsentTrackingRequest;
}

/**
 * Publish the native consent state to the tree below it.
 *
 * Render it once, near the root. A nested provider reuses the ancestor's client
 * rather than attaching a second time, so a storybook or a test harness that
 * wraps an already-provided subtree cannot double the native listener.
 *
 * By default it also presents the native consent prompt when one is owed. A
 * nested provider never presents; the outermost one does.
 *
 * @example
 * ```tsx
 * import { ConsentProvider } from '@c15t/react-native';
 *
 * export function App() {
 *     return (
 *         <ConsentProvider privacyPolicyURL="https://example.com/privacy">
 *             <Root />
 *         </ConsentProvider>
 *     );
 * }
 * ```
 *
 * @param props - Provider props.
 * @param props.children - Subtree that may read consent.
 * @param props.safeAreaInsets - Bands the surfaces stay clear of, when the host
 *   measured them.
 * @param props.autoPresent - `false` leaves presenting to the app.
 * @param props.privacyPolicyURL - The HTTPS privacy policy the prompt links to.
 * @param props.trackingRequest - When to ask for App Tracking Transparency.
 * @returns The children, with consent available through the hooks.
 * @throws {NativeC15tUnavailableError} When the native module is not in the
 *   running binary, for example in Expo Go.
 * @throws {C15tProtocolMismatchError} When the embedded native build speaks a
 *   protocol this bundle does not support. The message names both sides and the
 *   fix, which is a rebuild rather than a JavaScript update.
 * @throws {TypeError} When the provider presents the prompt and
 *   `privacyPolicyURL` is not an HTTPS URL. A binary built without the stock
 *   native screens (`bootstrap.nativeUI === false`) presents nothing, so it
 *   neither checks the URL nor needs one.
 */
export const ConsentProvider = ({
	autoPresent = true,
	children,
	privacyPolicyURL,
	safeAreaInsets,
	trackingRequest = 'afterConsent',
}: ConsentProviderProps): ReactNode => {
	const inherited = useContext(ConsentClientContext);
	const inheritedInsets = useConsentSafeAreaInsets();
	// The handshake runs here, during render, on purpose. A binary that cannot
	// speak this protocol is a configuration error, and the app should stop at
	// the provider rather than render a consent UI over state it cannot trust.
	const client = useMemo(() => inherited ?? getConsentClient(), [inherited]);
	// Record what native shows from the first render, before any child effect can
	// open a session, whether or not this provider presents. Idempotent per client.
	if (inherited === null) {
		recordConsentPresenter(client);
	}

	// Only the outermost provider presents, so a nested one cannot double it. A
	// binary built without the stock native screens has nothing to present, so it
	// needs no URL either: the app draws its own consent UI.
	const presents = autoPresent && inherited === null && linksNativeUI(client);
	if (presents) {
		assertPrivacyPolicyURL(privacyPolicyURL);
	}

	// An inner provider that was given nothing keeps the ancestor's measurement
	// rather than dropping the tree back to the reserved floor.
	const source = safeAreaInsets ?? inheritedInsets;
	const { bottom, left, right, top } = source ?? {};

	// Keyed on the four numbers, not the object. A host that spreads a fresh
	// object on each of its own renders would otherwise push a new context value
	// down to every surface that reads the layout.
	const insets = useMemo(
		() =>
			bottom === undefined ||
			left === undefined ||
			right === undefined ||
			top === undefined
				? null
				: { bottom, left, right, top },
		[bottom, left, right, top]
	);

	// Re-read the platform tracking answer on the way back to the foreground.
	//
	// The subject who turns tracking off in `Settings > Privacy & Security > Tracking` and
	// returns to your app has changed the one thing `getTrackingAuthorization` caches, and
	// Apple tells a running process nothing about it. Without this the app keeps an
	// `authorized` the device withdrew, which is the failure direction that matters: tracking
	// behaviour that should have stopped carries on until the next launch.
	//
	// It runs here rather than in a hook so it happens once per app and not once per
	// component that happens to read tracking, and it is a no-op on Android, where the
	// answer is `unsupported` before and after and nothing is notified.
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (state): void => {
			if (state === 'active') {
				client.refreshTrackingAuthorization();
			}
		});

		return () => {
			subscription.remove();
		};
	}, [client]);

	// Present the owed prompt now, whenever the owed prompt changes, and on the
	// way back to the foreground, where a call that found no window can succeed.
	useEffect(() => {
		if (!presents || privacyPolicyURL === undefined) {
			return;
		}
		const detach = attachAutoPresent(client, privacyPolicyURL);
		const token = createSequenceToken();
		// With beforeConsent the ledger hears the trigger only once Apple has been
		// asked or skipped, so it never opens the prompt over Apple's alert.
		const present = async (): Promise<void> => {
			if (
				trackingRequest === 'beforeConsent' &&
				!(await requestTrackingBeforeConsent(client, token))
			) {
				return;
			}
			await presentOwedPrompt(client, privacyPolicyURL);
		};
		void present();
		const unsubscribe = client.subscribe(selectOwedPromptKey, () => {
			void present();
		});
		const subscription = AppState.addEventListener('change', (state): void => {
			if (state === 'active') {
				void present();
			}
		});

		return () => {
			cancelSequence(token);
			unsubscribe();
			subscription.remove();
			detach();
		};
	}, [client, presents, privacyPolicyURL, trackingRequest]);

	// With beforeConsent, a prompt the app opens itself waits for Apple's alert
	// too. Only an iOS build that can still ask registers the wait.
	useEffect(() => {
		if (
			inherited !== null ||
			trackingRequest !== 'beforeConsent' ||
			client.getTrackingAuthorization() !== 'not-determined'
		) {
			return;
		}
		const token = createSequenceToken();
		const remove = setBeforeConsentPrompt(async (): Promise<void> => {
			if (selectOwedPromptKey(client.getSnapshot()) !== null) {
				await requestTrackingBeforeConsent(client, token);
			}
		});

		return () => {
			cancelSequence(token);
			remove();
		};
	}, [client, inherited, trackingRequest]);

	// Ask for App Tracking Transparency after each prompt or settings session
	// closes. The native host reports the outcome once its UI has animated away,
	// because iOS will not show the alert over a presentation that is leaving.
	// Only an iOS build that can still ask listens.
	useEffect(() => {
		if (
			inherited !== null ||
			trackingRequest !== 'afterConsent' ||
			client.getTrackingAuthorization() !== 'not-determined'
		) {
			return;
		}
		const token = createSequenceToken();
		// Additional Information on Apple's EU sheet asks for the app's own
		// controls. Closing them runs this rule again.
		const openSettings = async (url: string): Promise<void> => {
			if (token.cancelled) {
				return;
			}
			try {
				await presentPreferences(url);
			} catch {
				// No foreground window. The person can open settings themselves.
			}
		};
		const afterPrompt = async (url: string | undefined): Promise<void> => {
			const result = await requestSequencedTracking(
				client,
				trackingRequest,
				'afterPrompt',
				token
			);
			if (result === 'paused' && url !== undefined) {
				await openSettings(url);
			}
		};
		const removeOutcome = onConsentPresenterOutcome((outcome): void => {
			if (outcome.kind === 'unavailable') {
				return;
			}
			// The session was opened with a URL, also with autoPresent off.
			const url =
				sessionPrivacyPolicyURL(outcome.sessionId) ?? privacyPolicyURL;
			void afterPrompt(url);
		});
		// A stored choice still in force owes no prompt this launch, so the rule
		// applies as soon as the core has an answer. Only a presenting provider
		// does this, and it always has a URL.
		let stopLaunch = (): void => undefined;
		if (presents && privacyPolicyURL !== undefined) {
			const launchURL = privacyPolicyURL;
			const check = (): boolean =>
				checkTrackingAtLaunch(client, token, () => {
					void openSettings(launchURL);
				});
			if (!check()) {
				stopLaunch = client.subscribe(isSnapshotReady, () => {
					if (check()) {
						stopLaunch();
					}
				});
			}
		}

		return () => {
			cancelSequence(token);
			removeOutcome();
			stopLaunch();
		};
	}, [client, inherited, presents, privacyPolicyURL, trackingRequest]);

	return (
		<ConsentClientContext.Provider value={client}>
			<ConsentSafeAreaContext.Provider value={insets}>
				{children}
			</ConsentSafeAreaContext.Provider>
		</ConsentClientContext.Provider>
	);
};
