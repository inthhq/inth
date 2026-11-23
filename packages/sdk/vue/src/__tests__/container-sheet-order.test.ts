/**
 * A server render inlines the prompt's sheets in the order the browser
 * applies them.
 *
 * A container's classes (Card, Banner, Drawer) sit next to the surface's
 * on the same elements and override them, so the container's sheet must
 * come after the surface's. In the browser it does: the container's chunk
 * links its own CSS after the CSS of the chunks it imports. Nuxt's
 * `features.inlineStyles` inlines each server-rendered component's sheets
 * in render order, parent first, and lists the CSS of a component's own
 * chunk before the sheets it imports. With the container component as its
 * chunk's entry, the Card's sheet came first, and the page shifted when
 * the browser's links reordered the rules (the Nuxt manifest SSR journey
 * measured a layout shift of 0.05 to 0.07).
 *
 * So each container's chunk starts at a script that re-exports the
 * component, and the component imports the surface's sheet before its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

const promptDir = join(__dirname, '../runtime/components/prompt');
const read = (file: string): string =>
	readFileSync(join(promptDir, file), 'utf8');

const CONTAINERS = [
	['banner', 'strip', 'consent-banner'],
	['card', 'card', 'consent-card'],
	['drawer', 'drawer', 'consent-drawer'],
] as const;

describe('the prompt containers in a Nuxt server render', () => {
	test.each(CONTAINERS)(
		'the %s chunk starts at a script, not at its component',
		(type, file) => {
			const loader = new RegExp(
				`${type}: \\(\\) => import\\('(?<specifier>[^']+)'\\)`,
				'u'
			).exec(read('prompt-containers.ts'))?.groups?.specifier;
			expect(loader).toBe(`./chunks/${file}`);
			expect(read(`chunks/${file}.ts`)).toContain(
				`export { default } from '../${file}.vue';`
			);
		}
	);

	test.each(CONTAINERS)(
		'the %s component imports the surface sheet before its own',
		(_type, file, sheet) => {
			const source = read(`${file}.vue`);
			const surface = source.indexOf(
				"import '@inth/sdk/ui/styles/components/consent-surface.css';"
			);
			const own = source.indexOf(
				`import '@inth/sdk/ui/styles/components/${sheet}.css';`
			);
			expect(surface).toBeGreaterThan(-1);
			expect(own).toBeGreaterThan(surface);
		}
	);
});
