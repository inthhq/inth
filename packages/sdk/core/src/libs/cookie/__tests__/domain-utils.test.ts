import { describe, expect, test } from 'vite-plus/test';

import { cookieDomainsOf, rootDomainOf } from '../domain-utils';

describe('cookie scopes', () => {
	test.each([
		[
			'a.app.example.com',
			['a.app.example.com', 'app.example.com', 'example.com'],
		],
		['example.com', ['example.com']],
		['localhost', []],
		['192.168.1.20', []],
		['[::1]', []],
	])('%s takes cookies on %j', (hostname, domains) => {
		expect(cookieDomainsOf(hostname)).toEqual(domains);
	});

	test.each([
		['app.example.com', '.example.com'],
		['example.com', '.example.com'],
		['localhost', 'localhost'],
		['192.168.1.20', '192.168.1.20'],
	])('the root domain of %s is %s', (hostname, root) => {
		expect(rootDomainOf(hostname)).toBe(root);
	});
});
