/**
 * Vue components include their own styles: Vue apps do not import the
 * aggregated stylesheet. `@inth/sdk/ui` class maps carry no CSS, so every runtime
 * file that reads a class map must also import that component's stylesheet,
 * or the component renders unstyled.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

const RUNTIME_DIR = join(__dirname, '..', 'runtime');
const CLASS_MAP_IMPORT =
	/import\s+\w+\s+from\s+'@inth\/sdk\/ui\/styles\/components\/(?<name>[a-z-]+)';/gu;

const listSources = function listSources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === '__tests__' ? [] : listSources(path);
		}
		return /\.(?:vue|ts)$/u.test(entry.name) ? [path] : [];
	});
};

const sources = listSources(RUNTIME_DIR)
	.map((path) => ({ path, text: readFileSync(path, 'utf8') }))
	.filter(({ text }) => text.includes('@inth/sdk/ui/styles/components/'));

describe('Vue runtime imports the stylesheet for every class map it reads', () => {
	test('finds runtime files that read class maps', () => {
		expect(sources.length).toBeGreaterThan(10);
	});

	for (const { path, text } of sources) {
		test(relative(RUNTIME_DIR, path), () => {
			const missing = [...text.matchAll(CLASS_MAP_IMPORT)]
				.map((match) => match.groups?.name ?? '')
				.filter(
					(name) =>
						!text.includes(
							`import '@inth/sdk/ui/styles/components/${name}.css';`
						)
				);

			expect(missing).toEqual([]);
		});
	}
});
