import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

/**
 * The Svelte dialog island has to host the opt-out and opt-in
 * confirmations: Astro mounts it when either opens, and Svelte's bare
 * dialog panel renders neither, so a `ui: 'svelte'` page showed nothing
 * after an opt-out. The package's own test run has no Svelte compiler, so
 * this asserts the island's source; the Astro Storybook's opt-out
 * confirmation stories cover the rendered result under parity.
 */
describe('the Svelte dialog island', () => {
	const source = readFileSync(
		join(process.cwd(), 'src/components/islands/panel-surface.svelte'),
		'utf8'
	);

	it("renders Svelte's ConsentDialog, which hosts the confirmations", () => {
		expect(source).toMatch(
			/import\s*\{[^}]*\bConsentDialog\b[^}]*\}\s*from\s*'@inth\/svelte'/u
		);
		expect(source).toContain('<ConsentDialog {legalLinks} />');
		expect(source).not.toContain('<ConsentDialogPanel');
	});

	it('shows the standalone confirmation when the page has <OptOutConfirmation />', () => {
		expect(source).toContain('[data-inth-opt-out-confirmation-host]');
		expect(source).toMatch(
			/\{#if standaloneOptOut\}\s*<OptOutConfirmation \/>\s*\{\/if\}/u
		);
	});
});
