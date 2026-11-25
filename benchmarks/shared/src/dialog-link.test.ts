import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import { gateSelectors } from './consent-gate-page';
import { dialogLinkSelector } from './dialog-link';

const benchmarks = fileURLToPath(new URL('../..', import.meta.url));
const SKIPPED = new Set([
	'.angular',
	'.astro',
	'.next',
	'.nuxt',
	'.output',
	'.svelte-kit',
	'dist',
	'node_modules',
	'reports',
]);

const sources = function sources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return SKIPPED.has(entry.name) ? [] : sources(path);
		}
		return /\.(?:ts|tsx|mjs)$/u.test(entry.name) &&
			!entry.name.endsWith('.test.ts')
			? [path]
			: [];
	});
};

/** The page each framework's consent gate measures. */
const GATE_PAGES = [
	'angular-browser-bench/src/gate/app/app.ts',
	'astro-browser-bench/src/pages/gate/index.astro',
	'nextjs-browser-bench/app/gate/consent.tsx',
	'nuxt-browser-bench/app/pages/gate/index.vue',
	'react-browser-bench/app/gate/page.tsx',
	'sveltekit-browser-bench/src/routes/gate/+layout.svelte',
	'tanstack-start-browser-bench/src/bench/gate.tsx',
];

describe('bench dialog steps', () => {
	// Customize expands the banner in place and opens no dialog, so a bench
	// that presses it to open the dialog times out or measures nothing.
	it('never opens the dialog through the banner Customize button', () => {
		const pressing = sources(benchmarks)
			.filter((path) =>
				readFileSync(path, 'utf8').includes('consent-banner-customize-button')
			)
			.map((path) => relative(benchmarks, path));
		expect(pressing).toEqual([]);
	});

	it('opens the gate dialog from the Privacy settings link every gate page renders', () => {
		expect(Object.keys(gateSelectors)).not.toContain('customize');
		expect(gateSelectors.preferencesLink).toContain(
			'[data-testid="consent-dialog-link"]'
		);
		expect(gateSelectors.preferencesLink).toContain(
			'[data-testid="privacy-choices-link"]'
		);
		for (const page of GATE_PAGES) {
			expect(readFileSync(join(benchmarks, page), 'utf8'), page).toMatch(
				/ConsentDialogLink|PrivacyChoicesLink/u
			);
		}
	});

	it('covers the links each starter renders', () => {
		for (const testId of ['privacy-choices-link', 'consent-dialog-link']) {
			expect(dialogLinkSelector).toContain(`[data-testid="${testId}"]`);
		}
		// The script-tag starters link to the dialog by hash.
		expect(dialogLinkSelector).toContain('a[href="#inth-preferences"]');
	});
});
