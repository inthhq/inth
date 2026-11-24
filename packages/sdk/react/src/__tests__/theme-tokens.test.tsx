/**
 * The prebuilt styles read `--inth-*` custom properties. `ConsentTheme`
 * renders them for a custom theme; the provider no longer generates theme
 * CSS in the browser. Kept in its own file: the provider suite leaves
 * overlapping act() work behind that starves a trailing render of its
 * effects.
 */
import { describe, expect, test, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-react';

import { InthProvider, ConsentTheme } from '../index';
import { testing } from '../testing';

// Raw source text, inlined by Vite so the scan works in browser-mode vitest.
const rawSources = import.meta.glob(
	[
		'../**/*.{ts,tsx}',
		'!../**/__tests__/**',
		'!../**/*.test.*',
		'!../consent-theme.tsx',
		// The public `@inth/react/utils` helpers, for server or build-time use.
		'!../utils/theme-utils.ts',
	],
	{ eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

describe('InthProvider theme tokens', () => {
	test('no client module imports the theme generator', () => {
		expect(Object.keys(rawSources)).toContain('../provider.tsx');
		const offending = Object.entries(rawSources)
			.filter(([, text]) =>
				/^import\s+(?!type\b)\{[^}]*\b(?:generateThemeCSS|defaultTheme|themeToVars)\b[^}]*\}\s*from\s+'@inth\/sdk\/ui\/theme';/mu.test(
					text
				)
			)
			.map(([file]) => file);

		expect(offending).toEqual([]);
	});

	test('the provider injects no theme style', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
				}}
			>
				<div data-testid="themed-child" />
			</InthProvider>
		);
		expect(document.getElementById('inth-theme')).toBeNull();
		unmount();
	});

	test('ConsentTheme applies the CSP nonce and the provider applies it to loader scripts', async () => {
		const { unmount } = await render(
			<>
				<ConsentTheme nonce="csp-nonce" />
				<InthProvider
					options={{
						enabled: false,
						mode: testing(),
						nonce: 'csp-nonce',
						persistence: false,
						scripts: [
							{
								category: 'marketing',
								id: 'nonce-script',
								src: 'https://example.com/nonce.js',
							},
						],
					}}
				>
					<div />
				</InthProvider>
			</>
		);
		await vi.waitFor(() => {
			expect(document.getElementById('inth-theme')?.nonce).toBe('csp-nonce');
			expect(
				document.head.querySelector<HTMLScriptElement>(
					'script[src="https://example.com/nonce.js"]'
				)?.nonce
			).toBe('csp-nonce');
		});
		unmount();
	});

	test('a ConsentTheme theme replaces the defaults', async () => {
		const theme = { colors: { surface: 'rgb(1, 2, 3)' } };
		const { unmount } = await render(
			<>
				<ConsentTheme theme={theme} />
				<InthProvider
					options={{
						mode: testing(),
						persistence: false,
						theme,
					}}
				>
					<div />
				</InthProvider>
			</>
		);
		await vi.waitFor(() => {
			expect(
				getComputedStyle(document.documentElement).getPropertyValue(
					'--inth-surface'
				)
			).toContain('rgb(1, 2, 3)');
		});
		unmount();
	});

	test('warns in development when theme tokens have no ConsentTheme', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			const { unmount } = await render(
				<InthProvider
					options={{
						mode: testing(),
						persistence: false,
						theme: { colors: { surface: 'rgb(1, 2, 3)' } },
					}}
				>
					<div />
				</InthProvider>
			);
			await vi.waitFor(() => {
				expect(warn).toHaveBeenCalledWith(
					expect.stringContaining('<ConsentTheme theme={theme} />')
				);
			});
			unmount();
		} finally {
			warn.mockRestore();
		}
	});
});
