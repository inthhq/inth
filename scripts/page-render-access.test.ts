import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The page object a server render's inline scripts write
 * (`window.__inthRender`) can belong to an earlier render after a
 * client-side navigation. Only the server start writes it, and only
 * `pageRender()` reads it, after checking its id against this document's
 * boot data. Any other read could trust another render's marks.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The one writer and the one reader, and the engine preload: an inline
 * script that runs before any module can, so it repeats `pageRender()`'s
 * id check in its own source.
 */
const ALLOWED = new Set([
	'packages/sdk/core/src/runtime/script-server-start.ts',
	'packages/sdk/react/src/deferred/boot.ts',
	'packages/sdk/react/src/deferred/engine-preload-script.ts',
]);

const PAGE_OBJECT =
	/__inthRender|__inthEndedRenders|PAGE_RENDER_KEY|ENDED_RENDERS_KEY/u;

const sourceFiles = (dir: string): string[] => {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return entry.name === '__tests__' || entry.name === 'node_modules'
				? []
				: sourceFiles(path);
		}
		return /\.(?:ts|tsx|svelte|vue)$/u.test(entry.name) &&
			!/\.test\.|\.spec\./u.test(entry.name)
			? [path]
			: [];
	});
};

describe('the render page object', () => {
	it('is read only through pageRender()', () => {
		const packages = [
			...readdirSync(join(REPO_ROOT, 'packages', 'sdk'), {
				withFileTypes: true,
			})
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(REPO_ROOT, 'packages', 'sdk', entry.name, 'src')),
			join(REPO_ROOT, 'packages', 'react-native', 'src'),
		];
		const offenders = packages
			.flatMap(sourceFiles)
			.map((path) => relative(REPO_ROOT, path))
			.filter((path) => !ALLOWED.has(path))
			.filter((path) =>
				PAGE_OBJECT.test(readFileSync(join(REPO_ROOT, path), 'utf8'))
			);
		expect(offenders).toEqual([]);
	});
});
