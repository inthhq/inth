import type { AndroidConfig } from 'expo/config-plugins';

import { androidConfig } from './config-plugins';
import {
	ANDROID_GPP_META_KEYS,
	ANDROID_IAB_META_KEYS,
	ANDROID_INITIALIZER,
	ANDROID_INTERNET_PERMISSION,
	ANDROID_META,
	ANDROID_STARTUP_AUTHORITY_SUFFIX,
	ANDROID_STARTUP_META_VALUE,
	ANDROID_STARTUP_PROVIDER,
	GPP_NO_OPT_OUT_CATEGORIES,
	RETIRED_ANDROID_META_KEYS,
} from './constants';
import { InthPluginError } from './errors';
import type { ResolvedInthParams } from './params';
import { POLICY_RESOURCE_NAME, POLICY_RULES_NAME } from './policy-resource';

/** A `<meta-data>` element, as the manifest is held after `xml2js` parsing. */
interface ManifestMetaDataEntry {
	$: Record<string, string>;
}

/**
 * A `<provider>` element.
 *
 * `AndroidConfig.Manifest.ManifestApplication` types activity, service, and
 * receiver but not provider, so the shape lives here rather than being cast
 * away at every call site.
 */
interface ManifestProviderEntry {
	$: Record<string, string>;
	'meta-data'?: ManifestMetaDataEntry[];
}

type ManifestApplicationWithProviders =
	AndroidConfig.Manifest.ManifestApplication & {
		provider?: ManifestProviderEntry[];
	};

/** One `<meta-data name, value>` pair to write. */
interface MetaDataPair {
	readonly name: string;
	readonly value: string;
}

const metaDataEntry = function metaDataEntry(
	key: string,
	value: string
): ManifestMetaDataEntry {
	return { $: { 'android:name': key, 'android:value': value } };
};

/**
 * The `<meta-data>` set that configures the core, in the names
 * `com.inth.android.InthAndroid.configFrom` and the bridge's bootstrap read.
 *
 * There is one mode, so no mode key: the core starts against the project URL.
 * `com.inth.DRY_RUN` is written only when `dryRun` is on.
 */
export const buildMetaDataPairs = function buildMetaDataPairs(
	params: ResolvedInthParams
): MetaDataPair[] {
	const pairs: MetaDataPair[] = [];
	if (params.policyRules !== null) {
		pairs.push({ name: ANDROID_META.policyRules, value: POLICY_RULES_NAME });
	}
	if (params.policyResource !== null) {
		pairs.push({
			name: ANDROID_META.policyResource,
			value: POLICY_RESOURCE_NAME,
		});
	}

	pairs.push({ name: ANDROID_META.backendUrl, value: params.projectUrl });
	if (params.dryRun) {
		pairs.push({ name: ANDROID_META.dryRun, value: 'true' });
	}
	if (params.property !== null) {
		pairs.push({ name: ANDROID_META.property, value: params.property });
	}
	// The comma-separated spelling `InthAndroid.declaredCategories` parses; iOS
	// gets the same list as a plist array. An empty declaration stays unwritten,
	// because absence is the no-declaration answer.
	if (params.consentCategories.length > 0) {
		pairs.push({
			name: ANDROID_META.categories,
			value: params.consentCategories.join(','),
		});
	}
	// The comma-separated spelling `InthAndroid.declaredVendors` parses. An empty
	// declaration stays unwritten, because absence is the full-disclosure answer.
	if (params.vendors.length > 0) {
		pairs.push({
			name: ANDROID_META.vendors,
			value: params.vendors.join(','),
		});
	}
	// `InthAndroid.declaredIab` reads these. Absent keys leave IAB TCF off.
	if (params.iab !== null) {
		pairs.push(
			{ name: ANDROID_META.iabCmpId, value: String(params.iab.cmpId) },
			{
				name: ANDROID_META.iabCmpVersion,
				value: String(params.iab.cmpVersion),
			},
			{
				name: ANDROID_META.iabPublisherCountryCode,
				value: params.iab.publisherCountryCode,
			}
		);
		if (params.iab.consentScreen !== null) {
			pairs.push({
				name: ANDROID_META.iabConsentScreen,
				value: String(params.iab.consentScreen),
			});
		}
	}
	if (params.forceGPC) {
		pairs.push({ name: ANDROID_META.forceGpc, value: 'true' });
	}
	// `InthAndroid.declaredGpp` reads these. Absent keys leave GPP off, and an
	// absent option keeps the core's default.
	if (params.gpp !== null) {
		pairs.push({ name: ANDROID_META.gpp, value: 'true' });
		if (params.gpp.mspaMode !== null) {
			pairs.push({
				name: ANDROID_META.gppMspaMode,
				value: params.gpp.mspaMode,
			});
		}
		// Written whenever the app set the option. Meta-data cannot carry a
		// reliably empty value, so an empty list is the word `none`.
		if (params.gpp.optOutCategories !== null) {
			pairs.push({
				name: ANDROID_META.gppOptOutCategories,
				value:
					params.gpp.optOutCategories.length > 0
						? params.gpp.optOutCategories.join(',')
						: GPP_NO_OPT_OUT_CATEGORIES,
			});
		}
		if (!params.gpp.tcf) {
			pairs.push({ name: ANDROID_META.gppTcf, value: 'false' });
		}
	}
	if (!params.autoBootstrap) {
		pairs.push({ name: ANDROID_META.autoBootstrap, value: 'false' });
	}

	return pairs;
};

const getMainApplicationOrThrow = function getMainApplicationOrThrow(
	manifest: AndroidConfig.Manifest.AndroidManifest
): ManifestApplicationWithProviders {
	const application = androidConfig.Manifest.getMainApplication(manifest);
	if (application === null) {
		throw new InthPluginError(
			'AndroidManifest.xml has no <application android:name="...MainApplication">, ' +
				'so there is nothing to attach the Inth configuration to. If this app ' +
				'uses a custom Application class, add its Inth <meta-data> entries ' +
				'and the androidx.startup provider by hand and drop this plugin.'
		);
	}
	return application as ManifestApplicationWithProviders;
};

/** Add the INTERNET permission unless something already asked for it. */
const ensureInternetPermission = function ensureInternetPermission(
	manifest: AndroidConfig.Manifest.AndroidManifest
): void {
	const requested = androidConfig.Permissions.getPermissions(manifest);
	if (!requested.includes(ANDROID_INTERNET_PERMISSION)) {
		androidConfig.Permissions.addPermission(
			manifest,
			ANDROID_INTERNET_PERMISSION
		);
	}
};

/**
 * Register `InthReactNativeInitializer` through androidx.startup.
 *
 * The bridge's own library manifest carries the same entry and the manifest
 * merger would bring it across on its own. Declaring it in the app manifest
 * keeps it visible in `./gradlew :app:processDebugManifest`, which is where a
 * host looks when the first frame reads a deny-all answer.
 */
const ensureStartupInitializer = function ensureStartupInitializer(
	application: ManifestApplicationWithProviders
): void {
	const providers = application.provider ?? [];
	const existing = providers.find(
		(provider) => provider.$['android:name'] === ANDROID_STARTUP_PROVIDER
	);

	if (existing === undefined) {
		providers.push({
			$: {
				'android:authorities': `\${applicationId}${ANDROID_STARTUP_AUTHORITY_SUFFIX}`,
				'android:exported': 'false',
				'android:name': ANDROID_STARTUP_PROVIDER,
				'tools:node': 'merge',
			},
			'meta-data': [
				{
					$: {
						'android:name': ANDROID_INITIALIZER,
						'android:value': ANDROID_STARTUP_META_VALUE,
					},
				},
			],
		});
		application.provider = providers;
		return;
	}

	const metaData = existing['meta-data'] ?? [];
	const hasInitializer = metaData.some(
		(entry) => entry.$['android:name'] === ANDROID_INITIALIZER
	);
	if (!hasInitializer) {
		metaData.push(
			metaDataEntry(ANDROID_INITIALIZER, ANDROID_STARTUP_META_VALUE)
		);
	}
	existing['meta-data'] = metaData;
	application.provider = providers;
};

/**
 * Add the INTERNET permission, the Inth configuration, and the launch hook.
 *
 * @param params - Resolved plugin parameters.
 * @param manifest - The parsed `AndroidManifest.xml`.
 * @returns The same manifest, with Inth's entries merged in.
 */
export const applyAndroidManifest = function applyAndroidManifest(
	params: ResolvedInthParams,
	manifest: AndroidConfig.Manifest.AndroidManifest
): AndroidConfig.Manifest.AndroidManifest {
	const next = androidConfig.Manifest.ensureToolsAvailable(manifest);

	ensureInternetPermission(next);

	const application = getMainApplicationOrThrow(next);
	// The plugin owns every IAB and GPP entry. Clear them first, so a removed
	// `iab` or `gpp` option leaves no earlier CMP identity or GPP switch behind.
	if (application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) =>
				!ANDROID_IAB_META_KEYS.includes(item.$['android:name']) &&
				!ANDROID_GPP_META_KEYS.includes(item.$['android:name'])
		);
	}
	// The plugin owns the dryRun and policy rules keys, so a removed option
	// leaves neither behind. The retired keys go too: a prebuild without
	// --clean keeps the old manifest, and the cores refuse them.
	if (application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) =>
				!RETIRED_ANDROID_META_KEYS.includes(item.$['android:name']) &&
				item.$['android:name'] !== ANDROID_META.dryRun &&
				(item.$['android:name'] !== ANDROID_META.policyRules ||
					item.$['android:value'] !== POLICY_RULES_NAME)
		);
	}
	if (params.policyResource === null && application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) =>
				item.$['android:name'] !== ANDROID_META.policyResource ||
				item.$['android:value'] !== POLICY_RESOURCE_NAME
		);
	}

	for (const pair of buildMetaDataPairs(params)) {
		androidConfig.Manifest.addMetaDataItemToMainApplication(
			application,
			pair.name,
			pair.value
		);
	}

	if (params.autoBootstrap) {
		ensureStartupInitializer(application);
	}

	return next;
};
