import { describe, expect, it } from 'vitest';

import { resolveProjectUrl } from './server-url';

describe('resolveProjectUrl', () => {
	it('returns absolute http(s) URLs with trailing slash trimmed', () => {
		expect(resolveProjectUrl('https://api.example.com/', {})).toBe(
			'https://api.example.com'
		);
		expect(resolveProjectUrl('http://localhost:3000/api/', {})).toBe(
			'http://localhost:3000/api'
		);
	});

	it('rejects invalid or unsupported URL shapes', () => {
		expect(resolveProjectUrl('api/inth', {})).toBeNull();
		expect(resolveProjectUrl('ftp://api.example.com', {})).toBeNull();
		expect(resolveProjectUrl('https://', {})).toBeNull();
	});

	it('ignores forged forwarding headers and referer by default', () => {
		expect(
			resolveProjectUrl('/api/inth/', {
				host: 'app.example.com',
				referer: 'https://attacker.example/',
				'x-forwarded-host': 'attacker.example',
				'x-forwarded-proto': 'http',
			})
		).toBe('https://app.example.com/api/inth');
		expect(
			resolveProjectUrl('/api/inth', {
				referer: 'https://attacker.example/',
				'x-forwarded-host': 'attacker.example',
			})
		).toBeNull();
	});

	it('picks the scheme from the host', () => {
		expect(resolveProjectUrl('/api/inth', { host: 'localhost:3000' })).toBe(
			'http://localhost:3000/api/inth'
		);
		expect(resolveProjectUrl('/api/inth', { host: 'app.example.com' })).toBe(
			'https://app.example.com/api/inth'
		);
	});

	it('rejects a host that is not a bare authority', () => {
		expect(
			resolveProjectUrl('/api/inth', { host: 'user@attacker.example' })
		).toBeNull();
		expect(
			resolveProjectUrl('//attacker.example/x', { host: 'app.example.com' })
		).toBeNull();
	});

	it('resolves from proxy headers when trusted', () => {
		const trusted = { trustForwardedHeaders: true };
		expect(
			resolveProjectUrl(
				'/api/inth/',
				{
					'x-forwarded-host': 'app.example.com',
					'x-forwarded-proto': 'http',
				},
				trusted
			)
		).toBe('http://app.example.com/api/inth');
		expect(
			resolveProjectUrl(
				'/api/inth',
				{ host: 'secure.example.com', 'x-forwarded-ssl': 'on' },
				trusted
			)
		).toBe('https://secure.example.com/api/inth');
		expect(
			resolveProjectUrl(
				'/api/inth',
				{ referer: 'https://app.example.com/some/page' },
				trusted
			)
		).toBe('https://app.example.com/api/inth');
	});

	it('validates trusted proxy headers as it validates host', () => {
		const trusted = { trustForwardedHeaders: true };
		expect(
			resolveProjectUrl(
				'/api/inth',
				{
					'x-forwarded-host': 'edge.example.com, internal:3000',
					'x-forwarded-proto': 'http, https',
				},
				trusted
			)
		).toBe('http://edge.example.com/api/inth');
		expect(
			resolveProjectUrl(
				'/api/inth',
				{
					'x-forwarded-host': 'app.example.com',
					'x-forwarded-proto': 'javascript',
				},
				trusted
			)
		).toBe('https://app.example.com/api/inth');
		for (const host of ['attacker.example/x', 'user@attacker.example', 'a b']) {
			expect(
				resolveProjectUrl('/api/inth', { 'x-forwarded-host': host }, trusted)
			).toBeNull();
		}
	});

	it('returns null when a relative URL has no host source', () => {
		expect(resolveProjectUrl('/api/inth', {})).toBeNull();
	});
});
