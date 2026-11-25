/**
 * The Android SDK floor, checked against the files a current Expo template
 * generates.
 *
 * `fixtures/expo-templates/sdk-*` are `android/build.gradle`,
 * `android/app/build.gradle` and `android/gradle.properties` copied unchanged
 * from `expo-template-bare-minimum` 55.0.44, 57.0.34 and 58.0.32. None of them
 * spells an SDK number: the `expo-root-project` Gradle plugin resolves it, which
 * is why the old raise never fired. A level only lands in these files when the
 * host sets one, most often through `expo-build-properties`, which writes
 * `android.minSdkVersion` and `android.compileSdkVersion` into
 * `gradle.properties`.
 */
import {
	appendFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { InthPluginError } from '../inth-plugin-error';
import {
	assertAndroidSdkFloor,
	findAndroidSdkSettings,
	gradleStatements,
	readAndroidSdkFiles,
	stripGradleComments,
} from '../with-android-sdk-floor';
import { FIXTURE_DIR, applyToFixture, runMod } from './helpers';

const TEMPLATES = ['sdk-55', 'sdk-57', 'sdk-58'] as const;

const scratch: string[] = [];

afterEach(() => {
	for (const directory of scratch.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

/** A project root whose `android/` is one template's generated files. */
const templateProject = function templateProject(
	template: (typeof TEMPLATES)[number],
	gradleProperties = ''
): string {
	const root = mkdtempSync(join(tmpdir(), 'inth-sdk-floor-'));
	scratch.push(root);
	cpSync(join(FIXTURE_DIR, 'expo-templates', template), join(root, 'android'), {
		recursive: true,
	});
	if (gradleProperties !== '') {
		appendFileSync(
			join(root, 'android', 'gradle.properties'),
			`\n${gradleProperties}\n`
		);
	}
	return root;
};

/** Rewrite the template's `android/app/build.gradle`. */
const editAppGradle = function editAppGradle(
	root: string,
	edit: (contents: string) => string
): void {
	const path = join(root, 'android', 'app', 'build.gradle');
	writeFileSync(path, edit(readFileSync(path, 'utf8')));
};

/** The template line every Expo 55 to 58 `defaultConfig` carries. */
const MIN_SDK_LINE = 'minSdkVersion rootProject.ext.minSdkVersion';

/** Run the plugin's finalized Android mod, the way prebuild ends. */
const finalize = function finalize(projectRoot: string) {
	return runMod(
		applyToFixture({ projectUrl: 'https://acme.inth.app' }),
		'android',
		'finalized',
		undefined,
		{ projectRoot }
	);
};

describe.each(TEMPLATES)('the Expo %s template', (template) => {
	it('sets no SDK level, so there was nothing to raise', () => {
		const files = readAndroidSdkFiles(
			join(templateProject(template), 'android')
		);
		expect(Object.keys(files).sort()).toStrictEqual([
			'app/build.gradle',
			'build.gradle',
			'gradle.properties',
		]);
		expect(findAndroidSdkSettings(files)).toStrictEqual([]);
	});

	it('passes prebuild untouched', async () => {
		await expect(finalize(templateProject(template))).resolves.toBeDefined();
	});

	it('passes levels at or above the floor', async () => {
		const root = templateProject(
			template,
			'android.minSdkVersion=26\nandroid.compileSdkVersion=37'
		);
		await expect(finalize(root)).resolves.toBeDefined();
	});

	it('fails prebuild on an expo-build-properties minSdk below 24', async () => {
		const root = templateProject(template, 'android.minSdkVersion=23');
		await expect(finalize(root)).rejects.toThrowError(
			/minSdk is 23 in android\/gradle\.properties; Inth needs 24 or later \(raise or remove android\.minSdkVersion in the expo-build-properties plugin options\)/u
		);
	});

	it('fails prebuild on an expo-build-properties compileSdk below 36', async () => {
		const root = templateProject(template, 'android.compileSdkVersion=35');
		await expect(finalize(root)).rejects.toThrowError(
			/compileSdk is 35 in android\/gradle\.properties; Inth needs 36/u
		);
	});

	it('ignores commented-out levels', async () => {
		const root = templateProject(template);
		editAppGradle(root, (contents) => {
			expect(contents).toContain(MIN_SDK_LINE);
			return contents.replace(
				MIN_SDK_LINE,
				`// minSdkVersion 21\n        /* compileSdk 33 */\n        ${MIN_SDK_LINE}`
			);
		});
		await expect(finalize(root)).resolves.toBeDefined();
	});

	it('fails on a low literal in defaultConfig, past the comments', async () => {
		// Proves the comment scanner reads the whole template rather than
		// swallowing it from some quote onward, which would hide this line.
		const root = templateProject(template);
		editAppGradle(root, (contents) =>
			contents.replace(MIN_SDK_LINE, 'minSdkVersion 21')
		);
		await expect(finalize(root)).rejects.toThrowError(
			/minSdk is 21 in android\/app\/build\.gradle/u
		);
	});

	it.each([
		['minSdkVersion(21)', /minSdk is 21 in android\/app\/build\.gradle/u],
		['minSdk(21)', /minSdk is 21 in android\/app\/build\.gradle/u],
	])('fails on the call form %s in defaultConfig', async (line, message) => {
		const root = templateProject(template);
		editAppGradle(root, (contents) => contents.replace(MIN_SDK_LINE, line));
		await expect(finalize(root)).rejects.toThrowError(message);
	});

	it('ignores a commented-out call form', async () => {
		const root = templateProject(template);
		editAppGradle(root, (contents) =>
			contents.replace(
				MIN_SDK_LINE,
				`// minSdkVersion(21)\n        /* compileSdkVersion(33) */\n        ${MIN_SDK_LINE}`
			)
		);
		await expect(finalize(root)).resolves.toBeDefined();
	});

	it('lets an app call form override a low expo-build-properties value', async () => {
		const root = templateProject(template, 'android.minSdkVersion=23');
		editAppGradle(root, (contents) =>
			contents.replace(MIN_SDK_LINE, 'minSdkVersion(26)')
		);
		await expect(finalize(root)).resolves.toBeDefined();
	});

	it('reads the template defaultConfig as android/defaultConfig', () => {
		const root = templateProject(template);
		const source = stripGradleComments(
			readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8')
		);
		expect(
			gradleStatements(source).find((entry) => entry.text === MIN_SDK_LINE)
		).toStrictEqual({
			block: 'android/defaultConfig',
			text: MIN_SDK_LINE,
		});
	});

	it('fails on a compact block appended to the template', async () => {
		const root = templateProject(template);
		editAppGradle(
			root,
			(contents) =>
				`${contents}\nandroid { defaultConfig { minSdkVersion(21) } }\n`
		);
		await expect(finalize(root)).rejects.toThrowError(
			/minSdk is 21 in android\/app\/build\.gradle/u
		);
	});

	it('takes the last level within the template defaultConfig', async () => {
		const low = templateProject(template);
		editAppGradle(low, (contents) =>
			contents.replace(
				MIN_SDK_LINE,
				'minSdkVersion 24\n        minSdkVersion 21'
			)
		);
		await expect(finalize(low)).rejects.toThrowError(/minSdk is 21/u);
		const high = templateProject(template);
		editAppGradle(high, (contents) =>
			contents.replace(
				MIN_SDK_LINE,
				'minSdkVersion 21\n        minSdkVersion 24'
			)
		);
		await expect(finalize(high)).resolves.toBeDefined();
	});

	it('lets an app literal override a low expo-build-properties value', async () => {
		const root = templateProject(template, 'android.minSdkVersion=23');
		editAppGradle(root, (contents) =>
			contents.replace(MIN_SDK_LINE, 'minSdkVersion 26')
		);
		await expect(finalize(root)).resolves.toBeDefined();
	});
});

describe('assertAndroidSdkFloor', () => {
	it.each([
		['a Groovy app literal', 'app/build.gradle', 'compileSdk 35', 'compileSdk'],
		[
			'a root ext literal',
			'build.gradle',
			'ext {\n  minSdkVersion = 23\n}',
			'minSdk',
		],
		['a Kotlin DSL literal', 'app/build.gradle.kts', 'minSdk = 21', 'minSdk'],
	])('refuses %s', (_label, file, contents, level) => {
		expect(() => assertAndroidSdkFloor({ [file]: contents })).toThrowError(
			new RegExp(
				`${level} is \\d+ in android/${file.replaceAll('.', '\\.')}`,
				'u'
			)
		);
	});

	it('leaves rootProject.ext indirection and targetSdk alone', () => {
		expect(() =>
			assertAndroidSdkFloor({
				'app/build.gradle':
					'compileSdk rootProject.ext.compileSdkVersion\n' +
					'minSdkVersion rootProject.ext.minSdkVersion\n' +
					'targetSdkVersion 21',
			})
		).not.toThrow();
	});

	it.each([
		[
			'a level named inside a string',
			{ 'app/build.gradle': 'println "minSdkVersion 21 was the old floor"' },
		],
		[
			'a gradle.properties entry a later one replaces',
			{
				'gradle.properties':
					'android.minSdkVersion=23\nandroid.minSdkVersion=26',
			},
		],
		[
			'a gradle.properties entry a root ext value replaces',
			{
				'build.gradle':
					'buildscript {\n  ext {\n    minSdkVersion = 26\n  }\n}',
				'gradle.properties': 'android.minSdkVersion=23',
			},
		],
		[
			'a commented-out gradle.properties entry',
			{ 'gradle.properties': '# android.minSdkVersion=21' },
		],
	])('passes %s', (_label, files) => {
		expect(() => assertAndroidSdkFloor(files)).not.toThrow();
	});

	it.each([
		['a colon separator', 'android.minSdkVersion: 21'],
		['a space separator', 'android.minSdkVersion 21'],
	])('reads a gradle.properties entry with %s', (_label, line) => {
		expect(() =>
			assertAndroidSdkFloor({ 'gradle.properties': line })
		).toThrowError(/minSdk is 21 in android\/gradle\.properties/u);
	});

	it('keeps comment markers inside strings', () => {
		expect(
			stripGradleComments(
				'maven { url "https://example.com/m2" }\ninclude: ["**/*.jar"]\nminSdk 21'
			)
		).toBe(
			'maven { url "https://example.com/m2" }\ninclude: ["**/*.jar"]\nminSdk 21'
		);
	});

	describe('call forms and the Kotlin DSL', () => {
		it.each([
			[
				'Groovy minSdkVersion(21)',
				'app/build.gradle',
				'defaultConfig {\n  minSdkVersion(21)\n}',
				'minSdk is 21',
			],
			[
				'Groovy compileSdkVersion(35)',
				'app/build.gradle',
				'android {\n  compileSdkVersion( 35 );\n}',
				'compileSdk is 35',
			],
			['Groovy minSdk(21)', 'app/build.gradle', '  minSdk(21)', 'minSdk is 21'],
			[
				'Groovy root ext.set',
				'build.gradle',
				"ext.set('minSdkVersion', 21)",
				'minSdk is 21',
			],
			[
				'Kotlin minSdkVersion(21)',
				'app/build.gradle.kts',
				'defaultConfig {\n    minSdkVersion(21)\n}',
				'minSdk is 21',
			],
			[
				'Kotlin compileSdk = 35',
				'app/build.gradle.kts',
				'android {\n    compileSdk = 35\n}',
				'compileSdk is 35',
			],
			[
				'Kotlin root extra[]',
				'build.gradle.kts',
				'extra["minSdkVersion"] = 21',
				'minSdk is 21',
			],
			[
				'Kotlin root extra.set',
				'build.gradle.kts',
				'extra.set("compileSdkVersion", 35)',
				'compileSdk is 35',
			],
			[
				'Kotlin root by extra',
				'build.gradle.kts',
				'val minSdkVersion by extra(21)',
				'minSdk is 21',
			],
		])('refuses %s', (_label, file, contents, message) => {
			expect(() => assertAndroidSdkFloor({ [file]: contents })).toThrowError(
				new RegExp(`${message} in android/${file.replaceAll('.', '\\.')}`, 'u')
			);
		});

		it.each([
			[
				'a commented-out Groovy call',
				{
					'app/build.gradle':
						'// minSdkVersion(21)\n/* compileSdkVersion(33) */',
				},
			],
			[
				'a commented-out Kotlin call',
				{
					'app/build.gradle.kts': '// minSdkVersion(21)\n/* compileSdk = 33 */',
				},
			],
			[
				'a Groovy call named in a string',
				{ 'app/build.gradle': 'println "minSdkVersion(21)"' },
			],
			[
				'a Kotlin call named in a string',
				{ 'app/build.gradle.kts': 'println("minSdkVersion(21)")' },
			],
			[
				'a call at the floor',
				{ 'app/build.gradle.kts': 'compileSdkVersion(36)\nminSdkVersion(24)' },
			],
			[
				'a Groovy app call over a low property',
				{
					'app/build.gradle': 'minSdkVersion(26)',
					'gradle.properties': 'android.minSdkVersion=23',
				},
			],
			[
				'a Kotlin app assignment over a low property',
				{
					'app/build.gradle.kts': 'minSdk = 26',
					'gradle.properties': 'android.minSdkVersion=23',
				},
			],
			[
				'a Kotlin root extra over a low property',
				{
					'build.gradle.kts': 'extra["minSdkVersion"] = 26',
					'gradle.properties': 'android.minSdkVersion=23',
				},
			],
			[
				'a later Kotlin root extra over an earlier one',
				{
					'build.gradle.kts':
						'extra["minSdkVersion"] = 21\nextra.set("minSdkVersion", 26)',
				},
			],
			[
				'a Kotlin file beside a Groovy one, which Expo ignores',
				{
					'app/build.gradle': 'minSdkVersion 26',
					'app/build.gradle.kts': 'minSdk = 21',
				},
			],
		])('passes %s', (_label, files) => {
			expect(() => assertAndroidSdkFloor(files)).not.toThrow();
		});

		it('fails a Kotlin DSL project at prebuild', async () => {
			const root = mkdtempSync(join(tmpdir(), 'inth-sdk-floor-kts-'));
			scratch.push(root);
			const android = join(root, 'android');
			mkdirSync(join(android, 'app'), { recursive: true });
			cpSync(
				join(FIXTURE_DIR, 'expo-templates', 'sdk-58', 'gradle.properties'),
				join(android, 'gradle.properties')
			);
			writeFileSync(
				join(android, 'build.gradle.kts'),
				'plugins {\n    id("expo-root-project")\n}\n'
			);
			writeFileSync(
				join(android, 'app', 'build.gradle.kts'),
				'android {\n    compileSdkVersion(35) // too low\n    defaultConfig {\n        minSdk = 24\n    }\n}\n'
			);
			await expect(finalize(root)).rejects.toThrowError(
				/compileSdk is 35 in android\/app\/build\.gradle\.kts/u
			);
		});
	});

	describe('compact blocks and statement boundaries', () => {
		it.each([
			[
				'Groovy defaultConfig { minSdkVersion(21) }',
				'app/build.gradle',
				'android {\n  defaultConfig { minSdkVersion(21) }\n}',
				'minSdk is 21',
			],
			[
				'Groovy defaultConfig { minSdkVersion 23 }',
				'app/build.gradle',
				'defaultConfig { minSdkVersion 23 }',
				'minSdk is 23',
			],
			[
				'Groovy statements split by ;',
				'app/build.gradle',
				'android { compileSdkVersion 35; buildToolsVersion "35.0.0" }',
				'compileSdk is 35',
			],
			[
				'Groovy last in block is low',
				'app/build.gradle',
				'defaultConfig {\n  minSdkVersion 24\n  minSdkVersion 21\n}',
				'minSdk is 21',
			],
			[
				'Groovy compact root ext',
				'build.gradle',
				'buildscript { ext { minSdkVersion = 21 } }',
				'minSdk is 21',
			],
			[
				'Kotlin android { compileSdk = 35 }',
				'app/build.gradle.kts',
				'android { compileSdk = 35 }',
				'compileSdk is 35',
			],
			[
				'Kotlin nested on one line',
				'app/build.gradle.kts',
				'android { defaultConfig { minSdk = 21; targetSdk = 35 } }',
				'minSdk is 21',
			],
			[
				'Kotlin last in block is low',
				'app/build.gradle.kts',
				'defaultConfig { minSdk = 24; minSdk = 21 }',
				'minSdk is 21',
			],
			[
				'Kotlin flavor below a compliant defaultConfig',
				'app/build.gradle.kts',
				'android {\n    defaultConfig { minSdk = 24 }\n    productFlavors { create("legacy") { minSdk = 21 } }\n}',
				'minSdk is 21',
			],
		])('refuses %s', (_label, file, contents, message) => {
			expect(() => assertAndroidSdkFloor({ [file]: contents })).toThrowError(
				new RegExp(`${message} in android/${file.replaceAll('.', '\\.')}`, 'u')
			);
		});

		it.each([
			[
				'Groovy last in block wins',
				{
					'app/build.gradle':
						'defaultConfig {\n  minSdkVersion 21\n  minSdkVersion 24\n}',
				},
			],
			[
				'Kotlin last in block wins on one line',
				{
					'app/build.gradle.kts': 'defaultConfig { minSdk = 21; minSdk = 24 }',
				},
			],
			[
				'a later block of the same name',
				{
					'app/build.gradle':
						'defaultConfig { minSdkVersion 21 }\ndefaultConfig { minSdkVersion 24 }',
				},
			],
			[
				'a comment inside a compact block',
				{
					'app/build.gradle':
						'defaultConfig { /* minSdkVersion 21 */ minSdkVersion 24 }',
				},
			],
			[
				'braces and ; inside a Groovy string',
				{
					'app/build.gradle':
						'defaultConfig { buildConfigField "String", "X", "\\"a; minSdkVersion 21 }\\""; minSdkVersion 24 }',
				},
			],
			[
				'braces and ; inside a Kotlin string',
				{
					'app/build.gradle.kts': 'android { namespace = "a{b}; minSdk = 21" }',
				},
			],
			[
				'a compact app call over a low property',
				{
					'app/build.gradle': 'android { defaultConfig { minSdkVersion(26) } }',
					'gradle.properties': 'android.minSdkVersion=23',
				},
			],
			[
				'a call spanning lines before the level',
				{
					'app/build.gradle.kts':
						'defaultConfig {\n    manifestPlaceholders.putAll(mapOf(\n        "a" to "minSdk = 21"\n    ))\n    minSdk = 24\n}',
				},
			],
		])('passes %s', (_label, files) => {
			expect(() => assertAndroidSdkFloor(files)).not.toThrow();
		});
	});

	it('throws the plugin error type', () => {
		expect(() =>
			assertAndroidSdkFloor({ 'gradle.properties': 'android.minSdkVersion=21' })
		).toThrowError(InthPluginError);
	});
});
