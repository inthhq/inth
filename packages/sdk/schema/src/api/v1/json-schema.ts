/**
 * What the schemas in `./generated/schemas.ts` use where Valibot checks
 * something other than the backend's JSON Schema does. The generator
 * (`scripts/openapi-to-valibot.ts`) imports these into that file.
 *
 * - Valibot's object, record and variant schemas take an array, a `Date`, a
 *   `Map` or an object with any prototype. A JSON object is plain.
 * - `v.strictObject` lets through a key an object inherits, such as
 *   `toString`, and `v.record` skips `__proto__`, `prototype` and
 *   `constructor` without checking them.
 * - Valibot counts a string's length in UTF-16 units; JSON Schema in code
 *   points.
 * - Valibot has no check for an RFC 3339 date-time or an RFC 3986 URI.
 *
 * @packageDocumentation
 */

import * as v from 'valibot';

const OBJECT_SOURCE = Function.prototype.toString.call(Object);

/**
 * Whether `prototype` is the `Object.prototype` of some realm: the end of its
 * chain, with the built-in `Object` as its constructor. An object made with
 * `Object.create(null)` and used as a prototype is not one.
 */
const isObjectPrototype = function isObjectPrototype(
	prototype: unknown
): boolean {
	if (
		typeof prototype !== 'object' ||
		prototype === null ||
		Object.getPrototypeOf(prototype) !== null
	) {
		return false;
	}
	const constructor: unknown = Object.getOwnPropertyDescriptor(
		prototype,
		'constructor'
	)?.value;
	return (
		typeof constructor === 'function' &&
		constructor.prototype === prototype &&
		Function.prototype.toString.call(constructor) === OBJECT_SOURCE
	);
};

/**
 * Whether `input` is a plain object, as `JSON.parse` makes one: its prototype
 * is `null`, or an `Object.prototype`, from this realm or another, such as
 * the one a test runner's `fetch` builds its answers in.
 */
export const isPlainObject = function isPlainObject(
	input: unknown
): input is Record<string, unknown> {
	if (typeof input !== 'object' || input === null) {
		return false;
	}
	const prototype: unknown = Object.getPrototypeOf(input);
	return (
		prototype === null ||
		prototype === Object.prototype ||
		isObjectPrototype(prototype)
	);
};

/** The shape of an object schema this module reads. */
interface ObjectLike {
	readonly type: string;
	readonly entries: v.ObjectEntries;
}

const NOT_A_JSON_OBJECT = 'Invalid type: Expected a plain object';

/** Refuses anything but a plain object, before the object schema runs. */
const plainObject = <Input>() =>
	v.custom<Input>((input) => isPlainObject(input), NOT_A_JSON_OBJECT);

/**
 * Reports each own key of `input` a strict `schema` does not declare but
 * finds on its entries' prototype, such as `toString`. `v.strictObject`
 * reports every other key it does not declare itself.
 */
const reportInheritedKeys = function reportInheritedKeys(
	schema: ObjectLike,
	input: Record<string, unknown>,
	addIssue: (issue: { message: string; path: [v.ObjectPathItem] }) => void
): void {
	if (schema.type !== 'strict_object') {
		return;
	}
	for (const key of Object.keys(input)) {
		if (key in schema.entries && !Object.hasOwn(schema.entries, key)) {
			addIssue({
				message: `Invalid key: Expected never but received "${key}"`,
				path: [
					{ input, key, origin: 'key', type: 'object', value: input[key] },
				],
			});
		}
	}
};

/**
 * An object schema that takes only a plain object, and, when it is strict,
 * only the keys it declares. `entries` stays readable, to build on.
 */
export const jsonObject = <const Schema extends v.GenericSchema & ObjectLike>(
	schema: Schema
) =>
	Object.assign(
		v.pipe(
			plainObject<v.InferInput<Schema>>(),
			v.rawCheck<v.InferInput<Schema>>(({ dataset, addIssue }) => {
				reportInheritedKeys(
					schema,
					dataset.value as Record<string, unknown>,
					addIssue
				);
			}),
			schema
		),
		{ entries: schema.entries as Schema['entries'] }
	);

/** The shape of a variant schema this module reads. */
interface VariantLike {
	readonly key: string;
	readonly options: readonly (v.GenericSchema & ObjectLike)[];
}

/**
 * A variant schema that takes only a plain object, and only the keys the
 * branch it picks declares, when that branch is strict.
 */
export const jsonVariant = <const Schema extends v.GenericSchema & VariantLike>(
	schema: Schema
) =>
	v.pipe(
		plainObject<v.InferInput<Schema>>(),
		v.rawCheck<v.InferInput<Schema>>(({ dataset, addIssue }) => {
			const input = dataset.value as Record<string, unknown>;
			const picked = schema.options.find((option) =>
				v.is(option.entries[schema.key] as v.GenericSchema, input[schema.key])
			);
			if (picked !== undefined) {
				reportInheritedKeys(picked, input, addIssue);
			}
		}),
		schema
	);

/** The keys `v.record` passes over without checking them. */
const SKIPPED_KEYS = ['__proto__', 'prototype', 'constructor'];

/**
 * A record schema that takes only a plain object, and checks the keys
 * `v.record` passes over. Its output still leaves those keys out. `key` and
 * `value` stay readable, to build on.
 */
export const jsonRecord = <
	const Key extends v.GenericSchema<string, string>,
	const Value extends v.GenericSchema,
>(
	key: Key,
	value: Value
) =>
	Object.assign(
		v.pipe(
			v.custom<v.InferInput<v.RecordSchema<Key, Value, undefined>>>(
				(input) =>
					isPlainObject(input) &&
					SKIPPED_KEYS.every(
						(name) =>
							!Object.hasOwn(input, name) ||
							(v.is(key, name) && v.is(value, input[name]))
					),
				NOT_A_JSON_OBJECT
			),
			v.record(key, value)
		),
		{ key, value }
	);

/** The length of a string as JSON Schema counts it: in code points. */
export const characters = (value: string): number => [...value].length;

const DATE_TIME =
	/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[Tt](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:[Zz]|(?<sign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u;

const daysIn = function daysIn(year: number, month: number): number {
	if (month === 2) {
		const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
		return leap ? 29 : 28;
	}
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/**
 * Whether minute `minuteOfDay` of the day, in UTC, which may fall on the day
 * before or after, is the last minute of a month: when RFC 3339 allows a
 * leap second.
 */
const isLastMinuteOfMonth = function isLastMinuteOfMonth(
	year: number,
	month: number,
	day: number,
	minuteOfDay: number
): boolean {
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	date.setUTCMinutes(minuteOfDay);
	return (
		date.getUTCHours() === 23 &&
		date.getUTCMinutes() === 59 &&
		date.getUTCDate() === daysIn(date.getUTCFullYear(), date.getUTCMonth() + 1)
	);
};

/**
 * Whether `value` is an RFC 3339 date-time: on a day the calendar has, and
 * with a leap second only at 23:59:60 UTC on the last day of a month.
 */
export const isDateTime = function isDateTime(value: string): boolean {
	const groups = DATE_TIME.exec(value)?.groups;
	if (!groups) {
		return false;
	}
	const part = (name: string): number => Number(groups[name] ?? 0);
	const [year, month, day, hour, minute, second] = [
		'year',
		'month',
		'day',
		'hour',
		'minute',
		'second',
	].map(part) as [number, number, number, number, number, number];
	const offsetHour = part('offsetHour');
	const offsetMinute = part('offsetMinute');
	const { sign } = groups;
	const offset =
		sign === undefined
			? 0
			: (sign === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
	const leapSecond =
		second === 60 &&
		isLastMinuteOfMonth(year, month, day, hour * 60 + minute - offset);
	return (
		month >= 1 &&
		month <= 12 &&
		day >= 1 &&
		day <= daysIn(year, month) &&
		hour <= 23 &&
		minute <= 59 &&
		(second <= 59 || leapSecond) &&
		offsetHour <= 23 &&
		offsetMinute <= 59
	);
};

/** RFC 3986 appendix B: a URI's scheme, authority, path, query and fragment. */
const URI_PARTS =
	/^(?<scheme>[^:/?#]+):(?:\/\/(?<authority>[^/?#]*))?(?<path>[^?#]*)(?:\?(?<query>[^#]*))?(?:#(?<fragment>.*))?$/su;

const SCHEME = /^[A-Za-z][A-Za-z\d+.-]*$/u;

const ESCAPE = '%[\\dA-Fa-f]{2}';
const UNRESERVED_OR_SUB_DELIM = "A-Za-z\\d\\-._~!$&'()*+,;=";

const PATH = new RegExp(
	`^(?:[${UNRESERVED_OR_SUB_DELIM}:@/]|${ESCAPE})*$`,
	'u'
);
const QUERY = new RegExp(
	`^(?:[${UNRESERVED_OR_SUB_DELIM}:@/?]|${ESCAPE})*$`,
	'u'
);
const USER_INFO = new RegExp(
	`^(?:[${UNRESERVED_OR_SUB_DELIM}:]|${ESCAPE})*$`,
	'u'
);
const REG_NAME = new RegExp(
	`^(?:[${UNRESERVED_OR_SUB_DELIM}]|${ESCAPE})*$`,
	'u'
);
const IP_FUTURE = new RegExp(
	`^[vV][\\dA-Fa-f]+\\.[${UNRESERVED_OR_SUB_DELIM}:]+$`,
	'u'
);
const PORT = /^\d*$/u;

const HEX_GROUP = /^[\dA-Fa-f]{1,4}$/u;

const IPV4 =
	/^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/u;

/**
 * Whether `text` is an RFC 3986 `IPv6address`: eight groups of up to four hex
 * digits, with `::` for one or more zero groups, and the last two groups
 * optionally an IPv4 address. A zone ID has no place in a URI.
 */
const isIpv6 = function isIpv6(text: string): boolean {
	const halves = text.split('::');
	if (halves.length > 2) {
		return false;
	}
	const groupsOf = (part: string): string[] =>
		part === '' ? [] : part.split(':');
	const head = groupsOf(halves[0] ?? '');
	const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
	const end = halves.length === 2 ? tail : head;
	const last = end.at(-1);
	let count = head.length + tail.length;
	if (last?.includes('.')) {
		if (!IPV4.test(last)) {
			return false;
		}
		end.pop();
		count += 1;
	}
	if (![...head, ...tail].every((group) => HEX_GROUP.test(group))) {
		return false;
	}
	return halves.length === 2 ? count <= 7 : count === 8;
};

/** Whether `authority` is an RFC 3986 `[userinfo@]host[:port]`. */
const isAuthority = function isAuthority(authority: string): boolean {
	const at = authority.lastIndexOf('@');
	if (at !== -1 && !USER_INFO.test(authority.slice(0, at))) {
		return false;
	}
	const hostAndPort = authority.slice(at + 1);
	if (hostAndPort.startsWith('[')) {
		const close = hostAndPort.indexOf(']');
		const ipLiteral = hostAndPort.slice(1, close);
		const rest = hostAndPort.slice(close + 1);
		return (
			close !== -1 &&
			(isIpv6(ipLiteral) || IP_FUTURE.test(ipLiteral)) &&
			(rest === '' || (rest.startsWith(':') && PORT.test(rest.slice(1))))
		);
	}
	const colon = hostAndPort.indexOf(':');
	const host = colon === -1 ? hostAndPort : hostAndPort.slice(0, colon);
	const port = colon === -1 ? '' : hostAndPort.slice(colon + 1);
	return REG_NAME.test(host) && PORT.test(port);
};

/** Whether `value` is an RFC 3986 URI, with a scheme. */
export const isUri = function isUri(value: string): boolean {
	const groups = URI_PARTS.exec(value)?.groups;
	if (!groups) {
		return false;
	}
	const {
		scheme = '',
		authority,
		path = '',
		query = '',
		fragment = '',
	} = groups;
	return (
		SCHEME.test(scheme) &&
		(authority === undefined ||
			(isAuthority(authority) && (path === '' || path.startsWith('/')))) &&
		PATH.test(path) &&
		QUERY.test(query) &&
		QUERY.test(fragment)
	);
};
