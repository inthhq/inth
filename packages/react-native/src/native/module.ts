/**
 * The single lookup point for the native consent module.
 *
 * Everything else in this package talks to Swift and Kotlin through
 * {@link getNativeInth} or the client built on top of it, so there is exactly
 * one place that touches `TurboModuleRegistry`, and exactly one readable error
 * when the module is not there.
 *
 * New Architecture only. There is no `NativeModules` fallback, because the
 * legacy bridge cannot register the Codegen surface this package is generated
 * against.
 */

import { NativeEventEmitter, TurboModuleRegistry } from 'react-native';

import { NATIVE_INTH_MODULE_NAME } from '../protocol';
import type { Spec } from '../specs/NativeInth';

/**
 * The TurboModule the native cores register: the Codegen spec plus the
 * registration name `Inth`.
 */
export type NativeInthTurboModule = Spec;

/**
 * A subscription handed back by {@link NativeEventsLike}, in the shape
 * `NativeEventEmitter` returns.
 */
export interface NativeEventSubscription {
	/** Detach the listener. Safe to call more than once. */
	remove: () => void;
}

/**
 * The event surface the client attaches to.
 *
 * `NativeEventEmitter` satisfies it, and a test double can too, which is why
 * the client takes this instead of the concrete class.
 */
export interface NativeEventsLike {
	/**
	 * Register a listener for one native event.
	 *
	 * @param eventName - One of {@link NATIVE_EVENT_NAMES}.
	 * @param listener - Receives the event payload as a JSON string.
	 * @returns A subscription to remove when the last consumer unmounts.
	 */
	addListener: (
		eventName: string,
		listener: (payload: string) => void
	) => NativeEventSubscription;
}

/**
 * Thrown when the Inth TurboModule is not registered in the running binary.
 *
 * Detectability is the point: the failure is a build or host-app problem, so
 * the message names the causes in the order people hit them.
 */
export class NativeInthUnavailableError extends Error {
	/**
	 * @param reason - Why the lookup failed, already human readable.
	 */
	public constructor(reason: string) {
		super(
			[
				`@inth/react-native cannot reach its native consent module "${NATIVE_INTH_MODULE_NAME}": ${reason}`,
				'',
				'This package needs a custom native build with the New Architecture enabled. Usual causes:',
				'- The app runs in Expo Go, which cannot contain custom native modules. Use a development build instead.',
				'- The iOS pods were not installed or the app was not rebuilt after installing @inth/react-native. Run pod install, then rebuild clean.',
				'- The Android app was not rebuilt after installing @inth/react-native. Clean and rebuild the app.',
				'- It runs on web, which has no native module; InthProvider uses the browser engine.',
				'',
				'A JavaScript-only update (Expo Updates, CodePush) cannot add a missing native module; it has to ship inside the binary.',
			].join('\n')
		);
		this.name = 'NativeInthUnavailableError';
	}
}

/**
 * A module and emitter installed in place of the registry, or `null`.
 *
 * Only `@inth/react-native/testing` installs one, so a Jest or Vitest run has
 * a native core to talk to. Everything that reaches native goes through
 * {@link getNativeInth} and {@link getNativeInthEvents}, so the presenter
 * calls reach the same fake as the client does.
 */
let installed: {
	readonly events: NativeEventsLike;
	readonly nativeModule: NativeInthTurboModule;
} | null = null;

/**
 * Serve a module and emitter instead of the TurboModule registry.
 *
 * @internal
 * @param nativeModule - The module every lookup returns while installed.
 * @param events - The emitter every subscription attaches to.
 * @returns Uninstall them again, if they are still the installed pair.
 */
export const installNativeInth = function installNativeInth(
	nativeModule: NativeInthTurboModule,
	events: NativeEventsLike
): () => void {
	const pair = { events, nativeModule };
	installed = pair;

	return () => {
		if (installed === pair) {
			installed = null;
		}
	};
};

/**
 * Look the native module up.
 *
 * The lookup is not memoized: it is a property read, and skipping the memo
 * keeps a rebuilt host app or a fresh test double working without a reset
 * hook. Memoize at the consumer instead, which is what the consent client
 * does with the snapshot.
 *
 * @returns The registered TurboModule.
 * @throws {NativeInthUnavailableError} When the module is missing, so the
 *   caller gets the build diagnosis rather than an undefined read later.
 */
export const getNativeInth = function getNativeInth(): NativeInthTurboModule {
	if (installed !== null) {
		return installed.nativeModule;
	}

	let candidate: Spec | null | undefined = null;

	try {
		candidate = TurboModuleRegistry.get<Spec>(NATIVE_INTH_MODULE_NAME);
	} catch (error: unknown) {
		throw new NativeInthUnavailableError(
			`the TurboModule registry refused the lookup (${String(error instanceof Error ? error.message : error)})`
		);
	}

	if (candidate === null || candidate === undefined) {
		throw new NativeInthUnavailableError(
			`no module is registered under that name`
		);
	}

	return candidate;
};

/**
 * Check that a module looks like the surface this package calls.
 *
 * A partially built binding (a stale pod, a half-written Android package) fails
 * here rather than on the first `getSnapshot()` read, which would otherwise
 * throw somewhere inside a render.
 *
 * @param nativeModule - Candidate module from the registry.
 * @returns `true` when every synchronous read the client needs exists.
 */
export const hasNativeInthSurface = function hasNativeInthSurface(
	nativeModule: NativeInthTurboModule
): boolean {
	return (
		typeof nativeModule.getBootstrap === 'function' &&
		typeof nativeModule.getSnapshot === 'function' &&
		typeof nativeModule.commit === 'function'
	);
};

/**
 * Normalize an event payload to the JSON text the client parses.
 *
 * The contract says the payload is a JSON string, and on Android a dictionary
 * can arrive as an object instead. Serializing the object keeps one read path
 * in the client rather than two.
 *
 * @param payload - Whatever the emitter delivered.
 * @returns JSON text, or an empty object for a payload with no body.
 */
const toEventJson = function toEventJson(payload: unknown): string {
	if (typeof payload === 'string') {
		return payload;
	}

	if (typeof payload === 'object' && payload !== null) {
		return JSON.stringify(payload);
	}

	return '{}';
};

/**
 * Build the event emitter for the native module.
 *
 * The returned object adapts `NativeEventEmitter` to
 * {@link NativeEventsLike}: a JSON-string payload, and a subscription whose
 * `remove` is safe to call twice.
 *
 * @returns An emitter the consent client can subscribe through.
 * @throws {NativeInthUnavailableError} When the module is missing or incomplete.
 */
export const getNativeInthEvents =
	function getNativeInthEvents(): NativeEventsLike {
		if (installed !== null) {
			return installed.events;
		}

		const nativeModule = getNativeInth();

		if (!hasNativeInthSurface(nativeModule)) {
			throw new NativeInthUnavailableError(
				'the registered module is missing getBootstrap, getSnapshot, or commit, so the native build does not match this JavaScript package'
			);
		}

		const emitter = new NativeEventEmitter(nativeModule);

		return {
			addListener: (eventName, listener) => {
				const subscription = emitter.addListener(
					eventName,
					(payload: unknown) => {
						listener(toEventJson(payload));
					}
				);

				return {
					remove: () => {
						subscription.remove();
					},
				};
			},
		};
	};
