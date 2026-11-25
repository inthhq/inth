/**
 * Forced colours (Windows High Contrast) drop author backgrounds and box
 * shadows. A control drawn only with those disappears, and so does a focus
 * ring drawn as a shadow (WCAG 1.4.11, 2.4.7). These read the source
 * sheets: no test browser here can turn forced colours on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

const STYLES = join(__dirname, '..');
const read = (path: string) => readFileSync(join(STYLES, path), 'utf8');

/** The body of the sheet's `@media (forced-colors: active)` block. */
const forcedColors = (css: string): string => {
	const start = css.indexOf('@media (forced-colors: active)');
	if (start === -1) {
		return '';
	}
	let depth = 0;
	for (let index = css.indexOf('{', start); index < css.length; index += 1) {
		if (css[index] === '{') {
			depth += 1;
		} else if (css[index] === '}') {
			depth -= 1;
			if (depth === 0) {
				return css.slice(start, index + 1);
			}
		}
	}
	return '';
};

describe('forced colours', () => {
	test('the dialog draws its switch, selected option and edge in system colours', () => {
		const block = forcedColors(read('components/consent-dialog.module.css'));
		expect(block).toMatch(/\.switch \{[^}]*forced-color-adjust: none/u);
		expect(block).toMatch(/\.switch::after \{[^}]*background: ButtonText/u);
		expect(block).toMatch(
			/\.switch\[aria-checked='true'\] \{[^}]*background: Highlight/u
		);
		expect(block).toMatch(/\.segmentedThumb \{[^}]*outline:/u);
		expect(block).toMatch(/\.card,\s*\.confirm \{[^}]*outline:/u);
	});

	test.each(['components/switch.module.css', 'primitives/switch.module.css'])(
		'%s draws its track and thumb in system colours',
		(path) => {
			const block = forcedColors(read(path));
			expect(block).toMatch(/\.track \{[^}]*background-color: ButtonFace/u);
			// The thumb is drawn by its `::before`.
			expect(block).toMatch(
				/\.thumb::before \{[^}]*background-color: ButtonText/u
			);
			expect(block).toMatch(
				/\[data-state='checked'\] \.track \{[^}]*background-color: Highlight/u
			);
			// The dark, hover and disabled rules are more specific, so every
			// colour here must be `!important` to hold.
			for (const [declaration] of block.matchAll(
				/(?:background-color|box-shadow|opacity|outline-color): [^;]+;/gu
			)) {
				expect(declaration).toMatch(/!important;$/u);
			}
		}
	);

	test.each(['components/button.module.css', 'primitives/button.module.css'])(
		'a focused button in %s keeps an outline for forced colours to paint',
		(path) => {
			const bodies = [
				...read(path).matchAll(/:focus-visible[^{}]*\{(?<body>[^}]*)\}/gu),
			]
				.map((rule) => rule.groups?.body ?? '')
				.filter((body) => /outline:/u.test(body));
			expect(bodies.length).toBeGreaterThan(0);
			for (const body of bodies) {
				expect(body).not.toMatch(/outline:\s*(?:none|0)\b/u);
			}
		}
	);
});
