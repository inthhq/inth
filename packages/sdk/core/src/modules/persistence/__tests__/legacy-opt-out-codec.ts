/**
 * Test helper: the durable opt-out decoders as the SDK on `main`
 * (`daa5d3854`) ships them, before opt-outs stored their categories. Copied
 * verbatim from `modules/persistence/record-codec.ts` and
 * `consent-record/validation.ts` at that commit; only `export` keywords,
 * names, imports and formatting differ. Tests decode what this SDK stores
 * with them to prove that an older SDK on the same site, or a rollback,
 * still reads the opt-out instead of dropping it. Do not update it to match
 * the current codec.
 */
import {
	OPT_OUT_HOLDERS,
	OPT_OUT_METHODS,
	OPT_OUT_RIGHTS,
} from '@inth/sdk-schema/types';
import type {
	OptOutHolder,
	OptOutMethod,
	OptOutRecord,
	OptOutRight,
} from '@inth/sdk-schema/types';

import {
	isNonEmptyString,
	isPlainRecord,
	ownKeys,
	ownValue,
} from '../../../consent-record/consent-record-validation.model';
import type {
	RecordIssue,
	ValidationResult,
} from '../../../consent-record/consent-record-validation.model';
import type { ConsentSubject } from '../../../consent-record/types';
import type { OptOutLocalAct } from '../../../libs/opt-out-state.model';
import { decodeComponent } from '../record-codec.model';
import type {
	DecodeResult,
	StorageIssue,
	StoredOptOutRecord,
} from '../record-codec.model';

const FIELD_SEPARATOR = '&';
const KEY_VALUE_SEPARATOR = '=';
const LIST_SEPARATOR = '|';
const VERSION_FIELD = 'v';
const DIGITS_ONLY = /^\d+$/u;

const SUBJECT_CODES = {
	externalId: 'eid',
	identityProvider: 'idp',
	subjectId: 'sid',
} as const satisfies Record<keyof ConsentSubject, string>;

const CODE_TO_SUBJECT_KEY: ReadonlyMap<string, keyof ConsentSubject> = new Map(
	Object.entries(SUBJECT_CODES).map(([key, code]) => [
		code,
		key as keyof ConsentSubject,
	])
);

const SUBJECT_KEYS = ['subjectId', 'externalId', 'identityProvider'] as const;

const MAX_DATE_MS = 8_640_000_000_000_000;

const isValidTimestamp = function isValidTimestamp(
	value: unknown
): value is number {
	return (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value <= MAX_DATE_MS
	);
};

const OPT_OUT_KEYS = ['rights', 'method', 'recordedAt', 'heldBy'] as const;
const OPT_OUT_RIGHT_SET: ReadonlySet<string> = new Set(OPT_OUT_RIGHTS);
const OPT_OUT_METHOD_SET: ReadonlySet<string> = new Set(OPT_OUT_METHODS);
const OPT_OUT_HOLDER_SET: ReadonlySet<string> = new Set(OPT_OUT_HOLDERS);

/**
 * Validates a durable opt-out record. Rejects unknown keys, duplicate or
 * unknown rights, unknown methods or holders, and non-integer or negative
 * timestamps. Accepts an empty `rights` list for a local opt-out waiting for
 * the backend's answer. Future timestamps are accepted so a slow device clock
 * never drops a record stamped by the backend. Returns `rights` in canonical
 * order (`sale`, `share`, `targeted_ads`).
 */
const validateOptOutRecord = function validateOptOutRecord(
	input: unknown,
	_now?: number
): ValidationResult<OptOutRecord> {
	if (!isPlainRecord(input)) {
		return { issues: [{ code: 'not-an-object', path: '' }], ok: false };
	}
	const issues: RecordIssue[] = [];
	for (const key of ownKeys(input)) {
		if (!OPT_OUT_KEYS.includes(key as (typeof OPT_OUT_KEYS)[number])) {
			issues.push({ code: 'unknown-key', path: key });
		}
	}
	const rawRights = ownValue(input, 'rights');
	const seenRights = new Set<OptOutRight>();
	if (Array.isArray(rawRights)) {
		for (let index = 0; index < rawRights.length; index += 1) {
			const entry: unknown = index in rawRights ? rawRights[index] : undefined;
			if (
				typeof entry !== 'string' ||
				!OPT_OUT_RIGHT_SET.has(entry) ||
				seenRights.has(entry as OptOutRight)
			) {
				issues.push({ code: 'invalid-value', path: `rights[${index}]` });
				continue;
			}
			seenRights.add(entry as OptOutRight);
		}
	} else {
		issues.push({ code: 'not-an-object', path: 'rights' });
	}
	const method = ownValue(input, 'method');
	if (typeof method !== 'string' || !OPT_OUT_METHOD_SET.has(method)) {
		issues.push({ code: 'invalid-value', path: 'method' });
	}
	const recordedAt = ownValue(input, 'recordedAt');
	if (!isValidTimestamp(recordedAt)) {
		issues.push({ code: 'invalid-timestamp', path: 'recordedAt' });
	}
	const heldBy = ownValue(input, 'heldBy');
	if (typeof heldBy !== 'string' || !OPT_OUT_HOLDER_SET.has(heldBy)) {
		issues.push({ code: 'invalid-value', path: 'heldBy' });
	}
	if (issues.length > 0) {
		return { issues, ok: false };
	}
	return {
		ok: true,
		record: {
			heldBy: heldBy as OptOutHolder,
			method: method as OptOutMethod,
			recordedAt: recordedAt as number,
			rights: OPT_OUT_RIGHTS.filter((right) => seenRights.has(right)),
		},
	};
};

const validateSubject = function validateSubject(
	input: unknown,
	issues: StorageIssue[]
): ConsentSubject | undefined {
	if (input === undefined) {
		return undefined;
	}
	if (!isPlainRecord(input)) {
		issues.push({ code: 'not-an-object', path: 'subject' });
		return undefined;
	}
	const subject: ConsentSubject = {};
	for (const key of ownKeys(input)) {
		if (!SUBJECT_KEYS.includes(key as (typeof SUBJECT_KEYS)[number])) {
			issues.push({ code: 'unknown-key', path: `subject.${key}` });
			continue;
		}
		const value = input[key];
		if (value === undefined) {
			continue;
		}
		if (!isNonEmptyString(value)) {
			issues.push({ code: 'invalid-identifier', path: `subject.${key}` });
			continue;
		}
		subject[key as keyof ConsentSubject] = value;
	}
	return Object.keys(subject).length > 0 ? subject : undefined;
};

/**
 * Reads a compact subject field into `subject`. An empty or undecodable id
 * is an issue.
 *
 * @returns Whether `key` is a subject field.
 */
const readSubjectField = function readSubjectField(
	key: string,
	value: string,
	subject: ConsentSubject,
	issues: StorageIssue[]
): boolean {
	const subjectKey = CODE_TO_SUBJECT_KEY.get(key);
	if (subjectKey) {
		const decoded = decodeComponent(value);
		if (decoded) {
			subject[subjectKey] = decoded;
		} else {
			issues.push({ code: 'invalid-identifier', path: key });
		}
	}
	return subjectKey !== undefined;
};

/**
 * Splits a compact value into its fields after the version field, which
 * must be `prefix`. A malformed or repeated field rejects the whole value.
 */
const parseCompactFields = function parseCompactFields(
	rawValue: string,
	prefix: string,
	issues: StorageIssue[]
): Map<string, string> | null {
	const parts = rawValue.split(FIELD_SEPARATOR);
	if (parts[0] !== prefix) {
		issues.push({ code: 'unsupported-version', path: VERSION_FIELD });
		return null;
	}
	const fields = new Map<string, string>();
	for (const part of parts.slice(1)) {
		const separator = part.indexOf(KEY_VALUE_SEPARATOR);
		if (separator <= 0) {
			issues.push({ code: 'malformed-encoding', path: part });
			return null;
		}
		const key = part.slice(0, separator);
		if (fields.has(key)) {
			issues.push({ code: 'duplicate-key', path: key });
			return null;
		}
		fields.set(key, part.slice(separator + 1));
	}
	return fields;
};

const parseCompactInteger = function parseCompactInteger(
	value: string | undefined
): unknown {
	if (value === undefined || !DIGITS_ONLY.test(value)) {
		return value;
	}
	return Number(value);
};

/** Compact opt-out right codes. The encoder repeats them (`writer/encode.ts`). @internal */
const OPT_OUT_RIGHT_CODES = {
	sale: 'sa',
	share: 'sh',
	targeted_ads: 'ta',
} as const satisfies Record<OptOutRight, string>;

const CODE_TO_OPT_OUT_RIGHT: ReadonlyMap<string, OptOutRight> = new Map(
	Object.entries(OPT_OUT_RIGHT_CODES).map(([right, code]) => [
		code,
		right as OptOutRight,
	])
);

/** Compact opt-out method codes. The encoder repeats them. @internal */
const OPT_OUT_METHOD_CODES = {
	api: 'a',
	button: 'b',
	gpc: 'g',
	propagated: 'p',
} as const satisfies Record<OptOutMethod, string>;

const CODE_TO_OPT_OUT_METHOD: ReadonlyMap<string, OptOutMethod> = new Map(
	Object.entries(OPT_OUT_METHOD_CODES).map(([method, code]) => [
		code,
		method as OptOutMethod,
	])
);

/** Compact opt-out holder codes. The encoder repeats them. @internal */
const OPT_OUT_HOLDER_CODES = {
	both: 'b',
	device: 'd',
	person: 'p',
} as const satisfies Record<OptOutHolder, string>;

const CODE_TO_OPT_OUT_HOLDER: ReadonlyMap<string, OptOutHolder> = new Map(
	Object.entries(OPT_OUT_HOLDER_CODES).map(([holder, code]) => [
		code,
		holder as OptOutHolder,
	])
);

/** Compact opt-out local-act codes. The encoder repeats them. @internal */
const OPT_OUT_LOCAL_ACT_CODES = {
	button: 'b',
	gpc: 'g',
} as const satisfies Record<OptOutLocalAct, string>;

const CODE_TO_OPT_OUT_LOCAL_ACT: ReadonlyMap<string, OptOutLocalAct> = new Map(
	Object.entries(OPT_OUT_LOCAL_ACT_CODES).map(([act, code]) => [
		code,
		act as OptOutLocalAct,
	])
);

// ---------------------------------------------------------------------------
// Durable opt-out record (JSON + compact cookie projection)
// ---------------------------------------------------------------------------

const COMPACT_OPT_OUT_PREFIX = 'v=1';

const OPT_OUT_STORED_KEYS = [
	'version',
	'rights',
	'method',
	'recordedAt',
	'heldBy',
	'subject',
	'gpcReported',
	'reference',
	'localAct',
	'rightsConfirmed',
] as const;

const readOptionalOptOutBoolean = function readOptionalOptOutBoolean(
	input: Record<string, unknown>,
	key: string,
	issues: StorageIssue[]
): boolean {
	const value = ownValue(input, key);
	if (value === undefined) {
		return false;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	issues.push({ code: 'invalid-boolean', path: key });
	return false;
};

const readOptionalOptOutMeta = function readOptionalOptOutMeta(
	input: Record<string, unknown>,
	issues: StorageIssue[]
): {
	gpcReported: boolean;
	localAct: OptOutLocalAct | undefined;
	reference: string | undefined;
	rightsConfirmed: boolean;
} {
	const gpcReported = readOptionalOptOutBoolean(input, 'gpcReported', issues);
	const rightsConfirmed = readOptionalOptOutBoolean(
		input,
		'rightsConfirmed',
		issues
	);
	const rawReference = ownValue(input, 'reference');
	let reference: string | undefined;
	if (rawReference !== undefined) {
		if (isNonEmptyString(rawReference)) {
			reference = rawReference;
		} else {
			issues.push({ code: 'invalid-identifier', path: 'reference' });
		}
	}
	const rawLocalAct = ownValue(input, 'localAct');
	let localAct: OptOutLocalAct | undefined;
	if (rawLocalAct !== undefined) {
		if (rawLocalAct === 'button' || rawLocalAct === 'gpc') {
			localAct = rawLocalAct;
		} else {
			issues.push({ code: 'invalid-value', path: 'localAct' });
		}
	}
	return { gpcReported, localAct, reference, rightsConfirmed };
};

/**
 * Validates a parsed stored opt-out record. Future `recordedAt` timestamps are
 * kept so a slow or rewound device clock never drops a stored opt-out.
 */
export const legacyDecodeOptOutRecord = function legacyDecodeOptOutRecord(
	input: unknown,
	now?: number
): DecodeResult<StoredOptOutRecord> {
	if (!isPlainRecord(input)) {
		return { issues: [{ code: 'not-an-object', path: '' }], ok: false };
	}
	if (ownValue(input, 'version') !== 1) {
		return {
			issues: [{ code: 'unsupported-version', path: 'version' }],
			ok: false,
		};
	}
	const issues: StorageIssue[] = [];
	for (const key of ownKeys(input)) {
		if (
			!OPT_OUT_STORED_KEYS.includes(key as (typeof OPT_OUT_STORED_KEYS)[number])
		) {
			issues.push({ code: 'unknown-key', path: key });
		}
	}
	const subject = validateSubject(ownValue(input, 'subject'), issues);
	const meta = readOptionalOptOutMeta(input, issues);
	const inner = validateOptOutRecord(
		{
			heldBy: ownValue(input, 'heldBy'),
			method: ownValue(input, 'method'),
			recordedAt: ownValue(input, 'recordedAt'),
			rights: ownValue(input, 'rights'),
		},
		now
	);
	if (inner.ok === false) {
		issues.push(...inner.issues);
	}
	if (issues.length > 0 || inner.ok === false) {
		return { issues, ok: false };
	}
	const record: StoredOptOutRecord = {
		...inner.record,
		version: 1,
	};
	if (subject) {
		record.subject = subject;
	}
	if (meta.gpcReported) {
		record.gpcReported = true;
	}
	if (meta.reference) {
		record.reference = meta.reference;
	}
	if (meta.localAct) {
		record.localAct = meta.localAct;
	}
	if (meta.rightsConfirmed) {
		record.rightsConfirmed = true;
	}
	return { ok: true, record };
};

const COMPACT_OPT_OUT_CORE_KEYS = new Set(['r', 'm', 't', 'h']);

const checkCompactOptOutField = function checkCompactOptOutField(
	key: string,
	value: string,
	issues: StorageIssue[]
): void {
	if (key === 'g' || key === 'c') {
		if (value !== '1') {
			issues.push({ code: 'invalid-boolean', path: key });
		}
		return;
	}
	if (key === 'a') {
		if (!CODE_TO_OPT_OUT_LOCAL_ACT.has(value)) {
			issues.push({ code: 'invalid-value', path: key });
		}
		return;
	}
	if (!COMPACT_OPT_OUT_CORE_KEYS.has(key)) {
		issues.push({ code: 'unknown-key', path: key });
	}
};

/** Decodes a compact opt-out cookie through the shared validator. */
export const legacyDecodeOptOutRecordCompact =
	function legacyDecodeOptOutRecordCompact(
		rawValue: string,
		now?: number
	): DecodeResult<StoredOptOutRecord> {
		const issues: StorageIssue[] = [];
		const fields = parseCompactFields(rawValue, COMPACT_OPT_OUT_PREFIX, issues);
		if (!fields) {
			return { issues, ok: false };
		}
		const subject: ConsentSubject = {};
		for (const [key, value] of fields) {
			if (readSubjectField(key, value, subject, issues)) {
				continue;
			}
			checkCompactOptOutField(key, value, issues);
		}
		if (issues.length > 0) {
			return { issues, ok: false };
		}
		const rawRights = fields.get('r');
		let rights: unknown;
		if (rawRights !== undefined) {
			rights =
				rawRights.length > 0
					? rawRights
							.split(LIST_SEPARATOR)
							.map((code) => CODE_TO_OPT_OUT_RIGHT.get(code))
					: [];
		}
		const rawMethod = fields.get('m');
		const rawHolder = fields.get('h');
		const rawLocalAct = fields.get('a');
		const candidate: Record<string, unknown> = {
			heldBy:
				rawHolder === undefined
					? undefined
					: CODE_TO_OPT_OUT_HOLDER.get(rawHolder),
			method:
				rawMethod === undefined
					? undefined
					: CODE_TO_OPT_OUT_METHOD.get(rawMethod),
			recordedAt: parseCompactInteger(fields.get('t')),
			rights,
			version: 1,
		};
		if (Object.keys(subject).length > 0) {
			candidate.subject = subject;
		}
		if (fields.get('g') === '1') {
			candidate.gpcReported = true;
		}
		if (rawLocalAct !== undefined) {
			candidate.localAct = CODE_TO_OPT_OUT_LOCAL_ACT.get(rawLocalAct);
		}
		if (fields.get('c') === '1') {
			candidate.rightsConfirmed = true;
		}
		return legacyDecodeOptOutRecord(candidate, now);
	};
