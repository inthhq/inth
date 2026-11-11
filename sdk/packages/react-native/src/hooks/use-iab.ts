/**
 * Headless TCF: the hooks `@c15t/react` exports for IAB, reading the native
 * snapshot and the shared consent draft.
 *
 * The committed decision stays native authority. These hooks show it and stage
 * a new one; the native core validates and encodes it on save, and native
 * gates keep reading the TC String it writes.
 */

import { useCallback, useMemo } from 'react';

import {
	useConsentDraftSlice,
	useConsentDraftStore,
} from '../draft/consent-draft-provider';
import {
	acceptAllIAB,
	isCustomVendor,
	rejectAllIAB,
	withChoice,
	withCustomVendorChoice,
	withLegitimateInterest,
} from '../draft/iab-choices';
import type {
	CommitResult,
	ConsentSnapshot,
	NativeIABChoices,
	NativeIABState,
} from '../protocol';
import { useConsentSelector } from './use-consent-selector';

const selectEnabled = (snapshot: ConsentSnapshot): boolean =>
	snapshot.model === 'iab';
const selectIAB = (snapshot: ConsentSnapshot): NativeIABState | null =>
	snapshot.iab;
const selectTCString = (snapshot: ConsentSnapshot): string | null =>
	snapshot.iab?.committed?.tcString ?? null;

/**
 * Whether the resolved policy is a TCF policy.
 *
 * @returns `true` under an `iab` policy.
 */
export const useIABEnabled = function useIABEnabled(): boolean {
	return useConsentSelector(selectEnabled);
};

/**
 * The IAB slice of the snapshot: the served vendor list and the committed
 * decision. `null` when no list was served.
 *
 * @returns The IAB state, or `null`.
 */
export const useIABSnapshot =
	function useIABSnapshot(): Readonly<NativeIABState> | null {
		return useConsentSelector(selectIAB);
	};

/**
 * The committed TC String. `null` until a current TCF decision is saved, and
 * again once it expires or the policy stops being `iab`.
 *
 * @returns The TC String, or `null`.
 */
export const useTCString = function useTCString(): string | null {
	return useConsentSelector(selectTCString);
};

/**
 * The draft's consent selection for one vendor, registered or custom (non-IAB),
 * including changes not saved yet. Use it to render a control, not to gate a
 * vendor: native gates read the committed decision.
 *
 * @param vendorId - Numeric or string vendor ID. A custom vendor's ID is the
 *   `id` in `useIABSnapshot()?.customVendors`.
 * @returns Whether the vendor is selected.
 */
export const useVendorConsent = function useVendorConsent(
	vendorId: string | number
): boolean {
	const id = Number(vendorId);
	const key = String(vendorId);
	return useConsentDraftSlice(
		(state) =>
			(state.iab?.vendorConsents.includes(id) ||
				state.iab?.customVendorConsents?.includes(key)) ??
			false
	);
};

/**
 * The draft's consent selection for one IAB purpose (1-11), including changes
 * not saved yet. See {@link useVendorConsent}.
 *
 * @param purposeId - IAB purpose ID.
 * @returns Whether the purpose is selected.
 */
export const usePurposeConsent = function usePurposeConsent(
	purposeId: number
): boolean {
	return useConsentDraftSlice(
		(state) => state.iab?.purposeConsents.includes(purposeId) ?? false
	);
};

/**
 * The draft's opt-in for one special feature (1 = precise geolocation, 2 =
 * device scanning), including changes not saved yet. See
 * {@link useVendorConsent}.
 *
 * @param featureId - IAB special feature ID.
 * @returns Whether the feature is opted in.
 */
export const useSpecialFeatureOptIn = function useSpecialFeatureOptIn(
	featureId: number
): boolean {
	return useConsentDraftSlice(
		(state) => state.iab?.specialFeatureOptIns.includes(featureId) ?? false
	);
};

/** What {@link useIAB} returns under a TCF policy. */
export interface IABDraftHandle {
	/** The staged selection. */
	readonly choices: NativeIABChoices;
	/** The committed TC String, or `null`. */
	readonly tcString: string | null;
	/** Whether the draft, TCF or categories, differs from the record. */
	readonly isDirty: boolean;
	/** Whether the policy or vendor list changed under an unsaved edit. */
	readonly isStale: boolean;
	/**
	 * A registered or custom (non-IAB) vendor, as `@c15t/react`'s `useIAB()`
	 * takes either. A custom vendor's ID is the `id` in
	 * `useIABSnapshot()?.customVendors`.
	 */
	readonly setVendorConsent: (
		vendorId: string | number,
		value: boolean
	) => void;
	/** `false` objects to the vendor's legitimate interest, registered or custom. */
	readonly setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	readonly setPurposeConsent: (purposeId: number, value: boolean) => void;
	/**
	 * `false` objects. Purposes 1 and 3 to 6 never allow legitimate interest,
	 * so `true` is ignored for them.
	 */
	readonly setPurposeLegitimateInterest: (
		purposeId: number,
		value: boolean
	) => void;
	readonly setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	/** Google Additional Consent provider. */
	readonly setAdTechProviderConsent: (
		providerId: number,
		value: boolean
	) => void;
	/**
	 * Stage what native Accept all saves: the core's own projection of every live
	 * partner's bases under the publisher's disclosure and restrictions, and a grant
	 * for every displayed category, so a headless Accept all records the same
	 * signals as the stock one. Call `save()` to record it, or use
	 * `useSaveConsents()('all')` to save in one tap.
	 */
	readonly acceptAll: () => void;
	/**
	 * Stage withdrawal of every consent grant and a denial for every displayed
	 * category. Legitimate interest stays.
	 */
	readonly rejectAll: () => void;
	/**
	 * Commit the selection and the displayed categories in one native commit,
	 * pinned to the revision the draft was opened on. Check `ok`.
	 */
	readonly save: () => Promise<CommitResult>;
	/** Drop staged edits and reseed from the committed decision. */
	readonly reset: () => void;
}

/**
 * Stage and save a TCF decision from your own IAB screen, with the commands
 * `@c15t/react`'s `useIAB()` exposes. It shares the consent draft, so
 * `useSaveConsents()()` and `useConsentDraft().save()` save the same selection.
 *
 * @example
 * ```tsx
 * const iab = useIAB();
 * if (!iab) return null;
 * <Switch value={usePurposeConsent(1)} onValueChange={(on) => iab.setPurposeConsent(1, on)} />;
 * ```
 *
 * @returns The handle, or `null` when the policy is not `iab`, no vendor list
 *   was served, or native cannot open a draft now (`useIABSnapshot()?.editable`
 *   is `false`: a stale or offline list, a missing Additional Consent list, or a
 *   binary without the headless bridge).
 */
export const useIAB = function useIAB(): IABDraftHandle | null {
	const draft = useConsentDraftStore();
	const choices = useConsentDraftSlice((state) => state.iab);
	const isDirty = useConsentDraftSlice((state) => state.isDirty);
	const isStale = useConsentDraftSlice((state) => state.isStale);
	const tcString = useTCString();
	const { stageIAB } = draft;

	const toggle = useCallback(
		(list: Parameters<typeof withChoice>[1]) =>
			(id: string | number, value: boolean) => {
				stageIAB((current) => withChoice(current, list, Number(id), value));
			},
		[stageIAB]
	);

	const commands = useMemo(
		() => ({
			// The stock blanket actions decide the categories too, so these stage both.
			acceptAll: () => {
				draft.acceptAll();
				stageIAB(acceptAllIAB);
			},
			rejectAll: () => {
				draft.rejectAll();
				stageIAB(rejectAllIAB);
			},
			reset: draft.reset,
			save: draft.save,
			setAdTechProviderConsent: toggle('adTechProviderConsents'),
			setPurposeConsent: toggle('purposeConsents'),
			setPurposeLegitimateInterest: (purposeId: number, value: boolean) => {
				stageIAB((current) =>
					withLegitimateInterest(current, 'purpose', purposeId, value)
				);
			},
			setSpecialFeatureOptIn: toggle('specialFeatureOptIns'),
			setVendorConsent: (vendorId: string | number, value: boolean) => {
				stageIAB((current, snapshot) =>
					isCustomVendor(snapshot, vendorId)
						? withCustomVendorChoice(
								current,
								'customVendorConsents',
								String(vendorId),
								value
							)
						: withChoice(current, 'vendorConsents', Number(vendorId), value)
				);
			},
			setVendorLegitimateInterest: (
				vendorId: string | number,
				value: boolean
			) => {
				stageIAB((current, snapshot) =>
					isCustomVendor(snapshot, vendorId)
						? withCustomVendorChoice(
								current,
								'customVendorLegitimateInterests',
								String(vendorId),
								value
							)
						: withLegitimateInterest(current, 'vendor', Number(vendorId), value)
				);
			},
		}),
		[draft, stageIAB, toggle]
	);

	return useMemo(
		() =>
			choices === null
				? null
				: { ...commands, choices, isDirty, isStale, tcString },
		[choices, commands, isDirty, isStale, tcString]
	);
};
