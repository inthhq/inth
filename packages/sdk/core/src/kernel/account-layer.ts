/**
 * Account consent layer: normalization, clock conversion, identity gating,
 * and derivation of the effective consent view from the browser layer and
 * account layer.
 *
 * Pure: no storage, no `Date.now()`, no network, no DOM.
 *
 * @internal
 */

import { OPT_OUT_METHODS, OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';
import type {
	OptOutMethod,
	OptOutRecord,
	OptOutRight,
	UserConsent,
} from '@inth/sdk-schema/types';

import { isChoiceBasisCompatible } from '../consent-record/evaluate';
import { OPTIONAL_CONSENT_CATEGORIES } from '../consent-record/types';
import type {
	CategoryDecision,
	ChoiceBasis,
	EvaluationPolicy,
	ExplicitChoice,
	OptionalConsentCategory,
} from '../consent-record/types';
import {
	isNonEmptyString,
	isOptionalConsentCategory,
	isPlainRecord,
	ownKeys,
	ownValue,
} from '../consent-record/validation';
import { isValidVendorId } from '../libs/vendors';
import type { KernelUser, VendorChoice } from '../types';

/** Largest epoch millisecond value `Date` can represent. */
const MAX_DATE_MS = 8_640_000_000_000_000;

const OPT_OUT_RIGHT_SET: ReadonlySet<string> = new Set(OPT_OUT_RIGHTS);
const OPT_OUT_METHOD_SET: ReadonlySet<string> = new Set(OPT_OUT_METHODS);

/** One category choice stored in the account layer with raw server times. */
export interface AccountCategoryDecision {
	readonly value: boolean;
	readonly rawConfirmedAt: number;
	readonly expiresAt?: number;
	readonly basis: ChoiceBasis;
}

/** One vendor decision stored in the account layer with its raw server time. */
export interface AccountVendorDecision {
	readonly value: boolean;
	readonly rawConfirmedAt: number;
}

/** Person-held opt-out stored in the account layer with its raw server time. */
export interface AccountOptOutRecord {
	readonly rights: readonly OptOutRight[];
	readonly rawRecordedAt: number;
	readonly method: OptOutMethod;
}

/**
 * Normalized account consent layer kept apart from browser-made records.
 *
 * Raw server timestamps are preserved alongside the per-document `skew` and
 * `appliedAt`, so ordering times are recomputed deterministically across
 * reloads.
 */
export interface AccountConsentLayer {
	readonly externalId: string;
	readonly checkedAt: number;
	readonly skew: number;
	readonly appliedAt: number;
	/**
	 * Raw server `recordedAt` of the account opt-out that was lifted.
	 * Compared in server time against incoming documents' raw `optOut.recordedAt`
	 * so an already-lifted opt-out is ignored without blocking newer choices.
	 */
	readonly liftedRecordedAt?: number;
	readonly choices: Readonly<
		Partial<Record<OptionalConsentCategory, AccountCategoryDecision>>
	>;
	readonly vendors: Readonly<Record<string, AccountVendorDecision>>;
	readonly optOut: AccountOptOutRecord | null;
	/**
	 * True when the `<key>-acct-v` cookie exceeded its size budget and dropped
	 * its entries on SSR (so server-side vendor decisions are incomplete).
	 */
	readonly vendorsOverflow?: boolean;
}

/** Provenance of an account consent layer candidate for S1 adoption ordering. */
export type AccountLayerSource = 'incoming' | 'stored';

/** Inputs to {@link shouldAdoptAccountLayer}. */
export interface AccountAdoptionOptions {
	readonly current: AccountConsentLayer | null;
	readonly incoming: AccountConsentLayer | null;
	readonly userExternalId: string | null;
	readonly currentSource: AccountLayerSource;
	readonly incomingSource: AccountLayerSource;
	/**
	 * Allow client-clock reconversion of an identical, unlifted equal-`checkedAt`
	 * document during initial client `start()`.
	 */
	readonly forceClientSync?: boolean;
}

/** Browser-made consent records kept apart from the account layer. */
export interface BrowserConsentRecords {
	readonly choice: Readonly<ExplicitChoice> | null;
	readonly vendorChoice: Readonly<VendorChoice> | null;
	/**
	 * Declared vendor IDs covered by `vendorChoice`, when known. While present,
	 * `vendorChoice` only overrides an account vendor decision for IDs listed
	 * here or in `vendorChoice.denied` — never for a vendor never shown on this
	 * site.
	 */
	readonly vendorDeclared?: readonly string[] | null;
	readonly optOut: Readonly<OptOutRecord> | null;
}

/** Whether `value` is a valid non-negative epoch ms (future timestamps allowed). */
export const isValidAccountTimestamp = function isValidAccountTimestamp(
	value: unknown
): value is number {
	return (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value <= MAX_DATE_MS
	);
};

/**
 * Local ordering time for a raw server timestamp in `layer`:
 * `min(raw - skew, appliedAt)` (clamped at 0). Backward shift only, so a
 * cached or server-ahead document never outranks a newer local click.
 */
export const accountOrderingTime = function accountOrderingTime(
	raw: number,
	layer: Pick<AccountConsentLayer, 'skew' | 'appliedAt'>
): number {
	return Math.max(0, Math.min(raw - layer.skew, layer.appliedAt));
};

/** Converted local expiry deadline for an account grant, or `undefined`. */
export const accountGrantExpiresAt = function accountGrantExpiresAt(
	decision: AccountCategoryDecision,
	layer: Pick<AccountConsentLayer, 'skew'>
): number | undefined {
	if (!decision.value || decision.expiresAt === undefined) {
		return undefined;
	}
	return Math.max(0, decision.expiresAt - layer.skew);
};

const normalizeBasis = function normalizeBasis(
	input: unknown
): ChoiceBasis | null {
	if (!isPlainRecord(input)) {
		return null;
	}
	const kind = ownValue(input, 'kind');
	if (kind === 'choice-v1') {
		const fingerprint = ownValue(input, 'fingerprint');
		return isNonEmptyString(fingerprint)
			? { fingerprint, kind: 'choice-v1' }
			: null;
	}
	if (kind === 'legacy-v2') {
		const materialFingerprint = ownValue(input, 'materialFingerprint');
		if (materialFingerprint === undefined) {
			return { kind: 'legacy-v2' };
		}
		return isNonEmptyString(materialFingerprint)
			? { kind: 'legacy-v2', materialFingerprint }
			: null;
	}
	return null;
};

/** Filter wire rights to supported SDK rights in canonical order. */
export const filterSupportedOptOutRights = function filterSupportedOptOutRights(
	input: unknown
): OptOutRight[] {
	if (!Array.isArray(input)) {
		return [];
	}
	const seen = new Set<OptOutRight>();
	for (const entry of input) {
		if (typeof entry === 'string' && OPT_OUT_RIGHT_SET.has(entry)) {
			seen.add(entry as OptOutRight);
		}
	}
	return OPT_OUT_RIGHTS.filter((right) => seen.has(right));
};

const normalizeAccountMethod = function normalizeAccountMethod(
	input: unknown
): OptOutMethod | null {
	if (typeof input !== 'string' || input.length === 0) {
		return null;
	}
	return OPT_OUT_METHOD_SET.has(input) ? (input as OptOutMethod) : 'api';
};

const normalizeAccountChoices = function normalizeAccountChoices(
	rawChoices: Record<string, unknown>,
	timeKey: 'confirmedAt' | 'rawConfirmedAt',
	strict: boolean
): Partial<Record<OptionalConsentCategory, AccountCategoryDecision>> | null {
	const choices: Partial<
		Record<OptionalConsentCategory, AccountCategoryDecision>
	> = {};
	for (const key of ownKeys(rawChoices)) {
		if (!isOptionalConsentCategory(key)) {
			continue;
		}
		const entry = rawChoices[key];
		if (!isPlainRecord(entry)) {
			if (strict) {
				return null;
			}
			continue;
		}
		const value = ownValue(entry, 'value');
		const confirmedAt = ownValue(entry, timeKey);
		const expiresAt = ownValue(entry, 'expiresAt');
		const basis = normalizeBasis(ownValue(entry, 'basis'));
		const valid =
			typeof value === 'boolean' &&
			isValidAccountTimestamp(confirmedAt) &&
			basis !== null &&
			(expiresAt === undefined || isValidAccountTimestamp(expiresAt));
		if (!valid) {
			if (strict) {
				return null;
			}
			continue;
		}
		choices[key] =
			value && expiresAt !== undefined
				? { basis, expiresAt, rawConfirmedAt: confirmedAt, value }
				: { basis, rawConfirmedAt: confirmedAt, value };
	}
	return choices;
};

const normalizeAccountVendors = function normalizeAccountVendors(
	rawVendors: Record<string, unknown>,
	timeKey: 'confirmedAt' | 'rawConfirmedAt',
	strict: boolean
): Record<string, AccountVendorDecision> | null {
	const vendors: Record<string, AccountVendorDecision> = {};
	for (const id of ownKeys(rawVendors)) {
		if (!isValidVendorId(id)) {
			continue;
		}
		const entry = rawVendors[id];
		if (!isPlainRecord(entry)) {
			if (strict) {
				return null;
			}
			continue;
		}
		const value = ownValue(entry, 'value');
		const confirmedAt = ownValue(entry, timeKey);
		if (typeof value !== 'boolean' || !isValidAccountTimestamp(confirmedAt)) {
			if (strict) {
				return null;
			}
			continue;
		}
		Object.defineProperty(vendors, id, {
			configurable: true,
			enumerable: true,
			value: { rawConfirmedAt: confirmedAt, value },
			writable: true,
		});
	}
	return vendors;
};

const normalizeAccountOptOut = function normalizeAccountOptOut(
	rawOptOut: unknown,
	timeKey: 'recordedAt' | 'rawRecordedAt',
	strict: boolean
): { ok: true; record: AccountOptOutRecord | null } | { ok: false } {
	if (rawOptOut === null) {
		return { ok: true, record: null };
	}
	if (!isPlainRecord(rawOptOut)) {
		return { ok: false };
	}
	const recordedAt = ownValue(rawOptOut, timeKey);
	const method = normalizeAccountMethod(ownValue(rawOptOut, 'method'));
	const rights = filterSupportedOptOutRights(ownValue(rawOptOut, 'rights'));
	if (!isValidAccountTimestamp(recordedAt) || method === null) {
		return strict ? { ok: false } : { ok: true, record: null };
	}
	return {
		ok: true,
		record:
			rights.length > 0 ? { method, rawRecordedAt: recordedAt, rights } : null,
	};
};

/**
 * Normalize a raw `UserConsent` document into an `AccountConsentLayer` at
 * `localNow`. Returns `null` when the document is structurally invalid.
 *
 * Unknown categories, invalid entries, and unknown opt-out rights (such as
 * `limit_sensitive`) are dropped. An opt-out left with no supported rights
 * becomes `null`.
 */
export const normalizeUserConsent = function normalizeUserConsent(
	input: UserConsent | unknown,
	localNow: number
): AccountConsentLayer | null {
	if (!isPlainRecord(input)) {
		return null;
	}
	const sync = ownValue(input, 'sync');
	if (!isPlainRecord(sync)) {
		return null;
	}
	const externalId = ownValue(sync, 'externalId');
	const checkedAt = ownValue(sync, 'checkedAt');
	const rawChoices = ownValue(sync, 'choices');
	const rawVendors = ownValue(sync, 'vendors');
	const rawOptOut = ownValue(sync, 'optOut');
	if (
		!isNonEmptyString(externalId) ||
		!isValidAccountTimestamp(checkedAt) ||
		!isPlainRecord(rawChoices) ||
		!isPlainRecord(rawVendors)
	) {
		return null;
	}
	const optOut = normalizeAccountOptOut(rawOptOut, 'recordedAt', false);
	if (!optOut.ok) {
		return null;
	}
	const choices = normalizeAccountChoices(rawChoices, 'confirmedAt', false);
	const vendors = normalizeAccountVendors(rawVendors, 'confirmedAt', false);
	if (!choices || !vendors) {
		return null;
	}
	const appliedAt = isValidAccountTimestamp(localNow) ? localNow : 0;
	const skew = Math.max(0, checkedAt - appliedAt);
	return {
		appliedAt,
		checkedAt,
		choices,
		externalId,
		optOut: optOut.record,
		skew,
		vendors,
	};
};

/**
 * Validate a stored/hydrated `AccountConsentLayer`. Exempt from the
 * future-timestamp rule, like opt-out `recordedAt`.
 */
export const validateAccountConsentLayer = function validateAccountConsentLayer(
	input: unknown
): AccountConsentLayer | null {
	if (!isPlainRecord(input)) {
		return null;
	}
	const externalId = ownValue(input, 'externalId');
	const checkedAt = ownValue(input, 'checkedAt');
	const skew = ownValue(input, 'skew');
	const appliedAt = ownValue(input, 'appliedAt');
	const rawChoices = ownValue(input, 'choices');
	const rawVendors = ownValue(input, 'vendors');
	const rawOptOut = ownValue(input, 'optOut');
	if (
		!isNonEmptyString(externalId) ||
		!isValidAccountTimestamp(checkedAt) ||
		!isValidAccountTimestamp(skew) ||
		!isValidAccountTimestamp(appliedAt) ||
		!isPlainRecord(rawChoices) ||
		!isPlainRecord(rawVendors)
	) {
		return null;
	}
	const choices = normalizeAccountChoices(rawChoices, 'rawConfirmedAt', true);
	const vendors = normalizeAccountVendors(rawVendors, 'rawConfirmedAt', true);
	const optOut = normalizeAccountOptOut(rawOptOut, 'rawRecordedAt', true);
	const rawLiftedRecordedAt = ownValue(input, 'liftedRecordedAt');
	const rawOverflow = ownValue(input, 'vendorsOverflow');
	if (
		!choices ||
		!vendors ||
		!optOut.ok ||
		(rawLiftedRecordedAt !== undefined &&
			!isValidAccountTimestamp(rawLiftedRecordedAt)) ||
		(rawOverflow !== undefined && typeof rawOverflow !== 'boolean')
	) {
		return null;
	}
	const layer: AccountConsentLayer = {
		appliedAt,
		checkedAt,
		choices,
		externalId,
		optOut: optOut.record,
		skew,
		vendors,
	};
	const withLifted =
		rawLiftedRecordedAt === undefined
			? layer
			: { ...layer, liftedRecordedAt: rawLiftedRecordedAt };
	return rawOverflow === true
		? { ...withLifted, vendorsOverflow: true }
		: withLifted;
};

const sameBasis = function sameBasis(
	left: ChoiceBasis,
	right: ChoiceBasis
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}
	if (left.kind === 'choice-v1' && right.kind === 'choice-v1') {
		return left.fingerprint === right.fingerprint;
	}
	return (
		(left as { materialFingerprint?: string }).materialFingerprint ===
		(right as { materialFingerprint?: string }).materialFingerprint
	);
};

const sameAccountChoices = function sameAccountChoices(
	left: AccountConsentLayer['choices'],
	right: AccountConsentLayer['choices']
): boolean {
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const a = left[category];
		const b = right[category];
		if (a === b) {
			continue;
		}
		if (
			!a ||
			!b ||
			a.value !== b.value ||
			a.rawConfirmedAt !== b.rawConfirmedAt ||
			a.expiresAt !== b.expiresAt ||
			!sameBasis(a.basis, b.basis)
		) {
			return false;
		}
	}
	return true;
};

const sameAccountVendors = function sameAccountVendors(
	left: AccountConsentLayer['vendors'],
	right: AccountConsentLayer['vendors']
): boolean {
	const leftVendors = Object.keys(left);
	if (leftVendors.length !== Object.keys(right).length) {
		return false;
	}
	for (const id of leftVendors) {
		const a = left[id];
		const b = Object.hasOwn(right, id) ? right[id] : undefined;
		if (
			!a ||
			!b ||
			a.value !== b.value ||
			a.rawConfirmedAt !== b.rawConfirmedAt
		) {
			return false;
		}
	}
	return true;
};

const sameAccountOptOutContent = function sameAccountOptOutContent(
	left: AccountOptOutRecord | null,
	right: AccountOptOutRecord | null
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		left.method === right.method &&
		left.rawRecordedAt === right.rawRecordedAt &&
		left.rights.length === right.rights.length &&
		left.rights.every((rightName, index) => rightName === right.rights[index])
	);
};

/**
 * Whether two account layers hold identical document content (`externalId`,
 * `checkedAt`, `choices`, `vendors`, `optOut`). Used so re-passing an equal
 * resolved `UserConsent` value is a no-op.
 */
export const sameAccountLayerContent = function sameAccountLayerContent(
	left: AccountConsentLayer | null,
	right: AccountConsentLayer | null
): boolean {
	if (left === right) {
		return true;
	}
	if (
		!left ||
		!right ||
		left.externalId !== right.externalId ||
		left.checkedAt !== right.checkedAt
	) {
		return false;
	}
	return (
		sameAccountChoices(left.choices, right.choices) &&
		sameAccountVendors(left.vendors, right.vendors) &&
		sameAccountOptOutContent(left.optOut, right.optOut)
	);
};

const isMoreCompleteAccountLayer = function isMoreCompleteAccountLayer(
	incoming: AccountConsentLayer,
	current: AccountConsentLayer
): boolean {
	return (
		Object.keys(incoming.choices).length >
			Object.keys(current.choices).length ||
		Object.keys(incoming.vendors).length >
			Object.keys(current.vendors).length ||
		(current.optOut === null &&
			current.liftedRecordedAt === undefined &&
			incoming.optOut !== null) ||
		(current.vendorsOverflow === true && !incoming.vendorsOverflow)
	);
};

/**
 * Apply the current layer's server-time opt-out lift floor to an incoming
 * candidate for the same user: ignore an opt-out whose raw server `recordedAt`
 * is at or before `liftedRecordedAt`, while keeping newer choices/vendors and
 * preserving the lift floor for future checks.
 */
export const applyLiftFloorToIncoming = function applyLiftFloorToIncoming(
	current: AccountConsentLayer | null,
	incoming: AccountConsentLayer
): AccountConsentLayer {
	if (
		!current ||
		current.liftedRecordedAt === undefined ||
		current.externalId !== incoming.externalId
	) {
		return incoming;
	}
	const floor = Math.max(
		current.liftedRecordedAt,
		incoming.liftedRecordedAt ?? -1
	);
	if (incoming.optOut !== null && incoming.optOut.rawRecordedAt <= floor) {
		return { ...incoming, liftedRecordedAt: floor, optOut: null };
	}
	if (
		incoming.liftedRecordedAt === undefined ||
		incoming.liftedRecordedAt < floor
	) {
		return { ...incoming, liftedRecordedAt: floor };
	}
	return incoming;
};

/**
 * Single account-layer adoption rule shared by SSR construction, hydration,
 * persistence recovery/reconcile, streamed adoption, and `syncUserConsent`.
 *
 * Order:
 * 1. Identity gate (`externalId` must match the current user).
 * 2. Strictly newer `checkedAt` wins (callers apply `applyLiftFloorToIncoming`
 *    so an already-lifted opt-out with raw `recordedAt <= liftedRecordedAt` is
 *    ignored while newer choices/vendors still adopt).
 * 3. Equal `checkedAt`: stored beats incoming (never reconverting a stored
 *    layer's established `skew`/`appliedAt`); between two stored candidates,
 *    higher `liftedRecordedAt`, then higher `appliedAt`, then more complete
 *    part set wins.
 */
export const shouldAdoptAccountLayer = function shouldAdoptAccountLayer({
	current,
	currentSource,
	forceClientSync = false,
	incoming,
	incomingSource,
	userExternalId,
}: AccountAdoptionOptions): boolean {
	if (!incoming || !userExternalId || incoming.externalId !== userExternalId) {
		return false;
	}
	if (!current || current.externalId !== userExternalId) {
		return true;
	}
	if (incoming.checkedAt > current.checkedAt) {
		return true;
	}
	if (incoming.checkedAt < current.checkedAt) {
		return false;
	}
	if (incomingSource === 'incoming') {
		return (
			forceClientSync &&
			currentSource === 'incoming' &&
			current.liftedRecordedAt === undefined &&
			sameAccountLayerContent(current, incoming)
		);
	}
	if (currentSource === 'incoming') {
		return true;
	}
	const incomingLift = incoming.liftedRecordedAt ?? -1;
	const currentLift = current.liftedRecordedAt ?? -1;
	if (incomingLift !== currentLift) {
		return incomingLift > currentLift;
	}
	if (incoming.appliedAt !== current.appliedAt) {
		return incoming.appliedAt > current.appliedAt;
	}
	return isMoreCompleteAccountLayer(incoming, current);
};

/** Deep-freeze an `AccountConsentLayer` so snapshot/runtime consumers cannot mutate it. */
export const freezeAccountLayer = function freezeAccountLayer(
	layer: AccountConsentLayer | null
): AccountConsentLayer | null {
	if (!layer || Object.isFrozen(layer)) {
		return layer;
	}
	for (const decision of Object.values(layer.choices)) {
		if (decision) {
			Object.freeze(decision.basis);
			Object.freeze(decision);
		}
	}
	Object.freeze(layer.choices);
	for (const vendor of Object.values(layer.vendors)) {
		Object.freeze(vendor);
	}
	Object.freeze(layer.vendors);
	if (layer.optOut) {
		Object.freeze(layer.optOut.rights);
		Object.freeze(layer.optOut);
	}
	return Object.freeze(layer);
};

const pickNewerCategory = function pickNewerCategory(
	browser: CategoryDecision | undefined,
	account: CategoryDecision | undefined
): CategoryDecision | undefined {
	if (!account) {
		return browser;
	}
	if (!browser) {
		return account;
	}
	if (account.confirmedAt > browser.confirmedAt) {
		return account;
	}
	if (browser.confirmedAt > account.confirmedAt) {
		return browser;
	}
	// Tie goes to denial.
	if (!account.value && browser.value) {
		return account;
	}
	return browser;
};

const deriveEffectiveChoice = function deriveEffectiveChoice(
	browserChoice: Readonly<ExplicitChoice> | null,
	account: AccountConsentLayer,
	policy: EvaluationPolicy
): Readonly<ExplicitChoice> | null {
	const categories: ExplicitChoice['categories'] = {};
	let any = false;
	let differsFromBrowser = false;

	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const browserDecision = browserChoice?.categories[category];
		const rawAccount = account.choices[category];
		let accountDecision: CategoryDecision | undefined;
		if (rawAccount) {
			// Drop incompatible account grants before merging; keep denials.
			if (
				!rawAccount.value ||
				isChoiceBasisCompatible(rawAccount.basis, policy)
			) {
				const confirmedAt = accountOrderingTime(
					rawAccount.rawConfirmedAt,
					account
				);
				const expiresAt = accountGrantExpiresAt(rawAccount, account);
				accountDecision =
					expiresAt === undefined
						? { basis: rawAccount.basis, confirmedAt, value: rawAccount.value }
						: {
								basis: rawAccount.basis,
								confirmedAt,
								expiresAt,
								value: rawAccount.value,
							};
			}
		}
		const winner = pickNewerCategory(browserDecision, accountDecision);
		if (winner) {
			categories[category] = winner;
			any = true;
		}
		if (winner !== browserDecision) {
			differsFromBrowser = true;
		}
	}

	if (!any) {
		return null;
	}
	return differsFromBrowser ? { categories, version: 3 } : browserChoice;
};

const pickNewerVendor = function pickNewerVendor(
	hasBrowser: boolean,
	browserValue: boolean,
	browserAt: number,
	accountEntry: AccountVendorDecision | undefined,
	account: AccountConsentLayer
): { value: boolean; at: number } {
	if (!accountEntry) {
		return { at: browserAt, value: browserValue };
	}
	const accountAt = accountOrderingTime(accountEntry.rawConfirmedAt, account);
	if (!hasBrowser || accountAt > browserAt) {
		return { at: accountAt, value: accountEntry.value };
	}
	if (browserAt > accountAt) {
		return { at: browserAt, value: browserValue };
	}
	return { at: browserAt, value: browserValue && accountEntry.value };
};

const deriveEffectiveVendorChoice = function deriveEffectiveVendorChoice(
	browserVendors: Readonly<VendorChoice> | null,
	browserDeclared: readonly string[] | null | undefined,
	account: AccountConsentLayer
): Readonly<VendorChoice> | null {
	const accountIds = Object.keys(account.vendors);
	if (accountIds.length === 0) {
		return browserVendors;
	}
	const browserDenied = new Set(browserVendors?.denied);
	const declaredSet =
		browserDeclared !== null && browserDeclared !== undefined
			? new Set(browserDeclared)
			: null;
	const allIds = new Set<string>([...browserDenied, ...accountIds]);
	const denied: string[] = [];
	const hasBrowser = browserVendors !== null;
	const browserAt = browserVendors?.confirmedAt ?? -1;
	let latestConfirmedAt = browserAt;

	for (const id of allIds) {
		const accountEntry = Object.hasOwn(account.vendors, id)
			? account.vendors[id]
			: undefined;
		// When the browser recorded which declared vendors it showed, its
		// decision counts only for vendors it denied or explicitly showed.
		// When coverage is unknown (SSR cookie-only read or legacy vendor
		// record), browser counts only for vendors it denied; account wins elsewhere.
		const browserCoversId =
			hasBrowser &&
			(browserDenied.has(id) || (declaredSet !== null && declaredSet.has(id)));
		const winner = pickNewerVendor(
			browserCoversId,
			!browserDenied.has(id),
			browserAt,
			accountEntry,
			account
		);
		if (winner.at > latestConfirmedAt) {
			latestConfirmedAt = winner.at;
		}
		if (!winner.value) {
			denied.push(id);
		}
	}

	denied.sort();
	const confirmedAt = Math.max(0, latestConfirmedAt);
	if (
		browserVendors !== null &&
		browserVendors.confirmedAt === confirmedAt &&
		browserVendors.denied.length === denied.length &&
		browserVendors.denied.every((id, index) => id === denied[index])
	) {
		return browserVendors;
	}
	return { confirmedAt, denied, version: 1 };
};

const deriveEffectiveOptOut = function deriveEffectiveOptOut(
	browserOptOut: Readonly<OptOutRecord> | null,
	account: AccountConsentLayer
): Readonly<OptOutRecord> | null {
	// While an account layer is active, ignore any legacy `heldBy: 'person'`
	// record already stored in browser records so only device opt-outs merge
	// with the account layer.
	const deviceOptOut =
		browserOptOut?.heldBy === 'person' ? null : browserOptOut;
	const accountOptOut = account.optOut;
	if (!accountOptOut || accountOptOut.rights.length === 0) {
		return deviceOptOut;
	}
	const accountRecordedAt = accountOrderingTime(
		accountOptOut.rawRecordedAt,
		account
	);
	if (!deviceOptOut) {
		return {
			heldBy: 'person',
			method: accountOptOut.method,
			recordedAt: accountRecordedAt,
			rights: [...accountOptOut.rights],
		};
	}
	const mergedRights = new Set<OptOutRight>([
		...deviceOptOut.rights,
		...accountOptOut.rights,
	]);
	const rights = OPT_OUT_RIGHTS.filter((right) => mergedRights.has(right));
	const recordedAt = Math.max(deviceOptOut.recordedAt, accountRecordedAt);
	const method =
		deviceOptOut.recordedAt >= accountRecordedAt
			? deviceOptOut.method
			: accountOptOut.method;
	return {
		heldBy: 'both',
		method,
		recordedAt,
		rights,
	};
};

const sameEffectiveChoice = function sameEffectiveChoice(
	left: Readonly<ExplicitChoice> | null,
	right: Readonly<ExplicitChoice> | null
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	for (const category of OPTIONAL_CONSENT_CATEGORIES) {
		const a = left.categories[category];
		const b = right.categories[category];
		if (a === b) {
			continue;
		}
		if (
			!a ||
			!b ||
			a.value !== b.value ||
			a.confirmedAt !== b.confirmedAt ||
			a.expiresAt !== b.expiresAt ||
			!sameBasis(a.basis, b.basis)
		) {
			return false;
		}
	}
	return true;
};

const sameEffectiveVendors = function sameEffectiveVendors(
	left: Readonly<VendorChoice> | null,
	right: Readonly<VendorChoice> | null
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		left.confirmedAt === right.confirmedAt &&
		left.denied.length === right.denied.length &&
		left.denied.every((id, index) => id === right.denied[index])
	);
};

const sameEffectiveOptOut = function sameEffectiveOptOut(
	left: Readonly<OptOutRecord> | null,
	right: Readonly<OptOutRecord> | null
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	return (
		left.heldBy === right.heldBy &&
		left.method === right.method &&
		left.recordedAt === right.recordedAt &&
		left.rights.length === right.rights.length &&
		left.rights.every((rightName, index) => rightName === right.rights[index])
	);
};

/**
 * Effective consent records derived from `browser` and `account` under
 * `user` and `policy`.
 *
 * The identity gate requires `account.externalId === user.externalId`; when
 * it fails or no account layer is present, the browser records pass through
 * unchanged. When `previous` is provided, unchanged derived objects keep
 * their previous frozen reference so unrelated commits do not look like a
 * choice change.
 */
export const deriveEffectiveRecords = function deriveEffectiveRecords(
	browser: BrowserConsentRecords,
	account: AccountConsentLayer | null,
	user: Readonly<KernelUser> | null,
	policy: EvaluationPolicy,
	previous?: BrowserConsentRecords
): {
	readonly activeAccount: AccountConsentLayer | null;
	readonly choice: Readonly<ExplicitChoice> | null;
	readonly vendorChoice: Readonly<VendorChoice> | null;
	readonly optOut: Readonly<OptOutRecord> | null;
} {
	const activeAccount =
		account !== null && user !== null && account.externalId === user.externalId
			? account
			: null;
	const rawChoice = activeAccount
		? deriveEffectiveChoice(browser.choice, activeAccount, policy)
		: browser.choice;
	const rawOptOut = activeAccount
		? deriveEffectiveOptOut(browser.optOut, activeAccount)
		: browser.optOut;
	const rawVendorChoice = activeAccount
		? deriveEffectiveVendorChoice(
				browser.vendorChoice,
				browser.vendorDeclared,
				activeAccount
			)
		: browser.vendorChoice;
	return {
		activeAccount,
		choice:
			previous && sameEffectiveChoice(previous.choice, rawChoice)
				? previous.choice
				: rawChoice,
		optOut:
			previous && sameEffectiveOptOut(previous.optOut, rawOptOut)
				? previous.optOut
				: rawOptOut,
		vendorChoice:
			previous && sameEffectiveVendors(previous.vendorChoice, rawVendorChoice)
				? previous.vendorChoice
				: rawVendorChoice,
	};
};
