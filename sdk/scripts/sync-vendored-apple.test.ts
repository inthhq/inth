import {
	appendFileSync,
	cpSync,
	mkdtempSync,
	readdirSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import {
	scanPackedVendoredSources,
	scanVendoredNativeSources,
} from './check-publish-artifacts';
import { compareTrees } from './sync-vendored-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'native/core-swift/Sources/C15tApple');
const vendored = join(root, 'packages/react-native/vendor/C15tApple');

test('the CocoaPods Apple module matches the standalone module', () => {
	expect(readdirSync(source)).toContain('C15tApple.swift');
	expect(compareTrees(source, vendored)).toEqual([]);
});

test('publish checks reject stale and unpacked Apple platform sources', () => {
	const directory = mkdtempSync(join(tmpdir(), 'c15t-apple-copy-'));
	try {
		cpSync(source, join(directory, 'vendor/C15tApple'), { recursive: true });
		expect(scanVendoredNativeSources(directory)).toEqual([]);
		appendFileSync(
			join(directory, 'vendor/C15tApple/C15tApple.swift'),
			'\n// drift\n'
		);
		expect(scanVendoredNativeSources(directory)).toEqual([
			{
				path: 'vendor/C15tApple/C15tApple.swift',
				reason:
					'stale vendored native source: Run bun scripts/sync-vendored-apple.ts.',
				size: 0,
			},
		]);
		const packed = new Set(
			readdirSync(source).map((name) => `vendor/C15tApple/${name}`)
		);
		expect(scanPackedVendoredSources(directory, packed)).toEqual([]);
		packed.delete('vendor/C15tApple/C15tApple.swift');
		expect(
			scanPackedVendoredSources(directory, packed).map(({ path }) => path)
		).toEqual(['vendor/C15tApple/C15tApple.swift']);
	} finally {
		rmSync(resolve(directory), { force: true, recursive: true });
	}
});
