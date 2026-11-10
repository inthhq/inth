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
import type { CommitResult, ConsentSnapshot } from '../protocol';
import {
	CONSENT_CATEGORIES,
	OPTIONAL_CONSENT_CATEGORIES,
} from '../protocol/vocabulary';
import type {
	AllConsentNames,
	ConsentState,
	OptionalConsentCategory,
} from '../protocol/vocabulary';

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
	 * edit, or another surface decided a staged category differently (see
	 * `staleCategories`). `save` refuses a stale draft; `reset` reseeds it from
	 * the record.
	 */
	readonly isStale: boolean;
	/**
	 * Staged categories another surface decided differently after the subject
	 * staged them. Each one dropped its staged value and shows the new record.
	 * The draft stays stale until the subject sets each one again or calls
	 * `reset`, so an older intention never overwrites a newer decision.
	 */
	readonly staleCategories: readonly OptionalConsentCategory[];
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
	 * After a successful save of `submitted` (the values staged when the save
	 * began), reseed from the record and keep only the edits made since. When
	 * the record moved past `revision`, the save's own revision, something else
	 * decided after the save, so an edit made meanwhile that disagrees with the
	 * record is marked stale instead of kept.
	 *
	 * @internal
	 */
	readonly settle: (
		submitted: Readonly<ConsentState>,
		revision: number | null
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
	readonly displayed: readonly AllConsentNames[];
	readonly policyKey: string;
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
		policyKey: JSON.stringify([
			snapshot.resolution.policyId,
			snapshot.resolution.fingerprint,
			displayed,
		]),
		values,
	};
};

/**
 * One category's receipt as text. A new decision has a new `confirmedAt`, so a
 * second refusal reads as a change even though the value is the same.
 */
const receiptOf = (
	snapshot: ConsentSnapshot,
	category: OptionalConsentCategory
): string =>
	JSON.stringify(snapshot.explicitChoice?.categories[category] ?? null);

const differs = function differs(
	values: ConsentState,
	baseline: ConsentState,
	displayed: readonly AllConsentNames[]
): boolean {
	return displayed.some(
		(category) =>
			isOptional(category) && values[category] !== baseline[category]
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
	let { values } = seed;
	let stale = false;
	let staleCategories: readonly OptionalConsentCategory[] = [];
	let state: ConsentDraftState = {
		displayedCategories: seed.displayed,
		isDirty: false,
		isStale: false,
		staleCategories,
		values,
	};
	/**
	 * The categories the subject changed since the last seed, each with the
	 * receipt the record held when it was staged. Only these survive a new
	 * record, and only while nobody decided them since.
	 */
	const staged = new Map<OptionalConsentCategory, string>();
	const listeners = new Set<() => void>();
	let unsubscribeClient: (() => void) | null = null;

	const publish = function publish(): void {
		const next: ConsentDraftState = {
			displayedCategories: seed.displayed,
			isDirty: differs(values, seed.values, seed.displayed),
			isStale: stale || staleCategories.length > 0,
			staleCategories,
			values,
		};
		if (
			next.values === state.values &&
			next.displayedCategories === state.displayedCategories &&
			next.isDirty === state.isDirty &&
			next.isStale === state.isStale &&
			next.staleCategories === state.staleCategories
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
		({ values } = seed);
		staged.clear();
		stale = false;
		staleCategories = [];
		publish();
	};

	/** Add categories to `staleCategories`, keeping the array when none is new. */
	const markStale = function markStale(
		categories: readonly OptionalConsentCategory[]
	): void {
		const added = categories.filter(
			(category) => !staleCategories.includes(category)
		);
		if (added.length > 0) {
			staleCategories = [...staleCategories, ...added];
		}
	};

	/**
	 * Move a dirty draft onto a new record under the same policy. A category the
	 * subject did not touch takes the new record, so a save never writes back a
	 * value it only displayed. A staged value the record now holds is no longer
	 * an edit. A staged category decided differently since it was staged loses
	 * its staged value and turns stale: that decision is newer than the edit.
	 */
	const rebase = function rebase(next: Seed): void {
		const kept: Partial<ConsentState> = {};
		const overtaken: OptionalConsentCategory[] = [];
		for (const [category, receipt] of staged) {
			if (next.values[category] === values[category]) {
				staged.delete(category);
			} else if (receiptOf(snapshot, category) === receipt) {
				kept[category] = values[category];
			} else {
				staged.delete(category);
				overtaken.push(category);
			}
		}
		markStale(overtaken);
		seed = next;
		values = { ...next.values, ...kept };
	};

	/** Follow the record: adopt it while clean, rebase or mark stale while not. */
	const sync = function sync(): void {
		const latest = client.getSnapshot();
		if (latest === snapshot) {
			return;
		}
		snapshot = latest;
		const next = seedFrom(snapshot, currentDefaults);
		if (staged.size === 0 && staleCategories.length === 0) {
			seed = next;
			({ values } = next);
			stale = false;
		} else if (next.policyKey === seed.policyKey) {
			rebase(next);
		} else {
			stale = true;
		}
		publish();
	};

	const stage = function stage(patch: Partial<ConsentState>): void {
		sync();
		const touched = OPTIONAL_CONSENT_CATEGORIES.filter(
			(category) => patch[category] !== undefined
		);
		const changed = touched.filter(
			(category) => patch[category] !== values[category]
		);
		// A category set back to its saved value is no longer the subject's edit, so a
		// new record must not be overlaid with it.
		for (const category of changed) {
			if (patch[category] === seed.values[category]) {
				staged.delete(category);
			} else {
				staged.set(category, receiptOf(snapshot, category));
			}
		}
		// Setting a stale category again is a new choice, made with the newer
		// decision on screen.
		const stillStale = staleCategories.filter(
			(category) => !touched.includes(category)
		);
		if (stillStale.length !== staleCategories.length) {
			staleCategories = stillStale;
		}
		if (changed.length > 0) {
			values = {
				...values,
				...Object.fromEntries(
					changed.map((category) => [category, patch[category]])
				),
			};
		}
		publish();
	};

	const stageDisplayed = function stageDisplayed(value: boolean): void {
		stage(
			Object.fromEntries(
				seed.displayed.filter(isOptional).map((category) => [category, value])
			)
		);
	};

	const settle = function settle(
		submitted: Readonly<ConsentState>,
		revision: number | null
	): void {
		const later = [...staged.keys()].filter(
			(category) => values[category] !== submitted[category]
		);
		const edits = Object.fromEntries(
			later.map((category) => [category, values[category]])
		);
		snapshot = client.getSnapshot();
		// The record moved past this save, so another decision landed after it. It
		// may have decided a category edited during the save; nothing here can tell
		// which, so an edit the record disagrees with turns stale.
		const overtaken = revision !== null && snapshot.revision !== revision;
		reseed();
		if (overtaken) {
			markStale(
				later.filter((category) => seed.values[category] !== edits[category])
			);
			publish();
		} else {
			stage(edits);
		}
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
			if (stale || staleCategories.length > 0) {
				return STALE_RESULT;
			}
			const consents = Object.fromEntries(
				seed.displayed
					.filter(isOptional)
					.map((category) => [category, values[category]])
			) as Partial<Record<OptionalConsentCategory, boolean>>;
			const submitted = values;
			const result = await client.commit({ action: 'explicit', consents });
			if (result.ok) {
				settle(submitted, result.revision);
			}
			return result;
		},
		set: (category, value) => {
			stage({ [category]: value });
		},
		setDefaults: (next) => {
			currentDefaults = next;
			if (!differs(values, seed.values, seed.displayed)) {
				reseed();
			}
		},
		settle,

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
