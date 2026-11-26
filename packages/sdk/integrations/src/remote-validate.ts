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

const isRecord = function isRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const matches = function matches(pattern: string, value: string): boolean {
	return new RegExp(pattern, 'u').test(value);
};

/** Records an issue; returns undefined so a reader can return the call. */
const fail = function fail(issues: string[], message: string): undefined {
	issues.push(message);
	return undefined;
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
	value: unknown
): string[] | undefined {
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
	value: unknown
): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return fail(issues, `'${path}' must be an object`);
	}
	const entries = Object.entries(value);
	if (entries.length > spec.maxEntries) {
		return fail(
			issues,
			`'${path}' must have at most ${spec.maxEntries} entries`
		);
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
		if (spec.kind !== 'object') {
			read = readValue(issues, path, spec, value);
		} else if (isRecord(value)) {
			read = readFields(issues, `${path}.`, spec.fields, value);
		} else {
			fail(issues, `'${path}' must be an object`);
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
	const options = isRecord(input)
		? readFields(issues, '', specs, input)
		: fail(issues, 'options must be an object');
	return options === undefined
		? { issues: issues.map((issue) => `${key}: ${issue}`), ok: false }
		: { ok: true, options };
};
