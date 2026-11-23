/**
 * Storage boundary for consent records.
 *
 * Reads raw stored candidates with their provenance and decodes them into
 * the reviewed per-category receipt model. Reading is what the first
 * banner needs, so this file is in the first load. The writes, which run
 * only when the kernel explicitly asks, are in `writer/store.ts` and load
 * on demand.
 *
 * Read guarantees:
 *
 * - Read-only. No migration, mirroring, deletion, callback or
 *   `Date.now()` on any read path. Callers pass `now`.
 * - Candidates are inspected in a fixed order: the cookie and localStorage
 *   under the configured key, then the same under each legacy family
 *   (`ResolvedStorageKeys.legacy`). The first family with a structurally
 *   valid candidate wins, and within it the cookie. Structural validity is
 *   the only selection criterion: a semantically expired but well-formed
 *   cookie still wins over a fresher localStorage record, so a stale local
 *   copy can never resurrect authority the cookie no longer carries. The
 *   notice dismissal and vendor denials fall back across families the same
 *   way.
 * - Encoding provenance is kept. A v2 compact cookie omitted `false`, so
 *   the legacy normalizer restores `false` for the known legacy universe
 *   only for that encoding; a v2 JSON record keeps absent keys absent.
 *   The raw parsed value is exposed before normalization so callers can
 *   see original coverage.
 * - A versioned envelope is never decoded with the legacy reader, and a
 *   v1.x `id`-only record is rejected as unsupported, not read as v2.
 * - Cookie bytes are recognized by form before any decoding. Percent
 *   sequences inside a raw v2 value are identity bytes, not encoding.
 *
 * @internal
 */

import { OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';

import { normalizeLegacyConsentRecord } from '../../consent-record/normalize';
import type { LegacyRecordEncoding } from '../../consent-record/normalize';
import { unionOptOutCategories } from '../../consent-record/opt-out-rules';
import type {
	CategoryDecision,
	ConsentSubject,
	ExplicitChoice,
} from '../../consent-record/types';
import { isPlainRecord, ownValue } from '../../consent-record/validation';
import {
	expandFlatKeys,
	getRawCookieValue,
	readCookieValueFromHeader,
	stringToFlat,
} from '../../libs/cookie';
import type { StorageConfig } from '../../libs/cookie';
import {
	resolveStorageKeys,
	storageKeyFamilies,
} from '../../libs/storage-keys';
import type { StorageKeyFamily } from '../../libs/storage-keys';
import {
	choiceSinceEpoch,
	noticeSinceEpoch,
	optOutSinceEpoch,
	vendorChoiceSinceEpoch,
} from './epoch';
import {
	decodeClearEpoch,
	decodeComponent,
	decodeNoticeDismissal,
	decodeNoticeDismissalCompact,
	decodeOptOutCategoriesCompact,
	decodeOptOutRecord,
	decodeOptOutRecordCompact,
	decodeStoredConsentEnvelopeCompact,
	decodeVendorChoice,
	decodeVendorChoiceCompact,
	DIGITS_ONLY,
	validateIabMetadata,
	validateStoredConsentEnvelope,
} from './record-codec';
import type {
	DecodeResult,
	StorageIssue,
	StoredConsentEnvelope,
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredOptOutCategories,
	StoredOptOutRecord,
	StoredVendorChoice,
} from './record-codec';

export type { LegacyRecordEncoding as StoredRecordEncoding };

/**
 * Where a candidate was read from: the configured family's cookie or
 * localStorage, or a legacy family's.
 */
export type StoredRecordSource =
	| 'cookie'
	| 'local-storage'
	| 'legacy-cookie'
	| 'legacy-local-storage';

/** Which record format a parsed candidate turned out to be. */
export type StoredRecordFormat = 'legacy-v2' | 'v3';

/** One raw stored value, parsed but not validated or normalized. */
export type RawStoredCandidate =
	| { source: StoredRecordSource; key: string; status: 'absent' }
	| { source: StoredRecordSource; key: string; status: 'unparseable' }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'parsed';
			/** How the bytes were encoded. Drives legacy `false` restoration. */
			encoding: LegacyRecordEncoding;
			/**
			 * Compact v3 cookies are decoded straight into an envelope by the
			 * codec; everything else is the parsed JSON or v2 compact object.
			 */
			format: 'compact-v3' | 'parsed';
			/** Parsed value exactly as stored. Absent keys are still absent. */
			value: unknown;
			/**
			 * Text handed to the decoder: the stored bytes with surrounding
			 * whitespace removed and, only when the bytes matched no known form,
			 * one outer URI-encoding layer unwrapped.
			 */
			rawText: string;
	  };

/** A structurally valid stored record in the reviewed receipt model. */
export interface DecodedStoredConsent {
	source: StoredRecordSource;
	key: string;
	encoding: LegacyRecordEncoding;
	format: StoredRecordFormat;
	choice: ExplicitChoice;
	subject: ConsentSubject | null;
	iab: StoredIabMetadata | null;
	/** Clear epoch the record was written under; `0` for legacy records. */
	epoch: number;
}

export type StoredConsentCandidate =
	| { source: StoredRecordSource; key: string; status: 'absent' }
	| { source: StoredRecordSource; key: string; status: 'unparseable' }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'invalid';
			encoding: LegacyRecordEncoding;
			format: StoredRecordFormat;
			issues: StorageIssue[];
	  }
	| {
			source: StoredRecordSource;
			key: string;
			status: 'valid';
			record: DecodedStoredConsent;
	  };

export interface StoredConsentSelection {
	/** First structurally valid candidate in read order, or `null`. */
	selected: DecodedStoredConsent | null;
	/** Every candidate that was inspected, in read order. */
	candidates: StoredConsentCandidate[];
}

const parseJsonText = function parseJsonText(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
};

const LEGACY_BOOLEAN_MAPS: ReadonlySet<string> = new Set([
	'consents',
	'iabCustomVendorConsents',
	'iabCustomVendorLegitimateInterests',
]);

/**
 * Types one v2 compact leaf by its path instead of by what the text looks
 * like. The generic v2 parser turns `i.eid:12345` into a number and
 * `i.idp:1` into `true`, which then fails identity validation and throws
 * away the whole record. Here only `consentInfo.time` is numeric and only
 * category and vendor flags are booleans; every other leaf stays a string.
 * Unrecognized flag text and non-digit time text are kept verbatim so the
 * legacy normalizer reports them as invalid.
 */
const typeLegacyCompactLeaf = function typeLegacyCompactLeaf(
	path: readonly string[],
	value: string
): unknown {
	const [head, ...rest] = path;
	if (head === 'consentInfo' && rest.length === 1 && rest[0] === 'time') {
		return DIGITS_ONLY.test(value) ? Number(value) : value;
	}
	if (
		head !== undefined &&
		LEGACY_BOOLEAN_MAPS.has(head) &&
		rest.length === 1
	) {
		if (value === '1') {
			return true;
		}
		if (value === '0') {
			return false;
		}
	}
	return value;
};

/**
 * Decodes v2 compact `key:value,key:value` text into the `{ consents,
 * consentInfo, ... }` object the legacy normalizer expects. Nested objects
 * are only created for own keys and any `__proto__` segment drops the
 * entry, so cookie bytes cannot reach the prototype chain.
 */
const decodeLegacyCompact = function decodeLegacyCompact(
	text: string
): Record<string, unknown> | null {
	const expanded = expandFlatKeys(stringToFlat(text));
	const result: Record<string, unknown> = {};
	let leaves = 0;
	for (const [flatKey, value] of Object.entries(expanded)) {
		const path = flatKey.split('.');
		if (path.length === 0 || path.includes('__proto__')) {
			continue;
		}
		let current = result;
		for (const segment of path.slice(0, -1)) {
			const existing = Object.hasOwn(current, segment)
				? current[segment]
				: undefined;
			if (!isPlainRecord(existing)) {
				current[segment] = {};
			}
			current = current[segment] as Record<string, unknown>;
		}
		const leaf = path.at(-1);
		if (leaf === undefined) {
			continue;
		}
		current[leaf] = typeLegacyCompactLeaf(path, value);
		leaves += 1;
	}
	return leaves > 0 ? result : null;
};

type RecognizedCookieForm =
	| { kind: 'versioned'; text: string }
	| { kind: 'json'; text: string }
	| { kind: 'legacy-compact'; text: string };

const VERSION_FIELD_START = /^v=/u;

/**
 * Recognizes the stored bytes without decoding them. Surrounding
 * whitespace is ignored for recognition only.
 *
 * - `v=` at the start is a reserved version field, whatever follows it.
 * - `{` at the start is JSON.
 * - A `:` anywhere is the v2 compact `key:value` marker. The v2 writer
 *   never percent-encodes, so a `%2F` inside a compact or JSON value is
 *   part of the stored identity and must not be decoded away.
 */
const recognizeCookieForm = function recognizeCookieForm(
	value: string
): RecognizedCookieForm | null {
	const text = value.trim();
	if (text.length === 0) {
		return null;
	}
	if (VERSION_FIELD_START.test(text)) {
		return { kind: 'versioned', text };
	}
	if (text.startsWith('{')) {
		return { kind: 'json', text };
	}
	if (text.includes(':')) {
		return { kind: 'legacy-compact', text };
	}
	return null;
};

/**
 * Turns a raw cookie value into a candidate.
 *
 * Recognition is format-aware and happens before any decoding. Only when
 * the bytes match no known form and contain a `%` is one outer layer of
 * URI encoding removed and recognition retried; that single unwrap keeps
 * the component escapes inside a valid v3 cookie intact. Any reserved
 * version field, including a malformed or unknown one, goes to the
 * versioned decoder and never falls through to the legacy parser. JSON
 * objects (JSON whitespace allowed) are `json` encoding; v2 `key:value`
 * text is `compact` and is decoded by path-typed leaves so numeric-looking
 * identifiers stay strings.
 */
export const parseRawCookieCandidate = function parseRawCookieCandidate(
	rawValue: string | null | undefined,
	key: string,
	source: 'cookie' | 'legacy-cookie' = 'cookie'
): RawStoredCandidate {
	if (rawValue === null || rawValue === undefined || rawValue === '') {
		return { key, source, status: 'absent' };
	}
	let form = recognizeCookieForm(rawValue);
	if (!form && rawValue.includes('%')) {
		const unwrapped = decodeComponent(rawValue);
		if (unwrapped !== null) {
			form = recognizeCookieForm(unwrapped);
		}
	}
	if (!form) {
		return { key, source, status: 'unparseable' };
	}
	if (form.kind === 'versioned') {
		return {
			encoding: 'compact',
			format: 'compact-v3',
			key,
			rawText: form.text,
			source,
			status: 'parsed',
			value: undefined,
		};
	}
	if (form.kind === 'json') {
		const value = parseJsonText(form.text);
		if (!isPlainRecord(value)) {
			return { key, source, status: 'unparseable' };
		}
		return {
			encoding: 'json',
			format: 'parsed',
			key,
			rawText: form.text,
			source,
			status: 'parsed',
			value,
		};
	}
	const value = decodeLegacyCompact(form.text);
	if (value === null) {
		return { key, source, status: 'unparseable' };
	}
	return {
		encoding: 'compact',
		format: 'parsed',
		key,
		rawText: form.text,
		source,
		status: 'parsed',
		value,
	};
};

const readLocalStorageText = function readLocalStorageText(
	key: string,
	onUnavailable?: () => void
): string | null {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			return window.localStorage.getItem(key);
		}
	} catch (error) {
		console.warn('Failed to read consent from localStorage:', error);
	}
	onUnavailable?.();
	return null;
};

const parseLocalStorageCandidate = function parseLocalStorageCandidate(
	source: StoredRecordSource,
	key: string,
	onUnavailable?: () => void
): RawStoredCandidate {
	const text = readLocalStorageText(key, onUnavailable);
	if (text === null || text === '') {
		return { key, source, status: 'absent' };
	}
	const value = parseJsonText(text);
	if (!isPlainRecord(value)) {
		return { key, source, status: 'unparseable' };
	}
	return {
		encoding: 'json',
		format: 'parsed',
		key,
		rawText: text,
		source,
		status: 'parsed',
		value,
	};
};

/**
 * Reads every raw candidate in selection order without validating any of
 * them. Nothing is written.
 */
export const readRawStoredConsentCandidates =
	function readRawStoredConsentCandidates(
		config?: StorageConfig,
		onUnavailable?: () => void
	): RawStoredCandidate[] {
		return storageKeyFamilies(resolveStorageKeys(config)).flatMap(
			({ consent }, index) => [
				parseRawCookieCandidate(
					getRawCookieValue(consent, onUnavailable),
					consent,
					index === 0 ? 'cookie' : 'legacy-cookie'
				),
				parseLocalStorageCandidate(
					index === 0 ? 'local-storage' : 'legacy-local-storage',
					consent,
					onUnavailable
				),
			]
		);
	};

/**
 * Reads the cookie candidates from a request `Cookie` header. The server
 * counterpart of {@link readRawStoredConsentCandidates}; there is no
 * localStorage to fall back to.
 */
export const readRawStoredConsentCandidatesFromCookieHeader =
	function readRawStoredConsentCandidatesFromCookieHeader(
		cookieHeader: string | undefined,
		config?: StorageConfig
	): RawStoredCandidate[] {
		return storageKeyFamilies(resolveStorageKeys(config)).map(
			({ consent }, index) =>
				parseRawCookieCandidate(
					readCookieValueFromHeader(cookieHeader, consent),
					consent,
					index === 0 ? 'cookie' : 'legacy-cookie'
				)
		);
	};

const LEGACY_IAB_KEYS = {
	consents: 'iabCustomVendorConsents',
	legitimateInterests: 'iabCustomVendorLegitimateInterests',
} as const;

const decodeLegacyRecord = function decodeLegacyRecord(
	value: unknown,
	encoding: LegacyRecordEncoding,
	now: number
): DecodeResult<Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>> {
	const normalized = normalizeLegacyConsentRecord(value, { encoding, now });
	if (normalized.ok === false) {
		return { issues: normalized.issues, ok: false };
	}
	const issues: StorageIssue[] = [];
	const record = value as Record<string, unknown>;
	const iab = validateIabMetadata(
		ownValue(record, LEGACY_IAB_KEYS.consents),
		ownValue(record, LEGACY_IAB_KEYS.legitimateInterests),
		'iab',
		issues
	);
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return {
		ok: true,
		record: {
			choice: normalized.choice,
			epoch: 0,
			format: 'legacy-v2',
			iab: iab ?? null,
			subject: normalized.subject,
		},
	};
};

const decodeEnvelope = function decodeEnvelope(
	result: DecodeResult<StoredConsentEnvelope>
): DecodeResult<Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>> {
	if (result.ok === false) {
		return result;
	}
	const { record } = result;
	return {
		ok: true,
		record: {
			choice: { categories: record.categories, version: 3 },
			epoch: record.epoch ?? 0,
			format: 'v3',
			iab: record.iab ?? null,
			subject: record.subject ?? null,
		},
	};
};

/**
 * Structurally decodes one raw candidate. A parsed object with an own
 * `version` field is a versioned envelope and never falls through to the
 * legacy reader; anything else is read as a v2 record.
 */
export const decodeStoredConsentCandidate =
	function decodeStoredConsentCandidate(
		candidate: RawStoredCandidate,
		now: number
	): StoredConsentCandidate {
		if (candidate.status !== 'parsed') {
			return candidate;
		}
		const { encoding, key, source } = candidate;
		let format: StoredRecordFormat;
		let result: DecodeResult<
			Omit<DecodedStoredConsent, 'source' | 'key' | 'encoding'>
		>;
		if (candidate.format === 'compact-v3') {
			format = 'v3';
			result = decodeEnvelope(
				decodeStoredConsentEnvelopeCompact(candidate.rawText, now)
			);
		} else if (
			isPlainRecord(candidate.value) &&
			Object.hasOwn(candidate.value, 'version')
		) {
			format = 'v3';
			result = decodeEnvelope(
				validateStoredConsentEnvelope(candidate.value, now)
			);
		} else {
			format = 'legacy-v2';
			result = decodeLegacyRecord(candidate.value, encoding, now);
		}
		if (result.ok === false) {
			return {
				encoding,
				format,
				issues: result.issues,
				key,
				source,
				status: 'invalid',
			};
		}
		return {
			key,
			record: { ...result.record, encoding, key, source },
			source,
			status: 'valid',
		};
	};

/**
 * The categories of `record` still in force under `epoch`: decisions made
 * before the clear are void, and one in the clearing millisecond counts
 * only when the record was written under that epoch.
 */
const categoriesSinceEpoch = function categoriesSinceEpoch(
	record: DecodedStoredConsent,
	epoch: number
): ExplicitChoice['categories'] {
	return (
		choiceSinceEpoch(record.choice, epoch, record.epoch === epoch)
			?.categories ?? {}
	);
};

/**
 * Whether `decision` is a denial newer than `current`. A denial from the
 * same millisecond as a grant counts as newer: two conflicting decisions
 * that cannot be ordered fall back to the restrictive one.
 *
 * @internal
 */
export const isNewerDenial = function isNewerDenial(
	decision: CategoryDecision | undefined,
	current: CategoryDecision | undefined
): decision is CategoryDecision {
	return (
		decision?.value === false &&
		(!current ||
			decision.confirmedAt > current.confirmedAt ||
			(decision.confirmedAt === current.confirmedAt && current.value))
	);
};

/**
 * The cookie record with every newer localStorage denial applied, or the
 * cookie record itself when there is none.
 *
 * The cookie stays authoritative: a well-formed cookie wins even when it is
 * expired, so a stale local copy can never resurrect authority the cookie
 * no longer carries. But a browser can drop a cookie write (over the size
 * limit, say) while localStorage takes it, and then the cookie holds an
 * older choice. A local denial newer than the cookie's decision for that
 * category is therefore applied on top of it; a newer local grant never
 * is, so the result only ever moves toward less permission.
 *
 * When the two were written under different clear epochs, both are first
 * cut to the later one: each side's decisions from before it are void. The
 * same rule then applies, so a later epoch never lets a local grant replace
 * a cookie denial.
 *
 * The subject and IAB metadata come from the copy written under the later
 * epoch. Under the same epoch they come from the cookie, which a server
 * response or a sibling subdomain can rewrite without this origin's
 * localStorage, unless `localIsNewer` shows that the last write here
 * reached localStorage but not the cookie, and the cookie has not changed
 * since.
 */
const withNewerLocalDenials = function withNewerLocalDenials(
	cookie: DecodedStoredConsent,
	local: DecodedStoredConsent,
	localIsNewer: boolean
): DecodedStoredConsent {
	const epoch = Math.max(cookie.epoch, local.epoch);
	const categories = categoriesSinceEpoch(cookie, epoch);
	const cut =
		Object.keys(categories).length !==
		Object.keys(cookie.choice.categories).length;
	let changed = cut || epoch !== cookie.epoch;
	for (const [category, decision] of Object.entries(
		categoriesSinceEpoch(local, epoch)
	)) {
		if (
			isNewerDenial(decision, categories[category as keyof typeof categories])
		) {
			categories[category as keyof typeof categories] = decision;
			changed = true;
		}
	}
	// A copy from before the later epoch never saw that clear, so its
	// identity is void with its decisions.
	const identity =
		local.epoch > cookie.epoch || (local.epoch === epoch && localIsNewer)
			? local
			: cookie;
	if (!changed && identity === cookie) {
		return cookie;
	}
	return {
		...cookie,
		choice: changed ? { categories, version: 3 } : cookie.choice,
		epoch,
		iab: identity.iab,
		subject: identity.subject,
	};
};

/**
 * Decodes candidates and selects one from the first key, in read order,
 * with a valid one. Under that key the cookie wins over localStorage,
 * with the local copy's newer denials applied (see
 * {@link withNewerLocalDenials}); the localStorage record is used alone
 * only when the cookie holds no valid one. Semantic freshness is not
 * consulted here; that belongs to the evaluator with the same `now`.
 * `localIsNewer` tells, for a key, whether the local copy's identity is
 * the newer one (see {@link readStoredConsentRecord}).
 */
export const selectStoredConsent = function selectStoredConsent(
	rawCandidates: readonly RawStoredCandidate[],
	now: number,
	localIsNewer: (key: string) => boolean = () => false
): StoredConsentSelection {
	const candidates: StoredConsentCandidate[] = [];
	const valid = new Map<
		string,
		{ cookie?: DecodedStoredConsent; local?: DecodedStoredConsent }
	>();
	for (const raw of rawCandidates) {
		const candidate = decodeStoredConsentCandidate(raw, now);
		candidates.push(candidate);
		if (candidate.status === 'valid') {
			const stored = valid.get(raw.key) ?? {};
			valid.set(raw.key, stored);
			if (raw.source.endsWith('cookie')) {
				stored.cookie ??= candidate.record;
			} else {
				stored.local ??= candidate.record;
			}
		}
	}
	const [first] = valid;
	if (!first) {
		return { candidates, selected: null };
	}
	const [key, { cookie, local }] = first;
	return {
		candidates,
		selected:
			cookie && local
				? withNewerLocalDenials(cookie, local, localIsNewer(key))
				: (cookie ?? local ?? null),
	};
};

// ---------------------------------------------------------------------------
// Clear epoch: the time of the last clear, kept by the clear itself
// ---------------------------------------------------------------------------

const newerEpoch = function newerEpoch(
	result: DecodeResult<number> | null,
	current: number
): number {
	return result?.ok && result.record > current ? result.record : current;
};

const readRawEpoch = function readRawEpoch(
	text: string | null | undefined,
	now: number
): DecodeResult<number> | null {
	const trimmed = text?.trim();
	return trimmed ? decodeClearEpoch(trimmed, now) : null;
};

/**
 * Reads one family's clear epoch: the newer of the cookie and localStorage
 * copies, or `0` when neither holds a valid one. An unreadable or invalid
 * copy counts as `0`, which voids nothing, so a failed read never turns a
 * stored denial into a grant.
 */
const readEpochOf = function readEpochOf(
	family: Pick<StorageKeyFamily, 'epoch'>,
	now: number,
	onUnavailable?: () => void
): number {
	const fromCookie = readRawEpoch(
		getRawCookieValue(family.epoch, onUnavailable),
		now
	);
	const fromLocal = readRawEpoch(
		readLocalStorageText(family.epoch, onUnavailable),
		now
	);
	return newerEpoch(fromLocal, newerEpoch(fromCookie, 0));
};

const readEpochOfFromCookieHeader = function readEpochOfFromCookieHeader(
	cookieHeader: string | undefined,
	family: Pick<StorageKeyFamily, 'epoch'>,
	now: number
): number {
	return newerEpoch(
		readRawEpoch(readCookieValueFromHeader(cookieHeader, family.epoch), now),
		0
	);
};

/** Reads the configured family's clear epoch (see `readEpochOf`). */
export const readStoredClearEpoch = function readStoredClearEpoch(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): number {
	return readEpochOf(resolveStorageKeys(config), now, onUnavailable);
};

/** The latest clear epoch any legacy family keeps, `0` for none. */
export const readLegacyClearEpoch = function readLegacyClearEpoch(
	config: StorageConfig | undefined,
	now: number
): number {
	return Math.max(
		0,
		...resolveStorageKeys(config).legacy.map((family) =>
			readEpochOf(family, now)
		)
	);
};

export const readStoredClearEpochFromCookieHeader =
	function readStoredClearEpochFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): number {
		return readEpochOfFromCookieHeader(
			cookieHeader,
			resolveStorageKeys(config),
			now
		);
	};

/**
 * `record` as a clear leaves it, or `null` when no decision in it survives.
 * The later of `clearEpoch` and the epoch the record was written under is
 * in force: decisions before it are void, one in the clearing millisecond
 * counts only when the record was written under it, and a record written
 * before it loses its subject and IAB metadata with the cleared history.
 */
export const consentSinceEpoch = function consentSinceEpoch(
	record: DecodedStoredConsent | null,
	clearEpoch: number
): DecodedStoredConsent | null {
	if (!record) {
		return null;
	}
	const epoch = Math.max(clearEpoch, record.epoch);
	const writtenUnder = record.epoch === epoch;
	const choice = choiceSinceEpoch(record.choice, epoch, writtenUnder);
	if (!choice) {
		return null;
	}
	if (writtenUnder) {
		return choice === record.choice ? record : { ...record, choice };
	}
	return { ...record, choice, iab: null, subject: null };
};

/**
 * `selection` with a legacy family's record cut to that family's own clear
 * epoch (`c15t-epoch` for c15t's), which the runtime writing that family
 * keeps. The configured family's epoch applies to every family afterwards
 * (see `composeRecords`); a legacy family's only to its own records, so it
 * never voids a configured-family one.
 */
const withLegacyEpoch = function withLegacyEpoch(
	selection: StoredConsentSelection,
	config: StorageConfig | undefined,
	epochOf: (family: StorageKeyFamily) => number
): StoredConsentSelection {
	const { selected } = selection;
	const family =
		selected &&
		resolveStorageKeys(config).legacy.find(
			(legacy) => legacy.consent === selected.key
		);
	return family
		? { ...selection, selected: consentSinceEpoch(selected, epochOf(family)) }
		: selection;
};

/**
 * Browser read of the cookie and localStorage under the configured key,
 * then under each legacy family. The cookie wins, with newer denials from
 * the localStorage copy under the same key applied (see
 * {@link selectStoredConsent}), and the full candidate report is returned
 * for diagnostics. A server render reads the cookies alone, so the two
 * agree except when the browser dropped a cookie write that carried a
 * denial, where the browser is the stricter of the two. Never writes.
 *
 * The local copy's subject counts as newer only while the marker a
 * dropped cookie write leaves (`<key>-cookie-miss`, see
 * {@link writeStoredConsentEnvelope}) still matches the cookie. Any other
 * cookie change, such as a server-side restoration or a sibling
 * subdomain's save, came after that write.
 */
export const readStoredConsentRecord = function readStoredConsentRecord(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): StoredConsentSelection {
	const misses = new Map(
		storageKeyFamilies(resolveStorageKeys(config)).map((family) => [
			family.consent,
			family.cookieMiss,
		])
	);
	return withLegacyEpoch(
		selectStoredConsent(
			readRawStoredConsentCandidates(config, onUnavailable),
			now,
			(key) => {
				const miss = readLocalStorageText(misses.get(key) ?? '');
				return miss !== null && miss === (getRawCookieValue(key) ?? '');
			}
		),
		config,
		(family) => readEpochOf(family, now)
	);
};

/**
 * Server read from a request `Cookie` header. Same decoding as the
 * browser cookie candidates, so SSR and hydration agree on the record.
 */
export const readStoredConsentRecordFromCookieHeader =
	function readStoredConsentRecordFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): StoredConsentSelection {
		return withLegacyEpoch(
			selectStoredConsent(
				readRawStoredConsentCandidatesFromCookieHeader(cookieHeader, config),
				now
			),
			config,
			(family) => readEpochOfFromCookieHeader(cookieHeader, family, now)
		);
	};

/** A record read across families; `legacy` when a legacy family held it. */
export type FamilyRead<RecordType> =
	| (DecodeResult<RecordType> & { legacy?: true })
	| null;

/**
 * The first valid result of `read` across the families `config` reads,
 * configured family first; else the first stored but invalid one, so a
 * caller can report it; else `null`. `read` gets a legacy family's own
 * clear epoch from `epochOf` (see {@link withLegacyEpoch}), and `0` for
 * the configured family, whose epoch the caller applies.
 */
const firstValidAcrossFamilies = function firstValidAcrossFamilies<RecordType>(
	config: StorageConfig | undefined,
	epochOf: (family: StorageKeyFamily) => number,
	read: (
		family: StorageKeyFamily,
		legacyEpoch: number
	) => DecodeResult<RecordType> | null
): FamilyRead<RecordType> {
	let first: DecodeResult<RecordType> | null = null;
	for (const [index, family] of storageKeyFamilies(
		resolveStorageKeys(config)
	).entries()) {
		const result = read(family, index === 0 ? 0 : epochOf(family));
		if (result?.ok) {
			return index === 0 ? result : { ...result, legacy: true };
		}
		first ??= result;
	}
	return first;
};

// ---------------------------------------------------------------------------
// Auxiliary records: notice dismissal
//
// Each lives under its own localStorage key and has a compact cookie
// projection under the same name so a server render can read it from the
// request. The cookie is read first, then localStorage, mirroring the
// consent record order. Neither is ever written during hydration.
// ---------------------------------------------------------------------------

const readLocalJson = function readLocalJson<RecordType>(
	key: string,
	decode: (value: unknown) => DecodeResult<RecordType>,
	onUnavailable?: () => void
): DecodeResult<RecordType> | null {
	const text = readLocalStorageText(key, onUnavailable);
	if (text === null || text === '') {
		return null;
	}
	const value = parseJsonText(text);
	if (value === undefined) {
		return {
			issues: [{ code: 'malformed-encoding', path: '' }],
			ok: false,
		};
	}
	return decode(value);
};

const readCompactCookie = function readCompactCookie<RecordType>(
	rawValue: string | null | undefined,
	decode: (text: string) => DecodeResult<RecordType>
): DecodeResult<RecordType> | null {
	if (rawValue === null || rawValue === undefined) {
		return null;
	}
	const text = rawValue.trim();
	if (text === '') {
		return null;
	}
	if (text.startsWith('v=')) {
		return decode(text);
	}
	if (text.includes('%')) {
		const unwrapped = decodeComponent(text);
		if (unwrapped !== null && unwrapped.trim().startsWith('v=')) {
			return decode(unwrapped.trim());
		}
	}
	return { issues: [{ code: 'malformed-encoding', path: '' }], ok: false };
};

/** Attach identity only while its matching acknowledgement is still present. */
const noticeWithSubjectCookie = function noticeWithSubjectCookie(
	notice: DecodeResult<StoredNoticeDismissal> | null,
	rawSubject: string | null | undefined,
	now: number
): DecodeResult<StoredNoticeDismissal> | null {
	if (!notice?.ok) {
		return notice;
	}
	const subject = readCompactCookie(rawSubject, (text) =>
		decodeNoticeDismissalCompact(text, now)
	);
	if (
		subject?.ok &&
		subject.record.subject &&
		subject.record.dismissedAt === notice.record.dismissedAt &&
		subject.record.fingerprint === notice.record.fingerprint
	) {
		return {
			ok: true,
			record: { ...notice.record, subject: subject.record.subject },
		};
	}
	return notice;
};

/** The read, or `null` when it holds a dismissal made before `epoch`. */
const noticeSince = function noticeSince(
	read: DecodeResult<StoredNoticeDismissal> | null,
	epoch: number
): DecodeResult<StoredNoticeDismissal> | null {
	return read?.ok && !noticeSinceEpoch(read.record, epoch) ? null : read;
};

/**
 * Reads one family's notice dismissal from its cookie projection and its
 * localStorage copy. When both are valid the newer dismissal wins, the
 * cookie on a tie; otherwise the valid one is used. An invalid record is
 * reported, not silently treated as absent.
 */
const readNoticeDismissalOf = function readNoticeDismissalOf(
	keys: StorageKeyFamily,
	now: number,
	onUnavailable?: () => void
): DecodeResult<StoredNoticeDismissal> | null {
	const fromCookie = noticeWithSubjectCookie(
		readCompactCookie(getRawCookieValue(keys.notice, onUnavailable), (text) =>
			decodeNoticeDismissalCompact(text, now)
		),
		getRawCookieValue(keys.noticeSubject, onUnavailable),
		now
	);
	const fromLocal = readLocalJson(
		keys.notice,
		(value) => decodeNoticeDismissal(value, now),
		onUnavailable
	);
	// A dismissal only hides the notice for the fingerprint it names, which
	// the evaluator checks, and it never grants a category.
	if (fromCookie?.ok && fromLocal?.ok) {
		if (fromLocal.record.dismissedAt > fromCookie.record.dismissedAt) {
			return fromLocal;
		}
		// Prefer a local identity rewrite only while both cookie projections
		// still match the values observed when that write was dropped. A later
		// server or sibling-subdomain cookie rewrite supersedes the marker.
		if (
			fromLocal.record.dismissedAt === fromCookie.record.dismissedAt &&
			fromLocal.record.fingerprint === fromCookie.record.fingerprint &&
			readLocalStorageText(keys.noticeCookieMiss) ===
				JSON.stringify([
					getRawCookieValue(keys.notice) ?? '',
					getRawCookieValue(keys.noticeSubject) ?? '',
				])
		) {
			return fromLocal;
		}
		return fromCookie;
	}
	if (fromCookie?.ok) {
		return fromCookie;
	}
	return fromLocal ?? fromCookie;
};

/**
 * Reads the local notice dismissal (see `readNoticeDismissalOf`). A legacy
 * family is read only while the families before it hold no valid
 * dismissal. `null` when nothing is stored; an invalid record is reported
 * so callers can log it while still deriving `missing`.
 */
export const readStoredNoticeDismissal = function readStoredNoticeDismissal(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void
): FamilyRead<StoredNoticeDismissal> {
	return firstValidAcrossFamilies(
		config,
		(family) => readEpochOf(family, now),
		(keys, legacyEpoch) =>
			noticeSince(readNoticeDismissalOf(keys, now, onUnavailable), legacyEpoch)
	);
};

export const readStoredNoticeDismissalFromCookieHeader =
	function readStoredNoticeDismissalFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): FamilyRead<StoredNoticeDismissal> {
		return firstValidAcrossFamilies(
			config,
			(family) => readEpochOfFromCookieHeader(cookieHeader, family, now),
			(keys, legacyEpoch) =>
				noticeSince(
					noticeWithSubjectCookie(
						readCompactCookie(
							readCookieValueFromHeader(cookieHeader, keys.notice),
							(text) => decodeNoticeDismissalCompact(text, now)
						),
						readCookieValueFromHeader(cookieHeader, keys.noticeSubject),
						now
					),
					legacyEpoch
				)
		);
	};

// ---------------------------------------------------------------------------
// Auxiliary records: vendor denials
// ---------------------------------------------------------------------------

/** The read, or `null` when it holds a list confirmed before `epoch`. */
const vendorsSince = function vendorsSince(
	read: DecodeResult<StoredVendorChoice> | null,
	epoch: number
): DecodeResult<StoredVendorChoice> | null {
	return read?.ok && !vendorChoiceSinceEpoch(read.record, epoch) ? null : read;
};

/**
 * Reads the vendor denial list from both projections. The two can
 * disagree: a compact cookie that grew past the browser's limit fails to
 * write while localStorage already holds the new list. When the local copy
 * is at least as new, its denials are added to the cookie's and its time
 * and subject are kept; an equal time with different content means the
 * cookie missed the subject rewrite after `subject:resolved`. A denial the
 * cookie holds is never lifted by the local copy, so a dropped cookie write
 * only ever leaves fewer vendors allowed. An older local copy is ignored.
 *
 * Each copy is first cut to the clear epoch: one confirmed before it was
 * cleared and reads as absent, so its denials never merge into a list
 * recorded after the clear. `epoch` defaults to the stored clear epoch; a
 * caller that also knows the consent envelope's epoch passes the later of
 * the two. A legacy family is read only while the families before it hold
 * no valid list, and is cut to its own epoch too. `null` when nothing is
 * stored.
 */
export const readStoredVendorChoice = function readStoredVendorChoice(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void,
	epoch: number = readStoredClearEpoch(config, now)
): FamilyRead<StoredVendorChoice> {
	return firstValidAcrossFamilies(
		config,
		(family) => readEpochOf(family, now),
		(keys, legacyEpoch) => {
			const familyEpoch = Math.max(epoch, legacyEpoch);
			const fromCookie = vendorsSince(
				readCompactCookie(
					getRawCookieValue(keys.vendors, onUnavailable),
					(text) => decodeVendorChoiceCompact(text, now)
				),
				familyEpoch
			);
			const fromLocal = vendorsSince(
				readLocalJson(
					keys.vendors,
					(value) => decodeVendorChoice(value, now),
					onUnavailable
				),
				familyEpoch
			);
			if (fromCookie?.ok && fromLocal?.ok) {
				if (fromLocal.record.confirmedAt < fromCookie.record.confirmedAt) {
					return fromCookie;
				}
				const denied = [
					...new Set([...fromCookie.record.denied, ...fromLocal.record.denied]),
				].sort();
				return { ok: true, record: { ...fromLocal.record, denied } };
			}
			if (fromCookie?.ok) {
				return fromCookie;
			}
			return fromLocal ?? fromCookie;
		}
	);
};

export const readStoredVendorChoiceFromCookieHeader =
	function readStoredVendorChoiceFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): FamilyRead<StoredVendorChoice> {
		return firstValidAcrossFamilies(
			config,
			(family) => readEpochOfFromCookieHeader(cookieHeader, family, now),
			(keys, legacyEpoch) =>
				vendorsSince(
					readCompactCookie(
						readCookieValueFromHeader(cookieHeader, keys.vendors),
						(text) => decodeVendorChoiceCompact(text, now)
					),
					legacyEpoch
				)
		);
	};

// ---------------------------------------------------------------------------
// Auxiliary records: durable opt-out
// ---------------------------------------------------------------------------

/** The read, or `null` when it holds an opt-out recorded before `epoch`. */
const optOutSince = function optOutSince(
	read: DecodeResult<StoredOptOutRecord> | null,
	epoch: number
): DecodeResult<StoredOptOutRecord> | null {
	return read?.ok && !optOutSinceEpoch(read.record, epoch) ? null : read;
};

/**
 * `read` with the categories its act withholds, from every
 * `<key>-opt-out-categories` companion that names the same time and method.
 * A record no companion names keeps its own list, or none (legacy).
 */
const optOutWithCategories = function optOutWithCategories(
	read: DecodeResult<StoredOptOutRecord> | null,
	companions: readonly (DecodeResult<StoredOptOutCategories> | null)[]
): DecodeResult<StoredOptOutRecord> | null {
	if (!read?.ok) {
		return read;
	}
	let { categories } = read.record;
	for (const companion of companions) {
		if (
			companion?.ok &&
			companion.record.recordedAt === read.record.recordedAt &&
			companion.record.method === read.record.method
		) {
			// Both lists are this act's own, so neither stands for legacy.
			categories =
				categories === undefined
					? companion.record.categories
					: unionOptOutCategories(categories, companion.record.categories);
		}
	}
	return categories === read.record.categories
		? read
		: { ok: true, record: { ...read.record, categories } };
};

const readOptOutCategories = function readOptOutCategories(
	raw: string | null | undefined
): DecodeResult<StoredOptOutCategories> | null {
	return readCompactCookie(raw, decodeOptOutCategoriesCompact);
};

/**
 * Reads the durable opt-out record from cookie and localStorage. When both
 * projections are valid, the newer one's act wins; on equal times, rights
 * are unioned in canonical order so a dropped cookie write never loses an
 * opt-out right. Withheld categories are always unioned, so a newer copy
 * never lifts a category an older one withholds. Each copy is cut to the
 * clear epoch first.
 */
export const readStoredOptOutRecord = function readStoredOptOutRecord(
	config: StorageConfig | undefined,
	now: number,
	onUnavailable?: () => void,
	epoch: number = readStoredClearEpoch(config, now)
): FamilyRead<StoredOptOutRecord> {
	return firstValidAcrossFamilies(
		config,
		(family) => readEpochOf(family, now),
		(keys, legacyEpoch) => {
			const familyEpoch = Math.max(epoch, legacyEpoch);
			const companions = [
				readOptOutCategories(
					getRawCookieValue(keys.optOutCategories, onUnavailable)
				),
				readOptOutCategories(
					readLocalStorageText(keys.optOutCategories, onUnavailable)
				),
			];
			const fromCookie = optOutWithCategories(
				optOutSince(
					readCompactCookie(
						getRawCookieValue(keys.optOut, onUnavailable),
						(text) => decodeOptOutRecordCompact(text, now)
					),
					familyEpoch
				),
				companions
			);
			const fromLocal = optOutWithCategories(
				optOutSince(
					readLocalJson(
						keys.optOut,
						(value) => decodeOptOutRecord(value, now),
						onUnavailable
					),
					familyEpoch
				),
				companions
			);
			if (fromCookie?.ok && fromLocal?.ok) {
				const cookieAt = fromCookie.record.recordedAt;
				const localAt = fromLocal.record.recordedAt;
				let { rights } = fromLocal.record;
				if (localAt < cookieAt) {
					({ rights } = fromCookie.record);
				} else if (localAt === cookieAt) {
					const mergedRights = new Set([
						...fromCookie.record.rights,
						...fromLocal.record.rights,
					]);
					rights = OPT_OUT_RIGHTS.filter((right) => mergedRights.has(right));
				}
				// The newer copy's act wins, but neither copy lifts a category
				// the other withholds. A copy without a list is a legacy
				// record, which withholds marketing and measurement, never
				// nothing.
				const newer = localAt < cookieAt ? fromCookie : fromLocal;
				const categories = unionOptOutCategories(
					fromCookie.record.categories,
					fromLocal.record.categories
				);
				const record: StoredOptOutRecord = { ...newer.record, rights };
				if (categories === undefined) {
					delete record.categories;
				} else {
					record.categories = categories;
				}
				return { ok: true, record };
			}
			if (fromCookie?.ok) {
				return fromCookie;
			}
			return fromLocal ?? fromCookie;
		}
	);
};

export const readStoredOptOutRecordFromCookieHeader =
	function readStoredOptOutRecordFromCookieHeader(
		cookieHeader: string | undefined,
		config: StorageConfig | undefined,
		now: number
	): FamilyRead<StoredOptOutRecord> {
		return firstValidAcrossFamilies(
			config,
			(family) => readEpochOfFromCookieHeader(cookieHeader, family, now),
			(keys, legacyEpoch) =>
				optOutWithCategories(
					optOutSince(
						readCompactCookie(
							readCookieValueFromHeader(cookieHeader, keys.optOut),
							(text) => decodeOptOutRecordCompact(text, now)
						),
						legacyEpoch
					),
					[
						readOptOutCategories(
							readCookieValueFromHeader(cookieHeader, keys.optOutCategories)
						),
					]
				)
		);
	};
