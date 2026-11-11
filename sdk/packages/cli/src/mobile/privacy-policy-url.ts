/**
 * The privacy-policy URLs the native consent presenters accept.
 *
 * A mirror of `isPrivacyPolicyURL` in `packages/react-native/src/provider/privacy-policy-url.ts`
 * (the auto-present release), which `@c15t/cli` cannot import because the React Native package is
 * private. iOS parses with `URL(string:)` and Android with `Uri.parse`, and both refuse anything
 * but an absolute `https` URL with a host; this is the intersection of what they accept:
 *
 * - the scheme is lowercase `https`;
 * - the host is an ASCII DNS name or IPv4 address, with internationalized names in punycode. IPv6
 *   literals, user info and an empty or out-of-range port are refused;
 * - the path, query and fragment use only RFC 3986 characters and valid `%XX` escapes.
 *
 * `mobile-setup.test.ts` runs it on the same case table as the React Native test.
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
 * @param value - The URL the developer gave.
 * @returns `true` for an absolute HTTPS URL with a DNS host that iOS and Android both parse.
 */
export const isPrivacyPolicyURL = (value: string): boolean => {
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
