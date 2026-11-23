/// <reference types="node" />
/**
 * The record transport ships to every Next.js page that renders
 * `InthProvider`, because saves go through it. Init never runs on those pages
 * when the server resolved the visitor's state, so a static import of the
 * init path would put its bytes back into every first load.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const STATIC_VALUE_IMPORT =
	/^(?:import|export)\s+(?!type\b)(?:\{(?<names>[^}]*)\}|[^;]*?)\s*from\s+'(?<specifier>[^']+)';/gmu;

const resolveRelative = function resolveRelative(
	from: string,
	specifier: string
): string {
	const base = normalize(join(dirname(from), specifier));
	for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error(`Cannot resolve ${specifier} from ${from}`);
};

/** Source files and bare-specifier imports reachable through value imports. */
const staticGraph = function staticGraph(entry: string): {
	files: string[];
	packageImports: string[];
} {
	const files = new Set<string>();
	const packageImports = new Set<string>();
	const pending = [join(SOURCE_DIR, entry)];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (files.has(file)) {
			continue;
		}
		files.add(file);
		for (const match of readFileSync(file, 'utf8').matchAll(
			STATIC_VALUE_IMPORT
		)) {
			const specifier = match.groups?.specifier as string;
			if (specifier.startsWith('.')) {
				pending.push(resolveRelative(file, specifier));
				continue;
			}
			for (const name of (match.groups?.names ?? '').split(',')) {
				const [imported] = name.trim().split(/\s+as\s+/u);
				if (imported && !imported.startsWith('type ')) {
					packageImports.add(`${specifier}#${imported}`);
				}
			}
		}
	}
	return {
		files: [...files].map((file) => file.slice(SOURCE_DIR.length + 1)),
		packageImports: [...packageImports],
	};
};

describe('hosted record transport graph', () => {
	test.each([
		'transports/v1/records.ts',
		'transports/v1/init-request.ts',
		'libs/prefetch/window-key.ts',
	])('%s reaches no init-path module', (entry) => {
		const { files, packageImports } = staticGraph(entry);
		expect(files).not.toContain('transports/v1/hosted.ts');
		expect(files).not.toContain('transports/init-output.ts');
		expect(files).not.toContain('libs/request-context.ts');
		expect(files).not.toContain('libs/prefetch/prefetch.ts');
		expect(files).not.toContain('libs/prefetch/prefetch.api.ts');
		expect(packageImports).not.toContain(
			'@inth/sdk/schema/types#extractConsentRequestInputs'
		);
	});

	test.each(['index.ts', 'transports/index.ts', 'runtime/client-mode.ts'])(
		'%s does not load every language, as the server resolvers do',
		(entry) => {
			const { packageImports } = staticGraph(entry);
			expect(
				packageImports.filter((name) =>
					name.startsWith('@inth/sdk-translations/all#')
				)
			).toEqual([]);
		}
	);

	test.each(['index.ts', 'runtime/index.ts', 'runtime/client-mode.ts'])(
		'%s does not reach the testing transport or the offline transport',
		(entry) => {
			const { files } = staticGraph(entry);

			expect(files).not.toContain('transports/testing.ts');
			expect(files).not.toContain('transports/offline.ts');
		}
	);
});
