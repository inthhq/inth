/**
 * The privacy-policy URLs the provider accepts: none that the iOS `URL(string:)` or
 * Android `Uri.parse` checks in the native presenters would refuse.
 */

import { describe, expect, test } from 'vitest';

import { isPrivacyPolicyURL } from '../privacy-policy-url';

describe('accepted', () => {
	test.each([
		'https://example.com',
		'https://example.com/',
		'https://example.com/privacy',
		'https://EXAMPLE.com/Privacy',
		'https://sub.example.co.uk/legal/privacy.html',
		'https://example.com:8443/privacy',
		'https://example.com:1/p',
		'https://example.com:65535/p',
		'https://example.com/privacy?lang=en&v=2#cookies',
		'https://example.com/a%20b',
		"https://example.com/~user/(policy);v=1,2*!$'@:",
		'https://xn--bcher-kva.example/privacy',
		'https://192.168.0.1/privacy',
		'https://localhost',
	])('%s', (value) => {
		expect(isPrivacyPolicyURL(value)).toBe(true);
	});
});

describe('refused', () => {
	test.each([
		['plain http', 'http://example.com/privacy'],
		[
			'uppercase scheme, compared case-sensitively by both hosts',
			'HTTPS://example.com',
		],
		['no scheme', 'example.com/privacy'],
		['scheme without slashes', 'https:example.com'],
		['empty', ''],
		['no host', 'https://'],
		['empty host before a path', 'https:///privacy'],
		['non-numeric port', 'https://example.com:bad'],
		['empty port', 'https://example.com:/privacy'],
		['port zero', 'https://example.com:0'],
		['port above 65535', 'https://example.com:65536'],
		['unterminated IPv6 literal', 'https://['],
		['IPv6 literal', 'https://[::1]/privacy'],
		['Unicode host, which iOS 16 refuses', 'https://bücher.example/privacy'],
		['user info', 'https://user@example.com/privacy'],
		['label starting with a hyphen', 'https://-bad.example/privacy'],
		['empty label', 'https://example..com/privacy'],
		['trailing dot', 'https://example.com./privacy'],
		['leading whitespace', ' https://example.com'],
		['trailing whitespace', 'https://example.com/privacy '],
		['trailing newline', 'https://example.com/privacy\n'],
		['space in the path', 'https://example.com/privacy policy'],
		['quote in the path', 'https://example.com/"privacy"'],
		['bad percent escape', 'https://example.com/%zz'],
		['second fragment marker', 'https://example.com/a#b#c'],
		['backslash', 'https://example.com\\privacy'],
		['another scheme', 'mailto:privacy@example.com'],
		[
			'host over 253 characters',
			`https://${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(20)}/p`,
		],
	])('%s', (_reason, value) => {
		expect(isPrivacyPolicyURL(value)).toBe(false);
	});
});
