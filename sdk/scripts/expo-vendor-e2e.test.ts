import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import matrix from './mobile-compatibility.json';

const root = new URL('..', import.meta.url).pathname;
const prepare = join(
	root,
	'internals/fixtures/expo-dev/scripts/prepare-packed-consumer.py'
);
const expoCells = matrix.filter((cell) => cell.expo !== null);
const oldest = expoCells.at(0);
const newest = expoCells.at(-1);

/** A tarball whose only content is the manifest the helper checks. */
const fakePackage = (directory: string): string => {
	mkdirSync(join(directory, 'package'));
	writeFileSync(
		join(directory, 'package/package.json'),
		JSON.stringify({ name: '@c15t/react-native' })
	);
	const archive = join(directory, 'c15t-react-native.tgz');
	execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
	return archive;
};

describe('Expo vendor journey range', () => {
	it('runs the fixture and both ends of the Expo range on iOS and Android', () => {
		const github = parse(
			readFileSync(join(root, '.github/workflows/mobile-app-e2e.yml'), 'utf8')
		);
		const depot = parse(
			readFileSync(join(root, '.depot/workflows/android-emulator.yml'), 'utf8')
		);
		const expected = ['fixture', oldest?.id, newest?.id];
		expect(github.jobs['expo-ios-vendor-sdks'].strategy.matrix.cell).toEqual(
			expected
		);
		expect(depot.jobs['expo-vendor-sdks'].strategy.matrix.cell).toEqual(
			expected
		);
	});

	it('pins a packed consumer to the cell and keeps the vendor SDK pins', () => {
		const directory = mkdtempSync(join(tmpdir(), 'c15t-expo-consumer-'));
		try {
			const output = join(directory, 'consumer');
			execFileSync('python3', [
				prepare,
				'--package',
				fakePackage(directory),
				'--output',
				output,
				'--cell',
				String(newest?.id),
			]);
			const fixture = JSON.parse(
				readFileSync(
					join(root, 'internals/fixtures/expo-dev/package.json'),
					'utf8'
				)
			);
			const consumer = JSON.parse(
				readFileSync(join(output, 'package.json'), 'utf8')
			);
			expect(consumer.dependencies).toMatchObject({
				...newest?.expoPackages,
				'@c15t/react-native': 'file:vendor/c15t-react-native.tgz',
				expo: newest?.expo,
				react: newest?.react,
				'react-native': newest?.reactNative,
			});
			for (const vendor of [
				'@amplitude/analytics-react-native',
				'@react-native-firebase/app',
				'@sentry/react-native',
				'mixpanel-react-native',
				'posthog-react-native',
			]) {
				expect(consumer.dependencies[vendor]).toBe(
					fixture.dependencies[vendor]
				);
			}
			// The E2E host now imports the copy of the bare fixture's vendor code.
			expect(
				readFileSync(join(output, 'src/e2e/vendor-journey-app.tsx'), 'utf8')
			).toContain("'../../react-native-bare/src/vendors/e2e-vendor-probe'");
			expect(
				existsSync(join(output, 'react-native-bare/src/vendors/real-sdks.ts'))
			).toBe(true);
			expect(
				existsSync(
					join(
						output,
						'react-native-bare/src/vendors/capture-endpoints.test.ts'
					)
				)
			).toBe(false);
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});

	it('applies a cell vendor pin only with its reason', () => {
		const unexplained = expoCells.flatMap((cell) =>
			(['vendorPackages', 'devPackages'] as const)
				.filter((field) => {
					const { reason, ...pins }: Record<string, string> =
						field in cell
							? ((cell as Record<string, Record<string, string>>)[field] ?? {})
							: {};
					return Object.keys(pins).length > 0 && !reason?.trim();
				})
				.map((field) => `${cell.id} ${field}`)
		);
		expect(unexplained.map((cell) => cell.id)).toEqual([]);
		const directory = mkdtempSync(join(tmpdir(), 'c15t-expo-consumer-'));
		try {
			const output = join(directory, 'consumer');
			execFileSync('python3', [
				prepare,
				'--package',
				fakePackage(directory),
				'--output',
				output,
				'--cell',
				String(oldest?.id),
			]);
			const consumer = JSON.parse(
				readFileSync(join(output, 'package.json'), 'utf8')
			);
			const { reason: _reason, ...pins } =
				(oldest && 'vendorPackages' in oldest
					? oldest.vendorPackages
					: undefined) ?? {};
			expect(consumer.dependencies).toMatchObject(pins);
			const { reason: _devReason, ...devPins } =
				(oldest && 'devPackages' in oldest ? oldest.devPackages : undefined) ??
				{};
			expect(consumer.devDependencies).toMatchObject(devPins);
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});

	it('refuses an Expo cell without expoPackages pins', () => {
		const directory = mkdtempSync(join(tmpdir(), 'c15t-expo-consumer-'));
		try {
			const result = spawnSync('python3', [
				prepare,
				'--package',
				fakePackage(directory),
				'--output',
				join(directory, 'consumer'),
				'--cell',
				'expo-57',
			]);
			expect(result.status).toBe(2);
			expect(String(result.stderr)).toContain(
				'must be an Expo cell with expoPackages pins: expo-55, expo-58'
			);
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});

	it('refuses a cell without Expo instead of building a default', () => {
		const directory = mkdtempSync(join(tmpdir(), 'c15t-expo-consumer-'));
		try {
			const result = spawnSync('python3', [
				prepare,
				'--package',
				fakePackage(directory),
				'--output',
				join(directory, 'consumer'),
				'--cell',
				'rn-87',
			]);
			expect(result.status).toBe(2);
			expect(String(result.stderr)).toContain('must be an Expo cell');
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});
});
