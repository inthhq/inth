/**
 * The preference draft behind one Privacy Choices surface: the prompt's
 * options, or the dialog. The React port's `ConsentDraftProvider`.
 *
 * The prompt ships on first load and its options do not, so the draft
 * module arrives with whichever part needs it: the options panel or the
 * dialog hands `createPreferenceDraft` over as it renders, and the draft
 * lives on the surface from then on, so folding the options keeps what
 * they staged.
 */
import type {
	createPreferenceDraft,
	PreferenceDraft,
	PreferenceDraftState,
} from '@inth/sdk/preference-draft';
import { getContext, setContext, untrack } from 'svelte';

import { getConsentContext } from '../../context.svelte';

type CreatePreferenceDraft = typeof createPreferenceDraft;

const DRAFT_KEY = Symbol('inth-privacy-choices-draft');

/** A surface's draft, once a part that edits it handed the module over. */
export interface SurfaceDraft {
	readonly draft: PreferenceDraft | null;
	/** The draft's state, reactive. `null` until the draft exists. */
	readonly state: PreferenceDraftState | null;
	/** Start the draft with the module a part imported, once. */
	provide: (create: CreatePreferenceDraft) => PreferenceDraft;
}

/**
 * A draft for the surface that calls it, shared with the parts below it
 * through context. It follows the provider's kernel: a new runtime gets a
 * new draft, so a save never records into the previous one.
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const createSurfaceDraft = function createSurfaceDraft(): SurfaceDraft {
	const consent = getConsentContext();
	const defaults = () => consent.state.presentation?.preferences?.defaults;
	let create: CreatePreferenceDraft | null = null;
	let draft = $state.raw<PreferenceDraft | null>(null);
	let state = $state.raw<PreferenceDraftState | null>(null);

	const start = function start(): PreferenceDraft {
		const started = (create as CreatePreferenceDraft)(consent.kernel, {
			defaults: untrack(defaults),
		});
		draft = started;
		state = started.getState();
		return started;
	};

	$effect(() => {
		const current = draft;
		if (!current) {
			return;
		}
		state = current.getState();
		return current.subscribe(() => {
			state = current.getState();
		});
	});
	$effect(() => {
		const { kernel } = consent;
		if (untrack(() => draft) && untrack(() => draft?.kernel) !== kernel) {
			untrack(start);
		}
	});
	$effect(() => {
		const next = defaults();
		untrack(() => draft)?.setDefaults(next);
	});

	const surfaceDraft: SurfaceDraft = {
		get draft() {
			return draft;
		},
		provide(module) {
			if (draft) {
				return draft;
			}
			create = module;
			return start();
		},
		get state() {
			return state;
		},
	};
	setContext(DRAFT_KEY, surfaceDraft);
	return surfaceDraft;
};

/**
 * The nearest surface's draft.
 *
 * @internal
 */
export const getSurfaceDraft = function getSurfaceDraft(): SurfaceDraft {
	const found = getContext<SurfaceDraft | undefined>(DRAFT_KEY);
	if (!found) {
		throw new Error(
			'inth: a Privacy Choices part rendered outside its surface.'
		);
	}
	return found;
};
