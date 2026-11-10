import { isCategoryAllowed } from '../lib/selectors';
import { getConsentClient } from '../native/client';
import type { ConsentClient } from '../native/client';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import type {
	AllConsentNames,
	OptionalConsentCategory,
} from '../protocol/vocabulary';

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

/**
 * Serialize async vendor calls for state derived from several categories.
 *
 * `read` derives the vendor's state from category permission. It is called with
 * a reader that denies everything once the integration disconnects. `apply`
 * pushes the state to the vendor, re-reading through `current` between calls,
 * and returns the state it left the vendor in. A later snapshot that changes
 * the derived state queues another apply.
 */
export const connectConsentState = <StateType>(
	options: Pick<AnalyticsIntegrationOptions, 'client' | 'onError'>,
	read: (isAllowed: (category: AllConsentNames) => boolean) => StateType,
	apply: (current: () => StateType) => Promise<StateType>
): ConsentIntegration => {
	const client = options.client ?? getConsentClient();
	let connected = true;
	let applied: string | undefined;
	let tail = Promise.resolve();
	let disconnected: Promise<void> | undefined;
	const current = () =>
		read((category) => connected && client.isAllowed(category));
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
			if (!force && applied === JSON.stringify(current())) {
				return;
			}
			applied = undefined;
			applied = JSON.stringify(await apply(current));
		};
		// A failed vendor call must not prevent a subsequent withdrawal or retry.
		// oxlint-disable-next-line promise/prefer-await-to-then -- Both outcomes must continue the same serialized queue.
		const update = tail.then(reconcile, reconcile);
		tail = update;
		void reportFailure(update);
		return update;
	};
	const unsubscribe = client.subscribe(
		(snapshot) =>
			JSON.stringify(read((category) => isCategoryAllowed(snapshot, category))),
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

/** Serialize async vendor calls and re-read native authority before each apply. */
export const connectConsentIntegration = (
	options: AnalyticsIntegrationOptions,
	apply: (isAllowed: () => boolean) => Promise<boolean>
): ConsentIntegration => {
	const category = options.category ?? 'measurement';
	if (!OPTIONAL_CONSENT_CATEGORIES.includes(category)) {
		throw new TypeError('Analytics integrations require an optional category.');
	}
	return connectConsentState(
		options,
		(isAllowed) => isAllowed(category),
		apply
	);
};
