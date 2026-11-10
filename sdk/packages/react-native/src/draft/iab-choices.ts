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

/** Purposes TCF never lets a vendor or publisher claim under legitimate interest. */
const NEVER_LI = new Set([1, 3, 4, 5, 6]);

/** A selection with nothing granted. */
export const EMPTY_IAB_CHOICES: NativeIABChoices = Object.fromEntries(
	LISTS.map((list) => [list, []])
) as unknown as NativeIABChoices;

const sorted = (ids: Iterable<number>): readonly number[] =>
	[...new Set(ids)].sort((left, right) => left - right);

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
	if (snapshot.model !== 'iab' || !snapshot.iab?.gvl) {
		return null;
	}
	const committed = snapshot.iab.committed?.choices;
	if (!committed) {
		return EMPTY_IAB_CHOICES;
	}
	const filled = Object.fromEntries(
		LISTS.map((list) => [list, sorted(committed[list] ?? [])])
	) as Record<IABChoiceList, readonly number[]>;
	return {
		...filled,
		adTechProviderConsents: committed.adTechProviderConsents ?? null,
	};
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
 * Grant what the served partners declare, the way `@c15t/iab`'s `acceptAll`
 * stages it: consent for every declared consent purpose and the partners that
 * claim them, legitimate interest where it is declared and allowed, and the
 * declared special features. Undeclared purposes and features stay denied.
 *
 * @param choices - Current selection.
 * @param snapshot - Snapshot holding the served vendor list.
 * @returns The staged selection.
 */
export const acceptAllIAB = function acceptAllIAB(
	choices: NativeIABChoices,
	snapshot: ConsentSnapshot
): NativeIABChoices {
	const vendors = Object.entries(snapshot.iab?.gvl?.vendors ?? {}).filter(
		([, vendor]) => !vendor.deletedDate
	);
	const purposes = new Set<number>();
	const interests = new Set<number>();
	const features = new Set<number>();
	const consenting: number[] = [];
	const interested: number[] = [];
	for (const [key, vendor] of vendors) {
		const id = Number(key);
		for (const purpose of vendor.purposes) {
			purposes.add(purpose);
		}
		const allowed = vendor.legIntPurposes.filter(
			(purpose) => !NEVER_LI.has(purpose)
		);
		for (const purpose of allowed) {
			interests.add(purpose);
		}
		for (const feature of vendor.specialFeatures) {
			features.add(feature);
		}
		if (vendor.purposes.length > 0) {
			consenting.push(id);
		}
		if (allowed.length > 0) {
			interested.push(id);
		}
	}
	return {
		...choices,
		adTechProviderConsents: choices.adTechProviderConsents ?? null,
		purposeConsents: sorted(purposes),
		purposeLegitimateInterests: sorted(interests),
		purposeObjections: [],
		specialFeatureOptIns: sorted(features),
		vendorConsents: sorted(consenting),
		vendorLegitimateInterests: sorted(interested),
		vendorObjections: [],
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
		a: readonly number[] | null | undefined,
		b: readonly number[] | null | undefined
	) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	return (
		LISTS.every((list) => same(left[list], right[list])) &&
		same(left.adTechProviderConsents, right.adTechProviderConsents)
	);
};
