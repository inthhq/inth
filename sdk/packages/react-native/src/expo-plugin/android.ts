import type { AndroidConfig } from '@expo/config-plugins';

import { androidConfig } from './config-plugins';
import {
	ANDROID_IAB_META_KEYS,
	ANDROID_INITIALIZER,
	ANDROID_INTERNET_PERMISSION,
	ANDROID_META,
	ANDROID_STARTUP_AUTHORITY_SUFFIX,
	ANDROID_STARTUP_META_VALUE,
	ANDROID_STARTUP_PROVIDER,
} from './constants';
import { C15tPluginError } from './errors';
import type { ResolvedC15tParams } from './params';
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
 * `com.c15t.android.C15tAndroid.configFrom` and the bridge's bootstrap read.
 *
 * Only no-backend mode writes a mode key, `com.c15t.MODE` set to `offline`,
 * which starts the core with no backend URL and an offline transport. `hosted`
 * and `selfHosted` differ only by URL, and `custom` turns the launch hook off so
 * the host's own `C15t.bootstrap` call wins the race.
 */
export const buildMetaDataPairs = function buildMetaDataPairs(
	params: ResolvedC15tParams
): MetaDataPair[] {
	const pairs: MetaDataPair[] = [];
	if (params.mode === 'offline') {
		pairs.push({ name: ANDROID_META.mode, value: 'offline' });
	}
	if (params.policyRules !== null) {
		pairs.push({ name: ANDROID_META.policyRules, value: POLICY_RULES_NAME });
	}
	if (params.policyResource !== null) {
		pairs.push({
			name: ANDROID_META.policyResource,
			value: POLICY_RESOURCE_NAME,
		});
	}

	if (params.backendURL !== null) {
		pairs.push({ name: ANDROID_META.backendUrl, value: params.backendURL });
	}
	if (params.initURL !== null) {
		pairs.push({ name: ANDROID_META.initUrl, value: params.initURL });
	}
	if (params.domain !== null) {
		pairs.push({ name: ANDROID_META.domain, value: params.domain });
	}
	// The comma-separated spelling `C15tAndroid.declaredCategories` parses; iOS
	// gets the same list as a plist array. An empty declaration stays unwritten,
	// because absence is the no-declaration answer.
	if (params.consentCategories.length > 0) {
		pairs.push({
			name: ANDROID_META.categories,
			value: params.consentCategories.join(','),
		});
	}
	// The comma-separated spelling `C15tAndroid.declaredVendors` parses. An empty
	// declaration stays unwritten, because absence is the full-disclosure answer.
	if (params.vendors.length > 0) {
		pairs.push({
			name: ANDROID_META.vendors,
			value: params.vendors.join(','),
		});
	}
	// `C15tAndroid.declaredIab` reads these. Absent keys leave IAB TCF off.
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
		throw new C15tPluginError(
			'AndroidManifest.xml has no <application android:name="...MainApplication">, ' +
				'so there is nothing to attach the c15t configuration to. If this app ' +
				'uses a custom Application class, add its c15t <meta-data> entries ' +
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
 * Register `C15tReactNativeInitializer` through androidx.startup.
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
 * Add the INTERNET permission, the c15t configuration, and the launch hook.
 *
 * @param params - Resolved plugin parameters.
 * @param manifest - The parsed `AndroidManifest.xml`.
 * @returns The same manifest, with c15t's entries merged in.
 */
export const applyAndroidManifest = function applyAndroidManifest(
	params: ResolvedC15tParams,
	manifest: AndroidConfig.Manifest.AndroidManifest
): AndroidConfig.Manifest.AndroidManifest {
	const next = androidConfig.Manifest.ensureToolsAvailable(manifest);

	ensureInternetPermission(next);

	const application = getMainApplicationOrThrow(next);
	// The plugin owns every IAB entry. Clear them first, so a removed `iab`
	// option or `consentScreen` leaves no earlier CMP identity behind.
	if (application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) => !ANDROID_IAB_META_KEYS.includes(item.$['android:name'])
		);
	}
	// The plugin owns the mode and policy rules keys, so switching back to a
	// backend mode removes them.
	if (application['meta-data']) {
		application['meta-data'] = application['meta-data'].filter(
			(item) =>
				item.$['android:name'] !== ANDROID_META.mode &&
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
