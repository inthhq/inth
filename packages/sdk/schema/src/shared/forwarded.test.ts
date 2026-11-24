import { describe, expect, it } from 'vite-plus/test';

import { getIpAddress } from './client-ip';
import { forwardedNodeAddress, parseForwarded } from './forwarded';

describe('parseForwarded', () => {
	it('reads each element of an RFC 7239 header', () => {
		expect(
			parseForwarded(
				'for=192.0.2.60;proto=http;by=203.0.113.43, for=198.51.100.17'
			)
		).toEqual([
			{ by: '203.0.113.43', for: '192.0.2.60', proto: 'http' },
			{ for: '198.51.100.17' },
		]);
	});

	it('unquotes values, keeping commas and semicolons inside quotes', () => {
		expect(
			parseForwarded('For="[2001:db8:cafe::17]:4711";Host="a.example;b,c"')
		).toEqual([{ for: '[2001:db8:cafe::17]:4711', host: 'a.example;b,c' }]);
	});

	it('is empty for a missing or empty header', () => {
		expect(parseForwarded(undefined)).toEqual([]);
		expect(parseForwarded(' ')).toEqual([]);
	});
});

describe('forwardedNodeAddress', () => {
	it.each([
		['192.0.2.60', '192.0.2.60'],
		['192.0.2.60:47011', '192.0.2.60'],
		['[2001:db8:cafe::17]', '2001:db8:cafe::17'],
		['[2001:db8:cafe::17]:4711', '2001:db8:cafe::17'],
		['unknown', null],
		['_hidden', null],
		['_SEVKISEK:_47', null],
		['', null],
		['not an address', null],
	])('%s gives %s', (node, address) => {
		expect(forwardedNodeAddress(node)).toBe(address);
	});
});

describe('getIpAddress with Forwarded', () => {
	const headers = (forwarded: string) => new Headers({ forwarded });

	it('takes the first element’s for= address', () => {
		expect(
			getIpAddress(headers('for=192.0.2.60;proto=https, for=198.51.100.17'), {
				masking: false,
			})
		).toBe('192.0.2.60');
	});

	it('reads a quoted IPv6 address with a port', () => {
		expect(
			getIpAddress(headers('for="[2001:db8:cafe::17]:4711"'), {
				masking: false,
			})
		).toBe('2001:db8:cafe::17');
	});

	it('masks it by default', () => {
		expect(getIpAddress(headers('for=192.0.2.60'))).toBe('192.0.2.0');
	});

	it('gives no address for an unknown or obfuscated client', () => {
		expect(getIpAddress(headers('for=unknown'))).toBeNull();
		expect(getIpAddress(headers('for=_hidden;proto=https'))).toBeNull();
	});
});

describe('getIpAddress with the legacy X-Forwarded header', () => {
	const ip = (value: string) =>
		getIpAddress(new Headers({ 'x-forwarded': value }), { masking: false });

	it('reads a plain address, as before RFC 7239 parsing', () => {
		expect(ip('203.0.113.7')).toBe('203.0.113.7');
	});

	it('takes the first address of a plain chain', () => {
		expect(ip('203.0.113.7, 198.51.100.2')).toBe('203.0.113.7');
	});

	it('reads the for= address of a parameterized element', () => {
		expect(ip('for=203.0.113.7;proto=https, for=198.51.100.2')).toBe(
			'203.0.113.7'
		);
	});
});
