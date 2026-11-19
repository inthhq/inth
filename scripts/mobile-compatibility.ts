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
import { InthProvider, useConsent, useSaveConsents } from '@inth/react-native';
import withInth, { type InthPluginProps } from '@inth/react-native/expo-plugin';
import { connectPostHog, connectFirebaseAnalytics } from '@inth/react-native/integrations';

function PrivacyStatus() {
  const allowed = useConsent('measurement');
  const saveConsents = useSaveConsents();
  return <View><Text onPress={() => { void saveConsents('none'); }}>{allowed ? 'Allowed' : 'Denied'}</Text></View>;
}
export const App = () => <InthProvider privacyPolicyUrl="https://example.com/privacy"><PrivacyStatus /></InthProvider>;
export const plugin: typeof withInth = withInth;
export const configuration: InthPluginProps = {
	projectUrl: 'https://your-project.inth.app',
	policy: {
		rules: [
			{ id: 'fallback', match: { fallback: true }, model: 'opt-in', prompt: 'choice' },
		],
	},
};
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
			`${id}: generated iOS target is below Inth's 16.4 minimum.`
		);
	}
	const appTargets: unknown = JSON.parse(
		execFileSync(
			'node',
			[
				'-e',
				`
		const { IOSConfig } = require('expo/config-plugins');
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
		values.output ?? mkdtempSync(join(tmpdir(), 'inth-mobile-compat-'))
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
	const archive = join(output, 'inth-react-native.tgz');
	// pnpm, not `bun pm pack`: the workspace is a pnpm install, so only pnpm
	// can resolve the package's `workspace:` dependency versions.
	run(
		'pnpm',
		['--config.ignore-scripts=true', 'pack', '--out', archive],
		PACKAGE
	);
	writeFileSync(
		join(consumer, 'bunfig.toml'),
		'[install]\nminimumReleaseAge = 259200\n'
	);
	writeFileSync(
		join(consumer, 'package.json'),
		JSON.stringify(
			{
				dependencies: {
					...hostVersions(cell),
					'@inth/react-native': `file:${archive}`,
					'@types/node': '25.5.0',
					'@types/react': cell.react.startsWith('19.3.') ? '19.3.0' : '19.2.17',
				},
				name: 'inth-mobile-compatibility',
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
	const installed = join(consumer, 'node_modules/@inth/react-native');
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
				// The config plugin types come from the app's `expo`, which a bare
				// React Native host does not install.
				files: [
					'consumer.tsx',
					'sdk-source/index.ts',
					...(cell.expo ? ['sdk-source/expo-plugin/index.ts'] : []),
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
				? 'java/com/inth/reactnative/NativeInthSpec.java'
				: 'InthSpec/InthSpec.h';
		if (
			!readFileSync(join(generated, spec), 'utf8').includes('NativeInthSpec')
		) {
			throw new Error(
				`${cell.id}: ${platform} Codegen omitted NativeInthSpec.`
			);
		}
	}
	if (cell.expo) {
		writeFileSync(
			join(consumer, 'app.json'),
			JSON.stringify(
				{
					expo: {
						android: { package: 'com.inth.compatibility' },
						ios: { bundleIdentifier: 'com.inth.compatibility' },
						name: 'InthCompatibility',
						platforms: ['ios', 'android'],
						plugins: [
							[
								'@inth/react-native',
								{
									consentCategories: ['necessary', 'measurement'],
									// The policy is in code, so the build needs no network.
									policy: {
										rules: [
											{
												id: 'fallback',
												match: { fallback: true },
												model: 'opt-in',
												prompt: 'choice',
											},
										],
									},
									projectUrl: 'https://your-project.inth.app',
								},
							],
						],
						slug: 'inth-compatibility',
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
			!application.includes('com.inth.reactnative.InthReactNativeInitializer')
		) {
			throw new Error(`${cell.id}: Expo omitted native startup configuration.`);
		}
	}
	if (values.android) {
		const version = readFileSync(
			join(ROOT, 'packages/android/gradle.properties'),
			'utf8'
		).match(/^inth.native.version=(?<version>.+)$/mu)?.groups?.version;
		if (!version) {
			throw new Error('Missing staged native version.');
		}
		run('python3', [
			join(ROOT, 'packages/android/consumer-smoke/verify.py'),
			'--staging-repository',
			join(ROOT, 'packages/android/build/maven-staging'),
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
