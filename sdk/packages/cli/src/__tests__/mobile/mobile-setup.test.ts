import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ANDROID_META,
	IOS_PLIST_KEY,
} from '../../../../react-native/src/expo-plugin/constants';
// The Expo plugin's own URL rules, which setup mirrors. Test-only, so the published
// CLI takes no dependency on the private React Native package.
import { resolveParams } from '../../../../react-native/src/expo-plugin/params';
import { writePolicyRules } from '../../../../react-native/src/expo-plugin/policy-resource';
import type { CliCommand, CliContext } from '../../context/types';
import { runCli } from '../../index';
import {
	detectMobileProject,
	detectNativePlatforms,
} from '../../mobile/detect';
import { isPrivacyPolicyURL } from '../../mobile/privacy-policy-url';
import {
	C15T_ANDROID_VERSION,
	EXPO_PLUGIN,
	expoPluginEntry,
	KOTLIN_INSTALL_IMPORTS,
	KOTLIN_OFFLINE_IMPORTS,
	kotlinInstall,
	kotlinOfflineInstall,
	kotlinString,
	mergeExpoAppJson,
	providerImport,
	swiftConfiguration,
	swiftOfflineInstall,
	swiftString,
} from '../../mobile/scaffold';
import { normalizeMobileURL, resolveMobileOptions } from '../../mobile/setup';
import type { MobilePrompts, MobileSetupResult } from '../../mobile/setup';
import { createCliLogger } from '../../utils/logger';

const logger = createCliLogger('error', { write: () => {} });
const REPO = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../..'
);
const DEFAULT_CATEGORIES = ['necessary', 'measurement', 'marketing'] as const;

const SWIFT_SNIPPETS =
	'native/core-swift/Tests/C15tAppleTests/CLISnippetTests.swift';
const KOTLIN_SNIPPETS =
	'native/core-android/c15t-android/src/test/kotlin/com/c15t/android/CliSnippetTest.kt';
const PRIVACY_URL = 'https://app.example/privacy';

/** The lines between the `c15t-cli-snippet:<name>` markers in a native test, dedented. */
const nativeSnippet = async (file: string, name: string): Promise<string> => {
	const source = await readFile(path.join(REPO, file), 'utf8');
	const lines = source.split('\n');
	const start = lines.findIndex((line) =>
		line.includes(`c15t-cli-snippet:${name}:start`)
	);
	const end = lines.findIndex((line) =>
		line.includes(`c15t-cli-snippet:${name}:end`)
	);
	expect(start, `${name} markers in ${file}`).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	const block = lines.slice(start + 1, end);
	const indent = Math.min(
		...block.map((line) => /^[\t ]*/u.exec(line)?.[0].length ?? 0)
	);
	return block.map((line) => line.slice(indent)).join('\n');
};
const roots: string[] = [];

const project = async (files: Record<string, string>): Promise<string> => {
	const root = await mkdtemp(path.join(tmpdir(), 'c15t-mobile-'));
	roots.push(root);
	for (const [name, contents] of Object.entries(files)) {
		const target = path.join(root, name);
		// oxlint-disable-next-line no-await-in-loop -- Fixture files in order.
		await mkdir(path.dirname(target), { recursive: true });
		// oxlint-disable-next-line no-await-in-loop -- Fixture files in order.
		await writeFile(target, contents);
	}
	return root;
};

const pkg = (dependencies: Record<string, string>) =>
	JSON.stringify({ dependencies, name: 'app' });

const run = async (cwd: string, args: string[]) => {
	const result = await runCli(['setup', ...args, '--json', '--no-telemetry'], {
		cwd,
		logger,
	});
	return result as typeof result & { data: MobileSetupResult };
};

/** `c15t setup` with a privacy policy URL, which every platform requires. */
const setup = (cwd: string, args: string[]) =>
	run(
		cwd,
		args.includes('--privacy-policy-url')
			? args
			: [...args, '--privacy-policy-url', PRIVACY_URL]
	);

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
	);
});

describe('detectMobileProject', () => {
	it('tells Expo, bare React Native, native and web projects apart', async () => {
		const expo = await project({
			'package.json': pkg({ expo: '57.0.0', 'react-native': '0.86.0' }),
			'tsconfig.json': '{}',
		});
		const bare = await project({
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});
		const swift = await project({ 'App.xcodeproj/project.pbxproj': '' });
		const both = await project({
			'Package.swift': '',
			'settings.gradle.kts': '',
		});
		const web = await project({
			'package.json': pkg({ next: '16.0.0', react: '19.0.0' }),
		});

		expect(await detectMobileProject(expo)).toMatchObject({
			installed: false,
			kind: 'expo',
			typescript: true,
		});
		expect(await detectMobileProject(bare)).toMatchObject({
			kind: 'react-native',
			typescript: false,
		});
		expect(await detectMobileProject(swift)).toEqual({
			kind: 'native',
			platforms: ['ios'],
			root: swift,
		});
		expect(await detectNativePlatforms(both)).toEqual(['ios', 'android']);
		// A web project never takes the mobile path, so its setup is unchanged.
		expect(await detectMobileProject(web)).toBeNull();
		expect(await detectNativePlatforms(web)).toEqual([]);
	});
});

describe('the Expo plugin entry', () => {
	const base = {
		bundleManifest: false,
		categories: ['necessary', 'measurement'] as const,
		privacyPolicyURL: 'https://example.com/privacy',
	};

	it('writes only what each mode takes', () => {
		expect(
			expoPluginEntry({
				...base,
				backendURL: 'https://a.inth.app',
				bundleManifest: true,
				mode: 'hosted',
			})
		).toEqual([
			EXPO_PLUGIN,
			{
				backendURL: 'https://a.inth.app',
				bundleManifest: true,
				consentCategories: ['necessary', 'measurement'],
			},
		]);
		expect(
			expoPluginEntry({
				...base,
				backendURL: 'https://b.test',
				mode: 'self-hosted',
			})[1]
		).toMatchObject({ mode: 'selfHosted' });
		const [, offline] = expoPluginEntry({ ...base, mode: 'offline' });
		expect(offline).not.toHaveProperty('backendURL');
		expect(offline).toMatchObject({
			mode: 'offline',
			policy: { rules: [{ match: { fallback: true, isDefault: true } }] },
		});
	});

	it('adds to app.json, keeps an existing c15t entry, and keeps indentation', () => {
		const raw =
			'{\n  "expo": {\n    "name": "app",\n    "plugins": ["expo-router"]\n  }\n}\n';
		const entry = expoPluginEntry({
			...base,
			backendURL: 'https://a.inth.app',
			mode: 'hosted',
		});
		const merged = mergeExpoAppJson(raw, entry, false) as string;
		expect(JSON.parse(merged).expo.plugins).toEqual(['expo-router', entry]);
		expect(merged).toContain('\n  "expo"');
		expect(mergeExpoAppJson(merged, entry, false)).toBeNull();
		expect(
			JSON.parse(mergeExpoAppJson(merged, [EXPO_PLUGIN, {}], true) as string)
				.expo.plugins
		).toEqual(['expo-router', [EXPO_PLUGIN, {}]]);
	});
});

describe('c15t setup in a mobile project', () => {
	it('configures an Expo app: plugin entry, provider file and next steps', async () => {
		const root = await project({
			'App.tsx': 'export default () => null;\n',
			'app.json':
				'{\n\t"expo": {\n\t\t"name": "app",\n\t\t"slug": "app"\n\t}\n}\n',
			'package.json': pkg({ expo: '57.0.0', 'react-native': '0.86.0' }),
			'tsconfig.json': '{}',
		});

		const result = await setup(root, [
			'--backend-url',
			'https://your-project.inth.app/',
			'--categories',
			'marketing,measurement',
			'--privacy-policy-url',
			'https://app.example/privacy',
			'--bundle-manifest',
		]);

		expect(result.success).toBe(true);
		const appJson = JSON.parse(
			await readFile(path.join(root, 'app.json'), 'utf8')
		);
		expect(appJson.expo.plugins).toEqual([
			[
				EXPO_PLUGIN,
				{
					backendURL: 'https://your-project.inth.app',
					bundleManifest: true,
					consentCategories: ['necessary', 'measurement', 'marketing'],
				},
			],
		]);
		const provider = await readFile(
			path.join(root, 'c15t/privacy-app.tsx'),
			'utf8'
		);
		// The provider presents the prompt itself once it has the privacy policy.
		expect(provider).toContain(
			'<ConsentProvider privacyPolicyURL={privacyPolicyURL}>'
		);
		expect(provider).toContain('void presentPreferences(privacyPolicyURL);');
		expect(provider).toContain("import type { ReactNode } from 'react';");
		expect(result.data.steps.join('\n')).toContain(
			'<PrivacyApp privacyPolicyURL="https://app.example/privacy">, once, in App.tsx: import { PrivacyApp } from \'./c15t/privacy-app\';'
		);
		expect(result.data.steps.join('\n')).toContain('-D @c15t/cli');
	});

	it('tells an Expo app in custom mode to install the engine itself', async () => {
		const root = await project({ 'package.json': pkg({ expo: '57.0.0' }) });

		const steps = (
			await setup(root, ['custom', '--backend-url', 'https://a.test'])
		).data.steps.join('\n');

		expect(steps).toContain('Custom mode starts no consent engine at launch.');
		expect(steps).toContain(
			'"When your app owns native installation" in node_modules/@c15t/react-native/docs/frameworks/react-native/bare.md'
		);
		expect(
			await readFile(
				path.join(REPO, 'docs/frameworks/react-native/bare.mdx'),
				'utf8'
			)
		).toContain('## When your app owns native installation');
		// Other modes start the engine from the plugin, so they get no such step.
		const hosted = (
			await setup(root, ['--backend-url', 'https://a.test', '--overwrite'])
		).data.steps.join('\n');
		expect(hosted).not.toContain('Custom mode starts no consent engine');
	});

	it('prints the entry for a dynamic app config instead of editing it', async () => {
		const root = await project({
			'app.config.ts': 'export default {};\n',
			'package.json': pkg({ '@c15t/react-native': '*', expo: '57.0.0' }),
		});

		const result = await setup(root, [
			'offline',
			'--privacy-policy-url',
			'https://example.com/privacy',
		]);

		expect(result.success).toBe(true);
		expect(result.data.files.map((file) => file.path)).toEqual([
			'c15t/privacy-app.jsx',
		]);
		expect(result.data.steps[0]).toContain(
			'Add this entry to "plugins" in app.config.ts'
		);
		expect(result.data.steps.join('\n')).not.toContain('tarball');
		expect(await readFile(path.join(root, 'app.config.ts'), 'utf8')).toBe(
			'export default {};\n'
		);
	});

	it('keeps an existing provider file without --overwrite', async () => {
		const root = await project({
			'c15t/privacy-app.jsx': 'mine',
			'package.json': pkg({ expo: '57.0.0' }),
		});

		const result = await setup(root, ['--backend-url', 'https://a.inth.app']);

		expect(result.data.skipped).toEqual([
			'c15t/privacy-app.jsx exists; pass --overwrite to replace it.',
		]);
		expect(
			await readFile(path.join(root, 'c15t/privacy-app.jsx'), 'utf8')
		).toBe('mine');
	});

	it('gives bare React Native the native entries to add, and edits no native file', async () => {
		const root = await project({
			'ios/App/Info.plist': '<plist/>',
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});
		await mkdir(path.join(root, 'src'));

		const result = await setup(root, [
			'self-hosted',
			'--backend-url',
			'https://consent.example.com',
			'--dry-run',
		]);

		expect(result.data.applied).toBe(false);
		expect(result.data.files.map((file) => file.path)).toEqual([
			'src/c15t/privacy-app.jsx',
		]);
		const steps = result.data.steps.join('\n');
		expect(steps).toContain('<string>selfHosted</string>');
		expect(steps).toContain(
			'<meta-data android:name="com.c15t.BACKEND_URL" android:value="https://consent.example.com" />'
		);
		expect(steps).toContain(
			'android:value="necessary, measurement, marketing"'
		);
		expect(await readFile(path.join(root, 'ios/App/Info.plist'), 'utf8')).toBe(
			'<plist/>'
		);
		await expect(
			readFile(path.join(root, 'src/c15t/privacy-app.jsx'), 'utf8')
		).rejects.toThrow();
	});

	it('sets up a bare React Native app for offline mode the way the Expo plugin does', async () => {
		const root = await project({
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});

		const result = await setup(root, ['offline']);

		expect(result.success).toBe(true);
		const rulesPath = 'android/app/src/main/assets/c15t-policy-rules.json';
		expect(result.data.files.map((file) => file.path)).toContain(rulesPath);
		// Byte for byte what the plugin writes for the same rules, so both cores read it.
		const pluginCopy = path.join(root, 'plugin-rules.json');
		await writePolicyRules(
			pluginCopy,
			expoPluginEntry({
				bundleManifest: false,
				categories: DEFAULT_CATEGORIES,
				mode: 'offline',
				privacyPolicyURL: 'https://example.com/privacy',
			})[1].policy.rules
		);
		expect(await readFile(path.join(root, rulesPath), 'utf8')).toBe(
			await readFile(pluginCopy, 'utf8')
		);
		const steps = result.data.steps.join('\n');
		expect(steps).toContain(`<key>${IOS_PLIST_KEY.policyRules}</key>`);
		expect(steps).toContain(
			'<key>com.c15t.backend.mode</key>\n<string>offline</string>'
		);
		expect(steps).toContain(
			`android:name="${ANDROID_META.mode}" android:value="offline"`
		);
		expect(steps).toContain(
			`android:name="${ANDROID_META.policyRules}" android:value="c15t-policy-rules.json"`
		);
		expect(steps).not.toContain(ANDROID_META.backendUrl);
		expect(steps).not.toContain(IOS_PLIST_KEY.backendURL);
		expect(steps).not.toContain('frameworks/react-native/configuration.md');
	});

	it('points a bare React Native app in custom mode at app-owned installation', async () => {
		const root = await project({
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});

		const steps = (
			await setup(root, [
				'custom',
				'--backend-url',
				'https://a.test',
				'--dry-run',
			])
		).data.steps.join('\n');

		expect(steps).toContain(
			'"When your app owns native installation" in node_modules/@c15t/react-native/docs/frameworks/react-native/bare.md'
		);
		expect(steps).not.toContain('frameworks/react-native/configuration.md');
	});

	it('prints steps for Swift and Android apps and writes nothing', async () => {
		const root = await project({
			'App.xcodeproj/project.pbxproj': 'unchanged',
			'settings.gradle.kts': 'unchanged',
		});

		const result = await setup(root, ['--backend-url', 'https://a.inth.app']);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({ files: [], platform: 'native' });
		const steps = result.data.steps.join('\n');
		expect(steps).toContain('C15tCore, C15tApple and C15tConsentUI');
		expect(steps).toContain(`com.c15t:c15t-android:${C15T_ANDROID_VERSION}`);
		expect(steps).toContain(
			'consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING)'
		);
		expect(await readFile(path.join(root, 'settings.gradle.kts'), 'utf8')).toBe(
			'unchanged'
		);
	});

	it('gives the native screens the privacy policy and the chosen categories', async () => {
		const root = await project({ 'Package.swift': '', 'build.gradle.kts': '' });

		const steps = (
			await setup(root, [
				'--backend-url',
				'https://a.inth.app',
				'--categories',
				'measurement',
			])
		).data.steps.join('\n');

		expect(steps).toContain('consentCategories: [.necessary, .measurement]\n');
		expect(steps).toContain(
			'consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT),'
		);
		expect(steps).toContain(
			`.c15tConsent(\n        C15tAppleConfiguration(\n            transport: .hosted(URL(string: "https://a.inth.app")!),`
		);
		expect(steps).toContain(`privacyPolicyURL: URL(string: "${PRIVACY_URL}")!`);
		expect(steps).toContain('ConsentRootViewController(');
		expect(steps).toContain(`C15tConsent(privacyPolicyUrl = "${PRIVACY_URL}")`);
		expect(steps).toContain(`attachConsent("${PRIVACY_URL}")`);
		expect(steps).toContain(`imports: ${KOTLIN_INSTALL_IMPORTS.join(', ')}`);
		expect(steps).not.toContain('example.com/privacy');
	});

	it('refuses a positional mode that conflicts with --mode', async () => {
		const root = await project({ 'package.json': pkg({ expo: '57.0.0' }) });

		const conflict = await setup(root, ['hosted', '--mode', 'offline']);
		const agree = await setup(root, [
			'offline',
			'--mode',
			'offline',
			'--dry-run',
		]);

		expect(conflict.success).toBe(false);
		expect(conflict.error?.message).toContain('conflicts with --mode');
		expect(agree.success).toBe(true);
		expect(agree.data.options.mode).toBe('offline');
	});

	it('refuses missing or invalid answers without prompting', async () => {
		const root = await project({ 'package.json': pkg({ expo: '57.0.0' }) });

		expect((await setup(root, [])).error?.message).toContain('--backend-url');
		const noPolicy = await run(root, ['--backend-url', 'https://a.test']);
		expect(noPolicy.error?.code).toBe('INPUT_REQUIRED');
		expect(noPolicy.error?.message).toContain('--privacy-policy-url');
		for (const url of [
			'http://localhost:8787/privacy',
			'http://127.0.0.1/privacy',
			'https://user@app.example/privacy',
		]) {
			// oxlint-disable-next-line no-await-in-loop -- One URL at a time.
			const refused = await setup(root, [
				'--backend-url',
				'https://a.test',
				'--privacy-policy-url',
				url,
			]);
			expect(refused.error?.code, url).toBe('FLAG_INVALID');
		}
		expect(
			(await setup(root, ['--backend-url', 'http://consent.example.com'])).error
				?.message
		).toContain('https');
		expect(
			(
				await setup(root, [
					'--backend-url',
					'https://a.test',
					'--categories',
					'ads',
				])
			).error?.message
		).toContain('Unknown categories: ads');
		expect(
			(await setup(root, ['offline', '--backend-url', 'https://a.test'])).error
				?.message
		).toContain('takes no --backend-url');
	});
});

describe('the provider import', () => {
	it('is relative to the root component', () => {
		expect(providerImport('App.tsx', 'c15t/privacy-app.tsx')).toBe(
			'./c15t/privacy-app'
		);
		expect(providerImport('app/_layout.tsx', 'c15t/privacy-app.tsx')).toBe(
			'../c15t/privacy-app'
		);
		expect(
			providerImport('src/app/_layout.tsx', 'src/c15t/privacy-app.tsx')
		).toBe('../c15t/privacy-app');
		expect(providerImport('app/_layout.tsx', 'src/c15t/privacy-app.tsx')).toBe(
			'../src/c15t/privacy-app'
		);
	});

	it('names the import an Expo Router layout needs', async () => {
		const root = await project({
			'app/_layout.tsx': 'export default () => null;\n',
			'package.json': pkg({ expo: '57.0.0', 'expo-router': '6.0.0' }),
			'tsconfig.json': '{}',
		});
		const nested = await project({
			'package.json': pkg({ expo: '57.0.0', 'expo-router': '6.0.0' }),
			'src/app/_layout.tsx': 'export default () => null;\n',
			'tsconfig.json': '{}',
		});

		const top = (await setup(root, ['--backend-url', 'https://a.test'])).data;
		const inSrc = (await setup(nested, ['--backend-url', 'https://a.test']))
			.data;

		expect(top.files.map((file) => file.path)).toContain(
			'c15t/privacy-app.tsx'
		);
		expect(top.steps.join('\n')).toContain(
			"in app/_layout.tsx: import { PrivacyApp } from '../c15t/privacy-app';"
		);
		expect(inSrc.files.map((file) => file.path)).toContain(
			'src/c15t/privacy-app.tsx'
		);
		expect(inSrc.steps.join('\n')).toContain(
			"in src/app/_layout.tsx: import { PrivacyApp } from '../c15t/privacy-app';"
		);
	});
});

describe('offline setup in a Swift or Android app', () => {
	it('prints the offline install, not a backend one', async () => {
		const root = await project({ 'Package.swift': '', 'build.gradle.kts': '' });

		const steps = (await setup(root, ['offline'])).data.steps.join('\n');

		expect(steps).toContain(swiftOfflineInstall(DEFAULT_CATEGORIES));
		expect(steps).toContain(kotlinOfflineInstall(DEFAULT_CATEGORIES));
		expect(steps).not.toContain('backendURL:');
		expect(steps).not.toContain('backendUrl = "');
		expect(steps).not.toContain('your-project.inth.app');
	});

	it('prints exactly the code the native tests compile', async () => {
		const hosted = {
			backendURL: 'https://your-project.inth.app',
			bundleManifest: false,
			categories: DEFAULT_CATEGORIES,
			mode: 'hosted',
			privacyPolicyURL: PRIVACY_URL,
		} as const;
		expect(swiftOfflineInstall(DEFAULT_CATEGORIES)).toBe(
			await nativeSnippet(SWIFT_SNIPPETS, 'offline')
		);
		expect(swiftConfiguration(hosted)).toBe(
			await nativeSnippet(SWIFT_SNIPPETS, 'hosted')
		);
		expect(kotlinOfflineInstall(DEFAULT_CATEGORIES)).toBe(
			await nativeSnippet(KOTLIN_SNIPPETS, 'offline')
		);
		expect(kotlinInstall(hosted)).toBe(
			await nativeSnippet(KOTLIN_SNIPPETS, 'hosted')
		);
		const source = await readFile(path.join(REPO, KOTLIN_SNIPPETS), 'utf8');
		// The test sits in com.c15t.android, so C15tAndroid needs no import there.
		const imported = [
			...KOTLIN_OFFLINE_IMPORTS,
			...KOTLIN_INSTALL_IMPORTS,
		].filter((entry) => entry !== 'com.c15t.android.C15tAndroid');
		for (const entry of imported) {
			expect(source).toContain(`import ${entry}\n`);
		}
	});

	it('points custom mode at the custom transport guidance', async () => {
		const root = await project({ 'Package.swift': '', 'settings.gradle': '' });

		const steps = (
			await setup(root, [
				'custom',
				'--backend-url',
				'https://a.test',
				'--categories',
				'functionality',
			])
		).data.steps.join('\n');

		expect(steps).toContain(
			'"Use your own transport" in frameworks/swift/headless.mdx'
		);
		// The guidance examples hardcode or omit categories, so the steps carry the choice.
		expect(steps).toContain(
			'in the CoreConfig:\nconsentCategories: [.necessary, .functionality]\n'
		);
		expect(steps).toContain(
			'in the NativeConfig:\nconsentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.FUNCTIONALITY),\n'
		);
		expect(steps).toContain(
			'"Use your own transport" in frameworks/android/configuration.mdx'
		);
		expect(steps).not.toContain('mobile-offline');
		for (const page of [
			'frameworks/swift/headless.mdx',
			'frameworks/android/configuration.mdx',
		]) {
			// oxlint-disable-next-line no-await-in-loop -- Two pages.
			expect(await readFile(path.join(REPO, 'docs', page), 'utf8')).toContain(
				'## Use your own transport'
			);
		}
	});
});

describe('URLs in the printed Swift and Kotlin', () => {
	it('are escaped as string literals, not pasted raw', async () => {
		const root = await project({ 'Package.swift': '', 'build.gradle.kts': '' });

		// `new URL` accepts the quote by percent-encoding it; `$` is valid in both URLs.
		const steps = (
			await setup(root, [
				'--backend-url',
				'https://example.com/"x$y',
				'--privacy-policy-url',
				'https://app.example/a$b',
			])
		).data.steps.join('\n');

		expect(steps).toContain(
			'transport: .hosted(URL(string: "https://example.com/\\"x$y")!),'
		);
		expect(steps).toContain('backendUrl = "https://example.com/\\"x\\$y",');
		expect(steps).toContain(
			'privacyPolicyURL: URL(string: "https://app.example/a$b")!'
		);
		expect(steps).toContain(
			'C15tConsent(privacyPolicyUrl = "https://app.example/a\\$b")'
		);
		expect(steps).toContain('attachConsent("https://app.example/a\\$b")');
		expect(steps).not.toContain('"https://example.com/"x');
	});

	it('escape backslashes and control characters too', () => {
		expect(swiftString('a\\b"c\n')).toBe('"a\\\\b\\"c\\n"');
		expect(kotlinString('a\\b"c$d\t')).toBe('"a\\\\b\\"c\\$d\\t"');
	});
});

describe('where setup looks for the project', () => {
	const rootOf = async (cwd: string, name: string): Promise<string> => {
		const probe: CliCommand = {
			action: (context) => Promise.resolve({ root: context.projectRoot }),
			description: name,
			hint: name,
			label: name,
			name,
		};
		const result = await runCli([name, '--json'], {
			commands: [probe],
			cwd,
			logger,
		});
		return (result.data as { root: string }).root;
	};

	it('finds a mobile app from a subdirectory', async () => {
		const root = await project({
			'package.json': pkg({ expo: '57.0.0' }),
			'src/screens/home.tsx': '',
		});

		const result = await setup(path.join(root, 'src/screens'), [
			'--backend-url',
			'https://a.test',
			'--dry-run',
		]);

		expect(result.data.platform).toBe('expo');
		expect(result.data.files.map((file) => file.path)).toContain(
			'src/c15t/privacy-app.jsx'
		);
	});

	it('keeps every other command resolving to the package above ios/', async () => {
		const root = await project({
			'ios/App.xcodeproj/project.pbxproj': '',
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});
		const ios = path.join(root, 'ios');

		for (const command of ['codemods', 'self-host', 'skills']) {
			// oxlint-disable-next-line no-await-in-loop -- One command at a time.
			expect(await rootOf(ios, command), command).toBe(root);
		}
		// Setup from ios/ also finds the React Native app, not a Swift project.
		expect(await rootOf(ios, 'setup')).toBe(root);
	});

	it('finds a Swift or Gradle project from a directory inside it', async () => {
		const parent = await project({ 'package.json': pkg({ next: '16.0.0' }) });
		const swift = path.join(parent, 'MyApp');
		await mkdir(path.join(swift, 'Sources/Feature'), { recursive: true });
		await writeFile(path.join(swift, 'Package.swift'), '');
		const gradle = await project({
			'app/build.gradle.kts': '',
			'app/src/main/AndroidManifest.xml': '',
			'settings.gradle.kts': '',
		});

		expect(await rootOf(path.join(swift, 'Sources/Feature'), 'setup')).toBe(
			swift
		);
		// The Gradle project, not the `app` module that also has a build file.
		expect(await rootOf(path.join(gradle, 'app/src/main'), 'setup')).toBe(
			gradle
		);
		const result = await setup(path.join(swift, 'Sources/Feature'), [
			'--backend-url',
			'https://a.test',
		]);
		expect(result.data.platform).toBe('native');
		// Other commands still walk to the package above, as before.
		expect(await rootOf(path.join(swift, 'Sources/Feature'), 'codemods')).toBe(
			parent
		);
	});

	it('keeps a Swift app outside any package as its own root for setup only', async () => {
		const parent = await project({ 'package.json': pkg({ next: '16.0.0' }) });
		const app = path.join(parent, 'MyApp');
		await mkdir(path.join(app, 'MyApp.xcodeproj'), { recursive: true });

		expect(await rootOf(app, 'setup')).toBe(app);
		expect(await rootOf(app, 'codemods')).toBe(parent);
	});
});

describe('backend URLs', () => {
	const cases = [
		'https://your-project.inth.app',
		'https://your-project.inth.app/',
		'https://consent.example.com/api/c15t',
		'  https://padded.example.com  ',
		'http://localhost:8787',
		'http://127.0.0.1:8787',
		'http://[::1]:8787',
		'http://consent.example.com',
		'https://user:secret@consent.example.com',
		'https://consent.example.com?tenant=a',
		'https://consent.example.com#top',
		'ftp://consent.example.com',
		'not a url',
	];

	it('are accepted and rejected exactly as the Expo plugin does', () => {
		for (const value of cases) {
			let plugin: string | null;
			try {
				plugin = resolveParams({ backendURL: value }).backendURL;
			} catch {
				plugin = null;
			}
			expect(normalizeMobileURL(value), value).toBe(plugin);
		}
	});

	it('refuses credentials, a query and a fragment before writing app.json', async () => {
		const root = await project({
			'app.json': '{"expo":{}}',
			'package.json': pkg({ expo: '57.0.0' }),
		});

		for (const url of [
			'https://u:p@a.test',
			'https://a.test?x=1',
			'https://a.test#y',
		]) {
			// oxlint-disable-next-line no-await-in-loop -- One URL at a time.
			const result = await setup(root, ['--backend-url', url]);
			expect(result.success, url).toBe(false);
		}
		expect(await readFile(path.join(root, 'app.json'), 'utf8')).toBe(
			'{"expo":{}}'
		);
	});
});

/**
 * The React Native presenter's own table (`provider/__tests__/privacy-policy-url.test.ts`
 * in the auto-present release), plus loopback `http`, which the backend URL rule allows.
 */
const PRIVACY_URL_CASES: readonly (readonly [string, boolean])[] = [
	...[
		'https://example.com',
		'https://example.com/',
		'https://example.com/privacy',
		'https://EXAMPLE.com/Privacy',
		'https://sub.example.co.uk/legal/privacy.html',
		'https://example.com:8443/privacy',
		'https://example.com:1/p',
		'https://example.com:65535/p',
		'https://example.com/privacy?lang=en&v=2#cookies',
		'https://example.com/a%20b',
		"https://example.com/~user/(policy);v=1,2*!$'@:",
		'https://xn--bcher-kva.example/privacy',
		'https://192.168.0.1/privacy',
		'https://localhost',
	].map((value) => [value, true] as const),
	...[
		'http://example.com/privacy',
		'http://localhost:8787/privacy',
		'http://127.0.0.1/privacy',
		'HTTPS://example.com',
		'example.com/privacy',
		'https:example.com',
		'',
		'https://',
		'https:///privacy',
		'https://example.com:bad',
		'https://example.com:/privacy',
		'https://example.com:0',
		'https://example.com:65536',
		'https://[',
		'https://[::1]/privacy',
		'https://bücher.example/privacy',
		'https://user@example.com/privacy',
		'https://-bad.example/privacy',
		'https://example..com/privacy',
		'https://example.com./privacy',
		' https://example.com',
		'https://example.com/privacy ',
		'https://example.com/privacy\n',
		'https://example.com/privacy policy',
		'https://example.com/"privacy"',
		'https://example.com/%zz',
		'https://example.com/a#b#c',
		'https://example.com\\privacy',
		'mailto:privacy@example.com',
		`https://${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(20)}/p`,
	].map((value) => [value, false] as const),
];

// The presenter's rule ships with the auto-present release of @c15t/react-native.
const PRESENTER_RULE = path.join(
	REPO,
	'packages/react-native/src/provider/privacy-policy-url.ts'
);

describe('privacy policy URLs', () => {
	it.each(PRIVACY_URL_CASES)('%j: the CLI accepts it: %s', (value, ok) => {
		expect(isPrivacyPolicyURL(value)).toBe(ok);
	});

	it.skipIf(!existsSync(PRESENTER_RULE))(
		'are accepted and refused exactly as the React Native presenter does',
		async () => {
			const presenter = (await import(pathToFileURL(PRESENTER_RULE).href)) as {
				isPrivacyPolicyURL: (value: string) => boolean;
			};
			for (const [value] of PRIVACY_URL_CASES) {
				expect(isPrivacyPolicyURL(value), value).toBe(
					presenter.isPrivacyPolicyURL(value)
				);
			}
		}
	);

	it('is a prompt of its own, checked with the same rule', async () => {
		const asked: string[] = [];
		const prompts = (answer: string): MobilePrompts => ({
			confirm: () => Promise.resolve(false),
			multiselect: (_message, _options, initial) =>
				Promise.resolve([...initial]),
			select: () => Promise.resolve('hosted'),
			text: (message) => {
				asked.push(message);
				return Promise.resolve(
					message.startsWith('Privacy') ? answer : 'https://a.inth.app'
				);
			},
		});
		const context = { commandArgs: [], flags: {} } as unknown as CliContext;
		const expo = { kind: 'expo' } as Parameters<typeof resolveMobileOptions>[1];

		const options = await resolveMobileOptions(
			context,
			expo,
			prompts(PRIVACY_URL)
		);

		expect(options.privacyPolicyURL).toBe(PRIVACY_URL);
		expect(
			asked.some((message) => message.startsWith('Privacy policy URL'))
		).toBe(true);
		await expect(
			resolveMobileOptions(context, expo, prompts('http://localhost/privacy'))
		).rejects.toMatchObject({ code: 'FLAG_INVALID' });
	});
});

describe('the doc paths the steps print', () => {
	it('name pages that exist, not unpublished c15t.com pages', async () => {
		const repo = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			'../../../../..'
		);
		const expo = await project({ 'package.json': pkg({ expo: '57.0.0' }) });
		const bare = await project({
			'package.json': pkg({ 'react-native': '0.86.0' }),
		});
		const native = await project({ 'Package.swift': '', 'build.gradle': '' });
		const steps = [
			...(await setup(expo, ['--backend-url', 'https://a.test'])).data.steps,
			...(await setup(bare, ['--backend-url', 'https://a.test', '--dry-run']))
				.data.steps,
			...(
				await setup(bare, [
					'custom',
					'--backend-url',
					'https://a.test',
					'--dry-run',
				])
			).data.steps,
			...(await setup(native, ['offline'])).data.steps,
		].join('\n');

		expect(steps).not.toContain('https://c15t.com/docs');
		const bundled = [
			...steps.matchAll(
				/node_modules\/@c15t\/react-native\/docs\/(?<page>[\w/-]+)\.md/gu
			),
		].map((match) => match.groups?.page);
		const source = [
			...steps.matchAll(/(?<page>(?:frameworks|guides)\/[\w/-]+)\.mdx/gu),
		].map((match) => match.groups?.page);
		expect(bundled.length).toBeGreaterThan(0);
		expect(source.length).toBeGreaterThan(0);
		for (const page of [...bundled, ...source]) {
			// oxlint-disable-next-line no-await-in-loop -- One page at a time.
			await expect(
				readFile(path.join(repo, 'docs', `${page}.mdx`), 'utf8')
			).resolves.toBeTypeOf('string');
		}
	});
});

describe('the printed Android version', () => {
	it('matches the native release the steps point at', async () => {
		const properties = await readFile(
			path.resolve(
				path.dirname(fileURLToPath(import.meta.url)),
				'../../../../../native/core-android/gradle.properties'
			),
			'utf8'
		);
		expect(properties).toContain(
			`c15t.native.version=${C15T_ANDROID_VERSION}\n`
		);
	});
});
