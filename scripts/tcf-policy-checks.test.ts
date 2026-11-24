import type { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

/**
 * Every IAB Europe non-web CMP form check that the native SDKs can test must
 * have a test on each platform. A test claims a check with a comment such as
 * `// TCF-CHECK: P3` (or `// TCF-CHECK: P7, P12`).
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECKS_FILE = 'packages/native-protocol/iab/tcf-policy-checks.json';

const PLATFORMS = ['swift', 'kotlin'] as const;
type Platform = (typeof PLATFORMS)[number];

interface PolicyCheck {
	id: string;
	title: string;
	platforms: Platform[];
	note?: string;
}

const EXPECTED_IDS = [
	...Array.from({ length: 13 }, (_, index) => `T${index + 1}`),
	// The form has no question 24.
	...Array.from({ length: 32 }, (_, index) => `P${index + 1}`).filter(
		(id) => id !== 'P24'
	),
];

const SKIPPED_DIRECTORIES = new Set([
	'.gradle',
	'.build',
	'build',
	'node_modules',
]);

const walk = function walk(directory: string, extensions: string[]): string[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return SKIPPED_DIRECTORIES.has(entry.name) ? [] : walk(path, extensions);
		}
		return extensions.some((extension) => entry.name.endsWith(extension))
			? [path]
			: [];
	});
};

/** Kotlin test roots: every module's `src/test` and `src/androidTest`. */
const kotlinTestRoots = function kotlinTestRoots(directory: string): string[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries.flatMap((entry) => {
		if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
			return [];
		}
		const path = join(directory, entry.name);
		if (entry.name === 'src') {
			return ['test', 'androidTest'].map((name) => join(path, name));
		}
		return kotlinTestRoots(path);
	});
};

const TEST_SOURCES: Record<Platform, () => string[]> = {
	kotlin: () =>
		kotlinTestRoots(join(REPO_ROOT, 'packages/android')).flatMap((root) =>
			walk(root, ['.kt', '.java'])
		),
	swift: () => walk(join(REPO_ROOT, 'packages/swift/Tests'), ['.swift']),
};

const MARKER = /TCF-CHECK:\s*(?<ids>[TP]\d+(?:\s*,\s*[TP]\d+)*)\b/gu;

/**
 * Reads the check ids a source file claims. Ids match whole, so `P3` is not
 * found in `P30`.
 */
const markerIds = function markerIds(source: string): string[] {
	return [...source.matchAll(MARKER)].flatMap((match) =>
		(match.groups?.ids ?? '').split(',').map((id) => id.trim())
	);
};

const checks = JSON.parse(
	readFileSync(join(REPO_ROOT, CHECKS_FILE), 'utf8')
) as PolicyCheck[];

const markersByPlatform = Object.fromEntries(
	PLATFORMS.map((platform) => {
		const found = new Map<string, string[]>();
		for (const file of TEST_SOURCES[platform]()) {
			for (const id of markerIds(readFileSync(file, 'utf8'))) {
				found.set(id, [...(found.get(id) ?? []), relative(REPO_ROOT, file)]);
			}
		}
		return [platform, found];
	})
) as Record<Platform, Map<string, string[]>>;

describe('markerIds', () => {
	it('matches whole ids only', () => {
		expect(markerIds('// TCF-CHECK: P30')).toEqual(['P30']);
		expect(markerIds('// TCF-CHECK: P3')).toEqual(['P3']);
		expect(markerIds('// TCF-CHECK: P3x')).toEqual([]);
		expect(markerIds('// TCF-CHECK: P7, P12\n/* TCF-CHECK: T1 */')).toEqual([
			'P7',
			'P12',
			'T1',
		]);
	});
});

describe(CHECKS_FILE, () => {
	it('lists every form check once', () => {
		expect(checks.map(({ id }) => id)).toEqual(EXPECTED_IDS);
	});

	it('explains every check it leaves untested', () => {
		for (const check of checks) {
			expect(check.title.trim(), check.id).not.toBe('');
			for (const platform of check.platforms) {
				expect(PLATFORMS, check.id).toContain(platform);
			}
		}
		const partial = checks.filter(
			({ platforms }) => platforms.length < PLATFORMS.length
		);
		for (const check of partial) {
			expect(check.note?.trim(), `${check.id} needs a note`).toBeTruthy();
		}
	});

	it('has a native test marked TCF-CHECK for each check on each platform', () => {
		const missing = Object.fromEntries(
			PLATFORMS.map((platform) => [
				platform,
				checks
					.filter(({ platforms }) => platforms.includes(platform))
					.map(({ id }) => id)
					.filter((id) => !markersByPlatform[platform].has(id)),
			])
		) as Record<Platform, string[]>;
		const report = PLATFORMS.filter((platform) => missing[platform].length > 0)
			.map((platform) => `${platform}: ${missing[platform].join(', ')}`)
			.join('\n');

		expect(
			missing,
			`Add a test with a "// TCF-CHECK: <id>" comment for:\n${report}`
		).toEqual({
			kotlin: [],
			swift: [],
		});
	});

	it('has no TCF-CHECK marker for an unknown check', () => {
		const known = new Set(EXPECTED_IDS);
		const unknown = PLATFORMS.flatMap((platform) =>
			[...markersByPlatform[platform]]
				.filter(([id]) => !known.has(id))
				.map(([id, files]) => `${id} in ${files.join(', ')}`)
		);
		expect(unknown).toEqual([]);
	});
});
