import { isCategoryAllowed } from '../lib/selectors';
import { getConsentClient } from '../native/client';
import type { ConsentClient } from '../native/client';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import type {
	AllConsentNames,
	OptionalConsentCategory,
} from '../protocol/vocabulary';
import { resolveGoogleAdsConsent } from './google-consent-mode';
import type { GoogleAdsConsent } from './google-consent-mode';

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
 * the derived state queues another apply. `previous` is the state the last
 * apply left, or `undefined` on the first apply, after `sync()`, on
 * `disconnect()` and after a failure, so a vendor whose start call must run
 * once per grant can tell a new grant from an unrelated change.
 *
 * A withdrawal never waits in the queue. Every apply that has not settled is
 * tracked with each category granted in any publication it has seen, because
 * it reads `current()` before each enabling call and may have enabled any of
 * them. When one of those is withdrawn, or the integration disconnects, the
 * withdrawal applies at once, whichever apply is still waiting on a vendor
 * call. Later updates wait for the withdrawal and every apply it overtook, then
 * the queue reapplies current state, so a grant that settles late cannot leave
 * the vendor enabled and a regrant cannot finish before the withdrawal. `apply`
 * must read `current()` before each call that enables collection.
 */
export const connectConsentState = <StateType>(
	options: Pick<AnalyticsIntegrationOptions, 'client' | 'onError'>,
	read: (isAllowed: (category: AllConsentNames) => boolean) => StateType,
	apply: (
		current: () => StateType,
		previous: StateType | undefined
	) => Promise<StateType>
): ConsentIntegration => {
	const client = options.client ?? getConsentClient();
	let connected = true;
	let applied: string | undefined;
	let last: { readonly state: StateType } | undefined;
	let tail = Promise.resolve();
	// Every apply that has not settled, oldest first: the state it works toward and
	// each category granted in any publication it has seen.
	const unsettled = new Map<
		number,
		{ readonly state: StateType; readonly granted: Set<AllConsentNames> }
	>();
	// The categories granted in the last publication seen.
	let lastGranted: ReadonlySet<AllConsentNames> = new Set();
	// Bumped by every apply; only the newest may record what it left the vendor in.
	let generation = 0;
	// Set by a withdrawal that ran beside the queue: the next apply must not skip.
	let reapply = false;
	let disconnected: Promise<void> | undefined;
	const current = () =>
		read((category) => connected && client.isAllowed(category));
	const readGranted = () => {
		const granted = new Set<AllConsentNames>();
		const state = read((category) => {
			const allowed = connected && client.isAllowed(category);
			if (allowed) {
				granted.add(category);
			}
			return allowed;
		});
		return { granted, state };
	};
	const reportFailure = async (update: Promise<void>): Promise<void> => {
		try {
			await update;
		} catch (error) {
			try {
				await options.onError(error);
			} catch (reporterError) {
				// oxlint-disable-next-line no-console -- A failed error reporter needs an independent visible fallback.
				console.error(
					'[Inth] Analytics integration error reporter failed.',
					reporterError
				);
			}
		}
	};
	const run = async (
		next: ReturnType<typeof readGranted>,
		previous: StateType | undefined
	): Promise<void> => {
		generation += 1;
		const mine = generation;
		unsettled.set(mine, { granted: new Set(next.granted), state: next.state });
		try {
			const state = await apply(current, previous);
			if (mine === generation) {
				applied = JSON.stringify(state);
				last = { state };
			}
		} finally {
			unsettled.delete(mine);
		}
	};
	const enqueue = (force = false): Promise<void> => {
		const reconcile = async () => {
			const next = readGranted();
			if (!force && !reapply && applied === JSON.stringify(next.state)) {
				return;
			}
			const previous = force || reapply ? undefined : last?.state;
			reapply = false;
			applied = undefined;
			last = undefined;
			await run(next, previous);
		};
		// A failed vendor call must not prevent a subsequent withdrawal or retry.
		// oxlint-disable-next-line promise/prefer-await-to-then -- Both outcomes must continue the same serialized queue.
		const update = tail.then(reconcile, reconcile);
		tail = update;
		void reportFailure(update);
		return update;
	};
	// Apply a withdrawal beside the queue when it takes back a category an apply
	// that has not settled may have enabled. Disconnecting withdraws everything,
	// so it never waits behind an apply that has not settled.
	const preemptWithdrawal = (everything = false): Promise<void> | undefined => {
		const next = readGranted();
		const before = lastGranted;
		lastGranted = next.granted;
		let withdrawn = everything && unsettled.size > 0;
		let newest: StateType | undefined;
		for (const entry of unsettled.values()) {
			for (const category of entry.granted) {
				if (before.has(category) && !next.granted.has(category)) {
					withdrawn = true;
				}
			}
			// It may enable anything granted while it waits.
			for (const category of next.granted) {
				entry.granted.add(category);
			}
			newest = entry.state;
		}
		if (!withdrawn) {
			return;
		}
		reapply = true;
		const update = run(next, newest);
		void reportFailure(update);
		// Later updates wait for this withdrawal as well as the applies it overtook.
		const overtaken = tail;
		tail = (async () => {
			await Promise.allSettled([overtaken, update]);
		})();
		enqueue();
		return update;
	};
	const unsubscribe = client.subscribe(
		(snapshot) =>
			JSON.stringify(read((category) => isCategoryAllowed(snapshot, category))),
		() => {
			if (!preemptWithdrawal()) {
				enqueue();
			}
		}
	);
	lastGranted = readGranted().granted;
	const ready = enqueue();
	const disconnect = (): Promise<void> => {
		if (disconnected) {
			return disconnected;
		}
		connected = false;
		// The vendor may have reset its own opt-in since our last update.
		applied = undefined;
		last = undefined;
		unsubscribe();
		const update = preemptWithdrawal(true) ?? enqueue();
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

const optionalCategory = (
	options: AnalyticsIntegrationOptions,
	fallback: OptionalConsentCategory
): OptionalConsentCategory => {
	const category = options.category ?? fallback;
	if (!OPTIONAL_CONSENT_CATEGORIES.includes(category)) {
		throw new TypeError('Analytics integrations require an optional category.');
	}
	return category;
};

/** Serialize async vendor calls and re-read native authority before each apply. */
export const connectConsentIntegration = (
	options: AnalyticsIntegrationOptions,
	apply: (isAllowed: () => boolean) => Promise<boolean>,
	fallback: OptionalConsentCategory = 'measurement'
): ConsentIntegration => {
	const category = optionalCategory(options, fallback);
	return connectConsentState(
		options,
		(isAllowed) => isAllowed(category),
		apply
	);
};

/**
 * Make every call, in order, without waiting for one to settle before making the
 * next, then wait for all of them. Withdrawal paths use this so a call that
 * throws, rejects or never settles cannot stop a later call from turning
 * collection off.
 *
 * @param calls - Vendor calls that each restrict collection.
 * @returns Resolves when every call settled; rejects with the first failure.
 */
export const settleAll = async (
	calls: readonly (() => void | Promise<void>)[]
): Promise<void> => {
	const results = await Promise.allSettled(
		calls.map(async (call) => {
			await call();
		})
	);
	for (const result of results) {
		if (result.status === 'rejected') {
			throw result.reason;
		}
	}
};

/** Whether a vendor may run under its category, with the advertising types. */
export interface TrackingAndAds {
	readonly tracking: boolean;
	readonly ads: GoogleAdsConsent;
}

/**
 * Connect a vendor that runs under one category, defaulting to marketing, and
 * also takes the Consent Mode advertising types.
 */
export const connectTrackingAndAds = (
	options: AnalyticsIntegrationOptions,
	apply: (
		current: () => TrackingAndAds,
		previous: TrackingAndAds | undefined
	) => Promise<TrackingAndAds>
): ConsentIntegration => {
	const category = optionalCategory(options, 'marketing');
	return connectConsentState(
		options,
		(isAllowed) => ({
			ads: resolveGoogleAdsConsent(isAllowed),
			tracking: isAllowed(category),
		}),
		apply
	);
};
