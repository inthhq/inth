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

import { expect, test } from 'vite-plus/test';

import {
	scanPackedVendoredSources,
	scanVendoredNativeSources,
} from './check-publish-artifacts';
import { compareTrees } from './sync-vendored-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'packages/swift/Sources/InthApple');
const vendored = join(root, 'packages/react-native/vendor/InthApple');

test('the CocoaPods Apple module matches the standalone module', () => {
	expect(readdirSync(source)).toContain('InthApple.swift');
	expect(compareTrees(source, vendored)).toEqual([]);
});

test('publish checks reject stale and unpacked Apple platform sources', () => {
	const directory = mkdtempSync(join(tmpdir(), 'inth-apple-copy-'));
	try {
		cpSync(source, join(directory, 'vendor/InthApple'), { recursive: true });
		expect(scanVendoredNativeSources(directory)).toEqual([]);
		appendFileSync(
			join(directory, 'vendor/InthApple/InthApple.swift'),
			'\n// drift\n'
		);
		expect(scanVendoredNativeSources(directory)).toEqual([
			{
				path: 'vendor/InthApple/InthApple.swift',
				reason:
					'stale vendored native source: Run bun scripts/sync-vendored-apple.ts.',
				size: 0,
			},
		]);
		const packed = new Set(
			readdirSync(source).map((name) => `vendor/InthApple/${name}`)
		);
		expect(scanPackedVendoredSources(directory, packed)).toEqual([]);
		packed.delete('vendor/InthApple/InthApple.swift');
		expect(
			scanPackedVendoredSources(directory, packed).map(({ path }) => path)
		).toEqual(['vendor/InthApple/InthApple.swift']);
	} finally {
		rmSync(resolve(directory), { force: true, recursive: true });
	}
});
