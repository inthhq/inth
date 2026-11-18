import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

/**
 * App teams' E2E suites tap the stock native consent screens by these IDs, and
 * the Maestro subflows in `@inth/react-native/maestro` ship them. Renaming one
 * on either platform breaks every suite built on it, so each documented ID
 * must stay in the Swift and Kotlin sources and on the docs page, and the
 * shipped flows may use only documented IDs.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAESTRO_DIR = join(REPO_ROOT, 'packages/react-native/maestro');
const DOCS_PAGE = join(
	REPO_ROOT,
	'packages/sdk/docs/frameworks/react-native/e2e-testing.mdx'
);

const PLATFORM_SOURCES = {
	android: 'packages/android/inth-consent-ui/src/main',
	ios: 'packages/swift/Sources/InthConsentUI',
} as const;

interface Selector {
	readonly description: string;
	readonly id: string;
	readonly screen: string;
}

const { selectors } = JSON.parse(
	readFileSync(join(MAESTRO_DIR, 'selectors.json'), 'utf8')
) as { selectors: readonly Selector[] };

const walk = function walk(directory: string, pattern: RegExp): string[] {
	const entries: Dirent[] = readdirSync(directory, { withFileTypes: true });
	return entries.flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return walk(path, pattern);
		}
		return pattern.test(entry.name) ? [path] : [];
	});
};

const escape = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Splits `inth.prefs.category.<category>.switch` into literals and slots. */
const parts = (id: string): string[] => id.split(/<[a-z]+>/u);

/**
 * The ID as one string literal in Swift (`"a.\(x).b"`) or Kotlin
 * (`"a.$x.b"`, `"a.${x.y}.b"`), with each `<slot>` an interpolation.
 */
const literalPattern = (id: string): RegExp => {
	const interpolation = String.raw`(?:\\\([^)]*\)|\$\{[^}]*\}|\$[A-Za-z_]\w*)`;
	return new RegExp(`"${parts(id).map(escape).join(interpolation)}"`, 'u');
};

/** The ID with each slot filled, for matching a flow's selector against it. */
const sample = (id: string): string => parts(id).join('sample');

/**
 * Every `id:` selector in a flow, as Maestro reads it: a regular expression
 * matched against the whole ID, with `${VAR}` filled at runtime.
 */
const flowSelectors = (value: unknown): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap(flowSelectors);
	}
	if (value === null || typeof value !== 'object') {
		return [];
	}
	return Object.entries(value).flatMap(([key, child]) =>
		key === 'id' && typeof child === 'string' ? [child] : flowSelectors(child)
	);
};

const FLOWS = walk(MAESTRO_DIR, /\.yaml$/u);

describe('native consent selectors', () => {
	it('lists selectors and flows to guard', () => {
		expect(selectors.length).toBeGreaterThan(20);
		expect(new Set(selectors.map(({ id }) => id)).size).toBe(selectors.length);
		expect(FLOWS.length).toBeGreaterThan(0);
	});

	for (const [platform, root] of Object.entries(PLATFORM_SOURCES)) {
		it(`keeps every documented selector in the ${platform} screens`, () => {
			const source = walk(join(REPO_ROOT, root), /\.(?:swift|kt)$/u)
				.map((file) => readFileSync(file, 'utf8'))
				.join('\n');
			const missing = selectors
				.map(({ id }) => id)
				.filter((id) => !literalPattern(id).test(source));
			expect(missing, `missing from ${root}`).toEqual([]);
		});
	}

	it('documents every selector on the E2E testing page', () => {
		const page = readFileSync(DOCS_PAGE, 'utf8');
		const missing = selectors
			.map(({ id }) => id)
			.filter((id) => !page.includes(`\`${id}\``));
		expect(missing).toEqual([]);
	});

	it('uses only documented selectors in the shipped Maestro flows', () => {
		const samples = selectors.map(({ id }) => sample(id));
		const unknown = FLOWS.flatMap((file) => {
			const documents = parseAllDocuments(readFileSync(file, 'utf8'));
			return documents
				.flatMap((document) => flowSelectors(document.toJS()))
				.filter((selector) => {
					const pattern = new RegExp(
						`^(?:${selector.replace(/\$\{[^}]*\}/gu, '.+')})$`,
						'u'
					);
					return !samples.some((id) => pattern.test(id));
				})
				.map((selector) => `${relative(REPO_ROOT, file)}: ${selector}`);
		});
		expect(unknown).toEqual([]);
	});
});
