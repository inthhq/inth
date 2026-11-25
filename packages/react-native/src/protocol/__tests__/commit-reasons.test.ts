/**
 * Every refusal a native core's `save` can return has a name in
 * `CommitFailureReason`, so a TypeScript consumer can tell each one apart.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

import { COMMIT_FAILURE_REASONS } from '../commit-payload.model';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');

const read = (path: string): string =>
	readFileSync(resolve(REPO, path), 'utf8');

/** Kotlin's save refuses through one helper, `refusedCommit(code, message)`. */
const kotlinRefusals = function kotlinRefusals(): string[] {
	const source = read(
		'packages/android/inth-core/src/main/kotlin/com/inth/core/ConsentCore.kt'
	);
	return [...source.matchAll(/refusedCommit\(\s*"(?<code>[a-z-]+)"/gu)].map(
		(match) => match.groups?.code ?? ''
	);
};

/** Swift's save refuses with `.failure(CoreErrorInfo(code: ...))` in its body. */
const swiftRefusals = function swiftRefusals(): string[] {
	const source = read('packages/swift/Sources/InthCore/ConsentCore.swift');
	const start = source.indexOf('public func save(_ intent: CommitIntent');
	const end = source.indexOf('\n    public func ', start + 1);
	const body = source.slice(start, end === -1 ? undefined : end);
	return [
		...body.matchAll(
			/\.failure\(\s*CoreErrorInfo\(\s*code: "(?<code>[a-z-]+)"/gu
		),
	].map((match) => match.groups?.code ?? '');
};

describe('commit refusal reasons', () => {
	test('name every code either core refuses a save with', () => {
		const kotlin = kotlinRefusals();
		const swift = swiftRefusals();
		expect(kotlin.length).toBeGreaterThan(5);
		expect(swift.length).toBeGreaterThan(5);
		const known = new Set<string>(COMMIT_FAILURE_REASONS);
		expect(
			[...new Set([...kotlin, ...swift])].filter((code) => !known.has(code))
		).toEqual([]);
	});
});
