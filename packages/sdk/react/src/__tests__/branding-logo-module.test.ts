/**
 * The banner renders the branding logos on every page, so their module ships
 * in the first load. Bundlers keep or drop whole modules, so an icon defined
 * next to the logos ships with them even when only the dialog trigger uses
 * it. The trigger icons live in modules of their own, imported by the trigger.
 */
import { describe, expect, test } from 'vite-plus/test';

// Raw source text, inlined by Vite so the scan works in browser-mode vitest.
const rawSources = import.meta.glob(
	['../**/*.{ts,tsx}', '!../**/__tests__/**', '!../**/*.test.*'],
	{ eager: true, import: 'default', query: '?raw' }
) as Record<string, string>;

describe('branding logo module', () => {
	test('holds only the branding marks', () => {
		const logo = rawSources['../components/shared/ui/brand-mark-icon.tsx'];

		expect(logo).toBeDefined();
		expect(logo).not.toMatch(/FingerprintIcon|SettingsIcon/u);
	});

	test('only the dialog trigger imports the trigger icons', () => {
		const importers = Object.entries(rawSources)
			.filter(([, text]) =>
				/from '[^']*(?:fingerprint|settings|dev-tools)-icon'/u.test(text)
			)
			.map(([file]) => file)
			.sort();

		// The trigger's icon and its DevTools toolbar.
		expect(importers).toEqual([
			'../components/panel-trigger/atoms/trigger-icon.tsx',
			'../components/panel-trigger/atoms/trigger-toolbar.tsx',
		]);
	});
});
