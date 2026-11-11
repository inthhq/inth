/**
 * The TCF half of a consent draft: a complete `NativeIABChoices` and the pure
 * edits a headless IAB screen stages into it.
 */

import type { ConsentSnapshot, NativeIABChoices } from '../protocol';

/** Every list a complete selection names. */
const LISTS = [
	'purposeConsents',
	'purposeLegitimateInterests',
	'purposeObjections',
	'vendorConsents',
	'vendorLegitimateInterests',
	'vendorObjections',
	'specialFeatureOptIns',
	'publisherConsents',
	'publisherLegitimateInterests',
	'publisherCustomConsents',
	'publisherCustomLegitimateInterests',
] as const;

/** One list name in {@link NativeIABChoices}. */
export type IABChoiceList = (typeof LISTS)[number];

/** The custom (non-IAB) vendor lists, keyed by string vendor ID. */
const CUSTOM_LISTS = [
	'customVendorConsents',
	'customVendorLegitimateInterests',
] as const;

/** One custom vendor list name in {@link NativeIABChoices}. */
export type IABCustomVendorList = (typeof CUSTOM_LISTS)[number];

/** Purposes TCF never lets a vendor or publisher claim under legitimate interest. */
const NEVER_LI = new Set([1, 3, 4, 5, 6]);

/** A selection with nothing granted. */
export const EMPTY_IAB_CHOICES: NativeIABChoices = Object.fromEntries(
	[...LISTS, ...CUSTOM_LISTS].map((list) => [list, []])
) as unknown as NativeIABChoices;

const sorted = (ids: Iterable<number>): readonly number[] =>
	[...new Set(ids)].sort((left, right) => left - right);

/** Custom vendor IDs in the order native sorts them. */
const sortedNames = (ids: Iterable<string>): readonly string[] =>
	[...new Set(ids)].sort();

/** Both custom vendor lists of `choices`, filled and sorted. */
const customLists = (
	choices: Partial<NativeIABChoices> | null | undefined
): Record<IABCustomVendorList, readonly string[]> => ({
	customVendorConsents: sortedNames(choices?.customVendorConsents ?? []),
	customVendorLegitimateInterests: sortedNames(
		choices?.customVendorLegitimateInterests ?? []
	),
});

/**
 * The selection a draft opens with: the committed one, completed, or nothing
 * granted. `null` when the policy is not `iab` or no vendor list was served.
 *
 * @param snapshot - Current native snapshot.
 * @returns The selection, or `null` outside TCF.
 */
export const seedIABChoices = function seedIABChoices(
	snapshot: ConsentSnapshot
): NativeIABChoices | null {
	// Only while native can open and save a draft. A stale or offline list, a
	// missing Additional Consent list, and a binary without a headless bridge all
	// read `editable: false`, and a selection staged then would only be refused.
	// A configuration a custom screen could not disclose never opens one, whatever
	// `editable` says.
	if (
		snapshot.model !== 'iab' ||
		!snapshot.iab?.gvl ||
		!snapshot.iab.editable ||
		snapshot.iab.headlessUnsupported.length > 0
	) {
		return null;
	}
	const committed = snapshot.iab.committed?.choices;
	if (!committed) {
		// A first decision starts as the stock presenter starts it: every consent off
		// and the disclosed legitimate interests not objected to, from native's own
		// projection under the publisher's disclosure. Custom vendors start with
		// nothing, legitimate interest included, as the web's preference centre does.
		const disclosed = snapshot.iab.acceptAll;
		return {
			...EMPTY_IAB_CHOICES,
			purposeLegitimateInterests: sorted(
				disclosed?.purposeLegitimateInterests ?? []
			),
			vendorLegitimateInterests: sorted(
				disclosed?.vendorLegitimateInterests ?? []
			),
		};
	}
	const filled = Object.fromEntries(
		LISTS.map((list) => [list, sorted(committed[list] ?? [])])
	) as Record<IABChoiceList, readonly number[]>;
	return {
		...filled,
		...customLists(committed),
		adTechProviderConsents: committed.adTechProviderConsents ?? null,
	};
};

/**
 * Whether `id` names a custom (non-IAB) vendor on `snapshot`: one `/init`
 * served under `customVendors` that is not also a registered vendor, which the
 * TC String represents.
 *
 * @param snapshot - Current native snapshot.
 * @param id - Vendor ID as a string or number.
 * @returns `true` for a custom vendor.
 */
export const isCustomVendor = function isCustomVendor(
	snapshot: ConsentSnapshot,
	id: string | number
): boolean {
	const key = String(id);
	const { iab } = snapshot;
	return (
		(iab?.customVendors ?? []).some((vendor) => vendor.id === key) &&
		!Object.hasOwn(iab?.gvl?.vendors ?? {}, key)
	);
};

/**
 * Add or remove one custom vendor from one custom vendor list. Turning
 * legitimate interest off is the objection; there is no separate list.
 *
 * @param choices - Current selection.
 * @param list - `customVendorConsents` or `customVendorLegitimateInterests`.
 * @param id - Custom vendor ID.
 * @param value - `true` to include it.
 * @returns The same object when nothing changed.
 */
export const withCustomVendorChoice = function withCustomVendorChoice(
	choices: NativeIABChoices,
	list: IABCustomVendorList,
	id: string,
	value: boolean
): NativeIABChoices {
	const current = choices[list] ?? [];
	if (current.includes(id) === value) {
		return choices;
	}
	const next = value
		? sortedNames([...current, id])
		: current.filter((entry) => entry !== id);
	return { ...choices, [list]: next };
};

/**
 * Add or remove one ID from one list.
 *
 * @param choices - Current selection.
 * @param list - List to edit.
 * @param id - Vendor, purpose or feature ID.
 * @param value - `true` to include it.
 * @returns The same object when nothing changed.
 */
export const withChoice = function withChoice(
	choices: NativeIABChoices,
	list: IABChoiceList | 'adTechProviderConsents',
	id: number,
	value: boolean
): NativeIABChoices {
	const current = choices[list] ?? [];
	if (current.includes(id) === value) {
		return choices;
	}
	const next = value
		? sorted([...current, id])
		: current.filter((entry) => entry !== id);
	return { ...choices, [list]: next };
};

/**
 * Set a legitimate-interest basis, clearing the objection that would contradict
 * it: an objection and a legitimate interest for the same ID cannot both stand.
 *
 * @param choices - Current selection.
 * @param kind - Purpose or vendor.
 * @param id - The ID.
 * @param value - `true` to claim legitimate interest, `false` to object.
 * @returns The next selection.
 */
export const withLegitimateInterest = function withLegitimateInterest(
	choices: NativeIABChoices,
	kind: 'purpose' | 'vendor',
	id: number,
	value: boolean
): NativeIABChoices {
	const interest =
		kind === 'purpose'
			? 'purposeLegitimateInterests'
			: 'vendorLegitimateInterests';
	const objection =
		kind === 'purpose' ? 'purposeObjections' : 'vendorObjections';
	if (kind === 'purpose' && value && NEVER_LI.has(id)) {
		return choices;
	}
	return withChoice(
		withChoice(choices, interest, id, value),
		objection,
		id,
		!value
	);
};

/**
 * Stage what native Accept all saves: the core's own projection of every live
 * partner's bases under the publisher's disclosure and restrictions, so a
 * headless Accept all and the stock one produce the same signals. Unchanged
 * when native offers none.
 *
 * @param choices - Current selection.
 * @param snapshot - Snapshot carrying the native `acceptAll`.
 * @returns The staged selection.
 */
export const acceptAllIAB = function acceptAllIAB(
	choices: NativeIABChoices,
	snapshot: ConsentSnapshot
): NativeIABChoices {
	const accepted = snapshot.iab?.acceptAll;
	if (!accepted) {
		return choices;
	}
	return {
		...(Object.fromEntries(
			LISTS.map((list) => [list, sorted(accepted[list] ?? [])])
		) as Record<IABChoiceList, readonly number[]>),
		...customLists(accepted),
		adTechProviderConsents: accepted.adTechProviderConsents ?? null,
	};
};

/**
 * Withdraw every consent grant, as `@c15t/iab`'s `rejectAll` does. Legitimate
 * interest stays as it was; object to it per purpose or vendor.
 *
 * @param choices - Current selection.
 * @returns The staged selection.
 */
export const rejectAllIAB = function rejectAllIAB(
	choices: NativeIABChoices
): NativeIABChoices {
	return {
		...choices,
		adTechProviderConsents:
			choices.adTechProviderConsents === null ||
			choices.adTechProviderConsents === undefined
				? null
				: [],
		customVendorConsents: [],
		publisherConsents: [],
		publisherCustomConsents: [],
		purposeConsents: [],
		specialFeatureOptIns: [],
		vendorConsents: [],
	};
};

/**
 * Whether two selections grant the same thing.
 *
 * @param left - One selection.
 * @param right - The other.
 * @returns `true` when every list holds the same IDs.
 */
export const sameIABChoices = function sameIABChoices(
	left: NativeIABChoices | null,
	right: NativeIABChoices | null
): boolean {
	if (left === right) {
		return true;
	}
	if (left === null || right === null) {
		return false;
	}
	const same = (
		a: readonly (number | string)[] | null | undefined,
		b: readonly (number | string)[] | null | undefined
	) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	const leftCustom = customLists(left);
	const rightCustom = customLists(right);
	return (
		LISTS.every((list) => same(left[list], right[list])) &&
		CUSTOM_LISTS.every((list) => same(leftCustom[list], rightCustom[list])) &&
		same(left.adTechProviderConsents, right.adTechProviderConsents)
	);
};
