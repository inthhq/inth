// The privacy policy URLs the native consent screens accept.
//
// A copy of `isPrivacyPolicyURL` in the React Native package's provider, which
// the CLI cannot import. iOS parses with `URL(string:)` and Android with
// `Uri.parse`, and both refuse anything but an absolute https URL with a host.
// This is what both accept:
//
// - the scheme is lowercase https;
// - the host is an ASCII DNS name or IPv4 address, with internationalized names
//   in punycode. IPv6 literals, user info and an empty or out-of-range port are
//   refused;
// - the path, query and fragment use only RFC 3986 characters and valid %XX
//   escapes.

const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const PCHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})";
const URL_PATTERN = new RegExp(
  `^https://(${LABEL}(?:\\.${LABEL})*)(?::([0-9]{1,5}))?` +
    `(?:/(?:${PCHAR}|/)*)?(?:\\?(?:${PCHAR}|[/?])*)?(?:#(?:${PCHAR}|[/?])*)?$`,
  "u"
);
const MAX_HOST_LENGTH = 253;
const MAX_PORT = 65_535;

/**
 * Whether both native consent screens accept `value` as the privacy policy URL.
 * @param value The URL the developer gave.
 * @returns True for an absolute https URL with a DNS host that iOS and Android both parse.
 */
export const isPrivacyPolicyUrl = (value: string): boolean => {
  const match = URL_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const host = match[1] ?? "";
  const port = match[2] ?? "";
  if (host.length > MAX_HOST_LENGTH) {
    return false;
  }
  if (port === "") {
    return true;
  }
  const number = Number(port);
  return number >= 1 && number <= MAX_PORT;
};
