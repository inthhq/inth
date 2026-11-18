import type { InthPluginProps } from '@inth/react-native/expo-plugin';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
import expoPackage from 'expo/package.json';

/*
 * The appearance of the native consent screens, written into Info.plist and
 * AndroidManifest.xml at prebuild. The theme is JSON so Node can load it here
 * and Metro can bundle it into `src/app.tsx`, where the same values style the
 * React Native components. The Expo and Customize docs pages show this block.
 */
// #region docs:expo-theme title="app.config.ts"
import consentTheme from './src/inth/consent-theme.json';

const theme: InthPluginProps['theme'] = consentTheme;
// #endregion docs:expo-theme

/**
 * The Inth project URL for the embedded consent core.
 *
 * Expo loads `.env` into `process.env` before it evaluates this file, so one file
 * feeds both the native configuration (here, through the config plugin) and the
 * JavaScript screens (through the `EXPO_PUBLIC_` copy, which Metro inlines). A value
 * already in the real environment wins over the file, which is how CI overrides it.
 *
 * Everything written here ends up in a public `.ipa` and `.apk`, so nothing secret may
 * appear. There is no key to configure either: a project is its backend URL.
 */
const backendURL =
	process.env.EXPO_PUBLIC_C15T_BACKEND_URL ?? 'https://example-inth.inth.app/';

/** Truthy spellings that mean "off"; anything else present means on. */
const isOff = (value: string | undefined): boolean =>
	['0', 'false', 'no', 'off'].includes((value ?? '').toLowerCase());

/**
 * App E2E build: the real vendor SDKs start and every request goes to the
 * loopback E2E backend over plain HTTP. `scripts/vendor-e2e.sh` sets this, the
 * backend URL and `C15T_E2E_POLICY`, the policy resource it exported from that
 * backend. Normal builds keep the hosted demo and the committed resource.
 *
 * The Inth plugin accepts only an Inth project URL, and a Release build cannot
 * use `dryRun`. So in this mode the plugin gets the demo project as a placeholder
 * with `autoBootstrap: false`, and `plugins/with-inth-e2e-install` makes the
 * native app install the core against the loopback backend before React Native
 * starts. The JavaScript screens still read the loopback URL.
 */
const appE2e = process.env.EXPO_PUBLIC_C15T_APP_E2E === '1';

const consentCategories: NonNullable<InthPluginProps['consentCategories']> = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
];

/**
 * The installed Expo SDK. A packed consumer from
 * `scripts/prepare-packed-consumer.py --cell` runs this config on another SDK.
 */
const expoSdk = Number(expoPackage.version.split('.')[0]);

/**
 * The prompt Apple draws, compiled into the binary at prebuild.
 *
 * `trackingUsageDescription` is the plain alert and stays required. Apple shows it on
 * every older system and to every device outside the countries where it enabled the
 * expanded sheet, so the Markdown key sits beside it rather than replacing it. The
 * Markdown copy is what iOS and iPadOS 27.2 draws in its place for a device signed in
 * inside one of those countries, and Apple renders it as Markdown: bold, italics,
 * bullet lists, and paragraph breaks. No underline.
 *
 * Per-locale Markdown goes into each `<locale>.lproj/InfoPlist.strings` at prebuild,
 * keyed the way Xcode spells the tag, because `Info.plist` holds one value per key.
 * Whether the device ever runs this app in one of those locales is the app's own
 * localization list, not something this plugin decides.
 */
const trackingUsageDescription =
	'We ask to link your activity across apps and websites for one reason: to stop showing you ads you have already dismissed.';

const trackingMarkdownUsageDescription = `**We link your activity across apps and websites for one reason.**

- Fewer repeats of the ads you have already dismissed
- No name, no email, and nothing you type

You can change this in Settings at any time.`;

const trackingMarkdownUsageDescriptionLocalizations = {
	de: `**Wir verknüpfen Ihre Aktivitäten über Apps und Websites aus einem Grund.**

- Weniger Wiederholungen von Anzeigen, die Sie bereits verworfen haben
- Kein Name, keine E-Mail und nichts, was Sie eingeben

Sie können das jederzeit in den Einstellungen ändern.`,
	'fr-CA': `**Nous relions votre activité dans plusieurs applications et sites pour une seule raison.**

- Moins de répétitions des annonces que vous avez déjà ignorées
- Ni nom, ni courriel, et rien de ce que vous tapez

Vous pouvez changer cela dans Réglages à tout moment.`,
	'zh-Hans': `**我们跨应用和网站关联您的活动，只为一个原因。**

- 更少重复展示您已经忽略的广告
- 不收集姓名、电子邮件或您输入的内容

您可以随时在设置中更改。`,
};

const inthPluginProps: InthPluginProps = {
	androidMavenRepository: (process.env.C15T_MAVEN_URL ?? '').startsWith('file:')
		? { url: process.env.C15T_MAVEN_URL ?? '' }
		: {
				credentials: {
					passwordEnvironmentVariable: 'C15T_MAVEN_TOKEN',
					usernameEnvironmentVariable: 'C15T_MAVEN_USERNAME',
				},
				url:
					process.env.C15T_MAVEN_URL ??
					'https://maven.pkg.github.com/inthhq/c15t-private',
			},
	backendURL: appE2e ? 'https://example-inth.inth.app' : backendURL,
	consentCategories,
	// `C15T_DRY_RUN=1` drops consent records and lets a debug build use a staging
	// or loopback URL. A release build refuses to start Inth with it on.
	dryRun: process.env.C15T_DRY_RUN === '1',
	// The App Tracking Transparency opt-in. Consent to marketing cookies is not Apple
	// tracking authorization, so this fixture asks for both: the banner decides what
	// Inth may store, and the Apple sheet decides what the advertising identifier is
	// worth. See the tracking card on the Consent tab for the request itself.
	enableAppTrackingTransparency: true,
	// An App E2E build installs the core itself, with its own policy resource.
	...(appE2e
		? { autoBootstrap: false }
		: { policyResource: process.env.C15T_E2E_POLICY ?? './inth-policy.json' }),
	// `C15T_NATIVE_UI=0` builds without the stock native consent screens; the app
	// then draws its own with the headless hooks (src/screens/headless.tsx).
	...(process.env.C15T_NATIVE_UI === '0' ? { nativeUI: false } : { theme }),
	trackingMarkdownUsageDescription,
	trackingMarkdownUsageDescriptionLocalizations,
	trackingUsageDescription,
};

/**
 * A plugin list, in the spelling `app.config.ts` needs.
 *
 * `ExpoConfig['plugins']` describes the `app.json` form: strings and tuples. A
 * TypeScript config may also return a plugin function, which the runtime accepts and
 * the generated type does not name, so the list carries the wider type and meets the
 * config through one cast.
 */
type PluginEntry = ConfigPlugin | NonNullable<ExpoConfig['plugins']>[number];

const plugins: PluginEntry[] = [
	// Only while this example lives next to the core it builds against.
	// `expo export` and `expo run:*` both count as a native-build invocation, so
	// the plugin's Expo Go guard passes on its own. There is no `skipNativeBuildCheck`
	// here on purpose: this project has no Expo Go path, and a bare `expo config` in
	// CI should keep saying so.
	['@inth/react-native', inthPluginProps],
	// The vendor SDKs the Inth integrations control. They are always linked and
	// start only in an App E2E build (`src/e2e/vendor-journey-app.tsx`).
	[
		'expo-build-properties',
		{
			android: {
				// R8 shrinks the Release build, the default from Expo SDK 58 and
				// written out here so the older SDK cells build the same way. The
				// consent journeys then run on the minified code users ship.
				enableMinifyInReleaseBuilds: true,
				// Plain HTTP reaches only the loopback E2E backend.
				usesCleartextTraffic: appE2e,
			},
			ios: {
				// Expo SDK 55 links a precompiled React Native core that pods built as
				// dynamic frameworks cannot link against (`RCTRegisterModule` is
				// undefined), so React Native builds from source there. SDK 57 and
				// later link the precompiled core.
				buildReactNativeFromSource: expoSdk < 57,
				// React Native Firebase resolves the Firebase SDK through Swift
				// Package Manager and refuses static linkage.
				useFrameworks: 'dynamic',
			},
		},
	],
	'@react-native-firebase/app',
	'@react-native-firebase/analytics',
	// No Sentry project: nothing uploads source maps or debug symbols.
	['@sentry/react-native/expo', { disableAutoUpload: true }],
	// Inth's 16.4 floor for every pod, as the bare fixture's Podfile sets it.
	['./plugins/with-pod-deployment-floor', { floor: '16.4' }],
	// The native install against the loopback backend, in an App E2E build only.
	...(appE2e
		? [
				[
					'./plugins/with-inth-e2e-install',
					{
						backendURL,
						consentCategories,
						policy: process.env.C15T_E2E_POLICY,
					},
				] satisfies PluginEntry,
			]
		: []),
];

/**
 * `sort-keys` is waived on the config literal: Expo documents these fields in the
 * order below, and `name` and `slug` buried under `android` reads worse than an
 * unsorted object.
 */
/* eslint-disable eslint/sort-keys */
const inthExpoConfig = ({ config }: ConfigContext): ExpoConfig => ({
	...config,
	name: 'Inth Expo Dev',
	slug: 'inth-expo-dev',
	version: '1.0.0',
	orientation: 'portrait',
	scheme: 'c15texpodev',
	userInterfaceStyle: 'light',
	// Native only. Leaving `web` in the default set makes `expo export` demand
	// react-native-web for a fixture that will never render in a browser.
	platforms: ['ios', 'android'],
	// No `newArchEnabled` here. Expo SDK 57 dropped the field because the New
	// Architecture is the only option, which is what @inth/react-native needs: the
	// TurboModule has no legacy-bridge fallback.
	ios: {
		bundleIdentifier: 'com.inth.expodev',
		// Placeholder Firebase project; firebase.json keeps collection off.
		googleServicesFile: './vendors/GoogleService-Info.plist',
		supportsTablet: true,
	},
	android: {
		googleServicesFile: './vendors/google-services.json',
		package: 'com.inth.expodev',
	},
	plugins: plugins as ExpoConfig['plugins'],
	extra: {
		inth: {
			backendURL,
			forceFakeNative: !isOff(process.env.EXPO_PUBLIC_C15T_FAKE_NATIVE),
			sampleIntervalMs:
				Number(process.env.EXPO_PUBLIC_C15T_SAMPLE_INTERVAL_MS) || 1000,
		},
	},
});

export default inthExpoConfig;
