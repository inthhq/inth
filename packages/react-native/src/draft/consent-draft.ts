/**
 * A choice in progress: what a custom preference screen shows and stages
 * before the subject presses Save.
 *
 * It mirrors the draft `@inth/react` keeps for its preference dialog. Edits stay
 * in JavaScript; nothing reaches the native core until `save()`, which records
 * every displayed category in one commit. The draft follows the native record
 * while it is clean, and turns stale when the policy changes under an unsaved
 * edit, so a save can never confirm a choice the subject made against a
 * different policy.
 */

import { isProduction } from '../native/client';
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
	/**
	 * Stage one category. `necessary` and categories the policy does not
	 * display are ignored.
	 */
	readonly set: (category: AllConsentNames, value: boolean) => void;
	/** Stage several categories; undisplayed ones are ignored. */
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
	/**
	 * Run a save that will be settled into this draft. Until it resolves, a
	 * receipt change on a staged category is left for `settle` to judge, since
	 * the save's own write moves receipts too.
	 *
	 * @internal
	 */
	readonly whileSaving: (
		save: () => Promise<CommitResult>
	) => Promise<CommitResult>;
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
		revision: number | null,
		submittedIAB?: NativeIABChoices | null
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

/** Clients already warned that their binary cannot pin a draft save. */
const warnedUnpinned = new WeakSet<ConsentClient>();

/**
 * Say once, in development, that this binary saves drafts without the native
 * revision check.
 */
const warnUnpinned = function warnUnpinned(client: ConsentClient): void {
	if (warnedUnpinned.has(client) || isProduction()) {
		return;
	}
	warnedUnpinned.add(client);
	console.warn(
		'Inth: this native build does not check a draft save against the snapshot it was built on (bootstrap.commitRevision is false), so a decision another surface records while the save is in flight can be overwritten. Rebuild the app with this version of @inth/react-native.'
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
	let staleCategories: readonly OptionalConsentCategory[] = [];
	/** An edited TCF selection held back while native cannot open a draft. */
	let withdrawnIAB: NativeIABChoices | null = null;
	/** Whether losing editability is the only reason the draft is stale. */
	let staleByWithdrawal = false;
	/** Saves through this draft, or settled into it, whose reply has not arrived. */
	let savesInFlight = 0;
	let state: ConsentDraftState = {
		displayedCategories: seed.displayed,
		iab,
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
			iab,
			isDirty: differs(values, iab, seed),
			isStale: stale || staleCategories.length > 0,
			staleCategories,
			values,
		};
		if (
			next.values === state.values &&
			next.iab === state.iab &&
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
		({ iab, values } = seed);
		staged.clear();
		stale = false;
		staleCategories = [];
		withdrawnIAB = null;
		staleByWithdrawal = false;
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
			} else if (
				receiptOf(snapshot, category) === receipt ||
				savesInFlight > 0
			) {
				// While a save is in flight its own write moves the receipt too, and
				// nothing here can tell it from another surface's. settle() judges the
				// edit once the reply names the save's revision.
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
		if (withdrawnIAB !== null && next.iab !== null) {
			// Native can open a draft again: hand the selection back, so it can be
			// saved or reset. Nothing else changed if the policy and the committed
			// decision are the ones it was made against.
			iab = withdrawnIAB;
			withdrawnIAB = null;
			if (
				staleByWithdrawal &&
				next.policyKey === seed.policyKey &&
				sameIABChoices(seed.iab, next.iab)
			) {
				stale = false;
			}
			staleByWithdrawal = false;
		}
		const iabEdited = !sameIABChoices(iab ?? withdrawnIAB, seed.iab);
		if (staged.size === 0 && staleCategories.length === 0 && !iabEdited) {
			seed = next;
			({ iab, values } = next);
			withdrawnIAB = null;
			stale = false;
		} else if (
			next.policyKey !== seed.policyKey ||
			(iabEdited && !sameIABChoices(seed.iab, next.iab))
		) {
			// Native can no longer open a draft at all: withdraw the selection so no
			// control offers an edit every save would refuse, and keep it to hand
			// back when native can again.
			if (next.iab === null && iab !== null) {
				staleByWithdrawal = !stale && next.policyKey === seed.policyKey;
				withdrawnIAB = iab;
				iab = null;
			}
			// A new policy, or a TCF decision committed elsewhere under an edited
			// selection: saving the edit would overwrite something the subject never
			// saw, so it waits for a review.
			stale = true;
		} else {
			// The same authority. Untouched parts take the new record, and the save is
			// pinned to its revision.
			if (!iabEdited) {
				({ iab } = next);
			}
			rebase(next);
		}
		publish();
	};

	const stage = function stage(patch: Partial<ConsentState>): void {
		sync();
		// Only what the policy displays can be staged: nothing else is shown or
		// saved, and a hidden staged entry would turn a clean draft stale later.
		const touched = OPTIONAL_CONSENT_CATEGORIES.filter(
			(category) =>
				patch[category] !== undefined && seed.displayed.includes(category)
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
		revision: number | null,
		submittedIAB?: NativeIABChoices | null
	): void {
		const later = [...staged.keys()].filter(
			(category) => values[category] !== submitted[category]
		);
		const edits = Object.fromEntries(
			later.map((category) => [category, values[category]])
		);
		// A TCF edit made while the save was pending is newer than the save, held
		// back or not.
		const pendingIAB = iab ?? withdrawnIAB;
		const laterIAB =
			submittedIAB !== undefined && !sameIABChoices(pendingIAB, submittedIAB)
				? pendingIAB
				: null;
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
		} else {
			stage(edits);
		}
		if (laterIAB !== null && iab !== null) {
			iab = laterIAB;
			// The same rule for the TCF selection: a decision after the save may have
			// been made over it, so the subject reviews before saving it.
			stale = overtaken;
		} else if (laterIAB !== null && snapshot.model === 'iab') {
			// Native cannot open a draft now. Hold the edit back, as a withdrawal
			// does, and hand it back when native can. Unless something landed after
			// this save, the decision it was made over is the one the save committed.
			withdrawnIAB = laterIAB;
			stale = true;
			staleByWithdrawal = !overtaken;
			seed = { ...seed, iab: overtaken ? null : (submittedIAB ?? null) };
		}
		publish();
	};

	/**
	 * Save the draft, pinned to the revision it was last rebased on.
	 *
	 * The client serves a cached snapshot until a change event or a reply
	 * arrives, so a decision another surface records can already be in native
	 * when this reads. Only native can check that atomically: the commit names
	 * the revision, and native refuses it with `concurrent-change` if the record
	 * moved. The draft then reads the record, which rebases it under the same
	 * receipt rules as any other change, and tries once more if nothing the
	 * subject staged was overtaken. A binary without the check, which
	 * `bootstrap.commitRevision` reports, saves unpinned with the JavaScript-side
	 * check alone.
	 */
	/**
	 * Read the record and judge every staged category against the receipt it was
	 * staged on, including the ones a save in flight left for later.
	 */
	const rejudge = function rejudge(): void {
		sync();
		if (stale || savesInFlight > 0) {
			return;
		}
		rebase(seedFrom(snapshot, currentDefaults));
		publish();
	};

	const whileSaving = async function whileSaving(
		save: () => Promise<CommitResult>
	): Promise<CommitResult> {
		savesInFlight += 1;
		try {
			return await save();
		} finally {
			savesInFlight -= 1;
		}
	};

	const commitDraft = async function commitDraft(
		retry: boolean
	): Promise<CommitResult> {
		rejudge();
		if (stale || staleCategories.length > 0) {
			return STALE_RESULT;
		}
		const consents = Object.fromEntries(
			seed.displayed
				.filter(isOptional)
				.map((category) => [category, values[category]])
		) as Partial<Record<OptionalConsentCategory, boolean>>;
		const submitted = values;
		const submittedIAB = iab;
		// A binary that commits a TCF draft also checks the revision, so a TCF
		// selection is always pinned; it travels with the categories.
		const pinned = iab !== null || client.bootstrap.commitRevision;
		if (!pinned) {
			warnUnpinned(client);
		}
		const revision = pinned ? { revision: snapshot.revision } : {};
		const result = await whileSaving(() =>
			client.commit(
				iab === null
					? { action: 'explicit', consents, ...revision }
					: { action: 'iab', choices: iab, consents, ...revision }
			)
		);
		if (result.ok) {
			settle(submitted, result.revision, submittedIAB);
			return result;
		}
		// Nothing of this save was written, so every receipt that moved while it
		// was in flight was moved by someone else: judge them now, which also
		// brings `isStale` and `staleCategories` up to the record that refused it.
		rejudge();
		if (pinned && retry && result.reason === 'concurrent-change') {
			return commitDraft(false);
		}
		return result;
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
		save: () => commitDraft(true),
		set: (category, value) => {
			stage({ [category]: value });
		},
		setDefaults: (next) => {
			currentDefaults = next;
			// Only a clean draft takes new defaults: a staged edit, an overtaken
			// category, a policy change or a held-back TCF selection still waits for
			// the subject's review.
			if (
				staged.size === 0 &&
				staleCategories.length === 0 &&
				!stale &&
				withdrawnIAB === null &&
				!differs(values, iab, seed)
			) {
				reseed();
			}
		},
		settle,
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
		whileSaving,
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
