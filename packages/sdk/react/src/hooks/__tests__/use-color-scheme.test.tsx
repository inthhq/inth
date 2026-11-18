import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { useColorScheme } from '../use-color-scheme';

describe('useColorScheme', () => {
	let mediaQueryList: {
		matches: boolean;
		addEventListener: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		addListener: ReturnType<typeof vi.fn>;
		removeListener: ReturnType<typeof vi.fn>;
		dispatchEvent: ReturnType<typeof vi.fn>;
		onchange: null;
		media: string;
	};
	let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
	let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		document.documentElement.classList.remove('inth-dark', 'dark');

		mediaQueryList = {
			addEventListener: vi.fn(),
			// Deprecated but included for completeness
			addListener: vi.fn(),
			dispatchEvent: vi.fn(),
			matches: false,
			media: '(prefers-color-scheme: dark)',
			onchange: null,
			removeEventListener: vi.fn(),
			// Deprecated but included for completeness,
			removeListener: vi.fn(),
		};

		vi.spyOn(window, 'matchMedia').mockImplementation(
			() => mediaQueryList as MediaQueryList
		);

		addEventListenerSpy = vi.spyOn(mediaQueryList, 'addEventListener');
		removeEventListenerSpy = vi.spyOn(mediaQueryList, 'removeEventListener');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('sets light theme correctly', async () => {
		await renderHook(() => useColorScheme('light'));
		expect(document.documentElement.classList.contains('inth-dark')).toBe(
			false
		);
	});

	test('sets dark theme correctly', async () => {
		await renderHook(() => useColorScheme('dark'));
		expect(document.documentElement.classList.contains('inth-dark')).toBe(true);
	});

	test('responds to system preference', async () => {
		mediaQueryList.matches = true;
		await renderHook(() => useColorScheme('system'));
		expect(document.documentElement.classList.contains('inth-dark')).toBe(true);
		expect(addEventListenerSpy).toHaveBeenCalledWith(
			'change',
			expect.any(Function)
		);
	});

	test('cleans up system preference listener on unmount', async () => {
		const { unmount } = await renderHook(() => useColorScheme('system'));
		unmount();
		expect(removeEventListenerSpy).toHaveBeenCalled();
	});

	test('updates theme when system preference changes', async () => {
		await renderHook(() => useColorScheme('system'));

		const { calls } = addEventListenerSpy.mock;
		const handler = calls[0]?.[1];
		if (!handler) {
			throw new Error('Callback not found');
		}

		(handler as (e: MediaQueryListEvent) => void)({
			matches: true,
		} as MediaQueryListEvent);

		expect(document.documentElement.classList.contains('inth-dark')).toBe(true);
	});

	test('does nothing when colorScheme is null (opt-out behavior)', async () => {
		// When colorScheme is null, the hook opts out and does nothing
		// This allows users to manage color scheme themselves
		document.documentElement.classList.add('dark');
		await renderHook(() => useColorScheme(null));
		expect(document.documentElement.classList.contains('inth-dark')).toBe(
			false
		);
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});
});
