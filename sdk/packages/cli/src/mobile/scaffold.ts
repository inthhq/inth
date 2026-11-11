/**
 * What `c15t setup` writes and prints for a mobile project.
 *
 * Expo gets the config plugin entry and a provider file. Bare React Native gets
 * the provider file and the exact `Info.plist` and `AndroidManifest.xml`
 * entries to add. Swift and Kotlin apps get printed steps only: this module
 * never edits an Xcode project, a Gradle file or a native manifest.
 */

import path from 'node:path';

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
 * The example policy offline setup writes: one rule that asks for a choice
 * everywhere. The app replaces it with its own rules.
 */
export const OFFLINE_RULES = [
	{
		id: 'everywhere',
		match: { fallback: true, isDefault: true },
		model: 'opt-in',
		prompt: 'choice',
	},
] as const;

/**
 * Where a bare React Native app keeps the offline rules: the Android assets
 * folder, which the Android reader loads by name. The iOS target references the
 * same file, so the two platforms cannot drift.
 */
export const BARE_POLICY_RULES_PATH =
	'android/app/src/main/assets/c15t-policy-rules.json';

/**
 * The rules file, byte for byte what the Expo plugin's `writePolicyRules`
 * writes: `{"rules": [...]}`, the shape both native cores read.
 */
export const policyRulesFile = (): string =>
	`${JSON.stringify({ rules: OFFLINE_RULES }, null, 2)}\n`;

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
		props.policy = { rules: OFFLINE_RULES };
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
 * The provider file, in the auto-present API's shape: `ConsentProvider` with the
 * privacy policy opens the native prompt by itself when the policy asks for one,
 * and a Privacy settings button stays reachable afterwards.
 *
 * Needs the `privacyPolicyURL` provider prop and `presentPreferences(url)` from the
 * auto-present release of `@c15t/react-native`; see the PR description.
 */
export const providerSource = (typescript: boolean): string => {
	const props = typescript
		? ': { children: ReactNode; privacyPolicyURL: string }'
		: '';
	return `// Generated by \`c15t setup\`. The native consent engine reads its backend and
// categories from the build configuration; this file only attaches to it.
import { ConsentProvider, presentPreferences } from '@c15t/react-native';
${typescript ? "import type { ReactNode } from 'react';\n" : ''}import { Button } from 'react-native';

/**
 * Render your app inside this, once, above navigation. The provider opens the
 * consent prompt when the policy asks for one; pass autoPresent={false} to
 * ConsentProvider to open it yourself.
 */
export const PrivacyApp = ({ children, privacyPolicyURL }${props}) => (
	<ConsentProvider privacyPolicyURL={privacyPolicyURL}>
		{children}
		<Button
			title="Privacy settings"
			onPress={() => {
				void presentPreferences(privacyPolicyURL);
			}}
		/>
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

const IOS_MODE: Record<MobileMode, string> = {
	custom: 'none',
	hosted: 'hosted',
	offline: 'offline',
	'self-hosted': 'selfHosted',
};

/**
 * The `Info.plist` entries a bare app adds. Offline mode names the rules file
 * instead of a backend.
 */
export const infoPlistEntries = (options: MobileSetupOptions): string =>
	[
		'<key>com.c15t.backend.mode</key>',
		`<string>${IOS_MODE[options.mode]}</string>`,
		...(options.mode === 'offline'
			? [
					'<key>com.c15t.policy.rules</key>',
					'<string>c15t-policy-rules.json</string>',
				]
			: [
					'<key>com.c15t.backend.url</key>',
					`<string>${xml(options.backendURL ?? '')}</string>`,
				]),
		'<key>com.c15t.categories</key>',
		'<array>',
		...options.categories.map((category) => `\t<string>${category}</string>`),
		'</array>',
	].join('\n');

/**
 * The `<application>` meta-data a bare app adds. Offline mode selects no-backend
 * mode and names the rules asset instead of a backend.
 */
export const androidManifestEntries = (options: MobileSetupOptions): string =>
	[
		...(options.mode === 'offline'
			? [
					'<meta-data android:name="com.c15t.MODE" android:value="offline" />',
					'<meta-data android:name="com.c15t.POLICY_RULES" android:value="c15t-policy-rules.json" />',
				]
			: [
					`<meta-data android:name="com.c15t.BACKEND_URL" android:value="${xml(options.backendURL ?? '')}" />`,
				]),
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
	/** Whether a bare app already has the offline rules file. */
	readonly policyRulesExists: boolean;
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

/** No root component was found, so the step names the provider by its project path. */
export const UNKNOWN_ROOT_COMPONENT = 'your root component';

/**
 * The specifier the root component imports the provider with.
 *
 * Relative to the root component's own directory, so `app/_layout.tsx` imports
 * `../c15t/privacy-app`, not the project-root path it would otherwise be given.
 */
export const providerImport = (
	rootComponent: string,
	providerFile: string
): string => {
	const target = providerFile.replace(/\.[jt]sx$/u, '');
	if (rootComponent === UNKNOWN_ROOT_COMPONENT) {
		return `./${target}`;
	}
	const relative = path.posix.relative(
		path.posix.dirname(rootComponent),
		target
	);
	return relative.startsWith('.') ? relative : `./${relative}`;
};

const wrapStep = (files: ProjectFiles, providerFile: string, url: string) =>
	files.rootComponent === UNKNOWN_ROOT_COMPONENT
		? `Render your app inside <PrivacyApp privacyPolicyURL="${url}">, once, in your root component. It is exported from ${providerFile}.`
		: `Render your app inside <PrivacyApp privacyPolicyURL="${url}">, once, in ${files.rootComponent}: import { PrivacyApp } from '${providerImport(files.rootComponent, providerFile)}';`;

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
		if (options.mode === 'custom') {
			// The plugin turns automatic start-up off in custom mode, and the provider
			// only attaches to an engine that already exists.
			steps.push(
				`Custom mode starts no consent engine at launch. Install one in native code that runs before React starts, with your own transport: see "When your app owns native installation" in ${RN_DOCS}/frameworks/react-native/bare.md, and "Use your own transport" in ${RN_DOCS}/frameworks/swift/headless.md and ${RN_DOCS}/frameworks/android/configuration.md. Expo regenerates native code on prebuild, so add that code through a config plugin of your own.`
			);
		}
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

	if (options.mode === 'custom') {
		steps.push(
			`Custom mode installs no consent engine from app metadata. Turn automatic start-up off and install the engine with your own transport before React starts: see "When your app owns native installation" in ${RN_DOCS}/frameworks/react-native/bare.md, and "Use your own transport" in ${RN_DOCS}/frameworks/swift/headless.md and ${RN_DOCS}/frameworks/android/configuration.md.`
		);
	} else {
		if (options.mode === 'offline') {
			if (files.policyRulesExists && !overwrite) {
				skipped.push(
					`${BARE_POLICY_RULES_PATH} exists; pass --overwrite to replace it.`
				);
			} else {
				planned.push({
					action: files.policyRulesExists ? 'update' : 'create',
					contents: policyRulesFile(),
					path: BARE_POLICY_RULES_PATH,
				});
			}
		}
		const iosRules =
			options.mode === 'offline'
				? ` In Xcode, also add ${BARE_POLICY_RULES_PATH} to the app target without copying it, so Copy Bundle Resources includes the same rules file Android reads.`
				: '';
		steps.push(
			`iOS: add these entries inside the root <dict> of your app target's Info.plist, then run pod install in ios/.${iosRules}\n${infoPlistEntries(options)}`,
			`Android: add the private Maven repository you were given to android/build.gradle (${RN_DOCS}/frameworks/react-native/bare.md, Set up Android), and these entries inside <application> in android/app/src/main/AndroidManifest.xml:\n${androidManifestEntries(options)}`
		);
		if (options.mode === 'offline') {
			steps.push(
				`Replace the example rule in ${BARE_POLICY_RULES_PATH} with your own, as guides/mobile-offline.mdx describes (${SOURCE_DOCS}).`
			);
		}
	}
	steps.push('Rebuild both apps; native configuration needs a new binary.');
	return { files: planned, skipped, steps };
};

const kotlinCategories = (categories: readonly MobileCategory[]): string =>
	categories
		.map((category) => `ConsentCategory.${category.toUpperCase()}`)
		.join(', ');

const swiftCategories = (categories: readonly MobileCategory[]): string =>
	categories.map((category) => `.${category}`).join(', ');

/**
 * The Swift install for offline mode: a one-rule policy in code and the offline
 * transport.
 *
 * `native/core-swift/Tests/C15tAppleTests/CLISnippetTests.swift` compiles this exact
 * text against `C15tCore` and `C15tApple`, and the CLI tests compare the two, so the
 * printed step cannot drift from the API.
 */
export const swiftOfflineInstall = (
	categories: readonly MobileCategory[]
): string => `let policy = try ConsentPolicy(rules: [
    PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
])
let core = try C15tApple.install(C15tAppleConfiguration(
    transport: .offline,
    consentCategories: [${swiftCategories(categories)}],
    policy: policy
))`;

/** The Kotlin imports {@link kotlinOfflineInstall} needs. */
export const KOTLIN_OFFLINE_IMPORTS = [
	'com.c15t.android.C15tAndroid',
	'com.c15t.core.ConsentPolicy',
	'com.c15t.core.NativeConfig',
	'com.c15t.core.PolicyMatch',
	'com.c15t.core.PolicyRule',
	'com.c15t.core.model.ConsentCategory',
	'com.c15t.core.model.ConsentModel',
	'com.c15t.core.policy.PolicyPrompt',
] as const;

/**
 * The Kotlin install for offline mode, for `Application.onCreate`.
 *
 * `c15t-android`'s `CliSnippetTest.kt` compiles this exact text, and the CLI tests
 * compare the two.
 */
export const kotlinOfflineInstall = (
	categories: readonly MobileCategory[]
): string => `val policy = ConsentPolicy(listOf(
    PolicyRule("everywhere", PolicyMatch(fallback = true, isDefault = true), ConsentModel.OPT_IN, PolicyPrompt.CHOICE),
))
C15tAndroid.install(this, NativeConfig(
    backendUrl = null,
    consentCategories = listOf(${kotlinCategories(categories)}),
    policy = policy,
))`;

const ESCAPES: Record<string, string> = {
	'\t': '\\t',
	'\n': '\\n',
	'\r': '\\r',
};

/**
 * `value` as a Swift string literal. A URL can carry a quote or backslash that
 * `new URL` accepts by percent-encoding, so it is escaped, never pasted raw.
 */
export const swiftString = (value: string): string =>
	`"${value.replaceAll(/["\\\n\r\t]/gu, (char) => ESCAPES[char] ?? `\\${char}`)}"`;

/** `value` as a Kotlin string literal, with `$` escaped so it starts no template. */
export const kotlinString = (value: string): string =>
	`"${value.replaceAll(/["$\\\n\r\t]/gu, (char) => ESCAPES[char] ?? `\\${char}`)}"`;

const indentBlock = (text: string, prefix: string): string =>
	text
		.split('\n')
		.map((line, index) => (index === 0 ? line : `${prefix}${line}`))
		.join('\n');

/**
 * The Swift configuration for hosted and self-hosted mode.
 *
 * `CLISnippetTests.swift` compiles this text with the default categories, so it
 * cannot drift from `C15tAppleConfiguration`.
 */
export const swiftConfiguration = (options: MobileSetupOptions): string => {
	const transport = options.mode === 'self-hosted' ? 'selfHosted' : 'hosted';
	const url = options.backendURL ?? 'https://your-project.inth.app';
	return `C15tAppleConfiguration(
    transport: .${transport}(URL(string: ${swiftString(url)})!),
    consentCategories: [${swiftCategories(options.categories)}]
)`;
};

/**
 * The SwiftUI entry point: the stock screens on the root view, which install the
 * engine from `configuration` and open the prompt when the policy asks for one.
 * With no configuration, they attach to the engine the app already installed.
 *
 * This is the auto-present API (`.c15tConsent(_:privacyPolicyURL:)`). The compile
 * tests cover it once that API is on this branch; see the PR description.
 */
export const swiftUIEntry = (
	configuration: string | null,
	privacyPolicyURL: string
): string =>
	configuration === null
		? `ContentView()
    .c15tConsent(privacyPolicyURL: URL(string: ${swiftString(privacyPolicyURL)})!)`
		: `ContentView()
    .c15tConsent(
        ${indentBlock(configuration, '        ')},
        privacyPolicyURL: URL(string: ${swiftString(privacyPolicyURL)})!
    )`;

/** The UIKit entry point, `ConsentRootViewController(root:configuration:privacyPolicyURL:)`. */
export const uiKitEntry = (
	configuration: string | null,
	privacyPolicyURL: string
): string => `window.rootViewController = ConsentRootViewController(
    root: UIHostingController(rootView: ContentView()),${
			configuration === null
				? ''
				: `
    configuration: ${indentBlock(configuration, '    ')},`
		}
    privacyPolicyURL: URL(string: ${swiftString(privacyPolicyURL)})!
)`;

/** Opens privacy settings from the app's own control, on Apple platforms. */
export const SWIFT_PRIVACY_SETTINGS =
	'ConsentPrompt.current?.presentPreferences()';

/**
 * The Kotlin install for hosted and self-hosted mode, for `Application.onCreate`.
 *
 * `CliSnippetTest.kt` compiles this text with the default categories.
 */
export const kotlinInstall = (options: MobileSetupOptions): string =>
	`C15tAndroid.install(this, NativeConfig(
    backendUrl = ${kotlinString(options.backendURL ?? 'https://your-project.inth.app')},
    consentCategories = listOf(${kotlinCategories(options.categories)}),
))`;

/**
 * The Compose entry point, beside the app's content: `C15tConsent(privacyPolicyUrl =)`
 * from the auto-present API.
 */
export const composeEntry = (privacyPolicyURL: string): string =>
	`C15tConsent(privacyPolicyUrl = ${kotlinString(privacyPolicyURL)})`;

/** The entry point for an Activity with views, after `setContentView`. */
export const activityEntry = (privacyPolicyURL: string): string =>
	`val consent = attachConsent(${kotlinString(privacyPolicyURL)})
privacySettings.setOnClickListener { consent.presentPreferences() }`;

/** Opens privacy settings from the app's own control on Android. */
export const KOTLIN_PRIVACY_SETTINGS =
	'ConsentPrompt.current?.presentPreferences()';

/** The Kotlin imports {@link kotlinInstall} needs. */
export const KOTLIN_INSTALL_IMPORTS = [
	'com.c15t.android.C15tAndroid',
	'com.c15t.core.NativeConfig',
	'com.c15t.core.model.ConsentCategory',
] as const;

/** The Kotlin imports the consent-screen entry points need. */
export const KOTLIN_SCREEN_IMPORTS = [
	'com.c15t.consentui.C15tConsent',
	'com.c15t.consentui.ConsentPrompt',
	'com.c15t.consentui.attachConsent',
] as const;

const swiftInstallStep = (options: MobileSetupOptions): string => {
	const url = options.privacyPolicyURL;
	const screens = (configuration: string | null) =>
		`With import C15tApple and import C15tConsentUI. SwiftUI, on your root view:\n${swiftUIEntry(configuration, url)}\nUIKit, as the window's root view controller:\n${uiKitEntry(configuration, url)}\nOpen privacy settings from your own control with ${SWIFT_PRIVACY_SETTINGS}.`;
	switch (options.mode) {
		case 'offline':
			return `iOS: at launch, before the first view, install the engine with the policy in code:\n${swiftOfflineInstall(options.categories)}\nThen attach the consent screens, which open the prompt when the policy asks for one. ${screens(null)}\nReplace the example rule with your own, as guides/mobile-offline.mdx describes (${SOURCE_DOCS}).`;
		case 'custom':
			return `iOS: install the engine with your own transport at launch, as "Use your own transport" in frameworks/swift/headless.mdx shows (${SOURCE_DOCS}), passing the categories you chose in the CoreConfig:\nconsentCategories: [${swiftCategories(options.categories)}]\nThen attach the consent screens. ${screens(null)}`;
		default:
			return `iOS: attach the consent screens. They install the engine at launch and open the prompt when the policy asks for one. ${screens(swiftConfiguration(options))}`;
	}
};

const androidInstallStep = (options: MobileSetupOptions): string => {
	const url = options.privacyPolicyURL;
	const screens = `Then show the consent screens, which open the prompt when the policy asks for one (imports: ${KOTLIN_SCREEN_IMPORTS.join(', ')}). In a Compose activity, beside your content:\n${composeEntry(url)}\nIn an Activity with views, after setContentView:\n${activityEntry(url)}\nOpen privacy settings from your own control with ${KOTLIN_PRIVACY_SETTINGS}.`;
	switch (options.mode) {
		case 'offline':
			return `Android: in Application.onCreate, install the engine with the policy in code (imports: ${KOTLIN_OFFLINE_IMPORTS.join(', ')}):\n${kotlinOfflineInstall(options.categories)}\n${screens}\nReplace the example rule with your own, as guides/mobile-offline.mdx describes (${SOURCE_DOCS}).`;
		case 'custom':
			return `Android: install the engine with your own transport in Application.onCreate, as "Use your own transport" in frameworks/android/configuration.mdx shows (${SOURCE_DOCS}), passing the categories you chose in the NativeConfig:\nconsentCategories = listOf(${kotlinCategories(options.categories)}),\n${screens} Add android.permission.INTERNET to the manifest.`;
		default:
			return `Android: in Application.onCreate, install the engine (imports: ${KOTLIN_INSTALL_IMPORTS.join(', ')}):\n${kotlinInstall(options)}\n${screens} Add android.permission.INTERNET to the manifest.`;
	}
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
	const steps: string[] = [];
	if (platforms.includes('ios')) {
		steps.push(
			'iOS: the Swift SDK is private source. In Xcode, choose File > Add Package Dependencies > Add Local and select your c15t checkout. Add the C15tCore, C15tApple and C15tConsentUI products to your app target.',
			swiftInstallStep(options)
		);
	}
	if (platforms.includes('android')) {
		steps.push(
			`Android: add the private Maven repository you were given to dependencyResolutionManagement.repositories in settings.gradle.kts, with includeGroup("com.c15t"), as frameworks/android/quickstart.mdx shows (${SOURCE_DOCS}).`,
			`Android: add to app/build.gradle.kts:\nimplementation("com.c15t:c15t-android:${C15T_ANDROID_VERSION}")\nimplementation("com.c15t:c15t-consent-ui:${C15T_ANDROID_VERSION}")`,
			androidInstallStep(options)
		);
	}
	return { files: [], skipped: [], steps };
};
