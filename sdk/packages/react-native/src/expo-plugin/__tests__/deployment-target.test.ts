import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IOSConfig } from '@expo/config-plugins';
import type { XcodeProject } from '@expo/config-plugins';
import { afterEach, describe, expect, it } from 'vitest';

import { applyParamsOnConfig } from '../with-c15t';
import {
	FIXTURE_DIR,
	PREBUILD_ARGV,
	applyToFixture,
	fixtureConfig,
	runMod,
} from './helpers';

const PROPS = { backendURL: 'https://consent.example.com' };
const scratchRoots: string[] = [];

const projectFixture = (): XcodeProject => {
	const root = mkdtempSync(join(tmpdir(), 'c15t-deployment-target-'));
	scratchRoots.push(root);
	const directory = join(root, 'ios', 'C15tBare.xcodeproj');
	mkdirSync(directory, { recursive: true });
	copyFileSync(
		join(FIXTURE_DIR, 'project.pbxproj'),
		join(directory, 'project.pbxproj')
	);
	return IOSConfig.XcodeUtils.getPbxproj(root);
};

const applicationConfigurations = (project: XcodeProject) => {
	const [, target] = IOSConfig.Target.findFirstNativeTarget(project);
	return IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
		project,
		target.buildConfigurationList
	);
};

afterEach(() => {
	for (const root of scratchRoots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe('Expo iOS deployment target', () => {
	it('raises the SDK 55 Podfile platform without dropping other properties', async () => {
		const result = await runMod(
			applyToFixture(PROPS),
			'ios',
			'podfileProperties',
			{ 'expo.jsEngine': 'hermes', 'ios.deploymentTarget': '15.1' }
		);
		expect(result.modResults).toStrictEqual({
			'expo.jsEngine': 'hermes',
			'ios.deploymentTarget': '16.4',
		});
	});

	it('sets the Podfile platform when the template leaves it implicit', async () => {
		const result = await runMod(
			applyToFixture(PROPS),
			'ios',
			'podfileProperties',
			{}
		);
		expect(result.modResults).toStrictEqual({
			'ios.deploymentTarget': '16.4',
		});
	});

	it.each(['16.4', '16.10', '18.0', '26.0'])(
		'preserves the host Podfile platform %s',
		async (target) => {
			const result = await runMod(
				applyToFixture(PROPS),
				'ios',
				'podfileProperties',
				{ 'ios.deploymentTarget': target }
			);
			expect(result.modResults['ios.deploymentTarget']).toBe(target);
		}
	);

	it('raises both application configurations from the old template floor', async () => {
		const project = projectFixture();
		expect(
			applicationConfigurations(project).map(
				([, configuration]) =>
					configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET
			)
		).toStrictEqual(['15.1', '15.1']);
		await runMod(applyToFixture(PROPS), 'ios', 'xcodeproj', project);
		expect(
			applicationConfigurations(project).map(
				([, configuration]) =>
					configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET
			)
		).toStrictEqual(['16.4', '16.4']);
	});

	it('preserves higher per-configuration application targets', async () => {
		const project = projectFixture();
		const targets = ['18.0', '26.0'];
		applicationConfigurations(project).forEach(([, configuration], index) => {
			configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = targets[index];
		});
		await runMod(applyToFixture(PROPS), 'ios', 'xcodeproj', project);
		expect(
			applicationConfigurations(project).map(
				([, configuration]) =>
					configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET
			)
		).toStrictEqual(targets);
	});

	it.each(['16.4.1', '18.0'])(
		'honors app-config target %s in both CocoaPods and Xcode',
		async (target) => {
			const config = fixtureConfig();
			config.ios = { ...config.ios, deploymentTarget: target };
			const applied = applyParamsOnConfig(config, PROPS, {
				argv: PREBUILD_ARGV,
				projectRoot: FIXTURE_DIR,
			});
			const podfile = await runMod(applied, 'ios', 'podfileProperties', {
				'ios.deploymentTarget': '16.4',
			});
			expect(podfile.modResults['ios.deploymentTarget']).toBe(target);
			const project = projectFixture();
			await runMod(applied, 'ios', 'xcodeproj', project);
			expect(
				applicationConfigurations(project).map(
					([, configuration]) =>
						configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET
				)
			).toStrictEqual([target, target]);
		}
	);
});
