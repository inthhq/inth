import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { satisfies } from 'semver';
import { describe, expect, it } from 'vitest';

import {
	compatibilityCell,
	prepareCompatibilityOutput,
} from './mobile-compatibility';
import matrix from './mobile-compatibility.json';

const manifest = JSON.parse(
	readFileSync(
		new URL('../packages/react-native/package.json', import.meta.url),
		'utf8'
	)
);

describe('mobile compatibility contract', () => {
	it.each(matrix)(
		'allows the $id host to install without peer overrides',
		(cell) => {
			expect(
				satisfies(cell.reactNative, manifest.peerDependencies['react-native'])
			).toBe(true);
			expect(satisfies(cell.react, manifest.peerDependencies.react)).toBe(true);
		}
	);

	it.each(['0.82.1', '0.89.0', '0.90.0-rc.0'])(
		'does not promise untested RN %s',
		(version) => {
			expect(
				satisfies(version, manifest.peerDependencies['react-native'])
			).toBe(false);
		}
	);

	it.each(['19.1.0', '19.4.0', '20.0.0'])(
		'does not promise untested React %s',
		(version) => {
			expect(satisfies(version, manifest.peerDependencies.react)).toBe(false);
		}
	);

	it('covers every RN minor admitted by the package', () => {
		const missing: string[] = [];
		for (let minor = 0; minor < 100; minor += 1) {
			if (
				satisfies(`0.${minor}.0`, manifest.peerDependencies['react-native']) &&
				!matrix.some((cell) => cell.reactNative.startsWith(`0.${minor}.`))
			) {
				missing.push(`0.${minor}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('rejects unknown pairings instead of silently running a default', () => {
		expect(() => compatibilityCell('expo-59')).toThrow(
			'Unknown mobile compatibility cell'
		);
	});

	it('preserves an existing consumer and refuses checkout paths including aliases', () => {
		const directory = mkdtempSync(join(tmpdir(), 'inth-compat-output-'));
		try {
			const existing = join(directory, 'existing');
			mkdirSync(existing);
			writeFileSync(join(existing, 'keep.txt'), 'keep');
			expect(() => prepareCompatibilityOutput(existing)).toThrow(
				'new or empty'
			);
			expect(readFileSync(join(existing, 'keep.txt'), 'utf8')).toBe('keep');
			const alias = join(directory, 'checkout');
			symlinkSync(new URL('..', import.meta.url).pathname, alias);
			expect(() =>
				prepareCompatibilityOutput(join(alias, 'node_modules'))
			).toThrow('outside the checkout');
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});
});
