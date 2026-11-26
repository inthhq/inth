import type {
	RemoteIdListOption,
	RemoteMapOption,
	RemoteNumberOption,
	RemoteOptionSpec,
	RemoteOptionValue,
} from './remote-define';
import { isHostname } from './vendors/_shared/hostname';

export type RemoteOptionsValidation =
	| { ok: true; options: Record<string, RemoteOptionValue> }
	| { ok: false; issues: string[] };

/** A scheme such as `https:` or `javascript:`, or a `//host` reference. */
const URL_VALUE_PATTERN = /^[a-z][a-z\d+.-]*:|\/\//iu;
const MAX_VALUE_LENGTH = 200;
/** The longest DNS name. */
const MAX_HOSTNAME_LENGTH = 253;
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type JsonObject = Record<string, unknown>;

/** Records an issue; returns undefined so a reader can return the call. */
const fail = function fail(issues: string[], message: string): undefined {
	issues.push(message);
	return undefined;
};

const isRecord = function isRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const NOT_PLAIN = Symbol('not plain data');

/**
 * Copies a plain object or array: prototype `Object.prototype` or `null`
 * (`Array.prototype` for an array) and only own enumerable data properties.
 * Values are read from their descriptors, so no getter or proxy trap runs
 * after this; anything else, including a proxy whose traps throw, is
 * `NOT_PLAIN`. A value that is not an object comes back as it is. Shallow:
 * each nested value is checked when its own spec reads it.
 */
const toPlain = function toPlain(value: unknown): unknown {
	if (value === null || typeof value !== 'object') {
		return value;
	}
	try {
		const prototype: unknown = Object.getPrototypeOf(value);
		const list = prototype === Array.prototype && Array.isArray(value);
		if (!list && prototype !== Object.prototype && prototype !== null) {
			return NOT_PLAIN;
		}
		if (Object.getOwnPropertySymbols(value).length > 0) {
			return NOT_PLAIN;
		}
		const entries: [string, unknown][] = [];
		let length: unknown;
		for (const [name, descriptor] of Object.entries(
			Object.getOwnPropertyDescriptors(value)
		)) {
			if (list && name === 'length') {
				length = descriptor.value;
				continue;
			}
			if (!('value' in descriptor) || descriptor.enumerable !== true) {
				return NOT_PLAIN;
			}
			entries.push([name, descriptor.value]);
		}
		if (!list) {
			// fromEntries defines own properties, so no key reaches a prototype.
			return Object.fromEntries(entries);
		}
		// Integer keys come first and in order: a hole or an extra key fails.
		return entries.every(([name], index) => name === String(index)) &&
			entries.length === length
			? entries.map(([, item]) => item)
			: NOT_PLAIN;
	} catch {
		return NOT_PLAIN;
	}
};

/** Reads a plain object, or adds an issue naming `subject`. */
const readRecord = function readRecord(
	issues: string[],
	subject: string,
	value: unknown
): JsonObject | undefined {
	const plain = toPlain(value);
	if (isRecord(plain)) {
		return plain;
	}
	return fail(
		issues,
		`${subject} must be ${plain === NOT_PLAIN ? 'plain data' : 'an object'}`
	);
};

const matches = function matches(pattern: string, value: string): boolean {
	return new RegExp(pattern, 'u').test(value);
};

/**
 * Checks a string value: it is a string, not URL-shaped, and not too long.
 * Returns the string, or undefined after adding an issue.
 */
const readString = function readString(
	issues: string[],
	path: string,
	value: unknown,
	maxLength = MAX_VALUE_LENGTH
): string | undefined {
	if (typeof value !== 'string') {
		return fail(issues, `'${path}' must be a string`);
	}
	if (URL_VALUE_PATTERN.test(value)) {
		return fail(issues, `'${path}' must not be a URL`);
	}
	if (value.length > maxLength) {
		return fail(issues, `'${path}' must be at most ${maxLength} characters`);
	}
	return value;
};

const readNumber = function readNumber(
	issues: string[],
	path: string,
	spec: RemoteNumberOption,
	value: unknown
): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fail(issues, `'${path}' must be a number`);
	}
	if (spec.integer === true && !Number.isInteger(value)) {
		return fail(issues, `'${path}' must be an integer`);
	}
	if (spec.min !== undefined && value < spec.min) {
		return fail(issues, `'${path}' must be at least ${spec.min}`);
	}
	if (spec.max !== undefined && value > spec.max) {
		return fail(issues, `'${path}' must be at most ${spec.max}`);
	}
	return value;
};

const readIdList = function readIdList(
	issues: string[],
	path: string,
	spec: RemoteIdListOption,
	input: unknown
): string[] | undefined {
	const value = toPlain(input);
	if (value === NOT_PLAIN) {
		return fail(issues, `'${path}' must be plain data`);
	}
	if (!Array.isArray(value)) {
		return fail(issues, `'${path}' must be a list of IDs`);
	}
	if (value.length > spec.maxItems) {
		return fail(issues, `'${path}' must have at most ${spec.maxItems} IDs`);
	}
	if (spec.required && value.length === 0) {
		return fail(issues, `'${path}' must have at least one ID`);
	}
	const count = issues.length;
	const ids: string[] = [];
	for (const [index, item] of value.entries()) {
		const itemPath = `${path}[${index}]`;
		const id = readString(issues, itemPath, item);
		if (id === undefined) {
			continue;
		}
		if (!matches(spec.pattern, id)) {
			fail(issues, `'${itemPath}' must match ${spec.pattern}`);
		} else if (ids.includes(id)) {
			fail(issues, `'${itemPath}' repeats '${id}'`);
		} else {
			ids.push(id);
		}
	}
	return issues.length === count ? ids : undefined;
};

const readMap = function readMap(
	issues: string[],
	path: string,
	spec: RemoteMapOption,
	input: unknown
): Record<string, string> | undefined {
	const value = readRecord(issues, `'${path}'`, input);
	if (value === undefined) {
		return undefined;
	}
	const entries = Object.entries(value);
	if (entries.length > spec.maxEntries) {
		return fail(
			issues,
			`'${path}' must have at most ${spec.maxEntries} entries`
		);
	}
	if (spec.required && entries.length === 0) {
		return fail(issues, `'${path}' must have at least one entry`);
	}
	const count = issues.length;
	const result: [string, string][] = [];
	for (const [name, item] of entries) {
		const itemPath = `${path}.${name}`;
		if (PROTOTYPE_KEYS.has(name)) {
			fail(issues, `'${path}' must not have the key '${name}'`);
			continue;
		}
		const key = readString(issues, `${path} key ${name}`, name);
		if (key !== undefined && !matches(spec.keyPattern, key)) {
			fail(issues, `'${path}' key '${name}' must match ${spec.keyPattern}`);
		}
		const mapped = readString(issues, itemPath, item);
		if (mapped !== undefined && !spec.values.includes(mapped)) {
			fail(issues, `'${itemPath}' must be one of ${spec.values.join(', ')}`);
		}
		if (key !== undefined && mapped !== undefined) {
			result.push([key, mapped]);
		}
	}
	// fromEntries defines own properties, so no key reaches a prototype.
	return issues.length === count ? Object.fromEntries(result) : undefined;
};

/** Reads one present value against a spec that is not an object. */
const readValue = function readValue(
	issues: string[],
	path: string,
	spec: Exclude<RemoteOptionSpec, { kind: 'object' }>,
	value: unknown
): RemoteOptionValue | undefined {
	switch (spec.kind) {
		case 'id': {
			const id = readString(issues, path, value);
			if (id !== undefined && !matches(spec.pattern, id)) {
				return fail(issues, `'${path}' must match ${spec.pattern}`);
			}
			return id;
		}
		case 'hostname': {
			const hostname = readString(issues, path, value, MAX_HOSTNAME_LENGTH);
			if (hostname !== undefined && !isHostname(hostname)) {
				return fail(
					issues,
					`'${path}' must be a hostname such as ${spec.example}: lowercase DNS labels with no scheme, port, path or IP address`
				);
			}
			return hostname;
		}
		case 'enum': {
			const choice = readString(issues, path, value);
			if (choice !== undefined && !spec.values.includes(choice)) {
				return fail(
					issues,
					`'${path}' must be one of ${spec.values.join(', ')}`
				);
			}
			return choice;
		}
		case 'boolean': {
			return typeof value === 'boolean'
				? value
				: fail(issues, `'${path}' must be true or false`);
		}
		case 'number': {
			return readNumber(issues, path, spec, value);
		}
		case 'idList': {
			return readIdList(issues, path, spec, value);
		}
		case 'map': {
			return readMap(issues, path, spec, value);
		}
		default: {
			return fail(issues, `'${path}' has an unknown option kind`);
		}
	}
};

/**
 * Reads every declared field of `record`. Unknown keys fail; a missing enum
 * or boolean takes its default; a missing required value fails.
 */
const readFields = function readFields(
	issues: string[],
	prefix: string,
	specs: Readonly<Record<string, RemoteOptionSpec>>,
	record: JsonObject
): Record<string, RemoteOptionValue> | undefined {
	const count = issues.length;
	for (const name of Object.keys(record)) {
		if (!Object.hasOwn(specs, name)) {
			fail(issues, `unknown option '${prefix}${name}'`);
		}
	}

	const result: [string, RemoteOptionValue][] = [];
	for (const [name, spec] of Object.entries(specs)) {
		const path = `${prefix}${name}`;
		const value = Object.hasOwn(record, name) ? record[name] : undefined;
		if (value === undefined) {
			if (spec.kind === 'enum' || spec.kind === 'boolean') {
				result.push([name, spec.default]);
			} else if (spec.required) {
				fail(issues, `'${path}' is required`);
			}
			continue;
		}
		let read: RemoteOptionValue | undefined;
		if (spec.kind === 'object') {
			const fields = readRecord(issues, `'${path}'`, value);
			read = fields && readFields(issues, `${path}.`, spec.fields, fields);
		} else {
			read = readValue(issues, path, spec, value);
		}
		if (read !== undefined) {
			result.push([name, read]);
		}
	}

	return issues.length === count ? Object.fromEntries(result) : undefined;
};

/**
 * Checks `input` against an integration's option specs. On success, the
 * options are new JSON values with defaults filled in; nothing in them is
 * shared with `input`.
 */
export const validateOptionValues = function validateOptionValues(
	key: string,
	specs: Readonly<Record<string, RemoteOptionSpec>>,
	input: unknown
): RemoteOptionsValidation {
	const issues: string[] = [];
	const record = readRecord(issues, 'options', input);
	const options = record && readFields(issues, '', specs, record);
	return options === undefined
		? { issues: issues.map((issue) => `${key}: ${issue}`), ok: false }
		: { ok: true, options };
};
