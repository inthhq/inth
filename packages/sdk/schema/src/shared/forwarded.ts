/**
 * RFC 7239 `Forwarded` header parsing, shared by everything that reads the
 * client or the original host from it: the client IP stored on consent
 * records and the origin a consent route resolves against.
 */

/** One element of a `Forwarded` header: its parameters, names lowercased. */
export type ForwardedElement = Readonly<Record<string, string>>;

/**
 * Splits `value` on `separator` outside quoted strings.
 */
const splitOutsideQuotes = function splitOutsideQuotes(
	value: string,
	separator: ',' | ';'
): string[] {
	const parts: string[] = [];
	let current = '';
	let quoted = false;
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index] as string;
		if (quoted && char === '\\' && index + 1 < value.length) {
			current += char + (value[index + 1] as string);
			index += 1;
		} else if (char === '"') {
			quoted = !quoted;
			current += char;
		} else if (char === separator && !quoted) {
			parts.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	parts.push(current);
	return parts;
};

/** A token as is, or a quoted string with its quotes and escapes removed. */
const unquote = function unquote(value: string): string {
	return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
		? value.slice(1, -1).replace(/\\(?<escaped>.)/gu, '$<escaped>')
		: value;
};

/**
 * Parses an RFC 7239 `Forwarded` header into its elements, the client's
 * proxy first. Commas and semicolons inside quoted strings are kept.
 *
 * @param value - The header value.
 * @returns Each element's parameters, empty for a missing header.
 *
 * @example
 * ```ts
 * parseForwarded('for=192.0.2.60;proto=https, for=198.51.100.17');
 * // [{ for: '192.0.2.60', proto: 'https' }, { for: '198.51.100.17' }]
 * ```
 */
export const parseForwarded = function parseForwarded(
	value: string | null | undefined
): ForwardedElement[] {
	if (!value?.trim()) {
		return [];
	}
	const elements: ForwardedElement[] = [];
	for (const element of splitOutsideQuotes(value, ',')) {
		const parameters: Record<string, string> = {};
		for (const pair of splitOutsideQuotes(element, ';')) {
			const separator = pair.indexOf('=');
			if (separator === -1) {
				continue;
			}
			const name = pair.slice(0, separator).trim().toLowerCase();
			if (name) {
				parameters[name] = unquote(pair.slice(separator + 1).trim());
			}
		}
		if (Object.keys(parameters).length > 0) {
			elements.push(parameters);
		}
	}
	return elements;
};

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const IPV6 = /^[\da-f:.]*:[\da-f:.]*$/iu;

/**
 * The IP address of an RFC 7239 node (a `for=` or `by=` value), without
 * its port or IPv6 brackets.
 *
 * @param node - The node, unquoted.
 * @returns The address, or `null` for `unknown`, an obfuscated identifier
 * (`_hidden`) or anything that is not an IP address.
 */
export const forwardedNodeAddress = function forwardedNodeAddress(
	node: string | null | undefined
): string | null {
	const value = node?.trim() ?? '';
	if (value.startsWith('[')) {
		const end = value.indexOf(']');
		const address = end === -1 ? '' : value.slice(1, end);
		return IPV6.test(address) ? address : null;
	}
	// `name:port`, where an IPv6 node would be bracketed.
	const [name = ''] = value.split(':');
	return IPV4.test(name) ? name : null;
};
