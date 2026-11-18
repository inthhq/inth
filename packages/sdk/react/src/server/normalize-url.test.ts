import { describe, expect, it } from 'vitest';

import { normalizeProjectUrl, validateProjectUrl } from './normalize-url';

describe('validateProjectUrl', () => {
	it('should validate absolute URLs correctly', () => {
		const validAbsoluteURLs = [
			'http://example.com',
			'https://example.com',
			'http://localhost:3000',
			'https://api.example.com/path',
		];

		for (const url of validAbsoluteURLs) {
			const result = validateProjectUrl(url);
			expect(result.isAbsolute).toBe(true);
			expect(result.normalizedUrl).toBe(url);
		}
	});

	it('should trim trailing slashes from absolute URLs', () => {
		const testCases = [
			{
				expected: 'https://my-instance.c15t.dev',
				input: 'https://my-instance.c15t.dev/',
			},
			{ expected: 'https://example.com', input: 'https://example.com/' },
			{ expected: 'http://localhost:3000', input: 'http://localhost:3000/' },
			{
				expected: 'https://api.example.com/path',
				input: 'https://api.example.com/path/',
			},
		];

		for (const { input, expected } of testCases) {
			const result = validateProjectUrl(input);
			expect(result.isAbsolute).toBe(true);
			expect(result.normalizedUrl).toBe(expected);
		}
	});

	it('should throw error for invalid absolute URLs', () => {
		const invalidAbsoluteURLs = [
			'ftp://example.com',
			'ws://example.com',
			'not-a-url://',
			'http:/invalid-url',
		];

		for (const url of invalidAbsoluteURLs) {
			expect(() => validateProjectUrl(url)).toThrow();
		}
	});

	it('should validate relative URLs correctly', () => {
		const testCases = [
			{ expected: '/api/inth', input: '/api/inth' },
			{ expected: '/path/to/api', input: '/path/to/api' },
		];

		for (const { input, expected } of testCases) {
			const result = validateProjectUrl(input);
			expect(result.isAbsolute).toBe(false);
			expect(result.normalizedUrl).toBe(expected);
		}
	});

	it('should trim trailing slashes from relative URLs', () => {
		const testCases = [
			{ expected: '/api/inth', input: '/api/inth/' },
			{ expected: '/path/to/api', input: '/path/to/api/' },
			// Root path should be preserved
			{ expected: '/', input: '/' },
		];

		for (const { input, expected } of testCases) {
			const result = validateProjectUrl(input);
			expect(result.isAbsolute).toBe(false);
			expect(result.normalizedUrl).toBe(expected);
		}
	});

	it('should throw error for invalid relative URLs', () => {
		const invalidRelativeURLs = [
			'not-a-url',
			'http://',
			'https://',
			'api/inth',
		];

		for (const url of invalidRelativeURLs) {
			expect(() => validateProjectUrl(url)).toThrow();
		}
	});
});

describe('normalizeProjectUrl', () => {
	const createMockHeaders = (headers: Record<string, string>) =>
		({
			get: (key: string) => headers[key.toLowerCase()] || null,
		}) as Headers;

	it('should return absolute URLs unchanged', () => {
		const absoluteURL = 'https://example.com/api';
		const headers = createMockHeaders({});

		const result = normalizeProjectUrl(absoluteURL, headers);
		expect(result).toBe(absoluteURL);
	});

	it('should trim trailing slashes from absolute URLs', () => {
		const testCases = [
			{
				expected: 'https://my-instance.c15t.dev',
				input: 'https://my-instance.c15t.dev/',
			},
			{
				expected: 'https://example.com/api',
				input: 'https://example.com/api/',
			},
		];

		const headers = createMockHeaders({});

		for (const { input, expected } of testCases) {
			const result = normalizeProjectUrl(input, headers);
			expect(result).toBe(expected);
		}
	});

	it('should ignore x-forwarded headers by default', () => {
		const headers = createMockHeaders({
			host: 'example.com',
			'x-forwarded-host': 'attacker.example',
			'x-forwarded-proto': 'http',
		});

		const result = normalizeProjectUrl('/api/inth', headers);
		expect(result).toBe('https://example.com/api/inth');
	});

	it('should construct URL from x-forwarded headers when trusted', () => {
		const headers = createMockHeaders({
			'x-forwarded-host': 'example.com',
			'x-forwarded-proto': 'https',
		});

		const result = normalizeProjectUrl('/api/inth', headers, {
			trustForwardedHeaders: true,
		});
		expect(result).toBe('https://example.com/api/inth');
	});

	it('should construct URL from the host header and trim trailing slashes', () => {
		const testCases = [
			{
				expected: 'https://my-instance.c15t.dev/api/inth',
				input: '/api/inth/',
			},
			{ expected: 'https://my-instance.c15t.dev/api', input: '/api/' },
		];
		const headers = createMockHeaders({ host: 'my-instance.c15t.dev' });

		for (const { input, expected } of testCases) {
			expect(normalizeProjectUrl(input, headers)).toBe(expected);
		}
	});

	it('should use http for a localhost host header', () => {
		const headers = createMockHeaders({
			host: 'localhost:3000',
		});

		const result = normalizeProjectUrl('/api/inth', headers);
		expect(result).toBe('http://localhost:3000/api/inth');
	});

	it('should not use the referer', () => {
		const headers = createMockHeaders({
			referer: 'https://example.com/some/path',
		});

		const result = normalizeProjectUrl('/api/inth', headers);
		expect(result).toBeNull();
	});

	it('should return null when no headers are available to determine base URL', () => {
		const headers = createMockHeaders({});

		const result = normalizeProjectUrl('/api/inth', headers);
		expect(result).toBeNull();
	});

	it('should return null for invalid URLs', () => {
		const headers = createMockHeaders({
			host: 'example.com',
		});

		const result = normalizeProjectUrl('not-a-url://', headers);
		expect(result).toBeNull();
	});
});
