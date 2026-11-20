import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ConfigPlugin, ExportedConfig } from 'expo/config-plugins';

import { applyAndroidManifest } from './android';
import { withAndroidSdkFloor } from './android-sdk-floor';
import { fetchBundledManifest, manifestBuild } from './bundle-manifest';
import {
	androidConfig,
	iosConfig,
	withAndroidManifest,
	withAppBuildGradle,
	withDangerousMod,
	withInfoPlist,
	withMainApplication,
	withPodfile,
	withProjectBuildGradle,
	withXcodeProject,
} from './config-plugins';
import { EXTRA_KEY } from './constants';
import {
	applyGoogleConsentDefaultsToApplication,
	applyGoogleConsentDefaultsToInfoPlist,
} from './google-consent-mode';
import { applyProjectBuildGradle } from './gradle';
import {
	applyInfoPlist,
	applyLocalizedMarkdownDescriptions,
	buildPrivacyManifestDeclarations,
	withIosDeploymentTargetFloor,
} from './ios';
import { resolveNativeUI, withInthNativeUI } from './native-ui';
import { resolveParams } from './params';
import type { InthPluginProps, ResolvedInthParams } from './params';
import {
	embedPolicyResource,
	androidPolicyDestination,
	androidPolicyRulesDestination,
	POLICY_RESOURCE_NAME,
	POLICY_RULES_NAME,
	removeXcodeResource,
	writePolicyRules,
} from './policy-resource';
import { resolveTheme, withInthTheme } from './theme';
import {
	assertUpdatesCannotOutrunTheBinary,
	buildProtocolInfo,
} from './updates';
import {
	assertCustomNativeBuild,
	assertNoManualAndroidRegistration,
	assertNoManualGradleRegistration,
	assertNoManualIosRegistration,
} from './workflow';
import type { WorkflowContext } from './workflow';

/** What the plugin publishes under `extra.inth`. */
export interface InthExtraConfig {
	/** The Inth project URL, in its normal form. */
	projectUrl: string;
	/** Categories the app declares, or `null` when it declares none. Read on web. */
	consentCategories: readonly string[] | null;
	/** Whether consent records are dropped instead of sent. */
	dryRun: boolean;
	/** Whether the binary carries the App Tracking Transparency keys. */
	enableAppTrackingTransparency: boolean;
	/** Whether a GPC signal is reported for a staged or test build. Read on web. */
	forceGPC: boolean;
	/** `property` for consent records, or `null` for the platform default. */
	property: string | null;
	/** Protocol range this bundle speaks. */
	protocol: ReturnType<typeof buildProtocolInfo>;
}

const buildExtra = function buildExtra(
	params: ResolvedInthParams
): InthExtraConfig {
	return {
		consentCategories:
			params.consentCategories.length > 0
				? [...params.consentCategories]
				: null,
		dryRun: params.dryRun,
		enableAppTrackingTransparency: params.appTrackingTransparency.enabled,
		forceGPC: params.forceGPC,
		projectUrl: params.projectUrl,
		property: params.property,
		protocol: buildProtocolInfo(),
	};
};

let warnedAboutDryRun = false;

/**
 * Say once per prebuild that this build is a dry run. Prebuild cannot see the
 * build type, so it writes the flag and native code refuses it in a release.
 */
const warnAboutDryRun = function warnAboutDryRun(): void {
	if (warnedAboutDryRun) {
		return;
	}
	warnedAboutDryRun = true;
	console.warn(
		'Inth: dryRun is on. Consent records are dropped, not sent, and a ' +
			'release build will refuse to start Inth. Remove dryRun before you ' +
			'build a release.'
	);
};

const resolveProjectRoot = function resolveProjectRoot(
	config: ExportedConfig
): string {
	const internal = (config as { _internal?: { projectRoot?: unknown } })
		._internal;
	return typeof internal?.projectRoot === 'string' &&
		internal.projectRoot.length > 0
		? internal.projectRoot
		: process.cwd();
};

/**
 * Merge Inth's declarations into `ios.privacyManifests`.
 *
 * A host may already declare domains for its own trackers, so the lists union
 * rather than replace.
 */
const applyPrivacyDeclarations = function applyPrivacyDeclarations(
	config: ExportedConfig,
	params: ResolvedInthParams
): ExportedConfig {
	const declarations = buildPrivacyManifestDeclarations(params);
	const ios = config.ios ?? {};
	const existing = ios.privacyManifests ?? {};

	return {
		...config,
		ios: {
			...ios,
			privacyManifests: {
				...existing,
				NSPrivacyTracking: declarations.NSPrivacyTracking,
				NSPrivacyTrackingDomains: [
					...new Set([
						...(existing.NSPrivacyTrackingDomains ?? []),
						...declarations.NSPrivacyTrackingDomains,
					]),
				],
			},
		},
	};
};

/**
 * Apply every Inth modification to an Expo config.
 *
 * This is the whole plugin, and it is exported separately from
 * {@link withInth} because it is the part worth testing: it resolves the
 * parameters, refuses the configurations that cannot work, publishes the values
 * JavaScript needs, and registers the mods. Each mod is then a one-line call
 * into a pure function over the file it edits.
 *
 * Nothing here runs inside the app. Every write happens at `expo prebuild`,
 * `expo run:*`, or `eas build` time, which is what makes the plugin usable with
 * Continuous Native Generation: there is no patch step and nothing to re-apply
 * after `npx expo prebuild --clean`.
 *
 * @param config - The Expo config, as `app.json` plus any `app.config.js`.
 * @param props - The parameters the host passed for this plugin.
 * @param context - Overrides for the workflow checks; tests use it to name the
 * command being run.
 * @returns A config with `extra.inth`, the privacy declarations, and the mods.
 * @throws {InthPluginError} When parameters are unusable, the project is heading
 * for Expo Go, the native module is registered by hand as well, or an
 * over-the-air configuration can outrun the binary.
 */
export const applyParamsOnConfig = function applyParamsOnConfig(
	config: ExportedConfig,
	props: InthPluginProps | undefined,
	context: Partial<WorkflowContext> = {}
): ExportedConfig {
	const params = resolveParams(props);
	if (params.dryRun) {
		warnAboutDryRun();
	}
	const theme = resolveTheme(props?.theme);
	const nativeUI = resolveNativeUI(props?.nativeUI, props?.theme);

	assertCustomNativeBuild(params, {
		argv: context.argv,
		env: context.env,
		projectRoot: context.projectRoot ?? resolveProjectRoot(config),
	});
	assertUpdatesCannotOutrunTheBinary(config);

	let next: ExportedConfig = {
		...config,
		extra: { ...config.extra, [EXTRA_KEY]: buildExtra(params) },
	};

	next = applyPrivacyDeclarations(next, params);
	next = withInthNativeUI(next, nativeUI);
	next = withIosDeploymentTargetFloor(next);

	next = withInfoPlist(next, (configWithPlist) => ({
		...configWithPlist,
		modResults: applyGoogleConsentDefaultsToInfoPlist(
			applyInfoPlist(params, configWithPlist.modResults)
		),
	}));

	// Localized prompt copy has no mod of its own in the config plugin versions
	// this package supports, so it goes through the Xcode project, which is where
	// it has to be registered anyway: a string table that never reaches the
	// Resources phase is a localization that ships nothing. Registered only when a
	// locale was actually named, so a plain install leaves the project alone.
	if (
		params.appTrackingTransparency.markdownUsageDescriptionLocalizations
			.length > 0
	) {
		next = withXcodeProject(next, async (configWithProject) => {
			// Introspection must not touch the disk; it only asks what the plugin
			// would touch, and the answer is the mod being registered above.
			if (configWithProject.modRequest.introspect) {
				return configWithProject;
			}
			const { projectRoot } = configWithProject.modRequest;
			return {
				...configWithProject,
				modResults: await applyLocalizedMarkdownDescriptions(params, {
					project: configWithProject.modResults,
					projectName:
						configWithProject.modRequest.projectName ??
						iosConfig.XcodeUtils.getHackyProjectName(
							projectRoot,
							configWithProject
						),
					projectRoot,
				}),
			};
		});
	}

	if (params.policyResource !== null) {
		const source = params.policyResource;
		const bundle = params.bundleManifest;
		const build = manifestBuild(
			context.argv ?? process.argv,
			context.env ?? process.env
		);
		// With bundleManifest, fetch first. A debug build that could not reach the
		// backend continues with no manifest, so an earlier build's embedded copy is
		// removed rather than shipped: reusing an old copy is what
		// allowStaleManifest is for, and then the fetch leaves that copy in place.
		const ready = async (projectRoot: string): Promise<boolean> => {
			if (bundle === null) {
				return true;
			}
			await fetchBundledManifest(projectRoot, params.projectUrl, bundle, build);
			return existsSync(join(projectRoot, source));
		};
		next = withXcodeProject(next, async (cfg) => {
			if (cfg.modRequest.introspect) {
				return cfg;
			}
			const name =
				cfg.modRequest.projectName ??
				iosConfig.XcodeUtils.getHackyProjectName(
					cfg.modRequest.projectRoot,
					cfg
				);
			if (!(await ready(cfg.modRequest.projectRoot))) {
				await rm(
					join(cfg.modRequest.platformProjectRoot, name, POLICY_RESOURCE_NAME),
					{ force: true }
				);
				cfg.modResults = removeXcodeResource(
					cfg.modResults,
					`${name}/${POLICY_RESOURCE_NAME}`
				);
				return cfg;
			}
			await embedPolicyResource(
				cfg.modRequest.projectRoot,
				source,
				params.projectUrl,
				join(cfg.modRequest.platformProjectRoot, name, POLICY_RESOURCE_NAME)
			);
			if (!cfg.modResults.hasFile(`${name}/${POLICY_RESOURCE_NAME}`)) {
				cfg.modResults = iosConfig.XcodeUtils.addResourceFileToGroup({
					filepath: `${name}/${POLICY_RESOURCE_NAME}`,
					groupName: name,
					isBuildFile: true,
					project: cfg.modResults,
				});
			}
			return cfg;
		});
		next = withDangerousMod(next, [
			'android',
			async (cfg) => {
				if (!(await ready(cfg.modRequest.projectRoot))) {
					await rm(androidPolicyDestination(cfg.modRequest.projectRoot), {
						force: true,
					});
					return cfg;
				}
				await embedPolicyResource(
					cfg.modRequest.projectRoot,
					source,
					params.projectUrl,
					androidPolicyDestination(cfg.modRequest.projectRoot)
				);
				return cfg;
			},
		]);
	}

	if (params.policyRules !== null) {
		const rules = params.policyRules;
		next = withXcodeProject(next, async (cfg) => {
			if (cfg.modRequest.introspect) {
				return cfg;
			}
			const name =
				cfg.modRequest.projectName ??
				iosConfig.XcodeUtils.getHackyProjectName(
					cfg.modRequest.projectRoot,
					cfg
				);
			await writePolicyRules(
				join(cfg.modRequest.platformProjectRoot, name, POLICY_RULES_NAME),
				rules
			);
			if (!cfg.modResults.hasFile(`${name}/${POLICY_RULES_NAME}`)) {
				cfg.modResults = iosConfig.XcodeUtils.addResourceFileToGroup({
					filepath: `${name}/${POLICY_RULES_NAME}`,
					groupName: name,
					isBuildFile: true,
					project: cfg.modResults,
				});
			}
			return cfg;
		});
		next = withDangerousMod(next, [
			'android',
			async (cfg) => {
				await writePolicyRules(
					androidPolicyRulesDestination(cfg.modRequest.projectRoot),
					rules
				);
				return cfg;
			},
		]);
	}

	next = withAndroidManifest(next, (configWithManifest) => {
		const manifest = applyAndroidManifest(
			params,
			configWithManifest.modResults
		);
		const application =
			androidConfig.Manifest.getMainApplicationOrThrow(manifest);
		applyGoogleConsentDefaultsToApplication(application);
		return { ...configWithManifest, modResults: manifest };
	});

	next = withProjectBuildGradle(next, (configWithGradle) => ({
		...configWithGradle,
		modResults: applyProjectBuildGradle(
			configWithGradle.modResults,
			params.androidMavenRepository
		),
	}));

	next = withAppBuildGradle(next, (configWithGradle) => {
		assertNoManualGradleRegistration(configWithGradle.modResults.contents);
		return configWithGradle;
	});

	next = withMainApplication(next, (configWithApplication) => {
		assertNoManualAndroidRegistration(
			configWithApplication.modResults.contents
		);
		return configWithApplication;
	});

	next = withPodfile(next, (configWithPodfile) => {
		assertNoManualIosRegistration(configWithPodfile.modResults.contents);
		return configWithPodfile;
	});

	next = withInthTheme(next, theme);
	next = withAndroidSdkFloor(next);

	return next;
};

/**
 * Configure the native Inth core for an Expo app.
 *
 * Use it directly when composing configs by hand; the package default export
 * wraps this in `createRunOncePlugin` so a project that also pulls the plugin in
 * through another plugin does not apply it twice.
 */
export const withInth: ConfigPlugin<InthPluginProps> = function withInth(
	config,
	props
) {
	return applyParamsOnConfig(config, props);
};
