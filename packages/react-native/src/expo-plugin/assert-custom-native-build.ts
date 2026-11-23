import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { InthPluginError } from './inth-plugin-error';
import type { ResolvedInthParams } from './params';

/**
 * Everything the workflow checks need that is not the config.
 *
 * Injectable so a test can say "this is `expo start`, no native project yet"
 * without shelling out.
 */
export interface WorkflowContext {
	/** Absolute path to the app project root. */
	readonly projectRoot: string;
	/** Process arguments, for telling `expo prebuild` from `expo start`. */
	readonly argv?: readonly string[];
	/** Process environment, for the EAS Build markers. */
	readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Commands that build, export, or configure a native app without launching Expo Go.
 */
const NATIVE_COMMAND_TOKENS = new Set([
	'add',
	'build',
	'configure',
	'config',
	'config:customize',
	'doctor',
	'export',
	'export:embed',
	'init',
	'install',
	'prebuild',
	'project:init',
	'project:info',
	'remove',
	'run',
	'serve',
]);

/** `expo start` flags that open the web build, which needs no native project. */
const WEB_START_FLAGS = new Set(['--web', '-w']);

/** `expo start` flags that open Expo Go, which still needs refusing. */
const EXPO_GO_FLAGS = new Set(['--go', '-g']);

/**
 * A Metro transform worker. Expo's Babel preset reads the app config again in
 * each worker to inline it into a web bundle, and a worker's argv names the
 * worker, not the command. The command that started the bundler already ran
 * this check, so a worker skips it.
 */
const BUNDLER_WORKER_ENTRY =
	/(?:^|\/)jest-worker\/build\/workers\/(?:threadChild|processChild)\.js$/u;

const isNativeBuildInvocation = function isNativeBuildInvocation(
	argv: readonly string[]
): boolean {
	const command = argv[2]?.trim();
	const entry = argv[1]?.replaceAll('\\', '/');
	return (
		(entry !== undefined && BUNDLER_WORKER_ENTRY.test(entry)) ||
		(entry !== undefined &&
			/(?:^|\/)(?:eas(?:\.cmd)?|eas-cli\/bin\/run)$/u.test(entry)) ||
		(command !== undefined &&
			(NATIVE_COMMAND_TOKENS.has(command) || command.startsWith('run:'))) ||
		argv.some((token) => token.trim().startsWith('--dev-client')) ||
		// Web runs the browser engine, so no native core is missing there.
		(argv.some((token) => WEB_START_FLAGS.has(token.trim())) &&
			!argv.some((token) => EXPO_GO_FLAGS.has(token.trim())))
	);
};

const isEasBuild = function isEasBuild(
	env: Readonly<Record<string, string | undefined>>
): boolean {
	return Object.entries(env).some(
		([key, value]) =>
			value !== undefined &&
			value !== '' &&
			(key.startsWith('EAS_BUILD') || key.startsWith('EAS_LOCAL_BUILD'))
	);
};

const hasNativeProject = function hasNativeProject(
	projectRoot: string
): boolean {
	return (
		existsSync(join(projectRoot, 'ios')) ||
		existsSync(join(projectRoot, 'android'))
	);
};

/**
 * Refuse to configure a project that is heading for Expo Go.
 *
 * Expo Go ships a fixed set of native modules, so a project that uses this
 * plugin and still launches in Expo Go has a JavaScript bundle with no consent
 * core behind it: every read answers deny-all, the banner never appears, and the
 * failure looks like an Inth bug rather than a missing build. Catching it here
 * costs one sentence instead of a day.
 *
 * @param params - Resolved plugin parameters; `skipNativeBuildCheck` waives it.
 * @param context - Project root, argv, and environment.
 * @throws {InthPluginError} When the only thing this config could launch into is
 * Expo Go.
 */
export const assertCustomNativeBuild = function assertCustomNativeBuild(
	params: ResolvedInthParams,
	context: WorkflowContext
): void {
	if (params.skipNativeBuildCheck) {
		return;
	}

	const argv = context.argv ?? process.argv;
	const env = context.env ?? process.env;

	if (isEasBuild(env) || isNativeBuildInvocation(argv)) {
		return;
	}
	if (hasNativeProject(context.projectRoot)) {
		return;
	}

	throw new InthPluginError(
		`@inth/react-native needs a custom native build and this project has ` +
			`none, so it would launch in Expo Go with no consent core behind it. ` +
			`Create a development build with "npx expo run:ios" or ` +
			`"eas build --profile development --platform all" and open that instead. ` +
			`For the web build alone, run "npx expo start --web". ` +
			`In CI that only evaluates the config, pass "skipNativeBuildCheck": true.`
	);
};

/** How the Android package can be registered by hand. */
const MANUAL_ANDROID_PACKAGE_PATTERN = /\bInthReactNativePackage\b/u;

/** How the iOS target can be linked by hand. */
const MANUAL_IOS_POD_PATTERN =
	/^\s*pod\s+['"](?:InthReactNative|@inth\/react-native)['"]/imu;

/** How the Android module can be wired into a bare build by hand. */
const MANUAL_GRADLE_PROJECT_PATTERN =
	/project\(\s*['"]:inth-react-native['"]\s*\)/u;

const assertNotRegisteredManually = function assertNotRegisteredManually(
	matched: boolean,
	fileLabel: string,
	fix: string
): void {
	if (!matched) {
		return;
	}
	throw new InthPluginError(
		`${fileLabel} already registers the Inth native module by hand, and ` +
			`this plugin registers it too, which fails the build with a duplicate ` +
			`module name. Keep one: ${fix}, or remove ` +
			`the Inth plugin from app.json if this app owns its ` +
			`native wiring.`
	);
};

/**
 * Reject a `MainApplication` that lists the Inth package explicitly.
 *
 * Autolinking supplies the package, so a hand-written entry point list produces
 * two registrations of the same TurboModule.
 *
 * @param contents - `MainApplication.java` or `.kt` source.
 * @throws {InthPluginError} When the package is already there.
 */
export const assertNoManualAndroidRegistration =
	function assertNoManualAndroidRegistration(contents: string): void {
		assertNotRegisteredManually(
			MANUAL_ANDROID_PACKAGE_PATTERN.test(contents),
			'MainApplication',
			'delete the InthReactNativePackage entry from the package list'
		);
	};

/**
 * Reject a `Podfile` that pods the Inth iOS target explicitly.
 *
 * @param contents - `ios/Podfile` contents.
 * @throws {InthPluginError} When the pod is already there.
 */
export const assertNoManualIosRegistration =
	function assertNoManualIosRegistration(contents: string): void {
		assertNotRegisteredManually(
			MANUAL_IOS_POD_PATTERN.test(contents),
			'ios/Podfile',
			'delete the pod line for InthReactNative'
		);
	};

/**
 * Reject an app `build.gradle` that includes the Inth module by path.
 *
 * @param contents - `android/app/build.gradle` contents.
 * @throws {InthPluginError} When the module is already included.
 */
export const assertNoManualGradleRegistration =
	function assertNoManualGradleRegistration(contents: string): void {
		assertNotRegisteredManually(
			MANUAL_GRADLE_PROJECT_PATTERN.test(contents),
			'android/app/build.gradle',
			'delete the implementation project(":inth-react-native") line'
		);
	};
