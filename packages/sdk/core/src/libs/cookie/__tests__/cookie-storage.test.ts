import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteCookie, getRawCookieValue, getRootDomain, setCookie } from '..';

describe('Cookie Storage', () => {
	beforeEach(() => {
		document.cookie = '';
		window.localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		document.cookie = '';
		window.localStorage.clear();
	});

	describe('setCookie', () => {
		it('should set a cookie with a string value', () => {
			setCookie('test-cookie', 'test-value');
			expect(getRawCookieValue('test-cookie')).toBe('test-value');
		});

		it('should set cookie with the configured expiry', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			setCookie('test-cookie', 'value', { defaultExpiryDays: 7 });
			// The Node fixture captures the assignment, including cookie attributes.
			expect(document.cookie).toContain('path=/');
			expect(document.cookie).toContain(
				'expires=Thu, 08 Jan 2026 00:00:00 GMT'
			);
		});

		it('should handle errors gracefully', () => {
			const consoleWarnSpy = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => {});

			// Mock document to simulate error
			const originalDocument = globalThis.document;
			Reflect.deleteProperty(globalThis, 'document');

			expect(() => setCookie('test-cookie', 'value')).not.toThrow();

			globalThis.document = originalDocument;
			consoleWarnSpy.mockRestore();
		});
	});

	describe('getRawCookieValue', () => {
		it('should retrieve a cookie value', () => {
			document.cookie = 'test-cookie=test-value';
			expect(getRawCookieValue('test-cookie')).toBe('test-value');
		});

		it('should return null for non-existent cookie', () => {
			expect(getRawCookieValue('non-existent')).toBeNull();
		});

		it('should handle cookies with spaces in the cookie string', () => {
			document.cookie = ' test-cookie=test-value';
			expect(getRawCookieValue('test-cookie')).toBe('test-value');
		});
	});

	describe('deleteCookie', () => {
		it('should delete an existing cookie', () => {
			setCookie('test-cookie', 'test-value');
			expect(getRawCookieValue('test-cookie')).toBeTruthy();

			deleteCookie('test-cookie');
			// After deletion, the cookie should no longer be retrievable (or empty string in jsdom)
			const value = getRawCookieValue('test-cookie');
			expect(value === null || value === '').toBe(true);
		});

		it('should handle deleting non-existent cookie', () => {
			expect(() => deleteCookie('non-existent')).not.toThrow();
		});
	});

	describe('Cross-subdomain support', () => {
		it('writes and deletes at the root domain when crossSubdomain is set with a defaultDomain', () => {
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { hostname: 'app.shop.example.com', protocol: 'https:' },
				writable: true,
			});
			const config = {
				crossSubdomain: true,
				defaultDomain: '.shop.example.com',
			};

			setCookie('test-cookie', 'value', config);
			expect(document.cookie).toContain('domain=.example.com');

			deleteCookie('test-cookie', config);
			expect(document.cookie).toContain('domain=.example.com');

			setCookie('test-cookie', 'value', { defaultDomain: '.shop.example.com' });
			expect(document.cookie).toContain('domain=.shop.example.com');
		});

		it('should provide getRootDomain helper for cross-subdomain cookies', () => {
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { hostname: 'app.example.com' },
				writable: true,
			});

			const rootDomain = getRootDomain();
			expect(rootDomain).toBe('.example.com');
		});

		it('should handle localhost correctly', () => {
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { hostname: 'localhost' },
				writable: true,
			});

			const rootDomain = getRootDomain();
			expect(rootDomain).toBe('localhost');
		});

		it('should handle IP addresses correctly', () => {
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { hostname: '192.168.1.1' },
				writable: true,
			});

			const rootDomain = getRootDomain();
			expect(rootDomain).toBe('192.168.1.1');
		});

		it('should work with deeply nested subdomains', () => {
			Object.defineProperty(window, 'location', {
				configurable: true,
				value: { hostname: 'api.v2.app.example.com' },
				writable: true,
			});

			const rootDomain = getRootDomain();
			expect(rootDomain).toBe('.example.com');
		});
	});

	describe('SSR compatibility', () => {
		it('should handle missing document object gracefully', () => {
			const originalDocument = globalThis.document;
			const originalWindow = globalThis.window;

			Reflect.deleteProperty(globalThis, 'document');

			const value = getRawCookieValue('test');
			expect(value).toBeNull();

			globalThis.document = originalDocument;
			globalThis.window = originalWindow;
		});
	});
});

describe('writeCookie reporting', () => {
	afterEach(() => {
		document.cookie = '';
	});

	it('reports a verified write and keeps setCookie silent on success', async () => {
		const { writeCookie } = await import('../cookie.store');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(writeCookie('inth', 'c.necessary:1')).toEqual({
			attempted: true,
			verified: true,
		});
		setCookie('inth', 'c.necessary:1');

		expect(warn).not.toHaveBeenCalled();
	});

	it('reports a thrown assignment and setCookie warns instead of throwing', async () => {
		const { writeCookie } = await import('../cookie.store');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const descriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => '',
			set: () => {
				throw new Error('rejected');
			},
		});
		try {
			const report = writeCookie('inth', 'value');
			expect(report.attempted).toBe(false);
			expect(report.verified).toBe(false);
			expect(report.error).toBeInstanceOf(Error);

			expect(() => setCookie('inth', 'value')).not.toThrow();
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			if (descriptor) {
				Object.defineProperty(document, 'cookie', descriptor);
			}
		}
	});
});
