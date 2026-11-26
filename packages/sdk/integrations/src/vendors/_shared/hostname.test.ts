import { describe, expect, it } from 'vite-plus/test';

import { isHostname } from './hostname';

describe('isHostname', () => {
	it.each(['go.example.com', 'pi.pardot.com', 'a-1.b2.co', 'xn--bcher-kva.example'])(
		'accepts %s',
		(value) => {
			expect(isHostname(value)).toBe(true);
		}
	);

	it.each([
		['a scheme', 'https://go.example.com'],
		['a port', 'go.example.com:8443'],
		['a path', 'go.example.com/pd.js'],
		['credentials', 'user@go.example.com'],
		['a query', 'go.example.com?x=1'],
		['an IPv4 address', '10.0.0.1'],
		['an IPv6 address', '[::1]'],
		['a single label', 'localhost'],
		['an empty label', 'go..example.com'],
		['a trailing dot', 'go.example.com.'],
		['a leading hyphen', '-go.example.com'],
		['a trailing hyphen', 'go-.example.com'],
		['uppercase', 'Go.Example.com'],
		['whitespace', ' go.example.com'],
		['an underscore', 'go_1.example.com'],
		['a label over 63 characters', `${'a'.repeat(64)}.example.com`],
		['a name over 253 characters', `${'a.'.repeat(126)}com`],
		['an empty string', ''],
	])('refuses %s', (_label, value) => {
		expect(isHostname(value)).toBe(false);
	});
});
