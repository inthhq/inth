import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Suffixes that may exist under both prefixes because one name is read as a
 * fallback for the other, or because the two are separate code identifiers.
 * `*_INTH_PROJECT_URL` and its fallback `*_C15T_BACKEND_URL` need no entry:
 * their suffixes differ, so only a stray spelling of either one fails.
 */
const allowedBothPrefixes: Record<string, string> = {
	ON_BUILD_ERROR:
		'build-time manifest code reads C15T_ON_BUILD_ERROR after INTH_ON_BUILD_ERROR',
	TO_IAB_PURPOSE_MAP:
		'TypeScript export; the Swift and Kotlin comments that name it are synced from packages/swift and packages/android',
};

/**
 * Files that record past names on purpose. `packages/cli/vendor` is upstream
 * c15t source kept as it ships.
 */
const isHistorical = (path: string) =>
	path.endsWith('CHANGELOG.md') ||
	path.startsWith('benchmarks/reports/') ||
	path.startsWith('packages/cli/vendor/');

const tokenPattern =
	/(?<![A-Za-z0-9_])[A-Z0-9_]*(?:C15T|INTH)_[A-Z0-9_]+(?![A-Za-z0-9_])/gu;
const brandPattern = /(?:^|_)(?<brand>C15T|INTH)_/gu;

/**
 * Map each name suffix (the part after `C15T_` or `INTH_`, ignoring any prefix
 * such as `EXPO_PUBLIC_` or `SIMCTL_CHILD_`) to where each spelling appears.
 */
const collectSuffixes = function collectSuffixes() {
	const files = execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\0')
		.filter((path) => path && !isHistorical(path));
	const suffixes = new Map<string, Record<'C15T' | 'INTH', Set<string>>>();
	for (const path of files) {
		let text: string;
		try {
			text = readFileSync(resolve(root, path), 'utf8');
		} catch {
			continue;
		}
		if (text.includes('\0')) {
			continue;
		}
		for (const [token] of text.matchAll(tokenPattern)) {
			for (const match of token.matchAll(brandPattern)) {
				const brand = match.groups?.brand as 'C15T' | 'INTH';
				const suffix = token.slice((match.index ?? 0) + match[0].length);
				const entry = suffixes.get(suffix) ?? {
					C15T: new Set(),
					INTH: new Set(),
				};
				entry[brand].add(`${path}: ${token}`);
				suffixes.set(suffix, entry);
			}
		}
	}
	return suffixes;
};

describe('environment and constant names', () => {
	const suffixes = collectSuffixes();

	test('each name is spelled with one prefix, C15T_ or INTH_', () => {
		const split = [...suffixes]
			.filter(
				([suffix, entry]) =>
					entry.C15T.size > 0 &&
					entry.INTH.size > 0 &&
					!(suffix in allowedBothPrefixes)
			)
			.map(([suffix, entry]) => ({
				C15T: [...entry.C15T].sort(),
				INTH: [...entry.INTH].sort(),
				suffix,
			}));
		expect(split).toEqual([]);
	});

	test('every allowed suffix still has both spellings', () => {
		const stale = Object.keys(allowedBothPrefixes).filter((suffix) => {
			const entry = suffixes.get(suffix);
			return !entry || entry.C15T.size === 0 || entry.INTH.size === 0;
		});
		expect(stale).toEqual([]);
	});
});
