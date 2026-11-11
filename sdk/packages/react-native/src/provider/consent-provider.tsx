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

import { getConsentClient } from '../native/client';
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
		const present = (): void => {
			void presentOwedPrompt(client, privacyPolicyURL);
		};
		present();
		const unsubscribe = client.subscribe(selectOwedPromptKey, present);
		const subscription = AppState.addEventListener('change', (state): void => {
			if (state === 'active') {
				present();
			}
		});

		return () => {
			unsubscribe();
			subscription.remove();
			detach();
		};
	}, [client, presents, privacyPolicyURL]);

	return (
		<ConsentClientContext.Provider value={client}>
			<ConsentSafeAreaContext.Provider value={insets}>
				{children}
			</ConsentSafeAreaContext.Provider>
		</ConsentClientContext.Provider>
	);
};
