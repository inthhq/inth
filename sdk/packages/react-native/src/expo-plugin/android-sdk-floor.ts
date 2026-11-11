import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withFinalizedMod } from '@expo/config-plugins';
import type { ConfigPlugin } from '@expo/config-plugins';

import { MIN_ANDROID_COMPILE_SDK, MIN_ANDROID_MIN_SDK } from './constants';
import { C15tPluginError } from './errors';

/** The generated Android files that can set an SDK level, by path under `android/`. */
export interface AndroidSdkFiles {
	readonly [path: string]: string | undefined;
}

/** One explicit SDK level found in a Gradle file. */
export interface AndroidSdkSetting {
	readonly level: 'compileSdk' | 'minSdk';
	readonly value: number;
	/** Path under `android/`. */
	readonly file: string;
}

interface SdkFloor {
	readonly level: AndroidSdkSetting['level'];
	readonly floor: number;
	/**
	 * Whole Gradle statements that set the level in a module: `minSdkVersion 24`,
	 * `minSdkVersion = 24`, `minSdk = 24`, and the call forms `minSdkVersion(24)`
	 * and `minSdk(24)`, which Groovy accepts and the Kotlin DSL uses. Anchored to
	 * the line, so the name inside a string or a call argument is not a setting.
	 */
	readonly gradle: readonly RegExp[];
	/**
	 * Statements that set the root project's extra property, which
	 * `expo-root-project` reads before `gradle.properties`: Groovy
	 * `ext { minSdkVersion = 24 }`, `ext.minSdkVersion = 24`, and the Kotlin DSL
	 * `extra["minSdkVersion"] = 24`, `extra.set("minSdkVersion", 24)` and
	 * `val minSdkVersion by extra(24)`.
	 */
	readonly ext: readonly RegExp[];
	/** `gradle.properties` key, the one `expo-build-properties` writes. */
	readonly property: RegExp;
	/** The `expo-build-properties` option path that writes the property. */
	readonly buildProperty: string;
}

/** `key value`, `key = value` or `key: value`, as `java.util.Properties` reads it. */
const propertyPattern = (key: string): RegExp =>
	new RegExp(
		`^[ \\t\\f]*${key.replaceAll('.', '\\.')}(?:[ \\t\\f]*[=:][ \\t\\f]*|[ \\t\\f]+)(?<value>\\d{1,3})[ \\t\\f]*$`,
		'gmu'
	);

/** One statement on its own line, optionally ending in `;`. */
const statement = (body: string): RegExp =>
	new RegExp(`^[ \\t]*${body}[ \\t]*;?[ \\t]*$`, 'gmu');

const LEVEL = '(?<value>\\d{1,3})';

/** Assignment, Groovy command and call forms of `<name> <level>`. */
const settingPatterns = (name: string): RegExp[] => [
	statement(`${name}(?:[ \\t]*=[ \\t]*|[ \\t]+)${LEVEL}`),
	statement(`${name}[ \\t]*\\([ \\t]*${LEVEL}[ \\t]*\\)`),
];

/** The root extra-property forms for one property name. */
const extPatterns = (name: string): RegExp[] => {
	const key = `["']${name}["']`;
	return [
		...settingPatterns(`(?:ext\\.)?${name}`),
		statement(
			`(?:ext|extra)[ \\t]*\\[[ \\t]*${key}[ \\t]*\\][ \\t]*=[ \\t]*${LEVEL}`
		),
		statement(
			`(?:ext|extra)\\.set[ \\t]*\\([ \\t]*${key}[ \\t]*,[ \\t]*${LEVEL}[ \\t]*\\)`
		),
		statement(
			`val[ \\t]+${name}[ \\t]+by[ \\t]+extra[ \\t]*\\([ \\t]*${LEVEL}[ \\t]*\\)`
		),
	];
};

const SDK_FLOORS: readonly SdkFloor[] = [
	{
		buildProperty: 'android.minSdkVersion',
		ext: extPatterns('minSdkVersion'),
		floor: MIN_ANDROID_MIN_SDK,
		gradle: settingPatterns('(?:minSdkVersion|minSdk)'),
		level: 'minSdk',
		property: propertyPattern('android.minSdkVersion'),
	},
	{
		buildProperty: 'android.compileSdkVersion',
		ext: extPatterns('compileSdkVersion'),
		floor: MIN_ANDROID_COMPILE_SDK,
		gradle: settingPatterns('(?:compileSdkVersion|compileSdk)'),
		level: 'compileSdk',
		property: propertyPattern('android.compileSdkVersion'),
	},
];

/**
 * Blank out Groovy and Kotlin comments, keeping strings and line breaks.
 *
 * Strings are skipped rather than parsed, so `//` inside `"https://..."` and
 * `/*` inside `"**\/*.jar"` stay code. A commented-out level is not one Gradle
 * applies.
 */
export const stripGradleComments = function stripGradleComments(
	source: string
): string {
	let output = '';
	let index = 0;
	while (index < source.length) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';
		if (char === '/' && next === '/') {
			const end = source.indexOf('\n', index);
			index = end === -1 ? source.length : end;
			continue;
		}
		if (char === '/' && next === '*') {
			const end = source.indexOf('*/', index + 2);
			const stop = end === -1 ? source.length : end + 2;
			output += source.slice(index, stop).replaceAll(/[^\n]/gu, ' ');
			index = stop;
			continue;
		}
		if (char === '"' || char === "'") {
			const quote = source.startsWith(char.repeat(3), index)
				? char.repeat(3)
				: char;
			let end = index + quote.length;
			while (end < source.length && !source.startsWith(quote, end)) {
				end += source[end] === '\\' ? 2 : 1;
			}
			end = Math.min(source.length, end + quote.length);
			output += source.slice(index, end);
			index = end;
			continue;
		}
		output += char;
		index += 1;
	}
	return output;
};

/** Every level the patterns find, in file order across all of them. */
const matches = function matches(
	contents: string | undefined,
	patterns: RegExp | readonly RegExp[]
): number[] {
	if (contents === undefined) {
		return [];
	}
	return (Array.isArray(patterns) ? patterns : [patterns])
		.flatMap((pattern: RegExp) => [...contents.matchAll(pattern)])
		.sort((first, second) => (first.index ?? 0) - (second.index ?? 0))
		.map((match) => Number.parseInt(match.groups?.value ?? '', 10));
};

const firstFile = function firstFile(
	files: AndroidSdkFiles,
	paths: readonly string[]
): string | undefined {
	return paths.find((path) => files[path] !== undefined);
};

/**
 * The SDK levels the app module builds with, where the project sets them.
 *
 * An Expo SDK 55 to 58 template writes no number: `app/build.gradle` reads
 * `rootProject.ext.*`, and the `expo-root-project` Gradle plugin fills those
 * from, in order, a root `ext` block, the `android.*SdkVersion` keys in
 * `gradle.properties`, then React Native's version catalog. The catalog default
 * already meets c15t's floors, so only an explicit value can fall below them.
 *
 * Only the value Gradle applies counts. A literal in the app module wins over
 * the other two, and every literal there counts, because a product flavor's
 * level applies to that flavor's variants. Otherwise the last root `ext`
 * assignment wins, and otherwise the last `gradle.properties` entry, as
 * `java.util.Properties` reads it. Comments never count.
 *
 * @param files - File contents keyed by path under `android/`.
 * @returns The effective explicit levels; empty when Expo's defaults apply.
 */
export const findAndroidSdkSettings = function findAndroidSdkSettings(
	files: AndroidSdkFiles
): AndroidSdkSetting[] {
	const app = firstFile(files, ['app/build.gradle', 'app/build.gradle.kts']);
	const root = firstFile(files, ['build.gradle', 'build.gradle.kts']);
	const appSource =
		app === undefined ? undefined : stripGradleComments(files[app] ?? '');
	const rootSource =
		root === undefined ? undefined : stripGradleComments(files[root] ?? '');
	const properties = files['gradle.properties'];

	return SDK_FLOORS.flatMap((floor): AndroidSdkSetting[] => {
		const inApp = matches(appSource, floor.gradle);
		if (app !== undefined && inApp.length > 0) {
			return inApp.map((value) => ({ file: app, level: floor.level, value }));
		}
		const inRoot = matches(rootSource, floor.ext).at(-1);
		if (root !== undefined && inRoot !== undefined) {
			return [{ file: root, level: floor.level, value: inRoot }];
		}
		const inProperties = matches(properties, floor.property).at(-1);
		if (inProperties !== undefined) {
			return [
				{ file: 'gradle.properties', level: floor.level, value: inProperties },
			];
		}
		return [];
	});
};

/**
 * Fail when the project sets an SDK level below what the c15t AARs need.
 *
 * The plugin does not raise the number. On a current template there is no
 * number to raise, and a value that is there was set on purpose, usually through
 * `expo-build-properties`, which would write it back on the next prebuild.
 *
 * @param files - File contents keyed by path under `android/`.
 * @throws {C15tPluginError} When any explicit level is below its floor.
 */
export const assertAndroidSdkFloor = function assertAndroidSdkFloor(
	files: AndroidSdkFiles
): void {
	const low = findAndroidSdkSettings(files).filter((setting) => {
		const floor = SDK_FLOORS.find((entry) => entry.level === setting.level);
		return floor !== undefined && setting.value < floor.floor;
	});
	if (low.length === 0) {
		return;
	}
	const lines = low.map((setting) => {
		const floor = SDK_FLOORS.find((entry) => entry.level === setting.level);
		const fix = setting.file.endsWith('gradle.properties')
			? `raise or remove ${floor?.buildProperty ?? setting.level} in the ` +
				`expo-build-properties plugin options`
			: `raise it in android/${setting.file}`;
		return (
			`${setting.level} is ${String(setting.value)} in android/${setting.file}; ` +
			`c15t needs ${String(floor?.floor)} or later (${fix}).`
		);
	});
	throw new C15tPluginError(
		`the Android project is below the c15t SDK floor. ${lines.join(' ')} ` +
			`Below minSdk ${String(MIN_ANDROID_MIN_SDK)} the manifest merger fails, ` +
			`and below compileSdk ${String(MIN_ANDROID_COMPILE_SDK)} the c15t ` +
			`AARs do not compile, both with errors that do not name c15t.`
	);
};

/** Files under `android/` that can carry an SDK level. */
const SDK_FILE_PATHS = [
	'gradle.properties',
	'build.gradle',
	'build.gradle.kts',
	'app/build.gradle',
	'app/build.gradle.kts',
];

/** Read the generated Gradle files that exist, keyed by path under `android/`. */
export const readAndroidSdkFiles = function readAndroidSdkFiles(
	platformProjectRoot: string
): AndroidSdkFiles {
	const files: Record<string, string> = {};
	for (const path of SDK_FILE_PATHS) {
		const absolute = join(platformProjectRoot, path);
		if (existsSync(absolute)) {
			files[path] = readFileSync(absolute, 'utf8');
		}
	}
	return files;
};

/**
 * Check the SDK floor once prebuild has written every Android file.
 *
 * A finalized mod runs after every other plugin's mods, so the check reads what
 * Gradle will read, whatever order `expo-build-properties` and this plugin are
 * listed in.
 */
export const withAndroidSdkFloor: ConfigPlugin = (config) =>
	withFinalizedMod(config, [
		'android',
		(cfg) => {
			assertAndroidSdkFloor(
				readAndroidSdkFiles(cfg.modRequest.platformProjectRoot)
			);
			return cfg;
		},
	]);
