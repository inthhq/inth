/**
 * Runtime controller for the `userConsent` provider option: resolves values,
 * `null`, and `Promise<UserConsent | null>` with a 3-second hold timeout,
 * per-user hold arming, and generation fencing.
 *
 * @internal
 */

import type { UserConsent } from '@inth/sdk-schema/types';

import type { InternalKernel } from '../kernel/internals';

/** Accepted values for the `userConsent` runtime/provider option. */
export type UserConsentOption =
	| UserConsent
	| null
	| PromiseLike<UserConsent | null>;

/** Default timeout (ms) before a pending `userConsent` Promise releases its hold. */
export const DEFAULT_USER_CONSENT_TIMEOUT_MS = 3_000;

/** Whether `value` is a Promise / thenable. */
export const isUserConsentPromise = function isUserConsentPromise(
	value: UserConsentOption | undefined
): value is PromiseLike<UserConsent | null> {
	return (
		value !== null &&
		value !== undefined &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<UserConsent | null>).then === 'function'
	);
};

export interface UserConsentSyncController {
	/** Apply a new `userConsent` value or Promise. */
	apply: (
		value: UserConsentOption | undefined,
		options?: { readonly initialStart?: boolean }
	) => void;
	/** Reset hold tracking and fence any in-flight Promise on user change/logout. */
	onUserChanged: (externalId: string | null) => void;
	/** Cancel timers and fence any in-flight Promise on runtime disposal. */
	dispose: () => void;
}

/**
 * Create the runtime's `userConsent` controller bound to one kernel.
 *
 * - Each new user's first Promise arms the `userConsentPending` hold and a
 *   3-second timeout. Later Promise identities for the same user start a new
 *   generation without re-arming the hold.
 * - A late result arriving after the 3-second timeout still syncs if no user
 *   change, logout, newer Promise, clear, dispose, or opt-out lift fenced it.
 */
export const createUserConsentSyncController =
	function createUserConsentSyncController(
		kernel: InternalKernel,
		timeoutMs: number = DEFAULT_USER_CONSENT_TIMEOUT_MS
	): UserConsentSyncController {
		let holdArmedForExternalId: string | null = null;
		let activePromiseGeneration = 0;
		let activeTimeout: ReturnType<typeof setTimeout> | null = null;
		let lastPromise: PromiseLike<UserConsent | null> | null = null;
		let disposed = false;

		const clearTimer = (): void => {
			if (activeTimeout !== null) {
				clearTimeout(activeTimeout);
				activeTimeout = null;
			}
		};

		const clearHold = (): void => {
			clearTimer();
			if (kernel.getSnapshot().userConsentPending) {
				kernel.setUserConsentPending(false);
			}
		};

		const armHoldFor = (externalId: string, myPromiseGen: number): void => {
			holdArmedForExternalId = externalId;
			if (!kernel.getSnapshot().userConsentPending) {
				kernel.setUserConsentPending(true);
			}
			clearTimer();
			activeTimeout = setTimeout(() => {
				activeTimeout = null;
				if (!disposed && activePromiseGeneration === myPromiseGen) {
					kernel.setUserConsentPending(false);
				}
			}, timeoutMs);
		};

		const followPromise = async (
			promise: PromiseLike<UserConsent | null>,
			myPromiseGen: number,
			mySyncGen: number
		): Promise<void> => {
			let resolved: UserConsent | null;
			try {
				resolved = await promise;
			} catch {
				if (activePromiseGeneration === myPromiseGen) {
					clearHold();
				}
				return;
			}
			if (activePromiseGeneration === myPromiseGen) {
				clearHold();
			}
			if (
				disposed ||
				activePromiseGeneration !== myPromiseGen ||
				kernel.getAccountSyncGeneration() !== mySyncGen
			) {
				return;
			}
			kernel.syncUserConsent(resolved);
		};

		return {
			apply(value, options) {
				if (disposed) {
					return;
				}
				const currentExternalId = kernel.getSnapshot().user?.externalId ?? null;
				if (
					holdArmedForExternalId !== null &&
					holdArmedForExternalId !== currentExternalId
				) {
					holdArmedForExternalId = null;
				}
				if (value === undefined) {
					if (lastPromise !== null) {
						lastPromise = null;
						activePromiseGeneration += 1;
						clearHold();
					}
					return;
				}
				if (value === null) {
					lastPromise = null;
					activePromiseGeneration += 1;
					clearHold();
					kernel.syncUserConsent(null);
					return;
				}
				if (isUserConsentPromise(value)) {
					if (value === lastPromise) {
						return;
					}
					lastPromise = value;
					activePromiseGeneration += 1;
					const myPromiseGen = activePromiseGeneration;
					const mySyncGen = kernel.getAccountSyncGeneration();
					const externalId = kernel.getSnapshot().user?.externalId ?? null;
					if (externalId !== null && holdArmedForExternalId !== externalId) {
						armHoldFor(externalId, myPromiseGen);
					}
					void followPromise(value, myPromiseGen, mySyncGen);
					return;
				}

				lastPromise = null;
				activePromiseGeneration += 1;
				clearHold();
				if (options?.initialStart) {
					kernel.applyInitialUserConsent(value);
				} else {
					kernel.syncUserConsent(value);
				}
			},

			dispose() {
				disposed = true;
				lastPromise = null;
				activePromiseGeneration += 1;
				clearHold();
			},

			onUserChanged() {
				holdArmedForExternalId = null;
				lastPromise = null;
				activePromiseGeneration += 1;
				clearHold();
			},
		};
	};
