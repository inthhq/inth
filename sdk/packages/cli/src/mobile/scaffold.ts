/**
 * What `c15t setup` writes and prints for a mobile project.
 *
 * Expo gets the config plugin entry and a provider file. Bare React Native gets
 * the provider file and the exact `Info.plist` and `AndroidManifest.xml`
 * entries to add. Swift and Kotlin apps get printed steps only: this module
 * never edits an Xcode project, a Gradle file or a native manifest.
 */

import type { NativePlatform, ReactNativeProject } from './detect';

/** The plugin's specifier, as `app.json` names it. */
export const EXPO_PLUGIN = '@c15t/react-native/expo-plugin';

/**
 * The native artifact version the Android steps print.
 *
 * `src/__tests__/mobile/scaffold.test.ts` compares it with
 * `native/core-android/gradle.properties`, so a native release that forgets
 * this line fails the CLI tests.
 */
export const C15T_ANDROID_VERSION = '3.0.0-alpha.1';

/** Consent categories the native cores know. */
export const MOBILE_CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] as const;

/** One of {@link MOBILE_CATEGORIES}. */
export type MobileCategory = (typeof MOBILE_CATEGORIES)[number];

/** Setup modes, spelled as `c15t setup <mode>` takes them. */
export type MobileMode = 'hosted' | 'self-hosted' | 'offline' | 'custom';

/** The answers a mobile setup needs. */
export interface MobileSetupOptions {
	readonly mode: MobileMode;
	/** Required for every mode but `offline`. */
	readonly backendURL?: string;
	/** Always starts with `necessary`. */
	readonly categories: readonly MobileCategory[];
	/** Bundle the hosted manifest at prebuild. Hosted and self-hosted only. */
	readonly bundleManifest: boolean;
	readonly privacyPolicyURL: string;
}

/** A file the setup writes. */
export interface PlannedFile {
	/** Relative to the project root. */
	readonly path: string;
	readonly contents: string;
	readonly action: 'create' | 'update';
}

/** Files to write, and the steps the developer still has to take. */
export interface MobileSetupPlan {
	readonly files: readonly PlannedFile[];
	readonly steps: readonly string[];
	/** Files left alone, with the reason. */
	readonly skipped: readonly string[];
}

/**
 * Where the guides are. The mobile SDKs are a private prerelease and their pages
 * are not on c15t.com yet, so the steps point at copies a developer already has:
 * the Markdown `@c15t/react-native` bundles, or the MDX in the supplied c15t source.
 */
const RN_DOCS = 'node_modules/@c15t/react-native/docs';
const SOURCE_DOCS = 'docs in the c15t source your maintainer supplied';

const PLUGIN_MODE: Record<MobileMode, string | undefined> = {
	custom: 'custom',
	hosted: undefined,
	offline: 'offline',
	'self-hosted': 'selfHosted',
};

/**
 * The Expo config plugin entry for these options.
 *
 * Offline mode carries a one-rule policy that asks for a choice everywhere,
 * because the plugin refuses offline mode without one. The app replaces it with
 * its real rules.
 */
export const expoPluginEntry = (
	options: MobileSetupOptions
): [string, Record<string, unknown>] => {
	const props: Record<string, unknown> = {};
	const mode = PLUGIN_MODE[options.mode];
	if (mode !== undefined) {
		props.mode = mode;
	}
	if (options.mode !== 'offline' && options.backendURL) {
		props.backendURL = options.backendURL;
	}
	props.consentCategories = [...options.categories];
	if (options.mode === 'offline') {
		props.policy = {
			rules: [
				{
					id: 'everywhere',
					match: { fallback: true, isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
				},
			],
		};
	} else if (options.bundleManifest) {
		props.bundleManifest = true;
	}
	return [EXPO_PLUGIN, props];
};

const isC15tPlugin = (entry: unknown): boolean => {
	const name = Array.isArray(entry) ? entry[0] : entry;
	return (
		typeof name === 'string' &&
		(name === EXPO_PLUGIN || name === '@c15t/react-native')
	);
};

const indentOf = (raw: string): string | number => {
	const indent = /\n(?<indent>[\t ]+)"/u.exec(raw)?.groups?.indent;
	if (!indent) {
		return '\t';
	}
	return indent.startsWith('\t') ? '\t' : indent.length;
};

/**
 * Add the plugin entry to an `app.json`.
 *
 * @param raw - The current file, or `null` when there is none.
 * @param entry - From {@link expoPluginEntry}.
 * @param overwrite - Replace an existing c15t entry instead of keeping it.
 * @returns The new file, or `null` when a c15t entry exists and is kept.
 * @throws {Error} When the file is not a JSON object.
 */
export const mergeExpoAppJson = (
	raw: string | null,
	entry: [string, Record<string, unknown>],
	overwrite: boolean
): string | null => {
	const document: unknown = raw === null ? {} : JSON.parse(raw);
	if (
		typeof document !== 'object' ||
		document === null ||
		Array.isArray(document)
	) {
		throw new Error('app.json is not a JSON object');
	}
	const root = document as Record<string, unknown>;
	const expo = (
		typeof root.expo === 'object' && root.expo !== null ? root.expo : {}
	) as Record<string, unknown>;
	const plugins = Array.isArray(expo.plugins) ? [...expo.plugins] : [];
	const existing = plugins.findIndex(isC15tPlugin);
	if (existing !== -1 && !overwrite) {
		return null;
	}
	if (existing === -1) {
		plugins.push(entry);
	} else {
		plugins[existing] = entry;
	}
	const next = { ...root, expo: { ...expo, plugins } };
	return `${JSON.stringify(next, null, raw === null ? '\t' : indentOf(raw))}\n`;
};

/**
 * The provider file: `ConsentProvider`, the native prompt when the policy asks
 * for one, and a Privacy settings button that stays reachable afterwards. The
 * same component as the React Native quickstart.
 */
export const providerSource = (typescript: boolean): string => {
	const children = typescript
		? ': { children: ReactNode; privacyPolicyURL: string }'
		: '';
	const entryProps = typescript ? ': { privacyPolicyURL: string }' : '';
	const error = typescript ? ': unknown' : '';
	return `// Generated by \`c15t setup\`. The native consent engine reads its backend and
// categories from the build configuration; this file only attaches to it.
import {
	ConsentProvider,
	onConsentPresenterOutcome,
	presentConsentPrompt,
	presentPreferences,
	useConsentStatus,
} from '@c15t/react-native';
import { useEffect, useState } from 'react';
${typescript ? "import type { ReactNode } from 'react';\n" : ''}import { Button, Text, View } from 'react-native';

const PrivacyEntry = ({ privacyPolicyURL }${entryProps}) => {
	const status = useConsentStatus();
	const [message, setMessage] = useState('');
	useEffect(
		() => onConsentPresenterOutcome((outcome) => setMessage(outcome.kind)),
		[]
	);
	useEffect(() => {
		if (status.policyPending || status.promptRequirement.kind === 'none') {
			return;
		}
		presentConsentPrompt(privacyPolicyURL).catch((error${error}) =>
			setMessage(String(error))
		);
	}, [privacyPolicyURL, status.policyPending, status.promptRequirement.kind]);
	return (
		<View>
			<Button
				title="Privacy settings"
				onPress={() => {
					presentPreferences(privacyPolicyURL).catch((error${error}) =>
						setMessage(String(error))
					);
				}}
			/>
			<Text accessibilityLiveRegion="polite">{message}</Text>
		</View>
	);
};

/** Render your app inside this, once, above navigation. */
export const PrivacyApp = ({ children, privacyPolicyURL }${children}) => (
	<ConsentProvider>
		{children}
		<PrivacyEntry privacyPolicyURL={privacyPolicyURL} />
	</ConsentProvider>
);
`;
};

const xml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

/** The `Info.plist` entries a hosted or self-hosted app adds. */
export const infoPlistEntries = (options: MobileSetupOptions): string =>
	[
		'<key>com.c15t.backend.mode</key>',
		`<string>${options.mode === 'self-hosted' ? 'selfHosted' : 'hosted'}</string>`,
		'<key>com.c15t.backend.url</key>',
		`<string>${xml(options.backendURL ?? '')}</string>`,
		'<key>com.c15t.categories</key>',
		'<array>',
		...options.categories.map((category) => `\t<string>${category}</string>`),
		'</array>',
	].join('\n');

/** The `<application>` meta-data a hosted or self-hosted app adds. */
export const androidManifestEntries = (options: MobileSetupOptions): string =>
	[
		`<meta-data android:name="com.c15t.BACKEND_URL" android:value="${xml(options.backendURL ?? '')}" />`,
		`<meta-data android:name="com.c15t.CATEGORIES" android:value="${options.categories.join(', ')}" />`,
	].join('\n');

const providerPath = (project: ReactNativeProject, hasSrc: boolean): string =>
	`${hasSrc ? 'src/' : ''}c15t/privacy-app.${project.typescript ? 'tsx' : 'jsx'}`;

/** What the project already has, read before planning. */
export interface ProjectFiles {
	/** `app.json` contents, or `null`. */
	readonly appJson: string | null;
	/** A dynamic config, such as `app.config.ts`, which this setup does not edit. */
	readonly dynamicConfig: string | null;
	/** Whether a `src` directory exists. */
	readonly hasSrc: boolean;
	/** Whether the provider file already exists. */
	readonly providerExists: boolean;
	/** The root component the app renders, such as `app/_layout.tsx`. */
	readonly rootComponent: string;
	/** The install command for a package, such as `npm install`. */
	readonly installCommand: string;
}

const installStep = (project: ReactNativeProject, files: ProjectFiles) =>
	project.installed
		? []
		: [
				`Install the @c15t/react-native tarball your maintainer supplied (the mobile SDK is a private prerelease): ${files.installCommand} /absolute/path/to/c15t-react-native.tgz`,
			];

const wrapStep = (files: ProjectFiles, providerFile: string, url: string) =>
	`Render your app inside <PrivacyApp privacyPolicyURL="${url}"> from ./${providerFile.replace(/\.[jt]sx$/u, '')}, once, in ${files.rootComponent}.`;

/**
 * Plan the setup for an Expo or bare React Native app.
 *
 * @param project - From `detectMobileProject`.
 * @param options - The answers.
 * @param files - What the project already has.
 * @param overwrite - Replace an existing c15t plugin entry and provider file.
 * @returns The files to write and the remaining steps.
 */
export const planReactNativeSetup = (
	project: ReactNativeProject,
	options: MobileSetupOptions,
	files: ProjectFiles,
	overwrite: boolean
): MobileSetupPlan => {
	const planned: PlannedFile[] = [];
	const skipped: string[] = [];
	const steps: string[] = [...installStep(project, files)];
	const providerFile = providerPath(project, files.hasSrc);

	if (project.kind === 'expo') {
		const entry = expoPluginEntry(options);
		if (files.dynamicConfig === null) {
			const merged = mergeExpoAppJson(files.appJson, entry, overwrite);
			if (merged === null) {
				skipped.push(
					'app.json already has a c15t plugin entry; pass --overwrite to replace it.'
				);
			} else {
				planned.push({
					action: files.appJson === null ? 'create' : 'update',
					contents: merged,
					path: 'app.json',
				});
			}
		} else {
			steps.push(
				`Add this entry to "plugins" in ${files.dynamicConfig} (c15t does not edit a dynamic config):\n${JSON.stringify(entry, null, 2)}`
			);
		}
	}

	if (files.providerExists && !overwrite) {
		skipped.push(`${providerFile} exists; pass --overwrite to replace it.`);
	} else {
		planned.push({
			action: files.providerExists ? 'update' : 'create',
			contents: providerSource(project.typescript),
			path: providerFile,
		});
	}
	steps.push(wrapStep(files, providerFile, options.privacyPolicyURL));

	if (project.kind === 'expo') {
		steps.push(
			`Android resolves the native SDK from the private Maven repository you were given. Add it with the plugin's androidMavenRepository option. See ${RN_DOCS}/frameworks/react-native/expo.md.`
		);
		if (options.bundleManifest && !project.cliInstalled) {
			steps.push(
				`bundleManifest runs \`c15t mobile-manifest\` at prebuild. Add @c15t/cli as a dev dependency: ${files.installCommand} -D @c15t/cli`
			);
		}
		steps.push(
			'Build a native app: npx expo prebuild, then npx expo run:ios or npx expo run:android. Expo Go cannot load the native module.'
		);
		return { files: planned, skipped, steps };
	}

	if (options.mode === 'offline' || options.mode === 'custom') {
		steps.push(
			`Configure ${options.mode} mode in the native projects. See ${RN_DOCS}/frameworks/react-native/configuration.md.`
		);
	} else {
		steps.push(
			`iOS: add these entries inside the root <dict> of your app target's Info.plist, then run pod install in ios/:\n${infoPlistEntries(options)}`,
			`Android: add the private Maven repository you were given to android/build.gradle (${RN_DOCS}/frameworks/react-native/bare.md, Set up Android), and these entries inside <application> in android/app/src/main/AndroidManifest.xml:\n${androidManifestEntries(options)}`
		);
	}
	steps.push('Rebuild both apps; native configuration needs a new binary.');
	return { files: planned, skipped, steps };
};

/**
 * Steps for a Swift or Kotlin app. Nothing is written: Xcode projects, Gradle
 * files and manifests stay the developer's to edit.
 *
 * @param platforms - From `detectNativePlatforms`.
 * @param options - The answers.
 * @returns The steps, per platform.
 */
export const planNativeSetup = (
	platforms: readonly NativePlatform[],
	options: MobileSetupOptions
): MobileSetupPlan => {
	const url = options.backendURL ?? 'https://your-project.inth.app';
	const steps: string[] = [];
	if (platforms.includes('ios')) {
		steps.push(
			'iOS: the Swift SDK is private source. In Xcode, choose File > Add Package Dependencies > Add Local and select your c15t checkout. Add the C15tCore, C15tApple and C15tConsentUI products to your app target.',
			`iOS: add ConsentModel.swift and ConsentRoot.swift from frameworks/swift/quickstart.mdx (${SOURCE_DOCS}), then create the model once in your App with ConsentModel(backendURL: URL(string: "${url}")!) and wrap your root view in ConsentRoot(consent: consent, privacyPolicyURL: URL(string: "${options.privacyPolicyURL}")!).`
		);
	}
	if (platforms.includes('android')) {
		steps.push(
			`Android: add the private Maven repository you were given to dependencyResolutionManagement.repositories in settings.gradle.kts, with includeGroup("com.c15t"), as frameworks/android/quickstart.mdx shows (${SOURCE_DOCS}).`,
			`Android: add to app/build.gradle.kts:\nimplementation("com.c15t:c15t-android:${C15T_ANDROID_VERSION}")\nimplementation("com.c15t:c15t-consent-ui:${C15T_ANDROID_VERSION}")`,
			`Android: call C15tAndroid.install(this, NativeConfig(backendUrl = "${url}", consentCategories = listOf(${options.categories
				.map((category) => `ConsentCategory.${category.toUpperCase()}`)
				.join(
					', '
				)}))) in Application.onCreate, mount C15tConsent(presenter, "${options.privacyPolicyURL}") in your activity, and add android.permission.INTERNET to the manifest. The complete files are in frameworks/android/quickstart.mdx.`
		);
	}
	if (options.mode === 'offline' || options.mode === 'custom') {
		steps.push(
			`Configure ${options.mode} mode in code instead of a backend URL, as guides/mobile-offline.mdx describes (${SOURCE_DOCS}).`
		);
	}
	return { files: [], skipped: [], steps };
};
