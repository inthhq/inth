/**
 * React bindings for {@link ConsentDraft}, with the names `@inth/react` uses.
 */

import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import type { CommitResult } from '../protocol';
import type { AllConsentNames, ConsentState } from '../protocol/consent-vocabulary.model';
import { useConsentClient } from '../provider/consent-client-context';
import { createConsentDraft, rootConsentDraft } from './create-consent-draft';
import type { ConsentDraft, ConsentDraftState } from './create-consent-draft';

const DraftContext = createContext<ConsentDraft | null>(null);

/** Props of {@link ConsentDraftProvider}. */
export interface ConsentDraftProviderProps {
	readonly children: ReactNode;
	/** Defaults apply only to categories without a saved receipt. */
	readonly initial?: Partial<ConsentState>;
}

/**
 * Share one draft with every draft hook below it, separate from the app-wide
 * draft. Mount one around a preference screen whose edits should not leak into
 * other screens.
 *
 * @example
 * ```tsx
 * <ConsentDraftProvider initial={{ measurement: true }}>
 *   <PrivacySettingsScreen />
 * </ConsentDraftProvider>
 * ```
 */
export const ConsentDraftProvider = ({
	children,
	initial,
}: ConsentDraftProviderProps): ReactNode => {
	const client = useConsentClient();
	const [entry, setEntry] = useState(() => ({
		client,
		draft: createConsentDraft(client, initial),
	}));
	let { draft } = entry;
	if (entry.client !== client) {
		// A provider handed a new client rebuilds the draft rather than saving
		// into the previous native runtime.
		draft = createConsentDraft(client, initial);
		setEntry({ client, draft });
	}
	useEffect(() => {
		draft.setDefaults(initial);
	}, [draft, initial]);
	return (
		<DraftContext.Provider value={draft}>{children}</DraftContext.Provider>
	);
};

/**
 * The nearest draft for this client: the provider's, or the client's shared
 * draft.
 *
 * @returns The draft store.
 * @internal
 */
export const useConsentDraftStore =
	function useConsentDraftStore(): ConsentDraft {
		const client = useConsentClient();
		const shared = useContext(DraftContext);
		return shared?.client === client ? shared : rootConsentDraft(client);
	};

/**
 * One slice of the nearest draft. The component rerenders only when the slice
 * changes, so a vendor row does not redraw for an edit to another vendor.
 *
 * @param selector - Picks the slice. Return a primitive or a reference the
 *   draft already holds.
 * @returns The selected slice.
 * @internal
 */
export const useConsentDraftSlice = function useConsentDraftSlice<SliceType>(
	selector: (state: ConsentDraftState) => SliceType
): SliceType {
	const draft = useConsentDraftStore();
	const read = () => selector(draft.getState());
	return useSyncExternalStore(draft.subscribe, read, read);
};

/** A local, unsaved selection, committed only by an explicit save. */
export interface ConsentDraftHandle extends ConsentDraftState {
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
	/**
	 * Record every displayed optional category as staged, in one commit. Check
	 * `ok`; a stale draft resolves `ok: false` with `reason: 'concurrent-change'`.
	 */
	readonly save: () => Promise<CommitResult>;
	/** Drop staged edits and reseed from the saved record. */
	readonly reset: () => void;
}

/**
 * Read and stage category choices for a custom preference screen. The values
 * are the subject's own choices, not the masked effective permissions, so a GPC
 * denial does not show as a staged refusal.
 *
 * Every component outside a {@link ConsentDraftProvider} shares one draft, so a
 * Save button elsewhere on the screen can confirm it with
 * `useSaveConsents()()`.
 *
 * @example
 * ```tsx
 * const { values, displayedCategories, set, save, isStale, reset } =
 *   useConsentDraft();
 * ```
 *
 * @returns The draft's state and its commands.
 */
export const useConsentDraft = function useConsentDraft(): ConsentDraftHandle {
	const draft = useConsentDraftStore();
	const state = useSyncExternalStore(
		draft.subscribe,
		draft.getState,
		draft.getState
	);
	return useMemo(
		() => ({
			...state,
			acceptAll: draft.acceptAll,
			rejectAll: draft.rejectAll,
			reset: draft.reset,
			save: draft.save,
			set: draft.set,
			update: draft.update,
		}),
		[draft, state]
	);
};
