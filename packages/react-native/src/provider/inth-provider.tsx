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
 * a running process. And it tells native whether to present the consent prompt
 * by itself: the native `ConsentPrompt` decides when one is owed, as it does in
 * a Swift or Kotlin app. Both belong here rather than in a hook so they happen
 * once per app.
 */

import type { ReactNode } from 'react';
import { useContext, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { isSnapshotReady } from '../lib/consent-selectors.model';
import { getConsentClient } from '../native/create-consent-client';
import type { ConsentClient } from '../native/create-consent-client';
import {
	onConsentPresenterOutcome,
	presentPreferences,
	sessionPrivacyPolicyUrl,
} from '../native/presenter';
import {
	cancelSequence,
	checkTrackingAtLaunch,
	createSequenceToken,
	holdsAutoPresent,
	markAfterInformation,
	reholdAutoPresent,
	releaseBeforeConsentPrompt,
	requestSequencedTracking,
	setTrackingInformationHandled,
	setTrackingReprompt,
	syncBeforeConsentPrompt,
} from '../tracking/request-sequenced-tracking';
import type {
	ConsentTrackingReprompt,
	ConsentTrackingRequest,
} from '../tracking/tracking-sequence.model';
import {
	assertPrivacyPolicyUrl,
	configureAutoPresent,
	linksNativeUI,
	recordConsentPresenter,
} from './configure-auto-present';
import { ConsentClientContext } from './consent-client-context';
import {
	ConsentSafeAreaContext,
	useConsentSafeAreaInsets,
} from './consent-safe-area-context';
import type { ConsentSafeAreaInsets } from './consent-safe-area-context';

/**
 * Whether the provider presents the native consent prompt by itself.
 *
 * On by default. The provider then needs the app's privacy-policy URL, which the
 * prompt links to. With `autoPresent={false}` nothing opens until the app calls
 * {@link presentConsentPrompt} or {@link presentPreferences}.
 */
export type InthProviderPromptProps =
	// The opt-out comes first on purpose. TypeScript reports a failed union
	// against its last member, so `<InthProvider>` with no props is told that
	// `privacyPolicyUrl` is missing rather than that `autoPresent` is.
	| {
			/** Present nothing by itself. The manual presenter APIs work as before. */
			readonly autoPresent: false;
			/** Unused while `autoPresent` is `false`. */
			readonly privacyPolicyUrl?: string;
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
			readonly privacyPolicyUrl: string;
	  };

/**
 * Props for {@link InthProvider}.
 */
export type InthProviderProps = InthProviderBaseProps & InthProviderPromptProps;

/**
 * Props {@link InthProvider} takes whether or not it presents the prompt.
 */
export interface InthProviderBaseProps {
	/** The app subtree that may read consent. */
	readonly children?: ReactNode;
	/**
	 * The consent client to publish, instead of the one attached to the native
	 * module in the running binary.
	 *
	 * For tests: pass the client from `createTestConsentClient()` in
	 * `@inth/react-native/testing`. Leave it unset in an app. The hooks read
	 * this client, but presenting the prompt and preferences always goes to
	 * the native module installed for the process, which the test client
	 * replaces. A client built with `createConsentClient` over some other
	 * module therefore changes what the hooks read, not what is presented. A
	 * nested provider still never presents the prompt, even when it is given
	 * its own client.
	 *
	 * @example
	 * ```tsx
	 * import { createTestConsentClient } from '@inth/react-native/testing';
	 *
	 * const consent = createTestConsentClient({ consent: 'unset' });
	 *
	 * <InthProvider client={consent.client} autoPresent={false}>
	 *     <Screen />
	 * </InthProvider>;
	 * ```
	 */
	readonly client?: ConsentClient;
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
	 * function App() {
	 *     const insets = useSafeAreaInsets();
	 *
	 *     return (
	 *         <InthProvider privacyPolicyUrl="https://example.com/privacy" safeAreaInsets={insets}>
	 *             <Root />
	 *         </InthProvider>
	 *     );
	 * }
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
	/**
	 * Whether to ask Apple again after the person has answered.
	 *
	 * With `yearly`, the provider calls the request once per launch when Apple's
	 * answer is `authorized` or `denied`, marketing is granted, and a year has
	 * passed since the SDK last saw an answer. Apple decides whether to show
	 * anything: in the European Union it may ask again a year after the previous
	 * answer; elsewhere, or before then, it returns the stored answer at once. It
	 * never asks when marketing is refused, when tracking is restricted, or with
	 * `trackingRequest="manual"`.
	 *
	 * @default 'never'
	 */
	readonly trackingReprompt?: ConsentTrackingReprompt;
	/**
	 * Show your own consent controls when the person taps Additional Information
	 * on Apple's EU tracking sheet.
	 *
	 * Apple shows that button only when something will handle it. The provider
	 * handles it itself when the binary links the stock native screens: it opens
	 * native privacy settings. Pass this when you draw your own consent UI
	 * (`autoPresent={false}` with a JavaScript UI, or a build without the stock
	 * screens) and want the button; without either, Apple shows no button.
	 * Closing your controls does not ask Apple again by itself.
	 */
	readonly onTrackingAdditionalInformation?: () => void;
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
 * import { InthProvider } from '@inth/react-native';
 *
 * export function App() {
 *     return (
 *         <InthProvider privacyPolicyUrl="https://example.com/privacy">
 *             <Root />
 *         </InthProvider>
 *     );
 * }
 * ```
 *
 * @param props - Provider props.
 * @param props.children - Subtree that may read consent.
 * @param props.client - The client to publish instead of the native one, for
 *   tests. Presenting still goes to the installed native module.
 * @param props.safeAreaInsets - Bands the surfaces stay clear of, when the host
 *   measured them.
 * @param props.autoPresent - `false` leaves presenting to the app.
 * @param props.privacyPolicyUrl - The HTTPS privacy policy the prompt links to.
 * @param props.trackingRequest - When to ask for App Tracking Transparency.
 * @param props.trackingReprompt - Whether to ask again a year after an answer.
 * @param props.onTrackingAdditionalInformation - Your own controls for Apple's
 *   Additional Information button, when you draw your own consent UI.
 * @returns The children, with consent available through the hooks.
 * @throws {NativeInthUnavailableError} When the native module is not in the
 *   running binary, for example in Expo Go.
 * @throws {InthProtocolMismatchError} When the embedded native build speaks a
 *   protocol this bundle does not support. The message names both sides and the
 *   fix, which is a rebuild rather than a JavaScript update.
 * @throws {TypeError} When the provider presents the prompt and
 *   `privacyPolicyUrl` is not an HTTPS URL. A binary built without the stock
 *   native screens (`bootstrap.nativeUI === false`) presents nothing, so it
 *   neither checks the URL nor needs one.
 */
export const InthProvider = ({
	autoPresent = true,
	children,
	client: clientProp,
	privacyPolicyUrl,
	safeAreaInsets,
	trackingRequest = 'afterConsent',
	trackingReprompt = 'never',
	onTrackingAdditionalInformation,
}: InthProviderProps): ReactNode => {
	const inherited = useContext(ConsentClientContext);
	const inheritedInsets = useConsentSafeAreaInsets();
	// The handshake runs here, during render, on purpose. A binary that cannot
	// speak this protocol is a configuration error, and the app should stop at
	// the provider rather than render a consent UI over state it cannot trust.
	const client = useMemo(
		() => clientProp ?? inherited ?? getConsentClient(),
		[clientProp, inherited]
	);
	// Mirror what native shows from the first render, before any child effect can
	// open a session, whether or not this provider presents. Idempotent per client.
	if (inherited === null) {
		recordConsentPresenter(client);
		// Before any child effect can call presentConsentPrompt, for the same reason.
		syncBeforeConsentPrompt(client, trackingRequest === 'beforeConsent');
		setTrackingReprompt(client, trackingReprompt);
		setTrackingInformationHandled(
			client,
			onTrackingAdditionalInformation !== undefined || linksNativeUI(client)
		);
	}

	// Only the outermost provider presents, so a nested one cannot double it. A
	// binary built without the stock native screens has nothing to present, so it
	// needs no URL either: the app draws its own consent UI.
	const presents = autoPresent && inherited === null && linksNativeUI(client);
	if (presents) {
		assertPrivacyPolicyUrl(privacyPolicyUrl);
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

	// Tell native whether to present an owed prompt by itself. Native decides
	// when one is owed and opens it, also after backgrounding, rotation or a host
	// that was not ready yet. With beforeConsent it waits until Apple was asked.
	// Unmounting turns it off, so a later provider with autoPresent={false}
	// inherits nothing.
	useEffect(() => {
		if (inherited !== null) {
			return;
		}
		const off = (): void => {
			configureAutoPresent(client, {
				autoPresent: false,
				privacyPolicyURL: privacyPolicyUrl ?? null,
			});
		};
		if (!presents || privacyPolicyUrl === undefined) {
			off();
			return;
		}
		const token = createSequenceToken();
		const sync = (): void => {
			if (token.cancelled) {
				return;
			}
			configureAutoPresent(client, {
				autoPresent: !holdsAutoPresent(client, trackingRequest, token, sync),
				privacyPolicyURL: privacyPolicyUrl,
			});
		};
		sync();
		// Only the ATT hold reads these; native follows the core by itself.
		const stops =
			trackingRequest === 'beforeConsent'
				? [
						client.subscribe((snapshot) => snapshot.revision, sync),
						onConsentPresenterOutcome(() => {
							reholdAutoPresent(client);
							sync();
						}),
					]
				: [];

		return () => {
			cancelSequence(token);
			for (const stop of stops) {
				stop();
			}
			off();
		};
	}, [client, inherited, presents, privacyPolicyUrl, trackingRequest]);

	// With beforeConsent, a prompt the app opens itself waits for Apple's alert
	// too. The wait was installed while rendering; this keeps it through strict
	// mode's remount and drops it once the provider has gone.
	useEffect(() => {
		if (inherited !== null || trackingRequest !== 'beforeConsent') {
			return;
		}
		syncBeforeConsentPrompt(client, true);

		return () => {
			releaseBeforeConsentPrompt(client);
		};
	}, [client, inherited, trackingRequest]);

	// Ask for App Tracking Transparency after each prompt or settings session
	// closes, and at a launch that owes no prompt. The native host reports the
	// outcome once its UI has animated away, because iOS will not show the alert
	// over a presentation that is leaving. Only an iOS build that can still ask
	// listens: Apple has not answered, or the yearly re-ask may call again.
	useEffect(() => {
		const authorization = client.getTrackingAuthorization();
		const answered =
			authorization === 'authorized' || authorization === 'denied';
		if (
			inherited !== null ||
			trackingRequest === 'manual' ||
			!(
				authorization === 'not-determined' ||
				(answered && trackingReprompt === 'yearly')
			)
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
		// The app's own controls when it passed a handler, the stock settings otherwise.
		const showControls = async (url: string | undefined): Promise<void> => {
			markAfterInformation(client);
			if (onTrackingAdditionalInformation !== undefined) {
				onTrackingAdditionalInformation();
			} else if (url !== undefined) {
				await openSettings(url);
			}
		};
		const afterPrompt = async (url: string | undefined): Promise<void> => {
			const result = await requestSequencedTracking(
				client,
				trackingRequest,
				'afterPrompt',
				token
			);
			if (result === 'paused') {
				await showControls(url);
			}
		};
		const removeOutcome = onConsentPresenterOutcome((outcome): void => {
			if (outcome.kind === 'unavailable') {
				return;
			}
			// A session the app opened carries its URL; one native opened by itself
			// used the provider's.
			const url =
				sessionPrivacyPolicyUrl(outcome.sessionId) ?? privacyPolicyUrl;
			void afterPrompt(url);
		});
		// A stored choice still in force owes no prompt this launch, so the rule
		// applies as soon as the core has an answer. Only a presenting provider
		// does this, and it always has a URL.
		let stopLaunch = (): void => undefined;
		if (presents && privacyPolicyUrl !== undefined) {
			const launchURL = privacyPolicyUrl;
			const check = (): boolean =>
				checkTrackingAtLaunch(client, token, trackingRequest, () => {
					// Nothing else would show those controls; closing them asks again.
					void showControls(launchURL);
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
	}, [
		client,
		inherited,
		onTrackingAdditionalInformation,
		presents,
		privacyPolicyUrl,
		trackingReprompt,
		trackingRequest,
	]);

	return (
		<ConsentClientContext.Provider value={client}>
			<ConsentSafeAreaContext.Provider value={insets}>
				{children}
			</ConsentSafeAreaContext.Provider>
		</ConsentClientContext.Provider>
	);
};
