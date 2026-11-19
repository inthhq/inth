/**
 * Tests for @inth/sdk/modules/window-debug.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { version } from '../../../version';
import { createWindowDebug, resolveWindowDebugMode } from '../index';

type WindowWithInth = Window & {
	__inthDebug?: {
		version: string;
		pkg: string;
		mode: string;
		hosting: string | null;
	};
};

afterEach(() => {
	if (typeof window !== 'undefined') {
		delete (window as WindowWithInth).__inthDebug;
	}
});

describe('resolveWindowDebugMode', () => {
	test('uses the kind declared by the provider transport factory', () => {
		expect(resolveWindowDebugMode({ kind: 'offline' })).toBe('offline');
		expect(resolveWindowDebugMode({ kind: 'hosted' })).toBe('hosted');
		expect(resolveWindowDebugMode({ kind: 'manifest' })).toBe('manifest');
	});
});

describe('window-debug', () => {
	test('installs a frozen window.__inthDebug object with static metadata', () => {
		const handle = createWindowDebug({
			mode: 'hosted',
			pkg: '@inth/react',
		});

		const debug = (window as WindowWithInth).__inthDebug;
		expect(debug).toBeTruthy();
		expect(debug).toEqual({
			hosting: null,
			mode: 'hosted',
			pkg: '@inth/react',
			version,
		});
		expect(Object.isFrozen(debug)).toBe(true);

		handle.dispose();
	});

	test('reads hosting when accessed, so a later /init shows up', () => {
		let hosting: 'inth' | 'self-hosted' | null = null;
		const handle = createWindowDebug({
			getHosting: () => hosting,
			mode: 'hosted',
			pkg: '@inth/react',
		});
		const debug = (window as WindowWithInth).__inthDebug;

		expect(debug?.hosting).toBeNull();
		hosting = 'inth';
		expect(debug?.hosting).toBe('inth');
		expect(Object.isFrozen(debug)).toBe(true);

		handle.dispose();
	});

	test('dispose removes the installed object', () => {
		const handle = createWindowDebug({
			mode: 'offline',
			pkg: '@inth/svelte',
		});

		expect((window as WindowWithInth).__inthDebug).toBeTruthy();
		handle.dispose();
		expect((window as WindowWithInth).__inthDebug).toBeUndefined();
	});

	test('dispose does not remove a newer install', () => {
		const first = createWindowDebug({
			mode: 'hosted',
			pkg: '@inth/react',
		});
		const second = createWindowDebug({
			mode: 'hosted',
			pkg: '@inth/nextjs',
		});
		const latest = (window as WindowWithInth).__inthDebug;

		first.dispose();

		expect((window as WindowWithInth).__inthDebug).toBe(latest);
		expect((window as WindowWithInth).__inthDebug?.pkg).toBe('@inth/nextjs');

		second.dispose();
	});

	test('degrades to an inert handle when window.__inthDebug is non-writable', () => {
		Object.defineProperty(window, '__inthDebug', {
			configurable: true,
			value: 'host-owned',
			writable: false,
		});

		try {
			let handle: { dispose: () => void } | undefined;
			expect(() => {
				handle = createWindowDebug({ mode: 'hosted', pkg: '@inth/vue' });
			}).not.toThrow();
			expect((window as WindowWithInth).__inthDebug).toBe('host-owned');
			expect(() => handle?.dispose()).not.toThrow();
			expect((window as WindowWithInth).__inthDebug).toBe('host-owned');
		} finally {
			Object.defineProperty(window, '__inthDebug', {
				configurable: true,
				value: undefined,
				writable: true,
			});
			delete (window as WindowWithInth).__inthDebug;
		}
	});

	test('returns an inert handle when window is undefined', () => {
		const previousWindow = (
			globalThis as typeof globalThis & { window?: Window }
		).window;
		vi.stubGlobal('window', undefined);
		try {
			const handle = createWindowDebug({
				mode: 'offline',
				pkg: '@inth/react',
			});

			expect(() => handle.dispose()).not.toThrow();
		} finally {
			vi.stubGlobal('window', previousWindow);
		}
	});
});
