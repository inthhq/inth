const fs = require('node:fs');
const path = require('node:path');

const {
	IOSConfig,
	withAppBuildGradle,
	withAppDelegate,
	withDangerousMod,
	withMainApplication,
	withXcodeProject,
} = require('expo/config-plugins');

// `expo/config-plugins` does not re-export this helper, and an isolated install
// only links @expo/config-plugins next to expo.
const { mergeContents } = require(
	require.resolve('@expo/config-plugins/build/utils/generateCode', {
		paths: [require.resolve('expo/package.json')],
	})
);

/** The policy file's name in the app bundle and in the Android assets. */
const POLICY_NAME = 'inth-e2e-policy';
const POLICY_FILE = `${POLICY_NAME}.json`;

/** A string literal that Kotlin and Swift both read the same way. */
const literal = (value) => {
	if (!/^[\w\-.:/]+$/u.test(value)) {
		throw new Error(
			`with-inth-e2e-install cannot write ${JSON.stringify(value)} into native source.`
		);
	}
	return `"${value}"`;
};

const merge = (src, block) => mergeContents({ src, ...block }).contents;

const kotlinSource = (
	packageName,
	projectUrl,
	consentCategories
) => `package ${packageName}

import android.app.Application
import com.inth.android.InthAndroid
import com.inth.android.InthHttpClient
import com.inth.core.InthInternalApi
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.transport.HostedTransport

// Written by plugins/with-inth-e2e-install.js for an App E2E build.
// A Release build that talks to the loopback E2E backend installs through Inth's
// internal door. An app calls InthAndroid.install(context, config) with its Inth URL.
@OptIn(InthInternalApi::class)
object InthE2EInstall {
  fun install(application: Application) {
    val declared = listOf(${consentCategories.map(literal).join(', ')})
    val config = NativeConfig(
      backendUrl = ${literal(projectUrl)},
      bundledPolicy = application.assets.open("${POLICY_FILE}").bufferedReader().use { it.readText() },
      consentCategories = declared.map { name -> ConsentCategory.entries.first { it.wireName == name } },
    )
    InthAndroid.install(application, config, transport = HostedTransport(InthHttpClient(), config))
  }
}
`;

const swiftHelper = (
	projectUrl,
	consentCategories
) => `// App E2E only. A Release build that talks to the loopback E2E backend installs
// through Inth's internal door, before React Native starts.
private func installInthForE2E() {
  let endpoint = ${literal(projectUrl)}
  do {
    _ = try InthApple.install(CoreConfig(
      store: KeychainStore(service: InthBridgeConfiguration.defaultKeychainService),
      bundledPolicy: Bundle.main.url(forResource: "${POLICY_NAME}", withExtension: "json")
        .flatMap { BundledPolicyResource(url: $0, endpoint: endpoint) },
      transport: HostedTransport(baseURL: URL(string: endpoint)!),
      consentCategories: [${consentCategories.map(literal).join(', ')}].compactMap(ConsentCategory.init(rawValue:)),
      storageBus: UserDefaultsStorageBus()))
  } catch { fatalError("Inth E2E install failed: \\(error)") }
}
`;

/**
 * Install the consent core from native code in an App E2E build.
 *
 * The Inth plugin accepts only an Inth project URL, and a Release build cannot
 * use dryRun, so the app installs the core itself against the loopback E2E
 * backend before React Native starts. The Inth plugin runs with
 * `autoBootstrap: false`, and the bridge attaches to this core. The bare
 * fixture's AppDelegate and MainApplication do the same thing by hand.
 *
 * @param {import('expo/config').ExpoConfig} config Expo configuration.
 * @param {{ projectUrl: string, consentCategories: string[], policy: string }} props
 * The loopback backend URL, the categories to offer, and the policy resource
 * exported for that URL (absolute, or relative to the project).
 * @returns {import('expo/config').ExpoConfig} The configuration with the native install.
 */
const withInthE2EInstall = (
	config,
	{ projectUrl, consentCategories, policy }
) => {
	if (!policy) {
		throw new Error(
			'An App E2E build needs INTH_E2E_POLICY, the policy resource exported for its backend. scripts/vendor-e2e.sh sets it.'
		);
	}
	const policySource = (projectRoot) => path.resolve(projectRoot, policy);

	let next = withAppBuildGradle(config, (gradle) => {
		// The React Native module keeps Inth as `implementation`, so the app module
		// needs its own compile dependency. Same version rule as its library.gradle.
		gradle.modResults.contents = merge(gradle.modResults.contents, {
			anchor: /^dependencies\s*\{/u,
			comment: '//',
			newSrc: `    def inthCoreVersion = findProperty('inth.core.version') ?: '3.0.0-alpha.1'
    implementation("com.inth:inth-core:$inthCoreVersion")
    implementation("com.inth:inth-android:$inthCoreVersion")`,
			offset: 1,
			tag: 'inth-e2e-install-dependencies',
		});
		return gradle;
	});

	next = withMainApplication(next, (application) => {
		application.modResults.contents = merge(application.modResults.contents, {
			anchor: /super\.onCreate\(\)/u,
			comment: '//',
			newSrc: '    InthE2EInstall.install(this)',
			offset: 1,
			tag: 'inth-e2e-install',
		});
		return application;
	});

	next = withDangerousMod(next, [
		'android',
		(mod) => {
			const packageName = mod.android?.package;
			if (!packageName) {
				throw new Error('with-inth-e2e-install needs android.package.');
			}
			const main = path.join(
				mod.modRequest.platformProjectRoot,
				'app/src/main'
			);
			const sources = path.join(main, 'java', ...packageName.split('.'));
			fs.mkdirSync(sources, { recursive: true });
			fs.writeFileSync(
				path.join(sources, 'InthE2EInstall.kt'),
				kotlinSource(packageName, projectUrl, consentCategories)
			);
			fs.mkdirSync(path.join(main, 'assets'), { recursive: true });
			fs.copyFileSync(
				policySource(mod.modRequest.projectRoot),
				path.join(main, 'assets', POLICY_FILE)
			);
			return mod;
		},
	]);

	next = withAppDelegate(next, (delegate) => {
		let { contents } = delegate.modResults;
		// CocoaPods compiles the vendored core into the InthReactNative module.
		contents = merge(contents, {
			anchor: /^import React$/u,
			comment: '//',
			newSrc: '@_spi(InthInternal) import InthReactNative',
			offset: 0,
			tag: 'inth-e2e-install-import',
		});
		contents = merge(contents, {
			anchor: /let delegate = ReactNativeDelegate\(\)/u,
			comment: '//',
			newSrc: '    installInthForE2E()',
			offset: 0,
			tag: 'inth-e2e-install',
		});
		contents = merge(contents, {
			anchor: /^class ReactNativeDelegate\b/u,
			comment: '//',
			newSrc: swiftHelper(projectUrl, consentCategories),
			offset: 0,
			tag: 'inth-e2e-install-helper',
		});
		delegate.modResults.contents = contents;
		return delegate;
	});

	// A resource of the app target, so the build signs it with the rest of the bundle.
	next = withXcodeProject(next, (project) => {
		if (project.modRequest.introspect) {
			return project;
		}
		const { platformProjectRoot, projectRoot } = project.modRequest;
		const name =
			project.modRequest.projectName ??
			IOSConfig.XcodeUtils.getHackyProjectName(projectRoot, project);
		fs.copyFileSync(
			policySource(projectRoot),
			path.join(platformProjectRoot, name, POLICY_FILE)
		);
		if (!project.modResults.hasFile(`${name}/${POLICY_FILE}`)) {
			project.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
				filepath: `${name}/${POLICY_FILE}`,
				groupName: name,
				isBuildFile: true,
				project: project.modResults,
			});
		}
		return project;
	});

	return next;
};

module.exports = withInthE2EInstall;
