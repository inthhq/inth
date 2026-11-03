import { isCategoryAllowed } from '../lib/selectors';
import { getConsentClient } from '../native/client';
import type { ConsentClient } from '../native/client';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import type { OptionalConsentCategory } from '../protocol/vocabulary';

/** An app-owned connection between native consent and one vendor SDK. */
export interface ConsentIntegration {
	/** Resolves when initial vendor calls return. Void APIs may still run natively. */
	readonly ready: Promise<void>;
	/** Reapply current permission, for example after the vendor is reset.
	 * @returns Completion of the supplied calls, rejecting on reported failure.
	 */
	sync: () => Promise<void>;
	/** Stop observing consent and disable the covered collection. Idempotent.
	 * @returns Completion of the supplied disable, rejecting on reported failure.
	 */
	disconnect: () => Promise<void>;
}

/** Shared configuration for an app-lifetime analytics connection. */
export interface AnalyticsIntegrationOptions {
	/** Category governing analytics. Defaults to `measurement`. */
	readonly category?: OptionalConsentCategory;
	/** Receives initial and later vendor failures. Collection cannot be assumed off
	 * when a vendor's own disable operation fails.
	 */
	readonly onError: (error: unknown) => void | Promise<void>;
	/** Native consent client. Defaults to the client's shared app instance. */
	readonly client?: ConsentClient;
}

/** Serialize async vendor calls and re-read native authority before each apply. */
export const connectConsentIntegration = (
	options: AnalyticsIntegrationOptions,
	apply: (isAllowed: () => boolean) => Promise<boolean>
): ConsentIntegration => {
	const category = options.category ?? 'measurement';
	if (!OPTIONAL_CONSENT_CATEGORIES.includes(category)) {
		throw new TypeError('Analytics integrations require an optional category.');
	}
	const client = options.client ?? getConsentClient();
	let connected = true;
	let applied: boolean | undefined;
	let tail = Promise.resolve();
	let disconnected: Promise<void> | undefined;
	const isAllowed = () => connected && client.isAllowed(category);
	const reportFailure = async (update: Promise<void>): Promise<void> => {
		try {
			await update;
		} catch (error) {
			try {
				await options.onError(error);
			} catch (reporterError) {
				// oxlint-disable-next-line no-console -- A failed error reporter needs an independent visible fallback.
				console.error(
					'[c15t] Analytics integration error reporter failed.',
					reporterError
				);
			}
		}
	};
	const enqueue = (force = false): Promise<void> => {
		const reconcile = async () => {
			if (!force && applied === isAllowed()) {
				return;
			}
			applied = undefined;
			applied = await apply(isAllowed);
		};
		// A failed vendor call must not prevent a subsequent withdrawal or retry.
		// oxlint-disable-next-line promise/prefer-await-to-then -- Both outcomes must continue the same serialized queue.
		const update = tail.then(reconcile, reconcile);
		tail = update;
		void reportFailure(update);
		return update;
	};
	const unsubscribe = client.subscribe(
		(snapshot) => isCategoryAllowed(snapshot, category),
		() => {
			enqueue();
		}
	);
	const ready = enqueue();
	const disconnect = (): Promise<void> => {
		if (disconnected) {
			return disconnected;
		}
		connected = false;
		// The vendor may have reset its own opt-in since our last update.
		applied = undefined;
		unsubscribe();
		const update = enqueue();
		disconnected = update;
		// oxlint-disable-next-line promise/prefer-await-to-then -- Preserve the caller's rejection while allowing a later teardown retry.
		update.catch(() => {
			disconnected = undefined;
		});
		return update;
	};
	return {
		disconnect,
		ready,
		sync: () => (connected ? enqueue(true) : disconnect()),
	};
};
