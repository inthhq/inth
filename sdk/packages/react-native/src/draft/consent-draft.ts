/**
 * A choice in progress: what a custom preference screen shows and stages
 * before the subject presses Save.
 *
 * It mirrors the draft `@c15t/react` keeps for its preference dialog. Edits stay
 * in JavaScript; nothing reaches the native core until `save()`, which records
 * every displayed category in one commit. The draft follows the native record
 * while it is clean, and turns stale when the policy changes under an unsaved
 * edit, so a save can never confirm a choice the subject made against a
 * different policy.
 */

import type { ConsentClient } from '../native/client';
import type {
	CommitResult,
	ConsentSnapshot,
	NativeIABChoices,
} from '../protocol';
import {
	CONSENT_CATEGORIES,
	OPTIONAL_CONSENT_CATEGORIES,
} from '../protocol/vocabulary';
import type {
	AllConsentNames,
	ConsentState,
	OptionalConsentCategory,
} from '../protocol/vocabulary';
import { sameIABChoices, seedIABChoices } from './iab-choices';

/** What a draft holds at one moment. */
export interface ConsentDraftState {
	/**
	 * The staged value of every category. `necessary` is always `true`. A
	 * category with a saved receipt starts at that receipt; one without starts at
	 * the provider's `initial` value, then at its effective permission.
	 */
	readonly values: Readonly<ConsentState>;
	/** The categories the policy puts in scope, `necessary` first. */
	readonly displayedCategories: readonly AllConsentNames[];
	/** Whether a staged value differs from the saved record. */
	readonly isDirty: boolean;
	/**
	 * Whether the policy or the displayed categories changed under an unsaved
	 * edit. `save` refuses a stale draft; `reset` reseeds it from the record.
	 */
	readonly isStale: boolean;
	/**
	 * The staged TCF selection under an `iab` policy with a served vendor list,
	 * seeded from the committed decision. `null` otherwise.
	 */
	readonly iab: NativeIABChoices | null;
}

/** A draft store bound to one native client. */
export interface ConsentDraft {
	/** The client this draft saves into. */
	readonly client: ConsentClient;
	/** Current state. Stable until something changes. */
	readonly getState: () => ConsentDraftState;
	/** Listen for state changes. Returns the unsubscribe function. */
	readonly subscribe: (listener: () => void) => () => void;
	/** Stage one category. `necessary` is ignored. */
	readonly set: (category: AllConsentNames, value: boolean) => void;
	/** Stage several categories. */
	readonly update: (patch: Partial<ConsentState>) => void;
	/** Stage a grant for every displayed optional category. */
	readonly acceptAll: () => void;
	/** Stage a denial for every displayed optional category. */
	readonly rejectAll: () => void;
	/** Drop staged edits and reseed from the record. */
	readonly reset: () => void;
	/**
	 * Record every displayed optional category as staged, in one commit. A stale
	 * draft is refused with `reason: 'concurrent-change'` and nothing is written.
	 */
	readonly save: () => Promise<CommitResult>;
	/** Replace the defaults for categories without a receipt. */
	readonly setDefaults: (defaults: Partial<ConsentState> | undefined) => void;
	/**
	 * Stage a change to the TCF selection. Ignored outside TCF.
	 *
	 * @internal
	 */
	readonly stageIAB: (
		edit: (
			choices: NativeIABChoices,
			snapshot: ConsentSnapshot
		) => NativeIABChoices
	) => void;
}

/** What a stale save resolves with. Nothing was written. */
const STALE_RESULT: CommitResult = {
	confirmed: [],
	ok: false,
	queued: false,
	reason: 'concurrent-change',
	revision: null,
	subjectId: null,
};

interface Seed {
	readonly values: ConsentState;
	readonly iab: NativeIABChoices | null;
	readonly displayed: readonly AllConsentNames[];
	readonly policyKey: string;
	readonly revision: number;
}

const isOptional = (
	category: AllConsentNames
): category is OptionalConsentCategory => category !== 'necessary';

const seedFrom = function seedFrom(
	snapshot: ConsentSnapshot,
	defaults: Partial<ConsentState> | undefined
): Seed {
	const displayed = snapshot.consentCategories ?? CONSENT_CATEGORIES;
	const receipts = snapshot.explicitChoice?.categories ?? {};
	const values = Object.fromEntries(
		CONSENT_CATEGORIES.map((category) => [
			category,
			isOptional(category)
				? (receipts[category]?.value ??
					defaults?.[category] ??
					snapshot.effectivePermissions[category])
				: true,
		])
	) as ConsentState;
	return {
		displayed,
		iab: seedIABChoices(snapshot),
		policyKey: JSON.stringify([
			snapshot.resolution.policyId,
			snapshot.resolution.fingerprint,
			displayed,
			snapshot.model,
			snapshot.iab?.gvl?.vendorListVersion ?? null,
		]),
		revision: snapshot.revision,
		values,
	};
};

const differs = function differs(
	values: ConsentState,
	iab: NativeIABChoices | null,
	baseline: Seed
): boolean {
	return (
		!sameIABChoices(iab, baseline.iab) ||
		baseline.displayed.some(
			(category) =>
				isOptional(category) && values[category] !== baseline.values[category]
		)
	);
};

/**
 * Create a draft that stages choices for `client`.
 *
 * @param client - The native client the draft reads and saves through.
 * @param defaults - Values for categories that have no receipt yet.
 * @returns The draft store.
 */
export const createConsentDraft = function createConsentDraft(
	client: ConsentClient,
	defaults?: Partial<ConsentState>
): ConsentDraft {
	let currentDefaults = defaults;
	let snapshot = client.getSnapshot();
	let seed = seedFrom(snapshot, currentDefaults);
	let { iab, values } = seed;
	let stale = false;
	let state: ConsentDraftState = {
		displayedCategories: seed.displayed,
		iab,
		isDirty: false,
		isStale: false,
		values,
	};
	const listeners = new Set<() => void>();
	let unsubscribeClient: (() => void) | null = null;

	const publish = function publish(): void {
		const next: ConsentDraftState = {
			displayedCategories: seed.displayed,
			iab,
			isDirty: differs(values, iab, seed),
			isStale: stale,
			values,
		};
		if (
			next.values === state.values &&
			next.iab === state.iab &&
			next.displayedCategories === state.displayedCategories &&
			next.isDirty === state.isDirty &&
			next.isStale === state.isStale
		) {
			return;
		}
		state = next;
		for (const listener of [...listeners]) {
			listener();
		}
	};

	/** Reseed from the record, dropping staged edits. */
	const reseed = function reseed(): void {
		seed = seedFrom(snapshot, currentDefaults);
		({ iab, values } = seed);
		stale = false;
		publish();
	};

	/** Follow the record: adopt it while clean, mark stale under a policy change. */
	const sync = function sync(): void {
		const latest = client.getSnapshot();
		if (latest === snapshot) {
			return;
		}
		snapshot = latest;
		const next = seedFrom(snapshot, currentDefaults);
		if (differs(values, iab, seed)) {
			// Keep the edit. A new policy makes it stale; the same policy only moves
			// the baseline and the revision a save is pinned to.
			if (next.policyKey === seed.policyKey) {
				seed = next;
			} else {
				stale = true;
			}
		} else {
			seed = next;
			({ iab, values } = next);
			stale = false;
		}
		publish();
	};

	const stage = function stage(patch: Partial<ConsentState>): void {
		sync();
		const changed = OPTIONAL_CONSENT_CATEGORIES.filter(
			(category) =>
				patch[category] !== undefined && patch[category] !== values[category]
		);
		if (changed.length > 0) {
			values = {
				...values,
				...Object.fromEntries(
					changed.map((category) => [category, patch[category]])
				),
			};
			publish();
		}
	};

	const stageDisplayed = function stageDisplayed(value: boolean): void {
		stage(
			Object.fromEntries(
				seed.displayed.filter(isOptional).map((category) => [category, value])
			)
		);
	};

	return {
		acceptAll: () => stageDisplayed(true),
		client,
		getState: () => {
			// Subscribed, the client already reports every change. Unsubscribed,
			// nobody is listening, so catching up here notifies no one.
			if (unsubscribeClient === null) {
				sync();
			}
			return state;
		},
		rejectAll: () => stageDisplayed(false),
		reset: () => {
			snapshot = client.getSnapshot();
			reseed();
		},
		save: async () => {
			sync();
			if (stale) {
				return STALE_RESULT;
			}
			const consents = Object.fromEntries(
				seed.displayed
					.filter(isOptional)
					.map((category) => [category, values[category]])
			) as Partial<Record<OptionalConsentCategory, boolean>>;
			// Under TCF the purposes and vendors travel with the categories, pinned to
			// the revision the selection was made against.
			const result = await client.commit(
				iab === null
					? { action: 'explicit', consents }
					: { action: 'iab', choices: iab, consents, revision: seed.revision }
			);
			if (result.ok) {
				snapshot = client.getSnapshot();
				reseed();
			}
			return result;
		},
		set: (category, value) => {
			stage({ [category]: value });
		},
		setDefaults: (next) => {
			currentDefaults = next;
			if (!differs(values, iab, seed)) {
				reseed();
			}
		},
		stageIAB: (edit) => {
			sync();
			if (iab === null) {
				return;
			}
			const next = edit(iab, snapshot);
			if (next !== iab) {
				iab = next;
				publish();
			}
		},
		subscribe: (listener) => {
			listeners.add(listener);
			if (unsubscribeClient === null) {
				unsubscribeClient = client.subscribe(
					(current) => current,
					() => sync()
				);
				sync();
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && unsubscribeClient !== null) {
					unsubscribeClient();
					unsubscribeClient = null;
				}
			};
		},
		update: stage,
	};
};

/** The one draft each client shares with every hook outside a draft provider. */
const rootDrafts = new WeakMap<ConsentClient, ConsentDraft>();

/**
 * The client's shared draft, created on first use.
 *
 * @param client - Native client.
 * @returns The draft `useConsentDraft()` and a no-argument `useSaveConsents()`
 *   use outside a `ConsentDraftProvider`.
 */
export const rootConsentDraft = function rootConsentDraft(
	client: ConsentClient
): ConsentDraft {
	let draft = rootDrafts.get(client);
	if (draft === undefined) {
		draft = createConsentDraft(client);
		rootDrafts.set(client, draft);
	}
	return draft;
};
