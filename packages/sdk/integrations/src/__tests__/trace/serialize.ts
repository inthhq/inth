/**
 * Turns values a helper passes to a vendor global, or leaves on `window`,
 * into JSON a fixture can hold.
 *
 * Function names are left out on purpose: a helper rebuilt from a manifest
 * creates its own functions, and only what they carry should count. Object
 * keys are sorted for the same reason.
 */

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

type Fields = Readonly<Record<string, unknown>>;

const MAX_DEPTH = 8;

/** Names stub functions print as, so a reader can tell them from helper code. */
const stubLabels = new WeakMap<WeakKey, string>();

export const labelStub = function labelStub(
	stub: (...args: never[]) => unknown,
	label: string
): void {
	stubLabels.set(stub, label);
};

export const describeElement = function describeElement(
	element: Element
): string {
	const id = element.id ? ` #${element.id}` : '';
	const src = element.getAttribute('src');
	return `[<${element.localName}>${id}${src ? ` ${src}` : ''}]`;
};

const fieldsOf = (value: Fields, skip?: (key: string) => boolean) => {
	const entries: [string, unknown][] = [];
	for (const key of Object.keys(value).sort()) {
		if (skip?.(key)) {
			continue;
		}
		let item: unknown;
		try {
			item = value[key];
		} catch {
			item = '[Throws]';
		}
		entries.push([key, item]);
	}
	return entries;
};

const isIndex = (key: string) => /^(?:0|[1-9]\d*)$/u.test(key);

const convertPrimitive = (value: unknown): JsonValue | undefined => {
	switch (typeof value) {
		case 'undefined': {
			return '[undefined]';
		}
		case 'boolean':
		case 'string': {
			return value;
		}
		case 'number': {
			return Number.isFinite(value) ? value : `[${String(value)}]`;
		}
		case 'bigint': {
			return `[${String(value)}n]`;
		}
		case 'symbol': {
			return `[${String(value)}]`;
		}
		default: {
			return value === null ? null : undefined;
		}
	}
};

/** Platform objects print as one readable string. */
const convertPlatform = (value: unknown): string | undefined => {
	if (value === window) {
		return '[window]';
	}
	if (value === document) {
		return '[document]';
	}
	if (value instanceof Element) {
		return describeElement(value);
	}
	if (value instanceof Node) {
		return `[${value.nodeName}]`;
	}
	if (value instanceof Promise) {
		return '[Promise]';
	}
	if (value instanceof Date) {
		return `[Date ${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}]`;
	}
	if (value instanceof Error) {
		return `[${value.name}: ${value.message}]`;
	}
	if (value instanceof RegExp) {
		return `[RegExp ${String(value)}]`;
	}
	if (value instanceof Event) {
		return `[Event ${value.type}]`;
	}
	return undefined;
};

const withFields = (
	marker: string,
	head: JsonValue,
	fields: [string, unknown][],
	nested: (item: unknown) => JsonValue
): JsonValue => ({
	[marker]: head,
	...Object.fromEntries(fields.map(([key, item]) => [key, nested(item)])),
});

const convert = function convert(
	value: unknown,
	seen: readonly unknown[],
	depth: number
): JsonValue {
	const primitive = convertPrimitive(value);
	if (primitive !== undefined) {
		return primitive;
	}
	const label = stubLabels.get(value as WeakKey);
	if (label !== undefined) {
		return `[stub ${label}]`;
	}
	if (seen.includes(value)) {
		return '[Circular]';
	}
	if (depth >= MAX_DEPTH) {
		return '[Depth]';
	}
	const platform = convertPlatform(value);
	if (platform !== undefined) {
		return platform;
	}
	const next = [...seen, value];
	const nested = (item: unknown) => convert(item, next, depth + 1);
	if (value instanceof Map) {
		return {
			'[Map]': [...value.entries()].map(([key, item]) => [
				nested(key),
				nested(item),
			]),
		};
	}
	if (value instanceof Set) {
		return { '[Set]': [...value].map(nested) };
	}
	const fields = value as Fields;
	if (typeof value === 'function') {
		const props = fieldsOf(fields);
		return props.length === 0
			? '[Function]'
			: withFields('[Function]', true, props, nested);
	}
	// AdRoll's queue holds the real `arguments` object, not an array.
	if (Object.prototype.toString.call(value) === '[object Arguments]') {
		return { '[Arguments]': Array.from(value as IArguments, nested) };
	}
	if (Array.isArray(value)) {
		const items = value.map(nested);
		const props = fieldsOf(fields, isIndex);
		return props.length === 0
			? items
			: withFields('[Array]', items, props, nested);
	}
	return Object.fromEntries(
		fieldsOf(fields).map(([key, item]) => [key, nested(item)])
	);
};

/** A JSON-safe copy of `value`, taken now so later mutation does not show. */
export const toJsonSafe = function toJsonSafe(value: unknown): JsonValue {
	return convert(value, [], 0);
};
