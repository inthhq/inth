import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { getBlockedReason } from './check-publish-artifacts';
import {
	checkAutolinkConfig,
	checkExpoAndroidAutolinking,
	checkPackedAutolinking,
	checkPackedPackageSurface,
	checkPodspecPaths,
	checkReactNativeAutolinking,
	globToRegExp,
	hostReadPaths,
	podspecPathDeclarations,
	withPackedPackage,
} from './react-native-autolink';
import type { PackedPackage } from './react-native-autolink';

/** A config that says a host app can link the library on both platforms. */
const working = {
	'@inth/react-native': {
		platforms: {
			android: {
				packageImportPath:
					'import com.inth.reactnative.InthReactNativePackage;',
				packageInstance: 'new InthReactNativePackage()',
				sourceDir:
					'/app/node_modules/@inth/react-native/android/inth-react-native',
			},
			ios: {
				podspecPath:
					'/app/node_modules/@inth/react-native/InthReactNative.podspec',
			},
		},
	},
};

describe('checkAutolinkConfig', () => {
	it('accepts a library the CLI can link on both platforms', () => {
		expect(checkAutolinkConfig(working)).toStrictEqual([]);
	});

	// The regression this guard exists for. `react-native.config.js` pointed Android
	// autolinking at `android`, where the build file has no namespace, and the CLI's two
	// lookups came up empty: `react-native config` exited 1 and the host app died in
	// settings evaluation rather than at a compiler.
	it('rejects an Android source directory above the library module', () => {
		const sourceDir = '/app/node_modules/@inth/react-native/android';
		const failures = checkAutolinkConfig({
			'@inth/react-native': {
				platforms: {
					...working['@inth/react-native'].platforms,
					android: {
						...working['@inth/react-native'].platforms.android,
						sourceDir,
					},
				},
			},
		});

		expect(failures.join('\n')).toContain(sourceDir);
		expect(failures.join('\n')).toContain('no namespace');
	});

	// A library config written in the app shape validates, is ignored, and leaves the CLI
	// guessing, so the package silently disappears from the config entirely.
	it('reports a package the CLI never lists', () => {
		const failures = checkAutolinkConfig({});

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('dependency.platforms');
	});

	it('reports Android autolinking switched off', () => {
		const failures = checkAutolinkConfig({
			'@inth/react-native': {
				platforms: {
					...working['@inth/react-native'].platforms,
					android: null,
				},
			},
		});

		expect(failures.join('\n')).toContain('no Android half');
	});

	// The import is written into the app's generated PackageList, so a wrong package or class
	// name is a host app that does not compile.
	it('reports a package class the CLI could not resolve', () => {
		const failures = checkAutolinkConfig({
			'@inth/react-native': {
				platforms: {
					...working['@inth/react-native'].platforms,
					android: {
						...working['@inth/react-native'].platforms.android,
						packageImportPath: 'import com.inth.wrong.InthReactNativePackage;',
					},
				},
			},
		});

		expect(failures.join('\n')).toContain('packageImportPath');
	});

	// Codegen emits NativeInthSpec into the package named by codegenConfig, and the autolinked
	// library has to be in that same package for the module to compile against the spec.
	it('reports a Java package that disagrees with Codegen', () => {
		const message = checkAutolinkConfig(
			working,
			'com.inth.somewhere.else'
		).join('\n');

		expect(message).toContain('Codegen generates NativeInthSpec into');
		expect(message).toContain('com.inth.somewhere.else');
		expect(message).toContain('com.inth.reactnative');
	});

	it('accepts the Codegen package the package manifest actually declares', () => {
		// The default argument reads package.json, so an empty answer here is the invariant
		// holding: codegenConfig and the shipped namespace have not drifted apart.
		expect(checkAutolinkConfig(working)).toStrictEqual([]);
	});

	// iOS resolution rides along because the same config file feeds `pod install`, and a pod
	// that stops being discovered is a broken iOS build with no Android involvement.
	it('reports a missing podspec', () => {
		const failures = checkAutolinkConfig({
			'@inth/react-native': {
				platforms: { ...working['@inth/react-native'].platforms, ios: null },
			},
		});

		expect(failures.join('\n')).toContain('no iOS half');
	});

	it('reports a podspec that is not the binding', () => {
		const failures = checkAutolinkConfig({
			'@inth/react-native': {
				platforms: {
					...working['@inth/react-native'].platforms,
					ios: { podspecPath: '/somewhere/Else.podspec' },
				},
			},
		});

		expect(failures.join('\n')).toContain('Else.podspec');
	});
});

describe('checkReactNativeAutolinking', () => {
	// The whole path, from the example app's own install of the CLI. This is the assertion CI
	// is paid for: `packages/react-native/android` builds the same library without ever asking
	// the CLI what it makes of it.
	it('resolves @inth/react-native from the bare example app', () => {
		expect(checkReactNativeAutolinking()).toStrictEqual([]);
	}, 60_000);
});

describe('Expo autolinking', () => {
	// Expo answers one platform per invocation, so its `--platform android` output has no iOS
	// half by design. Without the option the check would report a false failure for every
	// healthy Expo app.
	const androidEntry = working['@inth/react-native'].platforms.android;
	const androidOnly = {
		'@inth/react-native': {
			platforms: { android: androidEntry },
		},
	};

	it('accepts an Android-only answer from the Expo linker', () => {
		expect(
			checkAutolinkConfig(androidOnly, undefined, {
				expectIos: false,
				linkerName: 'expo-modules-autolinking',
			})
		).toStrictEqual([]);
	});

	// The defect this exists for. `react-native.config.cjs` is invisible to
	// expo-modules-autolinking, which searches only `.js` and `.ts`, so Expo fell back to the
	// wrapper `android` directory, failed to parse a Java package, and dropped the library from
	// PackageList.java with no warning. CI's assembleDebug stayed green over the empty list.
	it('names the config extension when the Expo linker drops the package', () => {
		const failures = checkAutolinkConfig({}, undefined, {
			expectIos: false,
			linkerName: 'expo-modules-autolinking',
		});

		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('expo-modules-autolinking did not list');
		expect(failures[0]).toContain('react-native.config.js');
		expect(failures[0]).toContain('.cjs');
	});

	it('still checks Android properly when iOS is not expected', () => {
		const sourceDir = '/app/node_modules/@inth/react-native/android';
		const failures = checkAutolinkConfig(
			{
				'@inth/react-native': {
					platforms: {
						android: { ...androidEntry, sourceDir },
					},
				},
			},
			undefined,
			{ expectIos: false, linkerName: 'expo-modules-autolinking' }
		);

		expect(failures.join('\n')).toContain(sourceDir);
	});

	// Runs the real linker against the real fixture, which is the only way to catch a config
	// file Expo cannot read: the bare fixture exercises the community CLI and would stay green.
	it('resolves @inth/react-native from the Expo example app', () => {
		expect(checkExpoAndroidAutolinking()).toStrictEqual([]);
	}, 60_000);
});

/**
 * The packed-tree half.
 *
 * Everything above asks what the CLI makes of the checkout, because that is what both fixtures
 * install. These ask what it makes of the tarball, which is the only thing a consumer has.
 */

/** A podspec in the shape this repository writes, narrow enough to state each rule alone. */
const FAKE_PODSPEC = `
Pod::Spec.new do |s|
  s.license = { :type => "Apache-2.0", :file => "LICENSE.md" }
  s.source_files = "ios/InthReactNative/**/*.{h,swift,m,mm}"
  s.public_header_files = "ios/InthReactNative/InthReactNative.h"
  s.resource_bundle = { "InthReactNative" => "ios/InthReactNative/Resources/Privacy.xcprivacy" }
  s.preserve_paths = "ios", "package.json", "react-native.config.js"
end
`;

describe('globToRegExp', () => {
	// CocoaPods reads `source_files` with a glob, and this is the one pattern the binding
	// declares, so the check that says "the pod builds from nothing" hinges on matching it.
	it('matches a brace set across directories', () => {
		const matcher = globToRegExp('ios/InthReactNative/**/*.{h,swift,m,mm}');

		expect(matcher.test('ios/InthReactNative/Bridge/InthPayload.swift')).toBe(
			true
		);
		expect(matcher.test('ios/InthReactNative/InthReactNative.h')).toBe(true);
		expect(matcher.test('ios/InthReactNative/ReactNative/Module.mm')).toBe(
			true
		);
	});

	it('stays inside the directory the pattern names', () => {
		const matcher = globToRegExp('ios/InthReactNative/**/*.{h,swift,m,mm}');

		expect(matcher.test('ios/Tests/X.swift')).toBe(false);
		expect(matcher.test('ios/InthReactNative.swift')).toBe(false);
		expect(matcher.test('android/inth-react-native/build.gradle.kts')).toBe(
			false
		);
	});

	// A dot in `build.gradle.kts` is literal, and an unescaped one would match any character.
	it('treats a dot as a dot', () => {
		expect(globToRegExp('*.kts').test('buildXkts')).toBe(false);
		expect(globToRegExp('*.kts').test('build.gradle.kts')).toBe(true);
	});
});

describe('podspecPathDeclarations', () => {
	it('reads every path the pod declares, and no names', () => {
		expect(
			podspecPathDeclarations(FAKE_PODSPEC).map(({ pattern }) => pattern)
		).toStrictEqual([
			'LICENSE.md',
			'ios/InthReactNative/**/*.{h,swift,m,mm}',
			'ios/InthReactNative/InthReactNative.h',
			'ios/InthReactNative/Resources/Privacy.xcprivacy',
			'ios',
			'package.json',
			'react-native.config.js',
		]);
	});
});

describe('the published podspec', () => {
	const source = readFileSync(
		join(
			dirname(new URL(import.meta.url).pathname),
			'../packages/react-native/InthReactNative.podspec'
		),
		'utf8'
	);

	// The checker reads `s.*` lines as text. A list built in a variable and assigned
	// later hides every glob from it, so a missing vendor directory would publish.
	it('keeps every source glob where the package-surface check can see it', () => {
		const sources = podspecPathDeclarations(source)
			.filter(({ field }) => field === 's.source_files')
			.map(({ pattern }) => pattern);
		expect(sources).toStrictEqual([
			'ios/InthReactNative/**/*.{h,swift,m,mm}',
			'vendor/InthCore/**/*.swift',
			'vendor/InthApple/**/*.swift',
			'vendor/InthConsentUI/**/*.swift',
		]);
	});

	// CocoaPods evaluates a podspec inside `Pod::Specification`, where a bare
	// `StandardError` is `Pod::StandardError` and misses `Errno::ENOENT`: a bare app
	// with no Podfile.properties.json then failed `pod install` outright.
	it('never rescues with a bare StandardError', () => {
		expect(source).not.toMatch(/rescue\s+StandardError/u);
	});
});

describe('checkPodspecPaths', () => {
	const packedPaths = [
		'LICENSE.md',
		'package.json',
		'react-native.config.js',
		'ios/InthReactNative/InthReactNative.h',
		'ios/InthReactNative/Bridge/InthPayload.swift',
		'ios/InthReactNative/Resources/Privacy.xcprivacy',
	];

	it('accepts a podspec that resolves against the tarball', () => {
		expect(checkPodspecPaths(FAKE_PODSPEC, packedPaths)).toStrictEqual([]);
	});

	// `s.license` named the repository root, which is two directories above the pod: inside
	// this workspace it resolves through a symlink, and in an app it points at the consumer.
	it('refuses a path that leaves the package', () => {
		const failures = checkPodspecPaths(
			FAKE_PODSPEC.replace(
				':file => "LICENSE.md"',
				':file => "../../LICENSE.md"'
			),
			packedPaths
		);

		expect(failures.join('\n')).toContain('points outside the package');
	});

	it('reports a source pattern with nothing behind it', () => {
		const failures = checkPodspecPaths(
			FAKE_PODSPEC,
			packedPaths.filter(
				(path) => !path.startsWith('ios/InthReactNative/Bridge')
			)
		);

		expect(failures.join('\n')).not.toContain('InthReactNative.h');
	});

	it('reports a source pattern that matches no packed file', () => {
		const failures = checkPodspecPaths(FAKE_PODSPEC, ['package.json']);

		expect(failures.join('\n')).toContain('no packed file matches it');
		expect(failures.join('\n')).toContain('Privacy.xcprivacy');
	});
});

describe('checkPackedPackageSurface', () => {
	const workDir = mkdtempSync(join(tmpdir(), 'inth-surface-'));

	afterAll(() => {
		rmSync(workDir, { force: true, recursive: true });
	});

	/** The installed package as a host app would find it, minus one file per test. */
	const fakeInstall = function fakeInstall(name: string): PackedPackage {
		const installedDir = join(workDir, name, 'package');

		const files: Record<string, string> = {
			'InthReactNative.podspec': FAKE_PODSPEC,
			'package.json': JSON.stringify({
				codegenConfig: { jsSrcsDir: 'src/specs', name: 'InthSpec' },
				name: '@inth/react-native',
				version: '0.0.0',
			}),
		};

		for (const { path } of hostReadPaths) {
			files[path] ??= 'export {};\n';
		}

		files['ios/InthReactNative/InthReactNative.h'] = '#import <Foundation.h>\n';
		files['ios/InthReactNative/Bridge/InthPayload.swift'] = 'enum X {}\n';
		files['ios/InthReactNative/Resources/Privacy.xcprivacy'] = '<plist/>\n';

		for (const [path, contents] of Object.entries(files)) {
			const target = join(installedDir, path);

			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, contents);
		}

		return {
			installedDir,
			paths: Object.keys(files),
			tarball: join(workDir, name, 'package.tgz'),
		};
	};

	it('accepts a tarball that carries what the two native builds open', () => {
		expect(checkPackedPackageSurface(fakeInstall('whole'))).toStrictEqual([]);
	});

	// The bug this exists for, in one file: the app reads `codegenConfig.jsSrcsDir` out of
	// `react-native config` and generates the protocol there. An allowlist that keeps `dist`
	// and drops `src/specs` looks fine from a checkout and fails in every app.
	it('reports a Codegen input directory the tarball left out', () => {
		const packed = fakeInstall('no-specs');

		rmSync(join(packed.installedDir, 'src/specs/NativeInth.ts'));

		const failures = checkPackedPackageSurface({
			...packed,
			paths: packed.paths.filter((path) => path !== 'src/specs/NativeInth.ts'),
		});

		expect(failures.join('\n')).toContain('codegenConfig.jsSrcsDir');
		expect(failures.join('\n')).toContain('src/specs');
	});

	it('names the build that reads a file the tarball left out', () => {
		const packed = fakeInstall('no-gradle');

		rmSync(
			join(packed.installedDir, 'android/inth-react-native/library.gradle')
		);

		const failures = checkPackedPackageSurface({
			...packed,
			paths: packed.paths.filter(
				(path) => path !== 'android/inth-react-native/library.gradle'
			),
		});

		expect(failures.join('\n')).toContain('library.gradle');
		expect(failures.join('\n')).toContain('apply(from:)');
	});
});

describe('autolinking from the packed tarball', () => {
	// Two CLI resolutions over a real install, each of which loads the whole config for an
	// app with a few dozen modules.
	it('installs the tarball and resolves it in both fixtures', () => {
		withPackedPackage((packed) => {
			// The gate holds the tarball to the same shapes; the packed tree is the one a
			// consumer can actually publish, so it is the one worth checking here too.
			const leaks = packed.paths.filter(
				(path) => getBlockedReason('@inth/react-native', path) !== null
			);

			expect(leaks).toStrictEqual([]);
			expect(checkPackedAutolinking(packed)).toStrictEqual([]);
		});
	}, 180_000);
});
