/**
 * The privacy-policy URLs the native presenters accept.
 *
 * Both hosts parse the URL themselves and refuse it unless the scheme is `https` and there is a
 * host. iOS uses `URL(string:)`, which on iOS 16 is strict RFC 3986 and ASCII only, and compares
 * the scheme case-sensitively. Android uses the lenient `Uri.parse` with the same two checks.
 * This check is the intersection, so a URL that passes here is one neither host refuses:
 *
 * - the scheme is lowercase `https`;
 * - the host is an ASCII DNS name or IPv4 address. Internationalized names must be written in
 *   punycode (`xn--`), because iOS 16 refuses Unicode hosts. IPv6 literals, user info and an
 *   empty or out-of-range port are refused;
 * - the path, query and fragment use only RFC 3986 characters and valid `%XX` escapes. Spaces,
 *   quotes, angle brackets and leading or trailing whitespace are refused, as `URL(string:)`
 *   refuses them on iOS 16.
 */

const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const PCHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})";
const URL_PATTERN = new RegExp(
	`^https://(${LABEL}(?:\\.${LABEL})*)(?::([0-9]{1,5}))?` +
		`(?:/(?:${PCHAR}|/)*)?(?:\\?(?:${PCHAR}|[/?])*)?(?:#(?:${PCHAR}|[/?])*)?$`,
	'u'
);
const MAX_HOST_LENGTH = 253;
const MAX_PORT = 65_535;

/**
 * Whether both native presenters accept `value` as the privacy-policy URL.
 *
 * @param value - The URL the app passed.
 * @returns `true` for an absolute HTTPS URL with a DNS host that iOS and Android both parse.
 */
export const isPrivacyPolicyUrl = function isPrivacyPolicyUrl(
	value: string
): boolean {
	const match = URL_PATTERN.exec(value);
	if (match === null) {
		return false;
	}
	const [, host = '', port] = match;
	if (host.length > MAX_HOST_LENGTH) {
		return false;
	}
	if (port === undefined) {
		return true;
	}
	const number = Number(port);
	return number >= 1 && number <= MAX_PORT;
};
