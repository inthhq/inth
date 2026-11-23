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
	| PromiseLike<UserConsent | null | undefined>;

/** Default timeout (ms) before a pending `userConsent` Promise releases its hold. */
export const DEFAULT_USER_CONSENT_TIMEOUT_MS = 3_000;

/** Whether `value` is a Promise / thenable. */
export const isUserConsentPromise = function isUserConsentPromise(
	value: UserConsentOption | undefined
): value is PromiseLike<UserConsent | null | undefined> {
	return (
		value !== null &&
		value !== undefined &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<UserConsent | null | undefined>).then ===
			'function'
	);
};

export interface UserConsentSyncController {
	/** Apply a new `userConsent` value or Promise. */
	apply: (
		value: UserConsentOption | undefined,
		options?: { readonly initialStart?: boolean }
	) => void;
	/** Fence in-flight Promises, clear timers/replays, and optionally preserve hold. */
	onIdentityEpochChanged: (options?: {
		readonly preservePending?: boolean;
	}) => void;
	/** Cancel timers and fence any in-flight Promise on runtime disposal. */
	dispose: () => void;
}

/**
 * Create the runtime's `userConsent` controller bound to one kernel.
 *
 * - Each new user's first Promise arms the `userConsentPending` hold and a
 *   3-second timeout. Later Promise identities for the same user start a new
 *   generation without re-arming the hold.
 * - A late result arriving after the 3-second timeout still syncs if no
 *   identity-epoch bump, newer Promise, or opt-out lift fenced it.
 */
export const createUserConsentSyncController =
	function createUserConsentSyncController(
		kernel: InternalKernel,
		timeoutMs: number = DEFAULT_USER_CONSENT_TIMEOUT_MS,
		getIdentityEpoch: () => number = () => 0,
		onNullResolved?: () => void
	): UserConsentSyncController {
		let holdArmedForExternalId: string | null = null;
		let activePromiseGeneration = 0;
		let holdEpoch = 0;
		let activeTimeout: ReturnType<typeof setTimeout> | null = null;
		let lastPromise: PromiseLike<UserConsent | null | undefined> | null = null;
		let lastResolved: {
			readonly externalId: string;
			readonly identityEpoch: number;
			readonly value: UserConsent | null | undefined;
		} | null = null;
		let disposed = false;

		const cancelTimer = (): void => {
			holdEpoch += 1;
			if (activeTimeout !== null) {
				clearTimeout(activeTimeout);
				activeTimeout = null;
			}
		};

		const clearHold = (): void => {
			cancelTimer();
			if (kernel.getSnapshot().userConsentPending) {
				kernel.setUserConsentPending(false);
			}
		};

		const armHoldFor = (externalId: string): void => {
			holdArmedForExternalId = externalId;
			cancelTimer();
			const myHoldEpoch = holdEpoch;
			if (!kernel.getSnapshot().userConsentPending) {
				kernel.setUserConsentPending(true);
			}
			activeTimeout = setTimeout(() => {
				activeTimeout = null;
				if (!disposed && holdEpoch === myHoldEpoch) {
					kernel.setUserConsentPending(false);
				}
			}, timeoutMs);
		};

		const followPromise = async (
			promise: PromiseLike<UserConsent | null | undefined>,
			myPromiseGen: number,
			mySyncGen: number,
			myIdentityEpoch: number
		): Promise<void> => {
			let resolved: UserConsent | null | undefined;
			try {
				resolved = await promise;
			} catch {
				if (
					!disposed &&
					activePromiseGeneration === myPromiseGen &&
					getIdentityEpoch() === myIdentityEpoch
				) {
					clearHold();
				}
				return;
			}
			if (
				disposed ||
				activePromiseGeneration !== myPromiseGen ||
				getIdentityEpoch() !== myIdentityEpoch ||
				kernel.getAccountSyncGeneration() !== mySyncGen
			) {
				if (
					!disposed &&
					activePromiseGeneration === myPromiseGen &&
					getIdentityEpoch() === myIdentityEpoch
				) {
					clearHold();
				}
				return;
			}
			cancelTimer();
			if (resolved === null) {
				onNullResolved?.();
				kernel.settleUserConsent(null, { clearPending: true });
				return;
			}
			const externalId = kernel.getSnapshot().user?.externalId ?? null;
			if (externalId !== null) {
				lastResolved = {
					externalId,
					identityEpoch: myIdentityEpoch,
					value: resolved,
				};
			}
			kernel.settleUserConsent(resolved, { clearPending: true });
		};

		const applyPromise = (
			value: PromiseLike<UserConsent | null | undefined>,
			currentExternalId: string | null,
			initialStart: boolean
		): void => {
			if (value === lastPromise) {
				// If this memoized Promise already settled before `start()` mounted
				// persistence and the identity epoch has not moved, re-sync with
				// `forceClientSync` so persistence writes it.
				if (
					initialStart &&
					lastResolved !== null &&
					lastResolved.identityEpoch === getIdentityEpoch() &&
					lastResolved.externalId === currentExternalId &&
					lastResolved.value !== undefined
				) {
					kernel.settleUserConsent(lastResolved.value, {
						clearPending: true,
						forceClientSync: true,
					});
				}
				return;
			}
			lastPromise = value;
			lastResolved = null;
			activePromiseGeneration += 1;
			const myPromiseGen = activePromiseGeneration;
			const mySyncGen = kernel.getAccountSyncGeneration();
			const myIdentityEpoch = getIdentityEpoch();
			if (
				currentExternalId !== null &&
				holdArmedForExternalId !== currentExternalId
			) {
				armHoldFor(currentExternalId);
			}
			void followPromise(value, myPromiseGen, mySyncGen, myIdentityEpoch);
		};

		return {
			apply(value, options) {
				if (disposed || value === undefined) {
					return;
				}
				const currentExternalId = kernel.getSnapshot().user?.externalId ?? null;
				if (
					holdArmedForExternalId !== null &&
					holdArmedForExternalId !== currentExternalId
				) {
					holdArmedForExternalId = null;
				}
				if (value === null) {
					lastPromise = null;
					lastResolved = null;
					activePromiseGeneration += 1;
					cancelTimer();
					kernel.settleUserConsent(null, { clearPending: true });
					return;
				}
				if (isUserConsentPromise(value)) {
					applyPromise(
						value,
						currentExternalId,
						options?.initialStart === true
					);
					return;
				}

				lastPromise = null;
				lastResolved = null;
				activePromiseGeneration += 1;
				cancelTimer();
				kernel.settleUserConsent(value, {
					clearPending: true,
					forceClientSync: options?.initialStart === true,
				});
			},

			dispose() {
				disposed = true;
				lastPromise = null;
				lastResolved = null;
				activePromiseGeneration += 1;
				clearHold();
			},

			onIdentityEpochChanged(options) {
				holdArmedForExternalId = null;
				lastPromise = null;
				lastResolved = null;
				activePromiseGeneration += 1;
				if (options?.preservePending) {
					cancelTimer();
				} else {
					clearHold();
				}
			},
		};
	};
