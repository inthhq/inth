/**
 * Compact split-cookie + localStorage codec and reader for the account
 * consent layer.
 *
 * Three cookies carry the SSR-visible state, each stamped with `externalId`,
 * `checkedAt`, `skew`, `appliedAt`, and a shared revision `r`:
 * - `<key>-acct-c`: compact choices with the shared basis table, raw times,
 *   and optional `expiresAt`
 * - `<key>-acct-v`: denied vendor IDs with raw times
 * - `<key>-acct-o`: person-held opt-out with raw time
 *
 * LocalStorage (`<key>-acct`) holds the full layer (including grants and the
 * full vendor map) under the same revision. Any part whose revision differs
 * from the winning revision is treated as missing. Empty parts are written
 * explicitly so "empty" differs from a failed cookie write.
 *
 * Exempt from the future-timestamp rule in `checkTimestamp()`, like opt-out
 * `recordedAt`.
 *
 * @internal
 */

import { OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';
import type { OptOutMethod, OptOutRight } from '@inth/sdk-schema/types';

import type {
	ChoiceBasis,
	OptionalConsentCategory,
} from '../../consent-record/types';
import {
	isNonEmptyString,
	isPlainRecord,
	ownValue,
} from '../../consent-record/validation';
import {
	isValidAccountTimestamp,
	validateAccountConsentLayer,
} from '../../kernel/account-layer';
import type {
	AccountCategoryDecision,
	AccountConsentLayer,
	AccountOptOutRecord,
	AccountVendorDecision,
} from '../../kernel/account-layer';
import {
	getRawCookieValue,
	readCookieValueFromHeader,
} from '../../libs/cookie';
import type { StorageConfig } from '../../libs/cookie';
import { resolveStorageKeys } from '../../libs/storage-keys';
import { isValidVendorId } from '../../libs/vendors';
import { CATEGORY_CODES, decodeComponent, DIGITS_ONLY } from './record-codec';

const FIELD_SEPARATOR = '&';
const KEY_VALUE_SEPARATOR = '=';
const LIST_SEPARATOR = '|';
const TUPLE_SEPARATOR = '.';
const COMPACT_ACCOUNT_PREFIX = 'v=1';
const REVISION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;

const CODE_TO_CATEGORY: ReadonlyMap<string, OptionalConsentCategory> = new Map(
	Object.entries(CATEGORY_CODES).map(([category, code]) => [
		code,
		category as OptionalConsentCategory,
	])
);

const CODE_TO_RIGHT: ReadonlyMap<string, OptOutRight> = new Map([
	['sa', 'sale'],
	['sh', 'share'],
	['ta', 'targeted_ads'],
]);

const CODE_TO_METHOD: ReadonlyMap<string, OptOutMethod> = new Map([
	['a', 'api'],
	['b', 'button'],
	['g', 'gpc'],
	['p', 'propagated'],
]);

const RIGHT_TO_CODE: Readonly<Record<OptOutRight, string>> = {
	sale: 'sa',
	share: 'sh',
	targeted_ads: 'ta',
};

const METHOD_TO_CODE: Readonly<Record<OptOutMethod, string>> = {
	api: 'a',
	button: 'b',
	gpc: 'g',
	propagated: 'p',
};

const ORDERED_CATEGORY_CODES: readonly (readonly [
	OptionalConsentCategory,
	string,
])[] = [
	['functionality', 'fn'],
	['experience', 'ex'],
	['measurement', 'me'],
	['marketing', 'mk'],
];

/** Shared header stamped on every account cookie and localStorage copy. */
export interface AccountPartHeader {
	readonly rev: string;
	readonly externalId: string;
	readonly checkedAt: number;
	readonly skew: number;
	readonly appliedAt: number;
}

interface DecodedChoicesPart {
	readonly kind: 'choices';
	readonly header: AccountPartHeader;
	readonly choices: Readonly<
		Partial<Record<OptionalConsentCategory, AccountCategoryDecision>>
	>;
}

interface DecodedVendorsPart {
	readonly kind: 'vendors';
	readonly header: AccountPartHeader;
	readonly denied: Readonly<Record<string, AccountVendorDecision>>;
}

interface DecodedOptOutPart {
	readonly kind: 'optOut';
	readonly header: AccountPartHeader;
	readonly optOut: AccountOptOutRecord | null;
}

interface DecodedLocalPart {
	readonly kind: 'local';
	readonly header: AccountPartHeader;
	readonly layer: AccountConsentLayer;
}

type DecodedAccountPart =
	| DecodedChoicesPart
	| DecodedVendorsPart
	| DecodedOptOutPart
	| DecodedLocalPart;

let revisionSequence = 0;

/** Create a short unique revision token shared across one atomic write. */
export const createAccountRevision = function createAccountRevision(
	at: number
): string {
	revisionSequence += 1;
	return `${Math.max(0, Math.floor(at)).toString(36)}.${revisionSequence.toString(36)}`;
};

const field = (key: string, value: string | number): string =>
	`${key}${KEY_VALUE_SEPARATOR}${value}`;

const encodeHeaderFields = (
	layer: AccountConsentLayer,
	rev: string
): string[] => [
	COMPACT_ACCOUNT_PREFIX,
	field('r', rev),
	field('eid', encodeURIComponent(layer.externalId)),
	field('c', layer.checkedAt),
	field('s', layer.skew),
	field('a', layer.appliedAt),
];

const basisKey = (basis: ChoiceBasis): string => {
	if (basis.kind === 'choice-v1') {
		return `c${encodeURIComponent(basis.fingerprint)}`;
	}
	return basis.materialFingerprint === undefined
		? 'l'
		: `l${encodeURIComponent(basis.materialFingerprint)}`;
};

/** Encode the `<key>-acct-c` cookie. Empty choices are written explicitly. */
export const encodeAccountChoicesCookie = function encodeAccountChoicesCookie(
	layer: AccountConsentLayer,
	rev: string
): string {
	const fields = encodeHeaderFields(layer, rev);
	const bases: string[] = [];
	const categoryFields: string[] = [];
	for (const [category, code] of ORDERED_CATEGORY_CODES) {
		const decision = layer.choices[category];
		if (!decision) {
			continue;
		}
		const key = basisKey(decision.basis);
		let index = bases.indexOf(key);
		if (index < 0) {
			index = bases.push(key) - 1;
		}
		const baseTuple = `${decision.value ? '1' : '0'}${TUPLE_SEPARATOR}${decision.rawConfirmedAt}${TUPLE_SEPARATOR}${index}`;
		const tuple =
			decision.value && decision.expiresAt !== undefined
				? `${baseTuple}${TUPLE_SEPARATOR}${decision.expiresAt}`
				: baseTuple;
		categoryFields.push(field(code, tuple));
	}
	if (bases.length > 0) {
		fields.push(field('b', bases.join(LIST_SEPARATOR)));
	}
	fields.push(...categoryFields);
	return fields.join(FIELD_SEPARATOR);
};

/** Encode the `<key>-acct-v` cookie with denied vendor IDs only. */
export const encodeAccountVendorsCookie = function encodeAccountVendorsCookie(
	layer: AccountConsentLayer,
	rev: string
): string {
	const fields = encodeHeaderFields(layer, rev);
	const deniedEntries = Object.keys(layer.vendors)
		.filter((id) => layer.vendors[id]?.value === false)
		.sort()
		.map((id) => {
			const entry = layer.vendors[id] as AccountVendorDecision;
			return `${encodeURIComponent(id)}${TUPLE_SEPARATOR}${entry.rawConfirmedAt}`;
		});
	if (deniedEntries.length > 0) {
		fields.push(field('d', deniedEntries.join(LIST_SEPARATOR)));
	}
	return fields.join(FIELD_SEPARATOR);
};

/** Encode the `<key>-acct-o` cookie. A null opt-out is written explicitly. */
export const encodeAccountOptOutCookie = function encodeAccountOptOutCookie(
	layer: AccountConsentLayer,
	rev: string
): string {
	const fields = encodeHeaderFields(layer, rev);
	const { optOut } = layer;
	if (optOut && optOut.rights.length > 0) {
		const rightSet = new Set(optOut.rights);
		const rights = OPT_OUT_RIGHTS.filter((right) => rightSet.has(right))
			.map((right) => RIGHT_TO_CODE[right])
			.join(LIST_SEPARATOR);
		fields.push(
			field(
				'o',
				`${rights}${TUPLE_SEPARATOR}${METHOD_TO_CODE[optOut.method]}${TUPLE_SEPARATOR}${optOut.rawRecordedAt}`
			)
		);
	}
	return fields.join(FIELD_SEPARATOR);
};

/** Encode the full account layer JSON for localStorage (`<key>-acct`). */
export const encodeAccountLocalJson = function encodeAccountLocalJson(
	layer: AccountConsentLayer,
	rev: string
): string {
	return JSON.stringify({
		appliedAt: layer.appliedAt,
		checkedAt: layer.checkedAt,
		choices: layer.choices,
		externalId: layer.externalId,
		optOut: layer.optOut,
		rev,
		skew: layer.skew,
		vendors: layer.vendors,
		version: 1,
	});
};

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const unwrapCompactText = (
	rawValue: string | null | undefined
): string | null => {
	if (rawValue === null || rawValue === undefined) {
		return null;
	}
	const text = rawValue.trim();
	if (text === '') {
		return null;
	}
	if (text.startsWith('v=')) {
		return text;
	}
	if (text.includes('%')) {
		const unwrapped = decodeComponent(text);
		if (unwrapped !== null && unwrapped.trim().startsWith('v=')) {
			return unwrapped.trim();
		}
	}
	return null;
};

const parseFields = (rawValue: string): Map<string, string> | null => {
	const parts = rawValue.split(FIELD_SEPARATOR);
	if (parts[0] !== COMPACT_ACCOUNT_PREFIX) {
		return null;
	}
	const fields = new Map<string, string>();
	for (const part of parts.slice(1)) {
		const sep = part.indexOf(KEY_VALUE_SEPARATOR);
		if (sep <= 0) {
			return null;
		}
		const key = part.slice(0, sep);
		const value = part.slice(sep + 1);
		if (fields.has(key)) {
			return null;
		}
		fields.set(key, value);
	}
	return fields;
};

const parseNonNegativeInt = (raw: string | undefined): number | null => {
	if (raw === undefined || !DIGITS_ONLY.test(raw)) {
		return null;
	}
	const num = Number(raw);
	return isValidAccountTimestamp(num) ? num : null;
};

const parseHeader = (fields: Map<string, string>): AccountPartHeader | null => {
	const rev = fields.get('r');
	const rawEid = fields.get('eid');
	const checkedAt = parseNonNegativeInt(fields.get('c'));
	const skew = parseNonNegativeInt(fields.get('s'));
	const appliedAt = parseNonNegativeInt(fields.get('a'));
	if (
		!rev ||
		!REVISION_PATTERN.test(rev) ||
		rawEid === undefined ||
		checkedAt === null ||
		skew === null ||
		appliedAt === null
	) {
		return null;
	}
	const externalId = decodeComponent(rawEid);
	if (!externalId || externalId.length === 0) {
		return null;
	}
	return { appliedAt, checkedAt, externalId, rev, skew };
};

const HEADER_KEYS = new Set(['r', 'eid', 'c', 's', 'a']);

const parseBasisTable = (raw: string): ChoiceBasis[] | null => {
	if (raw.length === 0) {
		return null;
	}
	const bases: ChoiceBasis[] = [];
	for (const entry of raw.split(LIST_SEPARATOR)) {
		const kind = entry.charAt(0);
		const encoded = entry.slice(1);
		const fingerprint = encoded.length > 0 ? decodeComponent(encoded) : '';
		if (fingerprint === null) {
			return null;
		}
		if (kind === 'c') {
			if (fingerprint.length === 0) {
				return null;
			}
			bases.push({ fingerprint, kind: 'choice-v1' });
		} else if (kind === 'l') {
			bases.push(
				fingerprint.length === 0
					? { kind: 'legacy-v2' }
					: { kind: 'legacy-v2', materialFingerprint: fingerprint }
			);
		} else {
			return null;
		}
	}
	return bases;
};

const parseAccountChoiceTuple = (
	raw: string,
	bases: readonly ChoiceBasis[]
): AccountCategoryDecision | null => {
	const parts = raw.split(TUPLE_SEPARATOR);
	if (parts.length !== 3 && parts.length !== 4) {
		return null;
	}
	const [rawVal, rawTime, rawIdx, rawExp] = parts;
	if (rawVal !== '0' && rawVal !== '1') {
		return null;
	}
	const rawConfirmedAt = parseNonNegativeInt(rawTime);
	const basisIndex =
		rawIdx !== undefined && DIGITS_ONLY.test(rawIdx) ? Number(rawIdx) : -1;
	const basis = bases[basisIndex];
	if (rawConfirmedAt === null || !basis) {
		return null;
	}
	const value = rawVal === '1';
	if (rawExp === undefined) {
		return { basis, rawConfirmedAt, value };
	}
	const expiresAt = parseNonNegativeInt(rawExp);
	if (expiresAt === null) {
		return null;
	}
	return value
		? { basis, expiresAt, rawConfirmedAt, value }
		: { basis, rawConfirmedAt, value };
};

export const decodeAccountChoicesCookie = function decodeAccountChoicesCookie(
	rawValue: string | null | undefined
): DecodedChoicesPart | null {
	const text = unwrapCompactText(rawValue);
	if (!text) {
		return null;
	}
	const fields = parseFields(text);
	if (!fields) {
		return null;
	}
	const header = parseHeader(fields);
	if (!header) {
		return null;
	}
	const rawBases = fields.get('b');
	const bases = rawBases === undefined ? [] : parseBasisTable(rawBases);
	if (bases === null) {
		return null;
	}
	const choices: Partial<
		Record<OptionalConsentCategory, AccountCategoryDecision>
	> = {};
	for (const [key, value] of fields) {
		if (HEADER_KEYS.has(key) || key === 'b') {
			continue;
		}
		const category = CODE_TO_CATEGORY.get(key);
		if (!category) {
			return null;
		}
		const decision = parseAccountChoiceTuple(value, bases);
		if (!decision) {
			return null;
		}
		choices[category] = decision;
	}
	if (rawBases !== undefined && Object.keys(choices).length === 0) {
		return null;
	}
	return { choices, header, kind: 'choices' };
};

export const decodeAccountVendorsCookie = function decodeAccountVendorsCookie(
	rawValue: string | null | undefined
): DecodedVendorsPart | null {
	const text = unwrapCompactText(rawValue);
	if (!text) {
		return null;
	}
	const fields = parseFields(text);
	if (!fields) {
		return null;
	}
	const header = parseHeader(fields);
	if (!header) {
		return null;
	}
	const denied: Record<string, AccountVendorDecision> = {};
	for (const [key, value] of fields) {
		if (HEADER_KEYS.has(key)) {
			continue;
		}
		if (key !== 'd') {
			return null;
		}
		if (value === '') {
			return null;
		}
		for (const entry of value.split(LIST_SEPARATOR)) {
			const sep = entry.lastIndexOf(TUPLE_SEPARATOR);
			if (sep <= 0) {
				return null;
			}
			const id = decodeComponent(entry.slice(0, sep));
			const rawConfirmedAt = parseNonNegativeInt(entry.slice(sep + 1));
			if (
				!id ||
				!isValidVendorId(id) ||
				rawConfirmedAt === null ||
				Object.hasOwn(denied, id)
			) {
				return null;
			}
			Object.defineProperty(denied, id, {
				configurable: true,
				enumerable: true,
				value: { rawConfirmedAt, value: false },
				writable: true,
			});
		}
	}
	return { denied, header, kind: 'vendors' };
};

const parseOptOutTuple = (raw: string): AccountOptOutRecord | null => {
	const parts = raw.split(TUPLE_SEPARATOR);
	if (parts.length !== 3) {
		return null;
	}
	const [rawRights, rawMethod, rawTime] = parts;
	const method =
		rawMethod === undefined ? undefined : CODE_TO_METHOD.get(rawMethod);
	const rawRecordedAt = parseNonNegativeInt(rawTime);
	if (!rawRights || !method || rawRecordedAt === null) {
		return null;
	}
	const seen = new Set<OptOutRight>();
	for (const code of rawRights.split(LIST_SEPARATOR)) {
		const right = CODE_TO_RIGHT.get(code);
		if (!right || seen.has(right)) {
			return null;
		}
		seen.add(right);
	}
	const rights = OPT_OUT_RIGHTS.filter((right) => seen.has(right));
	return rights.length > 0 ? { method, rawRecordedAt, rights } : null;
};

export const decodeAccountOptOutCookie = function decodeAccountOptOutCookie(
	rawValue: string | null | undefined
): DecodedOptOutPart | null {
	const text = unwrapCompactText(rawValue);
	if (!text) {
		return null;
	}
	const fields = parseFields(text);
	if (!fields) {
		return null;
	}
	const header = parseHeader(fields);
	if (!header) {
		return null;
	}
	let optOut: AccountOptOutRecord | null = null;
	for (const [key, value] of fields) {
		if (HEADER_KEYS.has(key)) {
			continue;
		}
		if (key !== 'o') {
			return null;
		}
		const parsed = parseOptOutTuple(value);
		if (!parsed) {
			return null;
		}
		optOut = parsed;
	}
	return { header, kind: 'optOut', optOut };
};

export const decodeAccountLocalJson = function decodeAccountLocalJson(
	text: string | null | undefined
): DecodedLocalPart | null {
	if (!text) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return null;
	}
	if (!isPlainRecord(parsed) || ownValue(parsed, 'version') !== 1) {
		return null;
	}
	const rev = ownValue(parsed, 'rev');
	if (!isNonEmptyString(rev) || !REVISION_PATTERN.test(rev)) {
		return null;
	}
	const layer = validateAccountConsentLayer(parsed);
	if (!layer) {
		return null;
	}
	return {
		header: {
			appliedAt: layer.appliedAt,
			checkedAt: layer.checkedAt,
			externalId: layer.externalId,
			rev,
			skew: layer.skew,
		},
		kind: 'local',
		layer,
	};
};

// ---------------------------------------------------------------------------
// Revision-coherent assembly
// ---------------------------------------------------------------------------

interface PartGroup {
	readonly header: AccountPartHeader;
	choices?: DecodedChoicesPart;
	vendors?: DecodedVendorsPart;
	optOut?: DecodedOptOutPart;
	local?: DecodedLocalPart;
	count: number;
}

const groupKey = (header: AccountPartHeader): string =>
	`${header.rev}\0${header.externalId}\0${header.checkedAt}\0${header.skew}\0${header.appliedAt}`;

const compareGroups = (left: PartGroup, right: PartGroup): number => {
	if (left.header.checkedAt !== right.header.checkedAt) {
		return left.header.checkedAt - right.header.checkedAt;
	}
	if (left.header.appliedAt !== right.header.appliedAt) {
		return left.header.appliedAt - right.header.appliedAt;
	}
	if (left.count !== right.count) {
		return left.count - right.count;
	}
	return Number(Boolean(left.local)) - Number(Boolean(right.local));
};

const addPartToGroup = function addPartToGroup(
	group: PartGroup,
	part: DecodedAccountPart
): void {
	group.count += 1;
	if (part.kind === 'choices') {
		group.choices = part;
	} else if (part.kind === 'vendors') {
		group.vendors = part;
	} else if (part.kind === 'optOut') {
		group.optOut = part;
	} else {
		group.local = part;
	}
};

const mergeGroupVendors = function mergeGroupVendors(
	group: PartGroup
): Record<string, AccountVendorDecision> {
	const vendors: Record<string, AccountVendorDecision> = group.local
		? { ...group.local.layer.vendors }
		: {};
	if (!group.vendors) {
		return vendors;
	}
	for (const [id, entry] of Object.entries(group.vendors.denied)) {
		if (!Object.hasOwn(vendors, id)) {
			Object.defineProperty(vendors, id, {
				configurable: true,
				enumerable: true,
				value: entry,
				writable: true,
			});
		}
	}
	return vendors;
};

/**
 * Assemble an `AccountConsentLayer` from decoded parts. Parts whose revision
 * differs from the winning group are treated as missing.
 */
export const assembleAccountParts = function assembleAccountParts(
	parts: readonly (DecodedAccountPart | null)[]
): AccountConsentLayer | null {
	const groups = new Map<string, PartGroup>();
	for (const part of parts) {
		if (!part) {
			continue;
		}
		const key = groupKey(part.header);
		let group = groups.get(key);
		if (!group) {
			group = { count: 0, header: part.header };
			groups.set(key, group);
		}
		addPartToGroup(group, part);
	}
	let winner: PartGroup | null = null;
	for (const candidate of groups.values()) {
		if (!winner || compareGroups(candidate, winner) > 0) {
			winner = candidate;
		}
	}
	if (!winner) {
		return null;
	}
	const { appliedAt, checkedAt, externalId, skew } = winner.header;
	const choices = winner.choices?.choices ?? winner.local?.layer.choices ?? {};
	const optOut =
		winner.optOut === undefined
			? (winner.local?.layer.optOut ?? null)
			: winner.optOut.optOut;
	return {
		appliedAt,
		checkedAt,
		choices,
		externalId,
		optOut,
		skew,
		vendors: mergeGroupVendors(winner),
	};
};

const readLocalText = (key: string): string | null => {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage.getItem(key);
		}
	} catch {
		// Blocked storage: cookies still supply the account layer.
	}
	return null;
};

/** Browser read of the stored account consent layer (3 cookies + localStorage). */
export const readStoredAccountLayer = function readStoredAccountLayer(
	config: StorageConfig | undefined
): AccountConsentLayer | null {
	const keys = resolveStorageKeys(config);
	return assembleAccountParts([
		decodeAccountChoicesCookie(getRawCookieValue(keys.accountChoices)),
		decodeAccountVendorsCookie(getRawCookieValue(keys.accountVendors)),
		decodeAccountOptOutCookie(getRawCookieValue(keys.accountOptOut)),
		decodeAccountLocalJson(readLocalText(keys.accountState)),
	]);
};

/** Server read of the stored account consent layer from a request Cookie header. */
export const readStoredAccountLayerFromCookieHeader =
	function readStoredAccountLayerFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined
	): AccountConsentLayer | null {
		const keys = resolveStorageKeys(config);
		return assembleAccountParts([
			decodeAccountChoicesCookie(
				readCookieValueFromHeader(cookieHeader, keys.accountChoices)
			),
			decodeAccountVendorsCookie(
				readCookieValueFromHeader(cookieHeader, keys.accountVendors)
			),
			decodeAccountOptOutCookie(
				readCookieValueFromHeader(cookieHeader, keys.accountOptOut)
			),
		]);
	};
