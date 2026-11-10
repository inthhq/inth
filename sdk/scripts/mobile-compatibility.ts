#!/usr/bin/env bun
/** Check the packed SDK against the RN and Expo hosts in mobile-compatibility.json. */
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import matrix from './mobile-compatibility.json';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = join(ROOT, 'packages/react-native');

/** A reproducible host pairing, never an arbitrary combination of Expo and RN. */
export type MobileCompatibilityCell = (typeof matrix)[number];

const hostVersions = function hostVersions(
	cell: MobileCompatibilityCell
): Record<string, string> {
	const versions: Record<string, string> = {
		'@react-native/codegen': cell.reactNative,
		react: cell.react,
		'react-native': cell.reactNative,
	};
	if (cell.expo) {
		versions.expo = cell.expo;
	}
	return versions;
};

/** Refuse a missing cell before installing packages or building native code. */
export const compatibilityCell = function compatibilityCell(
	id: string
): MobileCompatibilityCell {
	const cell = matrix.find((candidate) => candidate.id === id);
	if (!cell) {
		throw new Error(
			`Unknown mobile compatibility cell ${id}. Choose ${matrix.map((candidate) => candidate.id).join(', ')}.`
		);
	}
	return cell;
};

/** Keep generated projects and installed packages outside the source checkout. */
export const prepareCompatibilityOutput = function prepareCompatibilityOutput(
	path: string
): string {
	const output = resolve(path);
	mkdirSync(dirname(output), { recursive: true });
	const canonical = join(
		realpathSync(dirname(output)),
		output.split('/').at(-1) ?? ''
	);
	const fromRoot = relative(realpathSync(ROOT), canonical);
	if (fromRoot === '' || (!fromRoot.startsWith('../') && fromRoot !== '..')) {
		throw new Error(
			'Mobile compatibility output must be outside the checkout.'
		);
	}
	if (
		existsSync(output) &&
		(realpathSync(output) !== canonical || readdirSync(output).length > 0)
	) {
		throw new Error(
			'Mobile compatibility output must be a new or empty directory.'
		);
	}
	mkdirSync(output, { recursive: true });
	return output;
};

const consumerSource = `
import { Text, View } from 'react-native';
import { ConsentProvider, useConsent, useSaveConsents } from '@c15t/react-native';
import withC15t, { type C15tPluginProps } from '@c15t/react-native/expo-plugin';
import { connectPostHog, connectFirebaseAnalytics } from '@c15t/react-native/integrations';

function PrivacyStatus() {
  const allowed = useConsent('measurement');
  const saveConsents = useSaveConsents();
  return <View><Text onPress={() => { void saveConsents('none'); }}>{allowed ? 'Allowed' : 'Denied'}</Text></View>;
}
export const App = () => <ConsentProvider><PrivacyStatus /></ConsentProvider>;
export const plugin: typeof withC15t = withC15t;
export const configuration: C15tPluginProps = { mode: 'offline' };
export const posthog: typeof connectPostHog = connectPostHog;
export const firebase: typeof connectFirebaseAnalytics = connectFirebaseAnalytics;
`;

const verifyIosDeploymentTargets = function verifyIosDeploymentTargets(
	consumer: string,
	id: string
): void {
	const properties = JSON.parse(
		readFileSync(join(consumer, 'ios/Podfile.properties.json'), 'utf8')
	);
	if (
		Number.parseFloat(properties['ios.deploymentTarget']) < 16.4 ||
		!properties['ios.deploymentTarget']
	) {
		throw new Error(
			`${id}: generated iOS target is below c15t's 16.4 minimum.`
		);
	}
	const appTargets: unknown = JSON.parse(
		execFileSync(
			'node',
			[
				'-e',
				`
		const { IOSConfig } = require('@expo/config-plugins');
		const project = IOSConfig.XcodeUtils.getPbxproj(process.cwd());
		const [, target] = IOSConfig.Target.findFirstNativeTarget(project);
		const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList);
		process.stdout.write(JSON.stringify(configurations.map(([, configuration]) => configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET)));
	`,
			],
			{ cwd: consumer, encoding: 'utf8' }
		)
	);
	if (
		!Array.isArray(appTargets) ||
		appTargets.length < 2 ||
		appTargets.some(
			(target) =>
				typeof target !== 'string' ||
				Number.parseFloat(target.replaceAll('"', '')) < 16.4
		)
	) {
		throw new Error(
			`${id}: generated Xcode application targets are below 16.4 or missing.`
		);
	}
};

const main = function main(): void {
	const { values } = parseArgs({
		options: {
			android: { type: 'boolean' },
			cell: { type: 'string' },
			matrix: { type: 'boolean' },
			output: { type: 'string' },
		},
	});
	if (values.matrix) {
		console.log(JSON.stringify(matrix));
		return;
	}
	const cell = compatibilityCell(values.cell ?? '');
	const output = prepareCompatibilityOutput(
		values.output ?? mkdtempSync(join(tmpdir(), 'c15t-mobile-compat-'))
	);
	const consumer = join(output, 'consumer');
	mkdirSync(consumer);
	const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' };
	let commandIndex = 0;
	const run = (command: string, args: string[], cwd = consumer): void => {
		commandIndex += 1;
		const log = join(output, `${String(commandIndex).padStart(2, '0')}.log`);
		console.log(`${cell.id}: ${command} ${args.join(' ')}`);
		try {
			const stdout = execFileSync(command, args, {
				cwd,
				encoding: 'utf8',
				env,
				maxBuffer: 32 * 1024 * 1024,
			});
			writeFileSync(log, stdout);
		} catch (error) {
			if (
				error !== null &&
				typeof error === 'object' &&
				'stdout' in error &&
				'stderr' in error
			) {
				writeFileSync(log, `${String(error.stdout)}\n${String(error.stderr)}`);
			}
			throw new Error(`${cell.id} failed. See ${log}.`, { cause: error });
		}
	};
	const archive = join(output, 'c15t-react-native.tgz');
	run(
		'bun',
		['pm', 'pack', '--ignore-scripts', '--filename', archive],
		PACKAGE
	);
	const producer = JSON.parse(
		readFileSync(join(PACKAGE, 'package.json'), 'utf8')
	);
	cpSync(join(ROOT, 'bunfig.toml'), join(consumer, 'bunfig.toml'));
	writeFileSync(
		join(consumer, 'package.json'),
		JSON.stringify(
			{
				dependencies: {
					...hostVersions(cell),
					'@c15t/react-native': `file:${archive}`,
					'@expo/config-plugins': producer.dependencies['@expo/config-plugins'],
					'@types/node': '25.5.0',
					'@types/react': cell.react.startsWith('19.3.') ? '19.3.0' : '19.2.17',
				},
				name: 'c15t-mobile-compatibility',
				private: true,
				type: 'module',
			},
			null,
			2
		)
	);
	run('bun', ['install', '--ignore-scripts']);
	for (const [name, version] of Object.entries(hostVersions(cell))) {
		const installed = JSON.parse(
			readFileSync(join(consumer, 'node_modules', name, 'package.json'), 'utf8')
		);
		if (installed.version !== version) {
			throw new Error(
				`${name}: expected ${version}, installed ${String(installed.version)}`
			);
		}
	}
	const installed = join(consumer, 'node_modules/@c15t/react-native');
	const sdkSource = join(consumer, 'sdk-source');
	cpSync(join(PACKAGE, 'src'), sdkSource, {
		filter: (path) => !path.includes('/__tests__'),
		recursive: true,
	});
	writeFileSync(join(consumer, 'consumer.tsx'), consumerSource);
	writeFileSync(
		join(consumer, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					jsx: 'react-jsx',
					lib: ['ES2022'],
					module: 'ESNext',
					moduleResolution: 'bundler',
					noEmit: true,
					noUncheckedIndexedAccess: true,
					skipLibCheck: true,
					strict: true,
					target: 'ES2022',
					types: ['node', 'react'],
				},
				files: [
					'consumer.tsx',
					'sdk-source/index.ts',
					'sdk-source/expo-plugin/index.ts',
				],
			},
			null,
			2
		)
	);
	run(join(PACKAGE, 'node_modules/.bin/tsc'), ['-p', consumer]);
	for (const platform of ['android', 'ios']) {
		const generated = join(output, `codegen-${platform}`);
		run('node', [
			join(installed, 'android/codegen/generate-spec.mjs'),
			'--platform',
			platform,
			'--output',
			generated,
			'--project-root',
			installed,
		]);
		const spec =
			platform === 'android'
				? 'java/com/c15t/reactnative/NativeC15tSpec.java'
				: 'C15tSpec/C15tSpec.h';
		if (
			!readFileSync(join(generated, spec), 'utf8').includes('NativeC15tSpec')
		) {
			throw new Error(
				`${cell.id}: ${platform} Codegen omitted NativeC15tSpec.`
			);
		}
	}
	if (cell.expo) {
		writeFileSync(
			join(consumer, 'app.json'),
			JSON.stringify(
				{
					expo: {
						android: { package: 'com.c15t.compatibility' },
						ios: { bundleIdentifier: 'com.c15t.compatibility' },
						name: 'C15tCompatibility',
						platforms: ['ios', 'android'],
						plugins: [
							[
								'@c15t/react-native/expo-plugin',
								{
									consentCategories: ['necessary', 'measurement'],
									mode: 'offline',
								},
							],
						],
						slug: 'c15t-compatibility',
					},
				},
				null,
				2
			)
		);
		run('bun', [
			'x',
			'--no-install',
			'expo',
			'prebuild',
			'--platform',
			'all',
			'--clean',
			'--no-install',
			'--template',
			`expo-template-bare-minimum@${String(cell.expoTemplate)}`,
		]);
		verifyIosDeploymentTargets(consumer, cell.id);
		const application = readFileSync(
			join(consumer, 'android/app/src/main/AndroidManifest.xml'),
			'utf8'
		);
		if (
			!application.includes('com.c15t.reactnative.C15tReactNativeInitializer')
		) {
			throw new Error(`${cell.id}: Expo omitted native startup configuration.`);
		}
	}
	if (values.android) {
		const version = readFileSync(
			join(ROOT, 'native/core-android/gradle.properties'),
			'utf8'
		).match(/^c15t.native.version=(?<version>.+)$/mu)?.groups?.version;
		if (!version) {
			throw new Error('Missing staged native version.');
		}
		run('python3', [
			join(ROOT, 'native/core-android/consumer-smoke/verify.py'),
			'--staging-repository',
			join(ROOT, 'native/core-android/build/maven-staging'),
			'--version',
			version,
			'--rn-package',
			archive,
			'--react-native-version',
			cell.reactNative,
			'--react-version',
			cell.react,
			'--compile-sdk',
			String(cell.compileSdk),
			'--output',
			join(output, 'android'),
		]);
	}
	writeFileSync(
		join(output, 'result.json'),
		JSON.stringify(
			{
				cell,
				checks: [
					'packed consumer types',
					'SDK source types',
					'Android Codegen',
					'iOS Codegen',
					...(cell.expo ? ['Expo prebuild'] : []),
					...(values.android ? ['Android R8 consumer'] : []),
				],
				notVerified: [
					'device journeys',
					'screen readers',
					'performance',
					'iOS app compilation',
					'certification',
				],
			},
			null,
			2
		)
	);
	console.log(`${cell.id}: passed. Evidence: ${output}`);
};

if (import.meta.main) {
	main();
}
