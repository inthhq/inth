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

import matrix from './mobile-compatibility.json';

const root = new URL('..', import.meta.url).pathname;
const prepare = join(
	root,
	'internals/fixtures/expo-dev/scripts/prepare-packed-consumer.py'
);
const fixtureManifest = JSON.parse(
	readFileSync(join(root, 'internals/fixtures/expo-dev/package.json'), 'utf8')
);
const [fixtureSdk] = fixtureManifest.dependencies.expo.split('.');
const expoCells = matrix.filter((cell) => cell.expo !== null);
const oldest = expoCells.at(0);
const newest = expoCells.at(-1);

/** A tarball whose only content is the manifest the helper checks. */
const fakePackage = (directory: string): string => {
	mkdirSync(join(directory, 'package'));
	writeFileSync(
		join(directory, 'package/package.json'),
		JSON.stringify({ name: '@inth/react-native' })
	);
	const archive = join(directory, 'inth-react-native.tgz');
	execFileSync('tar', ['-czf', archive, '-C', directory, 'package']);
	return archive;
};

describe('Expo vendor journey range', () => {
	it('pins a packed consumer to the cell and keeps the vendor SDK pins', () => {
		const directory = mkdtempSync(join(tmpdir(), 'inth-expo-consumer-'));
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
				'@inth/react-native': 'file:vendor/inth-react-native.tgz',
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
		const directory = mkdtempSync(join(tmpdir(), 'inth-expo-consumer-'));
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
			// The fixture's React 19.3 types do not describe the oldest cell's React.
			expect(consumer.devDependencies['@types/react']).toBe('~19.2.2');
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});

	it("pins every Expo cell's copy of the fixture's Expo packages", () => {
		// prepare-packed-consumer.py refuses a cell without these pins, so a missing
		// one would only surface when someone builds that cell.
		const expoPackages = Object.keys(fixtureManifest.dependencies)
			.filter((name) => name.startsWith('expo-'))
			.sort();
		const unpinned = expoCells.flatMap((cell) =>
			expoPackages
				.filter(
					(name) =>
						!('expoPackages' in cell) ||
						!(name in (cell.expoPackages as Record<string, string>))
				)
				.map((name) => `${cell.id} ${name}`)
		);
		expect(unpinned).toEqual([]);
	});

	it("keeps the fixture's SDK cell on the fixture's exact versions", () => {
		// Two different "SDK 58" setups would drift: the in-place fixture and the
		// packed cell must test the same patch releases.
		const cell = expoCells.find(
			(candidate) => candidate.expo?.split('.')[0] === fixtureSdk
		);
		const dependencies = fixtureManifest.dependencies as Record<string, string>;
		expect(cell?.expo).toBe(dependencies.expo);
		expect(cell?.reactNative).toBe(dependencies['react-native']);
		expect(cell?.react).toBe(dependencies.react);
		const pinned = (
			cell && 'expoPackages' in cell ? cell.expoPackages : {}
		) as Record<string, string>;
		for (const [name, version] of Object.entries(pinned)) {
			expect({ name, version }).toEqual({ name, version: dependencies[name] });
		}
	});

	it("builds the plugin against the fixture's Expo when the package pins one", () => {
		// The plugin resolves expo/config-plugins from its own package, so in this
		// repository a devDependency on another Expo would prebuild the fixture
		// with that SDK's config plugins.
		const sdkPackage = JSON.parse(
			readFileSync(join(root, 'packages/react-native/package.json'), 'utf8')
		) as { devDependencies?: Record<string, string> };
		const fixtureExpo = fixtureManifest.dependencies.expo;
		// No pin at all is fine: then the plugin resolves the fixture's Expo.
		expect(sdkPackage.devDependencies?.expo ?? fixtureExpo).toBe(fixtureExpo);
	});

	it('refuses a cell without Expo instead of building a default', () => {
		const directory = mkdtempSync(join(tmpdir(), 'inth-expo-consumer-'));
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
