/**
 * The script-tag build inlines only the `@inth/sdk/ui` rules its surfaces can
 * match.
 *
 * `@inth/sdk/ui/styles.css` also styles the headless primitives, tabs,
 * collapsibles and the ConsentGate placeholder, which the vanilla and IAB
 * surfaces never render. `scripts/build-styles.ts` prunes them; these
 * tests read what it generated (`bun prebuild` runs before the suite).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vite-plus/test';

import {
	collectClassNames,
	compactStylesheet,
	pruneStylesheet,
} from '../../scripts/prune-stylesheet';
import {
	classes as iabClasses,
	stylesheet as iabStylesheet,
} from '../generated/iab-styles';
import { classes, stylesheet } from '../generated/styles';

const require = createRequire(import.meta.url);
const uiStylesheet = (specifier: string) =>
	readFileSync(require.resolve(specifier), 'utf8');
const uiMainStylesheet = () => uiStylesheet('@inth/sdk-ui/styles.css');

const rendered = collectClassNames([classes, iabClasses]);

/** Every hashed ui class a sheet's selectors require, outside `:not()`. */
const requiredUiClasses = (css: string): Set<string> => {
	const names = new Set<string>();
	const withoutNegations = css.replace(/:not\((?:[^()]|\([^()]*\))*\)/gu, '');
	for (const match of withoutNegations.matchAll(
		/\.(?<name>inth-ui-[\w-]+-[\w-]{5})(?![\w-])/gu
	)) {
		names.add(match.groups?.name ?? '');
	}
	return names;
};

describe('inlined stylesheet', () => {
	it('carries no rule that needs a class these surfaces never render', () => {
		const unrendered = [
			...requiredUiClasses(stylesheet),
			...requiredUiClasses(iabStylesheet),
		].filter((name) => !rendered.has(name));
		expect(unrendered).toEqual([]);
	});

	it('keeps every rule the surfaces can match', () => {
		expect(stylesheet).toBe(
			compactStylesheet(pruneStylesheet(uiMainStylesheet(), rendered))
		);
		expect(iabStylesheet).toBe(
			compactStylesheet(
				pruneStylesheet(uiStylesheet('@inth/sdk-ui/iab/styles.css'), rendered)
			)
		);
		expect(stylesheet).not.toContain('/*');
		expect(iabStylesheet).not.toContain('/*');
		// The tokens and the shared parts' rules are there.
		expect(stylesheet).toContain('--inth-surface');
		expect(stylesheet).toContain(`.${classes.button.button?.split(' ')[0]}`);
	});

	it('is smaller than the full @inth/sdk/ui stylesheet', () => {
		// The prompt and the dialog add their own sheets, so pruning leaves
		// their rules out, with the collapsible, tabs and ConsentGate rules.
		expect(stylesheet.length).toBeLessThan(uiMainStylesheet().length * 0.98);
	});
});

describe('pruneStylesheet', () => {
	const used = new Set(['inth-ui-root-AAAAA']);
	const keeps = (selector: string) =>
		pruneStylesheet(`${selector}{color:red}`, used) !== '';

	it('drops a selector that needs an unrendered ui class', () => {
		expect(keeps('.inth-ui-list-BBBBB .inth-ui-root-AAAAA')).toBe(false);
		expect(keeps('.inth-ui-root-AAAAA:has(.inth-ui-x-CCCCC)')).toBe(false);
	});

	it('ignores negations and classes @inth/sdk/ui does not generate', () => {
		expect(keeps('.inth-ui-root-AAAAA:not(.inth-ui-x-CCCCC)')).toBe(true);
		expect(keeps('.inth-dark .inth-ui-root-AAAAA')).toBe(true);
		expect(keeps(':root,:host')).toBe(true);
	});

	it('drops only the unmatchable selectors of a rule', () => {
		expect(
			pruneStylesheet(
				'.inth-ui-root-AAAAA,.inth-ui-x-CCCCC{color:red}@media (min-width:1px){.inth-ui-x-CCCCC{color:blue}}@keyframes k{0%{opacity:0}}',
				used
			)
		).toBe('.inth-ui-root-AAAAA{color:red}@keyframes k{0%{opacity:0}}');
	});

	it('drops a component variable only the removed rules read', () => {
		expect(
			pruneStylesheet(
				':root,:host{--tabs-gap:1px;--tabs-ring:var(--tabs-color);--tabs-color:red;--root-gap:2px;--unread:3px;--inth-tabs:4px}:root,:host{--tabs-only:0}.inth-ui-x-CCCCC{gap:var(--tabs-gap);outline-color:var(--tabs-ring);margin:var(--inth-tabs) var(--tabs-only)}.inth-ui-root-AAAAA{gap:var(--root-gap)}',
				used
			)
		).toBe(
			':root,:host{--root-gap:2px;--unread:3px;--inth-tabs:4px}.inth-ui-root-AAAAA{gap:var(--root-gap)}'
		);
	});

	it('keeps a variable a kept rule still reads', () => {
		expect(
			pruneStylesheet(
				':root{--shared:1px;--chain:var(--shared)}.inth-ui-x-CCCCC{gap:var(--shared)}.inth-ui-root-AAAAA{gap:var(--chain)}',
				used
			)
		).toBe(
			':root{--shared:1px;--chain:var(--shared)}.inth-ui-root-AAAAA{gap:var(--chain)}'
		);
	});
});

describe('compactStylesheet', () => {
	it('drops comments and whitespace between rules, keeping every value', () => {
		expect(
			compactStylesheet(
				[
					'@layer theme, components;',
					'',
					'/* tokens */',
					':root, :host {',
					'\t--x: hsl(0, 0%, 90%);',
					'\tcolor: var(--x, red) !important;',
					'}',
					'',
					'@media (min-width: 640px) {',
					'\t.a .b { margin: 0 auto }',
					'}',
					'@keyframes k { 0% { opacity: 0 } }',
					'',
				].join('\n')
			)
		).toBe(
			'@layer theme, components;:root, :host{--x: hsl(0, 0%, 90%);color: var(--x, red) !important;}@media (min-width: 640px) {.a .b{margin: 0 auto}}@keyframes k {0%{opacity: 0}}'
		);
	});
});
