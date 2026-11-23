/**
 * Choice recording: the only way a visitor's decision enters the kernel.
 *
 * - `save()` records an explicit choice, or acknowledges a choice prompt
 *   with no category to decide. It captures one action time before any
 *   yield, network call or persistence, commits the choice, the vendor
 *   decision, any opt-out transition and any notice it acknowledges in one
 *   commit, and then hands the action's payloads to the save outbox
 *   (`save-outbox/`), which owns sending, queueing, replay and subject
 *   reassignment.
 * - `optOut()` and `optIn()` record and lift durable opt-out records and
 *   hand their acts to the save outbox. Lifting an account-held opt-out
 *   queues the lift in the same outbox and waits for the backend's answer
 *   before clearing locally.
 * - `dismissNotice()` records the local notice dismissal only.
 * - Drafts stage what a no-input `save()` confirms. They are bound to the
 *   choice contract they were presented under and dropped, never
 *   restamped, when that contract changes.
 *
 * Every action is attributed to the surface it was made on, with the time
 * from that surface's first impression and the experiment arm it ran.
 */

import {
	AD_TECH_PROVIDER_PURPOSES,
	ADDITIONAL_CONSENT_V2_PATTERN,
} from '@inth/sdk-schema/types';
import type { OptOutRecord, OptOutRight } from '@inth/sdk-schema/types';

import type {
	ConsentSnapshot,
	ConsentState,
	KernelEvent,
	KernelIABAuthority,
	KernelTransport,
	NoticeDismissResult,
	OptInResult,
	OptOutResult,
	SaveInput,
	SavePayload,
	SaveResult,
	SaveUISource,
	VendorChoice,
} from '../consent-kernel.model';
import {
	EMPTY_CHOICE,
	recordCategoryPatch,
} from '../consent-record/consent-record.model';
import { optOutDecidingCategory } from '../consent-record/types';
import type { OptionalConsentCategory } from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import { extractConsentNamesFromCondition, has } from '../libs/has';
import type { HasCondition } from '../libs/has';
import {
	createIdempotencyKey,
	generateUuidV7,
} from '../libs/subject-uuid.model';
import { vendorAxisActive } from '../libs/vendors';
import { toggleableVendorIds } from '../modules/vendor-denial';
import type { PresentedSelection } from '../policy-choice.model';
import { saveRecordsOptOut } from '../surface-actions/instant-commit';
import {
	accountOrderingTime,
	filterSupportedOptOutRights,
	resolveBrowserVendorTimes,
} from './account-layer';
import type {
	AccountConsentLayer,
	BrowserConsentRecords,
} from './account-layer';
import type { KernelRuntime } from './create-runtime';
import {
	applySyncedOptOut,
	buildLiftOptOutPayload,
	buildOptOutPayload,
	nextButtonOptOutRecord,
	optOutLiftBlocker,
} from './kernel-opt-out.model';
import type { SnapshotPatch } from './kernel-patch.model';
import { buildDraft, copyIABAuthority } from './kernel-snapshot.model';
import type { SaveOutbox } from './save-outbox';
import {
	applyNoticeAcknowledgement,
	buildSavePayload,
	choiceAcknowledgement,
	keepRightsSurface,
	resolveSaveSelection,
	saveAttribution,
	saveSubject,
} from './save-plan.model';

/**
 * Separate the vendor grants an object input carries from its categories.
 * Bulk and omitted inputs pass through; a `vendors` key that is not a map
 * is kept so the grant validation reports it rather than silently dropped.
 */
const splitSaveInput = function splitSaveInput(
	rawInput: SaveInput | undefined
): {
	input: 'all' | 'none' | Partial<ConsentState> | undefined;
	vendors: Record<string, boolean> | undefined;
} {
	if (rawInput === undefined || typeof rawInput !== 'object') {
		return { input: rawInput, vendors: undefined };
	}
	if (!Object.hasOwn(rawInput, 'vendors')) {
		return { input: rawInput, vendors: undefined };
	}
	const { vendors, ...categories } = rawInput;
	return { input: categories, vendors: vendors as Record<string, boolean> };
};

/** Own string keys mapped to booleans. Rejects anything else. */
const isVendorGrantMap = function isVendorGrantMap(
	value: unknown
): value is Record<string, boolean> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.entries(value).every(
		([id, granted]) => id.length > 0 && typeof granted === 'boolean'
	);
};

/** Whether a narrowed bulk action names every category the visitor decides. */
const coversChoiceScope = function coversChoiceScope(
	snapshot: ConsentSnapshot,
	categories: readonly AllConsentNames[]
): boolean {
	const scope = snapshot.evaluationPolicy.choiceScope;
	// An empty scope is vacuously covered by `every`, and the visitor decides
	// nothing in it, so a narrowed action there is not the full clear.
	return (
		scope.length > 0 && scope.every((category) => categories.includes(category))
	);
};

/** A condition's outcome, `null` when it cannot be evaluated. */
const conditionOutcome = function conditionOutcome(
	condition: HasCondition<AllConsentNames>,
	consents: ConsentState
): boolean | null {
	try {
		return has(condition, consents);
	} catch {
		return null;
	}
};

/**
 * Whether the selected categories alone settle a condition: with them at
 * their post-action values, no assignment of the condition's other
 * categories changes the outcome. Checked by enumerating those assignments,
 * which a condition over a handful of categories keeps small. A condition
 * that cannot be evaluated is never settled.
 */
const settledBySelection = function settledBySelection(
	condition: HasCondition<AllConsentNames>,
	afterAction: ConsentState,
	selected: ReadonlySet<AllConsentNames>
): boolean {
	const expected = conditionOutcome(condition, afterAction);
	if (expected === null) {
		return false;
	}
	const free = [...new Set(extractConsentNamesFromCondition(condition))].filter(
		(name) => !selected.has(name)
	);
	// Walk every other assignment of the free categories like an odometer:
	// flip the first digit, carrying into the next when it rolls back.
	const flipped = free.map(() => false);
	const advance = (): boolean => {
		for (const [index] of free.entries()) {
			flipped[index] = !flipped[index];
			if (flipped[index]) {
				return true;
			}
		}
		return false;
	};
	while (advance()) {
		const state: ConsentState = { ...afterAction };
		for (const [index, name] of free.entries()) {
			if (flipped[index]) {
				state[name] = !afterAction[name];
			}
		}
		if (conditionOutcome(condition, state) !== expected) {
			return false;
		}
	}
	return true;
};

/**
 * The state after a bulk action narrowed to some categories. A denial is
 * lifted only for a vendor the action decides on its own: one of its
 * categories is selected, and the selected categories are what settles its
 * condition, whatever the unselected ones hold. A vendor under
 * `{ or: [marketing, measurement] }` keeps its denial when only measurement
 * is rejected, since the still-granted marketing branch would load it at
 * once; one under `{ not: marketing }` is decided by rejecting marketing,
 * and its denial lifts; one under `{ and: [measurement, { not: marketing }] }`
 * is decided by rejecting both, even though no single flip of the pair
 * would change its outcome. Every other denial stays. Stamped like a full
 * bulk action once a governed vendor exists.
 */
const advanceVendorTimes = function advanceVendorTimes(
	existing: Readonly<Record<string, number>> | null,
	decidedIds: Iterable<string>,
	actionAt: number
): Record<string, number> {
	const next: Record<string, number> = existing ? { ...existing } : {};
	for (const id of decidedIds) {
		Object.defineProperty(next, id, {
			configurable: true,
			enumerable: true,
			value: actionAt,
			writable: true,
		});
	}
	return next;
};

const sameStringArray = (
	left: readonly string[] | null | undefined,
	right: readonly string[] | null | undefined
): boolean => {
	if (left === right) {
		return true;
	}
	if (!left || !right || left.length !== right.length) {
		return false;
	}
	return left.every((value, index) => value === right[index]);
};

const sameVendorTimesMap = (
	left: Readonly<Record<string, number>> | null | undefined,
	right: Readonly<Record<string, number>> | null | undefined
): boolean => {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return false;
	}
	const leftKeys = Object.keys(left);
	if (leftKeys.length !== Object.keys(right).length) {
		return false;
	}
	return leftKeys.every(
		(key) => Object.hasOwn(right, key) && left[key] === right[key]
	);
};

interface ResolvedVendorSelection {
	vendorChoice: VendorChoice | null;
	vendorDeclared?: readonly string[] | null;
	vendorTimes?: Readonly<Record<string, number>> | null;
}

const scopedBulkVendorChoice = function scopedBulkVendorChoice(
	snapshot: ConsentSnapshot,
	categories: readonly AllConsentNames[],
	granted: boolean,
	actionAt: number,
	browser: Pick<
		BrowserConsentRecords,
		'vendorChoice' | 'vendorDeclared' | 'vendorTimes'
	>
): ResolvedVendorSelection {
	const browserVendorChoice = browser.vendorChoice;
	const selected = new Set(categories);
	const afterAction: ConsentState = { ...snapshot.effectivePermissions };
	for (const category of selected) {
		afterAction[category] = granted;
	}
	const governed = new Set<string>();
	for (const vendor of snapshot.vendors?.declared ?? []) {
		const names = extractConsentNamesFromCondition(vendor.category);
		if (!names.some((name) => selected.has(name))) {
			continue;
		}
		if (settledBySelection(vendor.category, afterAction, selected)) {
			governed.add(vendor.id);
		}
	}
	if (governed.size === 0) {
		return {
			vendorChoice: browserVendorChoice,
			vendorDeclared: browser.vendorDeclared,
			vendorTimes: browser.vendorTimes,
		};
	}
	// A scoped bulk save advances ONLY the vendors it governs; older timestamps
	// for other vendors in browser records stay untouched.
	const existingTimes = resolveBrowserVendorTimes(browser);
	const vendorTimes = advanceVendorTimes(existingTimes, governed, actionAt);
	const vendorDeclared = Object.keys(vendorTimes).sort();
	// Read browser records, never the account-merged effective view, so an
	// unseen account-only vendor denial is never copied into browser records.
	const denied = (browserVendorChoice?.denied ?? []).filter(
		(id) => !governed.has(id)
	);
	if (
		browserVendorChoice &&
		denied.length === browserVendorChoice.denied.length
	) {
		return {
			vendorChoice:
				browserVendorChoice.confirmedAt >= actionAt
					? browserVendorChoice
					: {
							confirmedAt: actionAt,
							denied: [...browserVendorChoice.denied],
							version: 1,
						},
			vendorDeclared,
			vendorTimes,
		};
	}
	return {
		vendorChoice: { confirmedAt: actionAt, denied, version: 1 },
		vendorDeclared,
		vendorTimes,
	};
};

/**
 * The state after a bulk action. Unlike lifting the last denial, a bulk
 * action is always stamped once vendors are declared, even over `null` or an
 * already-empty list: a server denial recorded before the visitor pressed
 * accept all, but arriving afterwards, must lose to it in the merge.
 */
const bulkClearedVendorChoice = function bulkClearedVendorChoice(
	snapshot: ConsentSnapshot,
	actionAt: number,
	browserVendorChoice: ConsentSnapshot['vendorChoice']
): VendorChoice | null {
	const source = snapshot.hasAccountLayer
		? browserVendorChoice
		: snapshot.vendorChoice;
	// Nothing declared and nothing denied is not a decision. A retained
	// denial for a vendor no longer declared still clears, or the vendor
	// would come back blocked after the visitor used accept or reject all.
	if (
		(snapshot.vendors?.declared.length ?? 0) === 0 &&
		(source?.denied.length ?? 0) === 0
	) {
		return source;
	}
	if (
		browserVendorChoice !== null &&
		browserVendorChoice.denied.length === 0 &&
		browserVendorChoice.confirmedAt >= actionAt
	) {
		return browserVendorChoice;
	}
	return { confirmedAt: actionAt, denied: [], version: 1 };
};

/** Sorted denial list after applying grants on top of the current one. */
const applyVendorGrants = function applyVendorGrants(
	snapshot: ConsentSnapshot,
	current: readonly string[] | undefined,
	grants: Readonly<Record<string, boolean>> | undefined
): string[] {
	const toggleable = toggleableVendorIds(snapshot);
	const denied = new Set<string>(current);
	for (const [id, granted] of Object.entries(grants ?? {})) {
		if (!toggleable.has(id)) {
			continue;
		}
		if (granted) {
			denied.delete(id);
		} else {
			denied.add(id);
		}
	}
	return [...denied].sort();
};

/**
 * The vendor denial list one save leaves behind.
 *
 * - Under `model === 'iab'` the vendor axis is inert: IAB vendor consent is
 *   authoritative and nothing here changes.
 * - `'all'` and `'none'` clear the list: vendors follow the category, and
 *   any explicit grants or staged draft are ignored. Narrowed to displayed
 *   `categories`, only the denials of vendors those categories govern lift.
 * - Otherwise explicit grants win over the staged vendor draft, applied on
 *   top of the current denials. Ids that are not declared, or are declared
 *   `disabled`, are ignored.
 *
 * Lifting every denial leaves a timestamped empty list, never `null`: `null`
 * means no vendor decision was ever made, and an explicit grant over `null`
 * is a decision too. Explicit grants always take the action time, even for
 * an unchanged list; a staged draft or nothing usable returns the current
 * value, so a no-input save never renews the time.
 */
const resolveVendorSelection = function resolveVendorSelection(
	snapshot: ConsentSnapshot,
	input: SaveInput | undefined,
	explicit: Record<string, boolean> | undefined,
	actionAt: number,
	categories: readonly AllConsentNames[] | undefined,
	browser: Pick<
		BrowserConsentRecords,
		'vendorChoice' | 'vendorDeclared' | 'vendorTimes'
	>
): ResolvedVendorSelection {
	const browserVendorChoice = browser.vendorChoice;
	const current = snapshot.vendorChoice;
	if (!vendorAxisActive(snapshot)) {
		return {
			vendorChoice: browserVendorChoice,
			vendorDeclared: browser.vendorDeclared,
			vendorTimes: browser.vendorTimes,
		};
	}
	const allDeclared = (snapshot.vendors?.declared ?? [])
		.map((vendor) => vendor.id)
		.sort();
	const bulk = input === 'all' || input === 'none';
	if (bulk) {
		if (categories === undefined || coversChoiceScope(snapshot, categories)) {
			const vendorChoice = bulkClearedVendorChoice(
				snapshot,
				actionAt,
				browserVendorChoice
			);
			if (vendorChoice === null) {
				return {
					vendorChoice: null,
					vendorDeclared: browser.vendorDeclared,
					vendorTimes: browser.vendorTimes,
				};
			}
			const existingTimes = resolveBrowserVendorTimes(browser);
			const vendorTimes = advanceVendorTimes(
				existingTimes,
				allDeclared,
				actionAt
			);
			return {
				vendorChoice,
				vendorDeclared: Object.keys(vendorTimes).sort(),
				vendorTimes,
			};
		}
		return scopedBulkVendorChoice(
			snapshot,
			categories,
			input === 'all',
			actionAt,
			browser
		);
	}
	if (explicit === undefined) {
		return {
			vendorChoice: browserVendorChoice,
			vendorDeclared: browser.vendorDeclared,
			vendorTimes: browser.vendorTimes,
		};
	}
	const toggleable = toggleableVendorIds(snapshot);
	const toggledIds = Object.keys(explicit).filter((id) => toggleable.has(id));
	if (toggledIds.length === 0) {
		return {
			vendorChoice: browserVendorChoice,
			vendorDeclared: browser.vendorDeclared,
			vendorTimes: browser.vendorTimes,
		};
	}
	// Declared vendors start from what the visitor sees in the effective view
	// (so an account grant that already overrode an older browser denial stays
	// granted). Undeclared browser denials are kept unless already overridden
	// by the effective view; undeclared account denials stay account-only.
	const declaredIds = new Set(allDeclared);
	const effectiveDenied = new Set<string>(current?.denied);
	const baseDenied = new Set<string>();
	for (const id of effectiveDenied) {
		if (declaredIds.has(id)) {
			baseDenied.add(id);
		}
	}
	for (const id of browserVendorChoice?.denied ?? []) {
		if (!declaredIds.has(id) && effectiveDenied.has(id)) {
			baseDenied.add(id);
		}
	}
	const denied = applyVendorGrants(snapshot, [...baseDenied], explicit);
	const existingTimes = resolveBrowserVendorTimes(browser);
	// Advance only the vendors toggled by this save (keeping older timestamps
	// for other vendors so a single toggle never renews an older browser grant).
	const vendorTimes = advanceVendorTimes(existingTimes, toggledIds, actionAt);
	return {
		vendorChoice: { confirmedAt: actionAt, denied, version: 1 },
		vendorDeclared: [
			...new Set([...denied, ...Object.keys(vendorTimes)]),
		].sort(),
		vendorTimes,
	};
};

const setVendorGrant = (
	grants: Record<string, boolean>,
	id: string,
	value: boolean
): void => {
	Object.defineProperty(grants, id, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
};

const shouldEmitDeclaredVendorWithAccount = (
	id: string,
	denied: ReadonlySet<string>,
	vendorTimes: Readonly<Record<string, number>> | null,
	browserConfirmedAt: number,
	activeAccount: AccountConsentLayer
): boolean => {
	const accountEntry = Object.hasOwn(activeAccount.vendors, id)
		? activeAccount.vendors[id]
		: undefined;
	const perVendorTime =
		vendorTimes !== null && Object.hasOwn(vendorTimes, id)
			? vendorTimes[id]
			: undefined;
	if (denied.has(id)) {
		if (accountEntry?.value === true) {
			const accountAt = accountOrderingTime(
				accountEntry.rawConfirmedAt,
				activeAccount
			);
			return (perVendorTime ?? browserConfirmedAt) >= accountAt;
		}
		return true;
	}
	// Never emit a grant when browser coverage is unknown, when this vendor's
	// browser decision is older than this save's confirmation time, or when a
	// newer/tied account denial overrides it.
	if (perVendorTime === undefined || perVendorTime < browserConfirmedAt) {
		return false;
	}
	if (accountEntry?.value === false) {
		const accountAt = accountOrderingTime(
			accountEntry.rawConfirmedAt,
			activeAccount
		);
		if (accountAt >= perVendorTime) {
			return false;
		}
	}
	return true;
};

const addLiftedBrowserDenials = (
	grants: Record<string, boolean>,
	previous: ConsentSnapshot['vendorChoice'],
	hasAccountLayer: boolean
): void => {
	if (hasAccountLayer || !previous) {
		return;
	}
	for (const id of previous.denied) {
		if (!Object.hasOwn(grants, id)) {
			setVendorGrant(grants, id, true);
		}
	}
};

const vendorChoicePayload = function vendorChoicePayload(
	snapshot: ConsentSnapshot,
	browserAfter: Pick<
		BrowserConsentRecords,
		'vendorChoice' | 'vendorDeclared' | 'vendorTimes'
	>,
	previous: ConsentSnapshot['vendorChoice'],
	activeAccount: AccountConsentLayer | null = null
): SavePayload['vendorChoice'] {
	const browserVendorChoice = browserAfter.vendorChoice;
	const declared = snapshot.vendors?.declared ?? [];
	if (!vendorAxisActive(snapshot) || browserVendorChoice === null) {
		return undefined;
	}
	const denied = new Set(browserVendorChoice.denied);
	const vendorTimes = resolveBrowserVendorTimes(browserAfter);
	const hasAccountLayer = activeAccount !== null;
	const grants: Record<string, boolean> = {};
	for (const vendor of declared) {
		const emit = hasAccountLayer
			? shouldEmitDeclaredVendorWithAccount(
					vendor.id,
					denied,
					vendorTimes,
					browserVendorChoice.confirmedAt,
					activeAccount
				)
			: true;
		if (emit) {
			setVendorGrant(grants, vendor.id, !denied.has(vendor.id));
		}
	}
	for (const id of denied) {
		if (!Object.hasOwn(grants, id)) {
			setVendorGrant(grants, id, false);
		}
	}
	// Without an account layer, a browser-owned denial a bulk action just
	// lifted for a vendor nothing declares travels as `true`. With an account
	// layer, never emit a grant for a vendor that is no longer declared.
	addLiftedBrowserDenials(grants, previous, hasAccountLayer);
	if (hasAccountLayer && Object.keys(grants).length === 0) {
		return undefined;
	}
	return {
		confirmedAt: browserVendorChoice.confirmedAt,
		grants,
		version: 1,
	};
};

/** A save's action time must be a past or present safe integer. */
const isValidSaveActionAt = function isValidSaveActionAt(
	actionAt: number,
	currentTime: number
): boolean {
	return (
		Number.isSafeInteger(actionAt) && actionAt >= 0 && actionAt <= currentTime
	);
};

/**
 * A `none` regime owes no choice: nothing is recorded, written, sent or
 * announced, because permissions are already granted by default. Returns
 * the completed result for that case, or `null` when the save proceeds.
 */
const saveUnderNoneRegime = function saveUnderNoneRegime(
	snapshot: ConsentSnapshot
): SaveResult | null {
	if (snapshot.evaluationPolicy.model !== 'none') {
		return null;
	}
	return { confirmed: [], ok: true, subjectId: snapshot.subject?.subjectId };
};

const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const isIntegerIn = (value: unknown, min: number, max: number): boolean =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value >= min &&
	value <= max;

/**
 * Every index of a list, holes included. `every` skips holes, which would
 * let a sparse list through and hand `undefined` to the IAB gate.
 */
const everyIndex = (
	list: readonly unknown[],
	check: (entry: unknown) => boolean
): boolean => {
	for (let index = 0; index < list.length; index += 1) {
		if (!(index in list && check(list[index]))) {
			return false;
		}
	}
	return true;
};

/** Absent, or a dense list of well-formed TC publisher restrictions. */
const validPublisherRestrictions = function validPublisherRestrictions(
	value: unknown
): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			everyIndex(
				value,
				(restriction) =>
					isRecord(restriction) &&
					isIntegerIn(restriction.purposeId, 1, 63) &&
					isIntegerIn(restriction.restrictionType, 0, 2) &&
					Array.isArray(restriction.vendorIds) &&
					everyIndex(restriction.vendorIds, (id) => isIntegerIn(id, 1, 65_535))
			))
	);
};

const isBooleanMap = (value: unknown): value is Record<string, boolean> =>
	isRecord(value) &&
	Object.values(value).every((entry) => typeof entry === 'boolean');

/** IDs in one section of an AC string, such as `1.10`. */
const additionalConsentIds = (part: string): string[] =>
	part === '' ? [] : part.split('.');

/**
 * Absent, or provider switches and an AC string that stand for the listed
 * providers. Each switch is a provider the preference center lists, and the
 * string discloses exactly those providers, once each. It consents to
 * every provider switched on when the TC string grants each purpose in
 * `AD_TECH_PROVIDER_PURPOSES`, and to none otherwise.
 */
const validAdditionalConsent = function validAdditionalConsent(
	authority: Record<string, unknown>,
	snapshot: ConsentSnapshot
): boolean {
	const { addtlConsent, adTechProviderConsents: switches } = authority;
	if (switches === undefined) {
		return addtlConsent === undefined;
	}
	const listed = new Set(
		(snapshot.iab?.adTechProviders ?? []).map(({ id }) => String(id))
	);
	if (
		!isBooleanMap(switches) ||
		!Object.keys(switches).every((id) => listed.has(id))
	) {
		return false;
	}
	if (addtlConsent === undefined) {
		return Object.keys(switches).length === 0;
	}
	if (
		typeof addtlConsent !== 'string' ||
		!ADDITIONAL_CONSENT_V2_PATTERN.test(addtlConsent)
	) {
		return false;
	}
	const [, consentedPart = '', disclosedPart = ''] = addtlConsent.split('~');
	const consented = additionalConsentIds(consentedPart);
	const disclosed = [
		...consented,
		...additionalConsentIds(disclosedPart.slice(3)),
	];
	const { purposeConsents } = authority;
	const purposesGranted =
		isRecord(purposeConsents) &&
		AD_TECH_PROVIDER_PURPOSES.every(
			(purpose) => purposeConsents[purpose] === true
		);
	const granted = purposesGranted
		? Object.keys(switches).filter((id) => switches[id] === true)
		: [];
	return (
		consented.length === granted.length &&
		consented.every((id) => switches[id] === true) &&
		new Set(disclosed).size === disclosed.length &&
		disclosed.length === Object.keys(switches).length &&
		disclosed.every((id) => Object.hasOwn(switches, id))
	);
};

/** Validate addon metadata before the local action can mutate any state. */
const validSaveAuthority = function validSaveAuthority(
	value: unknown,
	snapshot: ConsentSnapshot,
	actionAt: number,
	now: number
): value is KernelIABAuthority {
	if (!isRecord(value)) {
		return false;
	}
	const authority = value;
	return (
		snapshot.model === 'iab' &&
		snapshot.resolution.status === 'matched' &&
		snapshot.iab?.enabled === true &&
		typeof authority.tcString === 'string' &&
		authority.tcString.length > 0 &&
		authority.choiceFingerprint ===
			snapshot.evaluationPolicy.choice.fingerprint &&
		authority.confirmedAt === actionAt &&
		typeof authority.expiresAt === 'number' &&
		Number.isSafeInteger(authority.expiresAt) &&
		authority.expiresAt > now &&
		authority.expiresAt > actionAt &&
		authority.expiresAt <=
			actionAt +
				Math.min(
					snapshot.evaluationPolicy.choice.maxAgeMs ?? 395 * 86400000,
					395 * 86400000
				) &&
		validPublisherRestrictions(authority.publisherRestrictions) &&
		validAdditionalConsent(authority, snapshot) &&
		[
			authority.vendorConsents,
			authority.vendorLegitimateInterests,
			authority.purposeConsents,
			authority.purposeLegitimateInterests,
			authority.specialFeatureOptIns,
		].every(
			(map) =>
				map !== null &&
				typeof map === 'object' &&
				!Array.isArray(map) &&
				Object.values(map).every((entry) => typeof entry === 'boolean')
		)
	);
};

const applySaveAuthority = function applySaveAuthority(
	patch: SnapshotPatch,
	snapshot: ConsentSnapshot,
	authority?: KernelIABAuthority
): void {
	if (authority && snapshot.iab) {
		patch.iab = {
			...snapshot.iab,
			authority: copyIABAuthority(authority),
			tcString: authority.tcString,
		};
	}
};

/** Merge staged draft values. Invalid values are ignored. */
const mergeDraft = function mergeDraft(
	current: PresentedSelection | null,
	input: Partial<ConsentState>
): PresentedSelection | null {
	const patch = buildDraft(input);
	if (!patch) {
		return current;
	}
	return { ...current, ...patch };
};

/**
 * A staged value bound to the choice contract it was presented under. Read
 * back only while that contract holds: a draft presented under an earlier
 * choice contract is stale once the policy changed materially.
 */
const createBoundDraft = function createBoundDraft<Values>(
	getSnapshot: () => ConsentSnapshot,
	initial: Values | null
) {
	const fingerprint = () => getSnapshot().evaluationPolicy.choice.fingerprint;
	let bound: { fingerprint: string; values: Values } | null = initial
		? { fingerprint: fingerprint(), values: initial }
		: null;
	return {
		get: (): Values | null =>
			bound && bound.fingerprint === fingerprint() ? bound.values : null,
		set(values: Values | null): void {
			bound = values ? { fingerprint: fingerprint(), values } : null;
		},
	};
};

export interface ChoiceRecorderOptions {
	runtime: KernelRuntime;
	/** Takes each recorded action from here on. */
	outbox: Pick<
		SaveOutbox,
		'liftAccountOptOut' | 'send' | 'sendOptOut' | 'sendOptOutLift'
	>;
	/** Draft values staged by config. */
	initialDraft: PresentedSelection | null;
	/** Rights placed on a newly created local opt-out record. */
	defaultOptOutRights?: () => OptOutRight[];
	/** Transport link endpoint, used to link a provisional subject before lifting an account opt-out. */
	transport?: Pick<KernelTransport, 'identify'>;
	/** Provisional subject id accessor from the records boundary. */
	getProvisionalSubject?: () => string | null;
	/** Marks a materialized subject id as recorded once linked. */
	noteRecordedSubject?: (id: string | undefined) => void;
	/** Whether `subjectId` was proven linked to `externalId` in this session. */
	isSubjectLinked?: (subjectId: string | null, externalId: string) => boolean;
	/** Record a proven link between `subjectId` and `externalId` in this session. */
	markSubjectLinked?: (subjectId: string, externalId: string) => void;
}

/**
 * Lift outcome table ("Requested" = the supported rights this lift asked to lift):
 *
 * | Answer            | Requested rights left? | Result            | Account layer                                      | Browser records                        |
 * | ----------------- | ---------------------- | ----------------- | -------------------------------------------------- | -------------------------------------- |
 * | `null`            | —                      | success           | clear opt-out, set `liftedRecordedAt`              | unchanged                              |
 * | `heldBy: 'person'`| no                     | success           | keep answer's remaining person rights, set floor   | unchanged                              |
 * | `heldBy: 'person'`| yes                    | `held-by-account` | unchanged                                          | unchanged                              |
 * | `heldBy: 'both'`  | no                     | success           | clear opt-out, set `liftedRecordedAt`              | unchanged (never copy rights)          |
 * | `heldBy: 'both'`  | yes                    | `held-by-account` | unchanged                                          | unchanged                              |
 * | `heldBy: 'device'`| no                     | success           | clear opt-out, set `liftedRecordedAt`              | adopt answer as this device's opt-out  |
 * | `heldBy: 'device'`| yes                    | `held-by-account` | unchanged                                          | unchanged                              |
 */
const isAccountLiftSucceeded = function isAccountLiftSucceeded(
	answerOptOut: OptOutRecord | null | undefined,
	requestedRights: readonly OptOutRight[] = []
): boolean {
	if (answerOptOut === null) {
		return true;
	}
	if (answerOptOut === undefined) {
		return false;
	}
	const remaining = filterSupportedOptOutRights(answerOptOut.rights);
	if (remaining.length === 0) {
		return true;
	}
	if (requestedRights.length === 0) {
		return false;
	}
	const requestedSet = new Set<string>(requestedRights);
	return !remaining.some((right) => requestedSet.has(right));
};

/**
 * Create the choice recorder of one kernel: `commands.save`,
 * `commands.dismissNotice` and `set.draft`.
 */
// oxlint-disable-next-line max-lines-per-function -- save() keeps the order of one action visible.
export const createChoiceRecorder = function createChoiceRecorder({
	runtime,
	outbox,
	initialDraft,
	defaultOptOutRights = () => [],
	transport,
	getProvisionalSubject,
	noteRecordedSubject,
	isSubjectLinked,
	markSubjectLinked,
}: ChoiceRecorderOptions) {
	const { batch, getSnapshot, commit, emit } = runtime;
	const draft = createBoundDraft<PresentedSelection>(getSnapshot, initialDraft);

	const hasActiveAccountLayer = (before: ConsentSnapshot): boolean => {
		const accountLayer = runtime.getAccountLayer();
		return (
			accountLayer !== null &&
			before.user !== null &&
			accountLayer.externalId === before.user.externalId
		);
	};

	const hasActiveAccountOptOut = (before: ConsentSnapshot): boolean => {
		const accountLayer = runtime.getAccountLayer();
		return (
			accountLayer !== null &&
			accountLayer.optOut !== null &&
			before.user !== null &&
			accountLayer.externalId === before.user.externalId
		);
	};

	const effectiveBrowserOptOutFor = (
		before: ConsentSnapshot,
		browserOptOut: Readonly<OptOutRecord> | null
	): Readonly<OptOutRecord> | null =>
		hasActiveAccountLayer(before) && browserOptOut?.heldBy === 'person'
			? null
			: browserOptOut;

	const captureAccountLiftBasis = (): {
		checkedAt: number | null;
		optOutRaw: number | null;
	} => {
		const layer = runtime.getAccountLayer();
		return {
			checkedAt: layer?.checkedAt ?? null,
			optOutRaw: layer?.optOut?.rawRecordedAt ?? null,
		};
	};

	const isAccountLiftFresh = (
		actVersion: number,
		generation: number,
		externalId: string | null,
		startedBasis: { checkedAt: number | null; optOutRaw: number | null },
		expectedSubjectId?: string | null
	): boolean => {
		const current = getSnapshot();
		const currentLayer = runtime.getAccountLayer();
		const basisMatches =
			startedBasis.checkedAt === null
				? currentLayer === null
				: currentLayer !== null &&
					currentLayer.checkedAt === startedBasis.checkedAt &&
					(currentLayer.optOut?.rawRecordedAt ?? null) ===
						startedBasis.optOutRaw;
		return (
			basisMatches &&
			runtime.getOptOutActVersion() === actVersion &&
			runtime.getGeneration() === generation &&
			(current.user?.externalId ?? null) === externalId &&
			(expectedSubjectId === undefined ||
				(current.subject?.subjectId ?? null) === expectedSubjectId)
		);
	};

	const needsSubjectLinkForLift = (
		before: ConsentSnapshot,
		wasProvisional: boolean
	): boolean => {
		if (!hasActiveAccountOptOut(before)) {
			return false;
		}
		const existingSubjectId = before.subject?.subjectId ?? null;
		const provisional =
			wasProvisional ||
			(existingSubjectId !== null &&
				existingSubjectId === getProvisionalSubject?.());
		const externalId = before.user?.externalId;
		return (
			provisional ||
			existingSubjectId === null ||
			!externalId ||
			!(isSubjectLinked?.(existingSubjectId, externalId) ?? false)
		);
	};

	const hasIdentityTokenForLift = (before: ConsentSnapshot): boolean =>
		Boolean(before.user?.externalId && before.user.identityToken);

	const ensureLinkedSubjectForAccountLift =
		async function ensureLinkedSubjectForAccountLift(
			before: ConsentSnapshot,
			wasProvisional: boolean,
			fence: {
				actVersion: number;
				generation: number;
				startedBasis: { checkedAt: number | null; optOutRaw: number | null };
			}
		): Promise<
			{ ok: true; subjectId: string; hadSubject: boolean } | { ok: false }
		> {
			const existingSubjectId = before.subject?.subjectId ?? null;
			if (hasActiveAccountOptOut(before) && !hasIdentityTokenForLift(before)) {
				return { ok: false };
			}
			if (!needsSubjectLinkForLift(before, wasProvisional)) {
				return {
					hadSubject: existingSubjectId !== null,
					ok: true,
					subjectId: existingSubjectId ?? generateUuidV7(),
				};
			}
			if (!hasIdentityTokenForLift(before) || !transport?.identify) {
				return { ok: false };
			}
			const user = before.user as NonNullable<ConsentSnapshot['user']>;
			const candidateId = existingSubjectId ?? generateUuidV7();
			let linked: Awaited<ReturnType<NonNullable<typeof transport.identify>>>;
			try {
				linked = await transport.identify({ ...user }, candidateId);
			} catch {
				return { ok: false };
			}
			if (
				!isAccountLiftFresh(
					fence.actVersion,
					fence.generation,
					user.externalId,
					fence.startedBasis
				)
			) {
				return { ok: false };
			}
			const linkedId = linked?.subjectId ?? candidateId;
			const current = getSnapshot();
			markSubjectLinked?.(linkedId, user.externalId);
			commit({ subject: saveSubject(current, linkedId) });
			noteRecordedSubject?.(linkedId);
			return { hadSubject: true, ok: true, subjectId: linkedId };
		};

	const applyAccountLiftSuccess = function applyAccountLiftSuccess(
		answerOptOut: OptOutRecord | null | undefined,
		actionAt: number,
		uiSource: SaveUISource | undefined,
		emitLifted: boolean
	): void {
		const current = getSnapshot();
		const activeAccount = runtime.getAccountLayer();
		const at = runtime.now();
		const remaining = answerOptOut
			? filterSupportedOptOutRights(answerOptOut.rights)
			: [];
		const hasActiveAccount =
			activeAccount !== null &&
			current.user !== null &&
			activeAccount.externalId === current.user.externalId;

		let nextAccount:
			| (NonNullable<typeof activeAccount> & {
					appliedAt: number;
					liftedRecordedAt?: number;
			  })
			| undefined;
		let browserOptOutPatch: OptOutRecord | null | undefined;
		let adoptDeviceReceipt = false;

		if (hasActiveAccount) {
			const liftedRecordedAt =
				activeAccount.optOut === null
					? activeAccount.liftedRecordedAt
					: Math.max(
							activeAccount.liftedRecordedAt ?? -1,
							activeAccount.optOut.rawRecordedAt
						);
			const nextAccountOptOut =
				answerOptOut !== null &&
				answerOptOut !== undefined &&
				answerOptOut.heldBy === 'person' &&
				remaining.length > 0
					? {
							method: answerOptOut.method,
							rawRecordedAt: answerOptOut.recordedAt,
							rights: remaining,
						}
					: null;
			nextAccount = {
				...activeAccount,
				appliedAt: Math.max(at, activeAccount.appliedAt + 1),
				optOut: nextAccountOptOut,
			};
			if (liftedRecordedAt !== undefined) {
				nextAccount.liftedRecordedAt = liftedRecordedAt;
			}
			if (
				answerOptOut !== null &&
				answerOptOut !== undefined &&
				answerOptOut.heldBy === 'device' &&
				remaining.length > 0
			) {
				browserOptOutPatch = {
					heldBy: 'device',
					method: answerOptOut.method,
					recordedAt: answerOptOut.recordedAt,
					rights: remaining,
				};
				adoptDeviceReceipt = true;
			}
		} else {
			browserOptOutPatch = null;
		}

		batch(() => {
			runtime.noteOptOutAct();
			runtime.bumpAccountSyncGeneration();
			if (adoptDeviceReceipt) {
				const currentReceipt = runtime.getOptOutReceiptData();
				runtime.setOptOutReceiptData({
					localAct: currentReceipt.localAct,
					reference: currentReceipt.reference,
					rightsConfirmed: true,
				});
			}
			const patch: SnapshotPatch = { now: at };
			if (browserOptOutPatch !== undefined) {
				patch.optOut = browserOptOutPatch;
			}
			commit(
				patch,
				nextAccount === undefined
					? undefined
					: { accountLayer: nextAccount, accountLayerSource: 'stored' }
			);
			const after = getSnapshot();
			if (emitLifted) {
				const event: Extract<KernelEvent, { type: 'opt-out:lifted' }> = {
					actionAt,
					snapshot: after,
					type: 'opt-out:lifted',
				};
				if (uiSource !== undefined) {
					event.uiSource = uiSource;
				}
				emit(event);
			} else {
				emit({
					optOut: after.optOut,
					snapshot: after,
					type: 'opt-out:synced',
				});
			}
		});
	};

	const liftAccountOptOut = async function liftAccountOptOut(
		before: ConsentSnapshot,
		actionAt: number,
		uiSource: SaveUISource | undefined
	): Promise<OptInResult> {
		const actVersion = runtime.getOptOutActVersion();
		const generation = runtime.getGeneration();
		// The lift is the account's that asked: identifying anyone on this
		// subject while it is out makes its answer stale.
		const identity = runtime.getIdentityVersion();
		const externalId = before.user?.externalId ?? null;
		const startedBasis = captureAccountLiftBasis();
		const linked = await ensureLinkedSubjectForAccountLift(before, false, {
			actVersion,
			generation,
			startedBasis,
		});
		if (
			!linked.ok ||
			!isAccountLiftFresh(actVersion, generation, externalId, startedBasis)
		) {
			return { ok: false, reason: 'held-by-account' };
		}
		const liftedRights = filterSupportedOptOutRights(before.optOut?.rights);
		const payload = buildLiftOptOutPayload(
			getSnapshot(),
			linked.subjectId,
			actionAt,
			uiSource,
			liftedRights
		);
		const outcome = await outbox.liftAccountOptOut(payload);
		const expectedSubjectId = linked.hadSubject
			? (outcome.subjectId ?? linked.subjectId)
			: null;
		if (
			!outcome.ok ||
			!isAccountLiftFresh(
				actVersion,
				generation,
				externalId,
				startedBasis,
				expectedSubjectId
			)
		) {
			return { ok: false, reason: 'held-by-account' };
		}
		if (isAccountLiftSucceeded(outcome.optOut, liftedRights)) {
			if (optOutLiftBlocker(getSnapshot()) === 'gpc-active') {
				return { ok: false, reason: 'gpc-active' };
			}
			applyAccountLiftSuccess(outcome.optOut, actionAt, uiSource, true);
			return { ok: true, optOut: null };
		}
		// Failed account-layer lifts leave both account and browser layers unchanged.
		if (runtime.getAccountLayer() === null && outcome.optOut !== undefined) {
			applySyncedOptOut(runtime, outcome.optOut, {
				actVersion,
				allowClear: false,
				externalId,
				generation,
				identity,
				subjectId: expectedSubjectId,
			});
		}
		return { ok: false, reason: 'held-by-account' };
	};

	const prepareSubjectForSaveLift = async function prepareSubjectForSaveLift(
		before: ConsentSnapshot,
		wasProvisional: boolean,
		fence: {
			actVersion: number;
			generation: number;
			startedBasis: { checkedAt: number | null; optOutRaw: number | null };
		}
	): Promise<boolean> {
		if (
			hasActiveAccountOptOut(before) &&
			(!before.user?.externalId || !before.user.identityToken)
		) {
			return false;
		}
		if (transport?.identify) {
			return (
				await ensureLinkedSubjectForAccountLift(before, wasProvisional, fence)
			).ok;
		}
		return (
			!hasActiveAccountOptOut(before) &&
			Boolean(before.user?.externalId && before.user.identityToken)
		);
	};

	const liftAccountOptOutAfterSave = async function liftAccountOptOutAfterSave(
		subjectId: string,
		actionAt: number,
		uiSource: SaveUISource,
		optOutActVersion: number,
		generation: number,
		externalId: string | null,
		wasProvisional: boolean,
		liftedRights: readonly OptOutRight[],
		startedBasis: { checkedAt: number | null; optOutRaw: number | null }
	): Promise<void> {
		if (
			!isAccountLiftFresh(
				optOutActVersion,
				generation,
				externalId,
				startedBasis
			)
		) {
			return;
		}
		const initialSnapshot = getSnapshot();
		if (
			hasActiveAccountOptOut(initialSnapshot) &&
			(!initialSnapshot.user?.externalId || !initialSnapshot.user.identityToken)
		) {
			return;
		}
		// Only an unlinked or provisional subject waits to be linked. A verified
		// linked subject starts the lift in the same tick the save resolves, so
		// the revocation reload sees it as pending.
		if (
			needsSubjectLinkForLift(initialSnapshot, wasProvisional) &&
			!(await prepareSubjectForSaveLift(initialSnapshot, wasProvisional, {
				actVersion: optOutActVersion,
				generation,
				startedBasis,
			}))
		) {
			return;
		}
		if (
			!isAccountLiftFresh(
				optOutActVersion,
				generation,
				externalId,
				startedBasis
			)
		) {
			return;
		}
		const currentBeforeLift = getSnapshot();
		const liftSubjectId = currentBeforeLift.subject?.subjectId ?? subjectId;
		const liftPayload = buildLiftOptOutPayload(
			currentBeforeLift,
			liftSubjectId,
			actionAt,
			uiSource,
			liftedRights
		);
		const outcome = await outbox.liftAccountOptOut(liftPayload);
		const expectedSubjectId = outcome.subjectId ?? liftSubjectId;
		if (
			!outcome.ok ||
			outcome.optOut === undefined ||
			!isAccountLiftFresh(
				optOutActVersion,
				generation,
				externalId,
				startedBasis,
				expectedSubjectId
			)
		) {
			return;
		}
		if (isAccountLiftSucceeded(outcome.optOut, liftedRights)) {
			if (optOutLiftBlocker(getSnapshot()) !== 'gpc-active') {
				applyAccountLiftSuccess(outcome.optOut, actionAt, uiSource, false);
			}
			return;
		}
		// Failed account-layer lifts leave both account and browser layers unchanged.
		if (runtime.getAccountLayer() === null) {
			applySyncedOptOut(runtime, outcome.optOut, {
				actVersion: optOutActVersion,
				allowClear: true,
				externalId,
				generation,
				subjectId: expectedSubjectId,
			});
		}
	};

	return {
		dismissNotice(context?: {
			actionAt?: number;
		}): Promise<NoticeDismissResult> {
			const snapshot = getSnapshot();
			if (snapshot.promptRequirement.kind !== 'notice') {
				return Promise.resolve({ ok: false, reason: 'not-required' });
			}
			// A captured time stands only when it is past or present; a bad one
			// falls back to now, because a dismissal has no issue to report.
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt !== undefined &&
				isValidSaveActionAt(context.actionAt, currentTime)
					? context.actionAt
					: currentTime;
			const dismissal = {
				dismissedAt: actionAt,
				fingerprint: snapshot.evaluationPolicy.notice.fingerprint,
				version: 1 as const,
			};
			// Attributed like a save: the surface is whatever is open, the
			// timing is known only for a shown prompt surface and a forward
			// clock, and the arm is the one the visitor dismissed under. All
			// three are read before `commit()` notifies subscribers, who may
			// reassign the arm or move the surface.
			const {
				experiment,
				uiSource: surface,
				timeToDecisionMs,
			} = saveAttribution(snapshot, undefined, actionAt);
			batch(() => {
				commit({ noticeDismissal: dismissal, now: currentTime });
				const event: Extract<KernelEvent, { type: 'notice:dismissed' }> = {
					dismissal,
					snapshot: getSnapshot(),
					surface,
					type: 'notice:dismissed',
				};
				if (timeToDecisionMs !== undefined) {
					event.timeToDecisionMs = timeToDecisionMs;
				}
				if (experiment) {
					event.experiment = experiment;
				}
				emit(event);
			});
			return Promise.resolve({ dismissal, ok: true });
		},

		draft(input: Partial<ConsentState>): void {
			draft.set(mergeDraft(draft.get(), input));
		},

		async optIn(context?: {
			uiSource?: SaveUISource;
			actionAt?: number;
		}): Promise<OptInResult> {
			const before = getSnapshot();
			if (before.externalPermissions) {
				throw new Error(
					'Consent is owned by an external CMP. Save through that provider.'
				);
			}
			const blocker = optOutLiftBlocker(before);
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt !== undefined &&
				isValidSaveActionAt(context.actionAt, currentTime)
					? context.actionAt
					: currentTime;
			if (blocker === 'held-by-account') {
				return liftAccountOptOut(before, actionAt, context?.uiSource);
			}
			if (blocker !== null) {
				return { ok: false, reason: blocker };
			}
			const subjectId = before.subject?.subjectId ?? generateUuidV7();
			const subject = saveSubject(before, subjectId);
			const { actVersion, after, generation } = batch(() => {
				const nextActVersion = runtime.noteOptOutAct();
				commit({ now: currentTime, optOut: null, subject });
				const committed = getSnapshot();
				const event: Extract<KernelEvent, { type: 'opt-out:lifted' }> = {
					actionAt,
					snapshot: committed,
					type: 'opt-out:lifted',
				};
				if (context?.uiSource !== undefined) {
					event.uiSource = context.uiSource;
				}
				emit(event);
				return {
					actVersion: nextActVersion,
					after: committed,
					generation: runtime.getGeneration(),
				};
			});
			const payload = buildLiftOptOutPayload(
				after,
				subjectId,
				actionAt,
				context?.uiSource
			);
			await outbox.sendOptOutLift(payload, { actVersion, generation });
			return { ok: true, optOut: null };
		},

		async optOut(context?: {
			uiSource?: SaveUISource;
			actionAt?: number;
			rightsControl?: boolean;
		}): Promise<OptOutResult> {
			const before = getSnapshot();
			if (before.externalPermissions) {
				throw new Error(
					'Consent is owned by an external CMP. Save through that provider.'
				);
			}
			if (before.evaluationPolicy.model !== 'opt-out') {
				return { ok: false, reason: 'not-available' };
			}
			emit({ type: 'command:opt-out:started' });
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt !== undefined &&
				isValidSaveActionAt(context.actionAt, currentTime)
					? context.actionAt
					: currentTime;
			const browserBefore = runtime.getBrowserRecords();
			const effectiveBrowserOptOut = effectiveBrowserOptOutFor(
				before,
				browserBefore.optOut
			);
			const nextOptOut = nextButtonOptOutRecord(
				{
					evaluationPolicy: before.evaluationPolicy,
					optOut: effectiveBrowserOptOut,
				},
				actionAt,
				defaultOptOutRights()
			);
			if (nextOptOut === null) {
				const result: OptOutResult = {
					changed: false,
					ok: true,
					optOut: before.optOut as Readonly<OptOutRecord>,
				};
				emit({ result, type: 'command:opt-out:completed' });
				return result;
			}
			const subjectId = before.subject?.subjectId ?? generateUuidV7();
			const subject = saveSubject(before, subjectId);
			const reference = createIdempotencyKey();
			const patch: SnapshotPatch = {
				now: currentTime,
				optOut: nextOptOut,
				subject,
			};
			applyNoticeAcknowledgement(patch, before, actionAt);
			keepRightsSurface(patch, before, context?.rightsControl);
			const { actVersion, after, generation, recorded } = batch(() => {
				const nextActVersion = runtime.noteOptOutAct();
				runtime.setOptOutReceiptData({
					localAct: 'button',
					reference,
					rightsConfirmed: false,
				});
				commit(patch);
				const committed = getSnapshot();
				const optOut = committed.optOut as Readonly<OptOutRecord>;
				const event: Extract<KernelEvent, { type: 'opt-out:recorded' }> = {
					actionAt,
					optOut,
					snapshot: committed,
					type: 'opt-out:recorded',
				};
				if (context?.uiSource !== undefined) {
					event.uiSource = context.uiSource;
				}
				emit(event);
				return {
					actVersion: nextActVersion,
					after: committed,
					generation: runtime.getGeneration(),
					recorded: optOut,
				};
			});
			const payload = buildOptOutPayload(
				after,
				nextOptOut,
				actionAt,
				context?.uiSource,
				reference
			);
			await outbox.sendOptOut(payload, { actVersion, generation });
			const current = getSnapshot().optOut;
			const result: OptOutResult = {
				changed: true,
				ok: true,
				optOut:
					runtime.getOptOutActVersion() === actVersion && current !== null
						? current
						: recorded,
			};
			emit({ result, type: 'command:opt-out:completed' });
			return result;
		},

		// oxlint-disable-next-line complexity -- One action records categories and vendors together in a fixed order.
		async save(
			rawInput?: SaveInput,
			context?: {
				actionAt?: number;
				iabAuthority?: KernelIABAuthority;
				categories?: readonly AllConsentNames[];
				vendors?: Record<string, boolean>;
				uiSource?: SaveUISource;
				rightsControl?: boolean;
			}
		): Promise<SaveResult> {
			if (getSnapshot().externalPermissions) {
				throw new Error(
					'Consent is owned by an external CMP. Save through that provider.'
				);
			}

			// An object input may carry the vendor grants next to the categories.
			// They are split off here so the category validator only sees
			// categories; the context form wins when both are given.
			const { input, vendors: inlineVendors } = splitSaveInput(rawInput);
			const explicitVendors = context?.vendors ?? inlineVendors;
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt === undefined ? currentTime : context.actionAt;
			if (!isValidSaveActionAt(actionAt, currentTime)) {
				return {
					issues: [{ code: 'invalid-timestamp', path: 'actionAt' }],
					ok: false,
				};
			}
			if (
				context?.iabAuthority !== undefined &&
				!validSaveAuthority(
					context.iabAuthority,
					getSnapshot(),
					actionAt,
					currentTime
				)
			) {
				return { ok: false };
			}
			if (explicitVendors !== undefined && !isVendorGrantMap(explicitVendors)) {
				return {
					issues: [{ code: 'invalid-boolean', path: 'vendors' }],
					ok: false,
				};
			}
			emit({ type: 'command:save:started' });

			const before = getSnapshot();
			const browserBefore = runtime.getBrowserRecords();
			const wasProvisionalBeforeSave =
				before.subject?.subjectId === undefined ||
				before.subject.subjectId === getProvisionalSubject?.();
			// Vendor denials resolve before any early return so a vendor-only
			// toggle is recorded even when no category receipt is owed.
			const {
				vendorChoice: nextVendorChoice,
				vendorDeclared: nextVendorDeclared,
				vendorTimes: nextVendorTimes,
			} = resolveVendorSelection(
				before,
				input,
				explicitVendors,
				actionAt,
				context?.categories,
				browserBefore
			);
			const vendorsChanged =
				nextVendorChoice !== browserBefore.vendorChoice ||
				!sameStringArray(nextVendorDeclared, browserBefore.vendorDeclared) ||
				!sameVendorTimesMap(nextVendorTimes, browserBefore.vendorTimes);
			const owedNothing = saveUnderNoneRegime(before);
			if (owedNothing && !vendorsChanged) {
				emit({ result: owedNothing, type: 'command:save:completed' });
				return owedNothing;
			}
			// Captured once, before validation, yield, network or persistence.
			const { uiSource, ...decisionTiming } = saveAttribution(
				before,
				context?.uiSource,
				actionAt
			);
			let consentAction: SavePayload['consentAction'] = 'custom';
			let recorded: ReturnType<typeof recordCategoryPatch>;
			if (owedNothing) {
				// A `none` regime owes no category receipt; only vendors change.
				recorded = {
					choice: browserBefore.choice ?? EMPTY_CHOICE,
					confirmed: [],
					ok: true,
				};
			} else {
				const selection = resolveSaveSelection(
					before,
					draft.get(),
					input,
					context?.categories
				);
				({ consentAction } = selection);
				recorded = recordCategoryPatch(browserBefore.choice, selection.values, {
					actionAt,
					now: currentTime,
					policy: before.evaluationPolicy,
				});
			}
			if (recorded.ok === false) {
				const result: SaveResult = { issues: recorded.issues, ok: false };
				emit({ result, type: 'command:save:completed' });
				return result;
			}
			const categoriesChanged = recorded.confirmed.length > 0;
			// Any action on a choice prompt with nothing to decide acknowledges
			// it, and sends a receipt for strictly necessary alone.
			const acknowledgement = owedNothing
				? null
				: choiceAcknowledgement(
						before,
						actionAt,
						context?.rightsControl === true,
						recorded,
						currentTime
					);
			if (!categoriesChanged && !vendorsChanged && !acknowledgement) {
				// Nothing confirmed: no receipt, no choice event, no request, no write.
				const result: SaveResult = {
					confirmed: [],
					ok: true,
					subjectId: before.subject?.subjectId,
				};
				emit({ result, type: 'command:save:completed' });
				return result;
			}

			const subjectId = before.subject?.subjectId ?? generateUuidV7();
			const subject = saveSubject(before, subjectId);
			draft.set(null);
			const patch: SnapshotPatch = {
				now: currentTime,
				subject,
			};
			const confirmedValue = (
				category: OptionalConsentCategory
			): boolean | undefined =>
				recorded.confirmed.includes(category)
					? recorded.choice.categories[category]?.value
					: undefined;
			const decidingCategory = optOutDecidingCategory(before.evaluationPolicy);
			const grantsDecidingCategory =
				decidingCategory !== null && confirmedValue(decidingCategory) === true;
			const keepsOptOut =
				before.optOut !== null &&
				decidingCategory !== null &&
				confirmedValue(decidingCategory) === false;
			const optOutBlocker = optOutLiftBlocker(before);
			const liftsOptOut = grantsDecidingCategory && optOutBlocker === null;
			const liftsAccountOptOut =
				grantsDecidingCategory && optOutBlocker === 'held-by-account';
			const liftedAccountRights = liftsAccountOptOut
				? filterSupportedOptOutRights(before.optOut?.rights)
				: [];
			const startedAccountLiftBasis = liftsAccountOptOut
				? captureAccountLiftBasis()
				: null;
			const effectiveBrowserOptOut = effectiveBrowserOptOutFor(
				before,
				browserBefore.optOut
			);
			const recordedOptOut = saveRecordsOptOut(
				before.evaluationPolicy,
				confirmedValue,
				effectiveBrowserOptOut !== null
			)
				? nextButtonOptOutRecord(
						{
							evaluationPolicy: before.evaluationPolicy,
							optOut: effectiveBrowserOptOut,
						},
						actionAt,
						defaultOptOutRights()
					)
				: null;
			if (categoriesChanged) {
				patch.explicitChoice = recorded.choice;
			}
			if (liftsOptOut) {
				patch.optOut = null;
			} else if (recordedOptOut !== null) {
				patch.optOut = recordedOptOut;
			}
			if (vendorsChanged) {
				patch.vendorChoice = nextVendorChoice;
			}
			const declaredVendorIds = vendorsChanged ? nextVendorDeclared : undefined;
			const nextBrowserVendorTimes = vendorsChanged
				? nextVendorTimes
				: undefined;
			const acknowledged =
				acknowledgement !== null && acknowledgement !== before.noticeDismissal;
			if (acknowledged) {
				patch.noticeDismissal = acknowledgement;
			}
			applyNoticeAcknowledgement(patch, before, actionAt);
			keepRightsSurface(patch, before, context?.rightsControl);
			applySaveAuthority(patch, before, context?.iabAuthority);
			const recordedOptOutReference =
				recordedOptOut === null ? undefined : createIdempotencyKey();
			// Listeners run when the batch closes, after this action's events
			// are queued: `after` and the events carry this action's snapshot
			// even when a listener records another choice in response.
			// A follow-up account lift belongs to the account that saved.
			const identity = runtime.getIdentityVersion();
			const { after, browserAfter, generation, optOutActVersion } = batch(
				() => {
					const actVersion =
						liftsOptOut || recordedOptOut !== null || keepsOptOut
							? runtime.noteOptOutAct()
							: runtime.getOptOutActVersion();
					if (recordedOptOutReference !== undefined) {
						runtime.setOptOutReceiptData({
							localAct: 'button',
							reference: recordedOptOutReference,
							rightsConfirmed: false,
						});
					}
					commit(
						patch,
						declaredVendorIds === undefined &&
							nextBrowserVendorTimes === undefined
							? undefined
							: {
									vendorDeclared: declaredVendorIds,
									vendorTimes: nextBrowserVendorTimes,
								}
					);
					const committed = getSnapshot();
					const committedBrowser = runtime.getBrowserRecords();
					// Records generation at the moment the action landed. A hydration
					// boundary (storage clear, server record) that replaces the choice
					// afterwards supersedes this action: its outcome must not queue a
					// replay or touch the subject.
					const recordsGeneration = runtime.getGeneration();
					if (categoriesChanged) {
						emit({
							actionAt,
							// Listeners run before the payload below is built. A frozen
							// copy keeps them from changing what this save sends.
							confirmed: Object.freeze([...recorded.confirmed]),
							consentAction,
							snapshot: committed,
							type: 'choice:recorded',
							uiSource,
							...decisionTiming,
						});
					}
					if (liftsOptOut) {
						emit({
							actionAt,
							snapshot: committed,
							type: 'opt-out:lifted',
							uiSource,
						});
					}
					if (recordedOptOut !== null) {
						emit({
							actionAt,
							optOut: committed.optOut as Readonly<OptOutRecord>,
							snapshot: committed,
							type: 'opt-out:recorded',
							uiSource,
						});
					}
					if (vendorsChanged) {
						emit({ actionAt, snapshot: committed, type: 'vendors:recorded' });
					}
					if (acknowledged) {
						// Attributed like the save that recorded it.
						emit({
							dismissal: acknowledgement,
							snapshot: committed,
							surface: uiSource,
							type: 'notice:dismissed',
							...decisionTiming,
						});
					}
					return {
						after: committed,
						browserAfter: committedBrowser,
						generation: recordsGeneration,
						optOutActVersion: actVersion,
					};
				}
			);
			const payload = buildSavePayload(after, {
				actionAt,
				choice: recorded.choice,
				confirmed: recorded.confirmed,
				consentAction,
				subject,
				subjectId,
				timing: decisionTiming,
				uiSource,
			});
			const activeAccountLayer = runtime.getAccountLayer();
			const activeAccountForPayload =
				activeAccountLayer !== null &&
				after.user !== null &&
				activeAccountLayer.externalId === after.user.externalId
					? activeAccountLayer
					: null;
			const vendorChoice = vendorChoicePayload(
				after,
				browserAfter,
				browserBefore.vendorChoice,
				activeAccountForPayload
			);
			if (vendorChoice) {
				payload.vendorChoice = vendorChoice;
			}
			const addtlConsent = after.iab?.authority?.addtlConsent;
			if (payload.tcString && addtlConsent) {
				payload.addtlConsent = addtlConsent;
			}

			if (recordedOptOut !== null) {
				void outbox.sendOptOut(
					buildOptOutPayload(
						after,
						recordedOptOut,
						actionAt,
						uiSource,
						recordedOptOutReference
					),
					{ actVersion: optOutActVersion, generation }
				);
			} else if (liftsOptOut) {
				void outbox.sendOptOutLift(
					buildLiftOptOutPayload(after, subjectId, actionAt, uiSource),
					{ actVersion: optOutActVersion, generation }
				);
			}

			const result = await outbox.send(payload, {
				browserRecords: browserAfter,
				confirmed: recorded.confirmed,
				generation,
				identity,
				optOutActVersion,
				snapshot: after,
			});
			if (
				result.ok &&
				before.user?.externalId &&
				before.user.identityToken &&
				(result as { link?: { stored?: boolean } }).link?.stored === true
			) {
				markSubjectLinked?.(
					result.subjectId ?? subjectId,
					before.user.externalId
				);
			}
			if (
				result.ok &&
				liftsAccountOptOut &&
				startedAccountLiftBasis !== null &&
				runtime.getOptOutActVersion() === optOutActVersion &&
				runtime.getGeneration() === generation &&
				runtime.getIdentityVersion() === identity &&
				optOutLiftBlocker(getSnapshot()) === 'held-by-account'
			) {
				void liftAccountOptOutAfterSave(
					result.subjectId ?? subjectId,
					actionAt,
					uiSource,
					optOutActVersion,
					generation,
					before.user?.externalId ?? null,
					wasProvisionalBeforeSave,
					liftedAccountRights,
					startedAccountLiftBasis
				);
			}
			emit({ result, type: 'command:save:completed' });
			return result;
		},
	};
};
