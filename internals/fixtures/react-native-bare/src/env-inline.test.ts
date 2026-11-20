import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
// The fixture has no @babel/core types; this is the one call the test needs.
const { transformSync } = require('@babel/core') as {
	transformSync: (
		code: string,
		options: Record<string, unknown>
	) => { code?: string | null } | null;
};
const root = join(__dirname, '..');
const babelConfig = require('../babel.config.js') as { plugins: unknown[] };
const [inlineEnv] = babelConfig.plugins;

const sources = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return sources(path);
		}
		return /\.tsx?$/u.test(entry.name) && !entry.name.endsWith('.test.ts')
			? [path]
			: [];
	});

// React Native has no process.env at runtime. A read the build does not inline
// is undefined in the app, which silently turns off the E2E observer.
describe('babel.config.js', () => {
	it('inlines every process.env read in the app source', () => {
		const files = [join(root, 'App.tsx'), ...sources(join(root, 'src'))];
		const leftovers = files.flatMap((file) => {
			const code = transformSync(readFileSync(file, 'utf8'), {
				babelrc: false,
				comments: false,
				configFile: false,
				filename: file,
				parserOpts: { plugins: ['typescript', 'jsx'] },
				plugins: [inlineEnv as never],
			})?.code;
			return (code?.match(/process\.env\.[A-Z0-9_]+/gu) ?? []).map(
				(read) => `${relative(root, file)}: ${read}`
			);
		});

		expect(leftovers).toEqual([]);
	});
});
