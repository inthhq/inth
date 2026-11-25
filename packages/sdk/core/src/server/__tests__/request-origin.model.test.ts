import { describe, expect, test } from 'vite-plus/test';

import {
	resolveRequestProjectUrl,
	resolveRequestOrigin,
} from '../request-origin.model';

const FORGED = {
	forwarded: 'host=attacker.example;proto=https',
	'x-forwarded-host': 'attacker.example',
	'x-forwarded-proto': 'https',
};

describe('resolveRequestProjectUrl', () => {
	test('returns absolute URLs normalized, whatever the request says', () => {
		expect(
			resolveRequestProjectUrl('https://consent.example.com/', {
				headers: new Headers(FORGED),
			})
		).toBe('https://consent.example.com');
	});

	test('resolves a relative URL against the request URL', () => {
		expect(
			resolveRequestProjectUrl('/api/inth/', {
				requestUrl: 'http://localhost:5173/some/page?x=1',
			})
		).toBe('http://localhost:5173/api/inth');
	});

	test('ignores forged forwarding headers by default', () => {
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers(FORGED),
				requestUrl: 'https://app.example.com/',
			})
		).toBe('https://app.example.com/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers({ ...FORGED, host: 'app.example.com' }),
			})
		).toBe('https://app.example.com/api/inth');
	});

	test('falls back to the host header, over https for domain names', () => {
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: { host: 'localhost:3000' },
			})
		).toBe('http://localhost:3000/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: { host: '127.0.0.1:3000' },
			})
		).toBe('http://127.0.0.1:3000/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: { host: 'app:3000' },
			})
		).toBe('http://app:3000/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: { host: 'app.example.com' },
			})
		).toBe('https://app.example.com/api/inth');
	});

	test('does not fall back to the referer', () => {
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers({ referer: 'https://attacker.example/' }),
			})
		).toBeNull();
	});

	test('honours forwarding headers when the app trusts them', () => {
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers({
					'x-forwarded-host': 'edge.example.com, internal:3000',
					'x-forwarded-proto': 'https',
				}),
				requestUrl: 'http://127.0.0.1:3000/',
				trustForwardedHeaders: true,
			})
		).toBe('https://edge.example.com/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers({
					forwarded: 'for=1.2.3.4;host="edge.example.com";proto=https',
				}),
				requestUrl: 'http://127.0.0.1:3000/',
				trustForwardedHeaders: true,
			})
		).toBe('https://edge.example.com/api/inth');
	});

	test('honours a trusted forwarded scheme without a forwarded host', () => {
		const headers = { host: 'localhost:3000', 'x-forwarded-proto': 'https' };
		expect(resolveRequestProjectUrl('/api/inth', { headers })).toBe(
			'http://localhost:3000/api/inth'
		);
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers,
				trustForwardedHeaders: true,
			})
		).toBe('https://localhost:3000/api/inth');
		expect(
			resolveRequestProjectUrl('/api/inth', {
				headers: new Headers({ 'x-forwarded-ssl': 'on' }),
				requestUrl: 'http://app.example.com/page',
				trustForwardedHeaders: true,
			})
		).toBe('https://app.example.com/api/inth');
	});

	test('rejects a host header that is not a bare authority', () => {
		for (const host of [
			'attacker.example/x',
			'user@attacker.example',
			'a b',
			'x?y',
		]) {
			expect(
				resolveRequestProjectUrl('/api/inth', { headers: { host } })
			).toBeNull();
		}
	});

	test('keeps the result on the request origin', () => {
		const options = { requestUrl: 'https://app.example.com/' };
		expect(
			resolveRequestProjectUrl('//attacker.example/api', options)
		).toBeNull();
		expect(
			new URL(
				resolveRequestProjectUrl('/\\attacker.example/api', options) ?? ''
			).origin
		).toBe('https://app.example.com');
		expect(resolveRequestProjectUrl('api/inth', options)).toBeNull();
		expect(resolveRequestProjectUrl('ftp://x.example', options)).toBeNull();
	});
});

describe('resolveRequestOrigin', () => {
	test('returns null when the request carries no origin', () => {
		expect(resolveRequestOrigin({})).toBeNull();
		expect(resolveRequestOrigin({ headers: new Headers(FORGED) })).toBeNull();
	});

	test('reads the first value of a Node header array', () => {
		expect(
			resolveRequestOrigin({
				headers: { host: ['app.example.com', 'other.example'] },
			})
		).toBe('https://app.example.com');
	});

	// Header names are case-insensitive, and some runtimes keep the casing
	// the client sent.
	test('reads a Node header record in any casing, forwarding headers only when trusted', () => {
		expect(
			resolveRequestOrigin({
				headers: { HOST: ['app.example.com', 'other.example'] },
			})
		).toBe('https://app.example.com');
		const headers = {
			Forwarded: 'host=attacker.example;proto=http',
			Host: 'app.example.com',
			'X-Forwarded-Host': 'attacker.example',
		};
		expect(resolveRequestOrigin({ headers })).toBe('https://app.example.com');
		expect(
			resolveRequestOrigin({
				headers,
				requestUrl: 'http://localhost:5173/page',
			})
		).toBe('http://localhost:5173');
		expect(resolveRequestOrigin({ headers, trustForwardedHeaders: true })).toBe(
			'http://attacker.example'
		);
	});
});
