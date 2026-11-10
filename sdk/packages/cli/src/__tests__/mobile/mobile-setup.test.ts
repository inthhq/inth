import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runCli } from '../../index';
import {
	detectMobileProject,
	detectNativePlatforms,
} from '../../mobile/detect';
import {
	C15T_ANDROID_VERSION,
	EXPO_PLUGIN,
	expoPluginEntry,
	mergeExpoAppJson,
} from '../../mobile/scaffold';
import type { MobileSetupResult } from '../../mobile/setup';
import { createCliLogger } from '../../utils/logger';

const logger = createCliLogger('error', { write: () => {} });
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

const setup = async (cwd: string, args: string[]) => {
	const result = await runCli(['setup', ...args, '--json', '--no-telemetry'], {
		cwd,
		logger,
	});
	return result as typeof result & { data: MobileSetupResult };
};

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
		expect(provider).toContain('<ConsentProvider>');
		expect(provider).toContain("import type { ReactNode } from 'react';");
		expect(result.data.steps.join('\n')).toContain(
			'<PrivacyApp privacyPolicyURL="https://app.example/privacy"> from ./c15t/privacy-app, once, in App.tsx'
		);
		expect(result.data.steps.join('\n')).toContain('-D @c15t/cli');
		expect(result.data.steps.join('\n')).not.toContain(
			'Replace https://example.com/privacy'
		);
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
		// The URL was passed, so it is a choice even though it is the example one.
		expect(result.data.steps.join('\n')).not.toContain(
			'Replace https://example.com/privacy'
		);
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

		expect(result.data.steps.at(-1)).toBe(
			'Replace https://example.com/privacy with your privacy policy, or rerun with --privacy-policy-url.'
		);
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

	it('refuses missing or invalid answers without prompting', async () => {
		const root = await project({ 'package.json': pkg({ expo: '57.0.0' }) });

		expect((await setup(root, [])).error?.message).toContain('--backend-url');
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
