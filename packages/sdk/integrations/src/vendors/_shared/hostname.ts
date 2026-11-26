const LABEL_PATTERN = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/u;
const MAX_HOSTNAME_LENGTH = 253;

/**
 * Whether `value` is a DNS name a script may load from: two or more lowercase
 * labels of letters, digits and inner hyphens. A scheme, port, path,
 * credentials, trailing dot or IP address fails, so the value can only pick
 * a host, never a URL.
 */
export const isHostname = function isHostname(value: string): boolean {
	if (value.length > MAX_HOSTNAME_LENGTH) {
		return false;
	}
	const labels = value.split('.');
	const topLevel = labels.at(-1) ?? '';
	return (
		labels.length >= 2 &&
		labels.every((label) => LABEL_PATTERN.test(label)) &&
		// An all-digit last label is an IPv4 address such as 10.0.0.1.
		!/^\d+$/u.test(topLevel)
	);
};
