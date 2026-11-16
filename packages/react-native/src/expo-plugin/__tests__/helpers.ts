import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExportedConfig, Mod } from 'expo/config-plugins';

import type { C15tPluginProps } from '../params';
import { applyParamsOnConfig } from '../with-c15t';
import type { WorkflowContext } from '../workflow';
import fixtureAppJson from './fixtures/app.json';

const thisDirectory = dirname(fileURLToPath(import.meta.url));

/** Directory holding `app.json` and the native project fixtures. */
export const FIXTURE_DIR = join(thisDirectory, 'fixtures');

/** Read a fixture from this directory's `fixtures/` folder. */
export const readFixture = function readFixture(name: string): string {
	return readFileSync(join(FIXTURE_DIR, name), 'utf8');
};

/** argv for `expo prebuild`, the command Continuous Native Generation runs. */
/** The smallest in-code policy the plugin accepts. */
export const IN_CODE_POLICY = {
	rules: [
		{
			id: 'everywhere',
			match: { fallback: true, isDefault: true },
			model: 'opt-in',
			prompt: 'choice',
		},
	],
} as const;

/** Props for an app whose policy is in code. */
export const WITH_POLICY = {
	backendURL: 'https://acme.inth.app',
	policy: IN_CODE_POLICY,
} as const;

export const PREBUILD_ARGV = ['node', '/usr/local/bin/expo', 'prebuild'];

/** argv for `expo start`, which on a managed project means Expo Go. */
export const START_ARGV = ['node', '/usr/local/bin/expo', 'start'];

/** Environment an EAS Build worker runs with. */
export const EAS_BUILD_ENV = {
	EAS_BUILD: 'true',
	EAS_BUILD_PLATFORM: 'ios',
	EAS_BUILD_PROFILE: 'production',
};

/** The fixture `app.json`, as the object `@expo/config` hands a plugin. */
export const fixtureConfig = function fixtureConfig(): ExportedConfig {
	return structuredClone((fixtureAppJson as { expo: ExportedConfig }).expo);
};

/**
 * Apply the plugin the way a prebuild would: config in, mods registered, no
 * file written yet. Every test starts here.
 */
export const applyToFixture = function applyToFixture(
	props: C15tPluginProps | undefined,
	context: Partial<WorkflowContext> = {}
): ExportedConfig {
	return applyParamsOnConfig(fixtureConfig(), props, {
		argv: PREBUILD_ARGV,
		env: {},
		projectRoot: FIXTURE_DIR,
		...context,
	});
};

/**
 * Run one registered mod against a hand-built file contents.
 *
 * This is how Expo's own plugin tests work: `applyParamsOnConfig` only
 * registers mods, and a mod is a function from a file to a file, so the file
 * under test can come from a fixture instead of a generated project.
 */
export const runMod = async function runMod<T>(
	config: ExportedConfig,
	platform: 'android' | 'ios',
	modName: string,
	modResults: T,
	options: {
		introspect?: boolean;
		projectName?: string;
		projectRoot?: string;
	} = {}
): Promise<ExportedConfig> {
	const mods = config.mods?.[platform] as
		| Record<string, Mod<T> | undefined>
		| undefined;
	const mod = mods?.[modName];
	if (mod === undefined) {
		throw new Error(`no ${platform}.${modName} mod was registered`);
	}

	// A mod that writes files needs a project to write into, so a test that
	// exercises one points at a scratch tree instead of the read-only fixtures.
	const projectRoot = options.projectRoot ?? FIXTURE_DIR;
	const applied = await mod({
		...config,
		modRequest: {
			introspect: options.introspect ?? false,
			modName,
			platform,
			platformProjectRoot: join(projectRoot, platform),
			projectName: options.projectName,
			projectRoot,
		},
		modResults,
	});

	return applied;
};

/** The `Info.plist` the plugin leaves behind, from `config.ios.infoPlist`. */
export const runInfoPlist = function runInfoPlist(
	config: ExportedConfig,
	infoPlist: Record<string, unknown> = config.ios?.infoPlist ?? {}
): Promise<ExportedConfig> {
	return runMod(config, 'ios', 'infoPlist', infoPlist);
};

/** A fixture file as the gradle and source mods receive it. */
export const gradleFile = function gradleFile(
	name: string,
	language: 'groovy' | 'kt' | 'rb' = 'groovy'
) {
	return { contents: readFixture(name), language, path: name };
};

/** The Firebase Consent Mode v2 defaults every `Info.plist` gets: all denied. */
export const GOOGLE_CONSENT_PLIST_DEFAULTS = {
	GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS: false,
	GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE: false,
	GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA: false,
	GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE: false,
} as const;

/** The same defaults as `<meta-data>` names, in the order they are written. */
export const GOOGLE_CONSENT_META_DATA_NAMES = [
	'google_analytics_default_allow_analytics_storage',
	'google_analytics_default_allow_ad_storage',
	'google_analytics_default_allow_ad_user_data',
	'google_analytics_default_allow_ad_personalization_signals',
];

/** The `<meta-data>` entries for those defaults, as the manifest holds them. */
export const GOOGLE_CONSENT_META_DATA = GOOGLE_CONSENT_META_DATA_NAMES.map(
	(name) => ({
		$: {
			'android:name': name,
			'android:value': 'false',
			'tools:replace': 'android:value',
		},
	})
);
