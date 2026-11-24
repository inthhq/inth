import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { AndroidConfig } from 'expo/config-plugins';
import { describe, expect, it, vi } from 'vite-plus/test';

import { applyAndroidManifest } from '../android';
import { ANDROID_META, IOS_PLIST_KEY } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import {
	embedPolicyResource,
	policyResourceProblem,
	POLICY_RESOURCE_NAME,
} from '../policy-resource';
import { FIXTURE_DIR } from './helpers';

const endpoint = 'https://demo.inth.app';
describe('Expo native policy embedding', () => {
	it('copies exact bytes to assets and refuses wrong project or expired authority', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-policy-'));
		try {
			const payload = JSON.stringify({
				defaultLanguage: 'en',
				disclosures: { atp: { fetchedAt: 123 } },
				endpoint,
				expiresAt: Date.now() + 60000,
				issuedAt: Date.now() - 1000,
				manifestRevision: 'r1',
				policyPacks: [{}],
				schemaVersion: 1,
			});
			const source = JSON.stringify({
				payload,
				sha256: createHash('sha256').update(payload).digest('hex'),
			});
			await writeFile(join(root, 'input.json'), source);
			const output = join(root, 'android/app/src/main/assets/inth-policy.json');
			await embedPolicyResource(root, 'input.json', endpoint, output);
			expect(await readFile(output, 'utf8')).toBe(source);
			await expect(
				embedPolicyResource(
					root,
					'input.json',
					'https://wrong.example.test',
					output
				)
			).rejects.toThrow('different projectUrl');
			await Promise.all(
				[{ issuedAt: Date.now() + 60000 }, { schemaVersion: 2 }].map(
					async (patch, index) => {
						const invalidPayload = JSON.stringify({
							...JSON.parse(payload),
							...patch,
						});
						const name = `invalid-${index}.json`;
						await writeFile(
							join(root, name),
							JSON.stringify({
								payload: invalidPayload,
								sha256: createHash('sha256')
									.update(invalidPayload)
									.digest('hex'),
							})
						);
						await expect(
							embedPolicyResource(root, name, endpoint, output)
						).rejects.toThrow('is invalid');
					}
				)
			);
			const expiredPayload = JSON.stringify({
				...JSON.parse(payload),
				expiresAt: Date.now() - 1,
			});
			await writeFile(
				join(root, 'expired.json'),
				JSON.stringify({
					payload: expiredPayload,
					sha256: createHash('sha256').update(expiredPayload).digest('hex'),
				})
			);
			// An expired manifest still prompts on the device, so prebuild warns and embeds it.
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined);
			await embedPolicyResource(root, 'expired.json', endpoint, output);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('policyStale'));
			warn.mockRestore();
			await writeFile(
				join(root, 'input.json'),
				source.replace('sha256', 'corrupt')
			);
			await expect(
				embedPolicyResource(root, 'input.json', endpoint, output)
			).rejects.toThrow();
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

it('removing policyResource disables the old fallback on incremental prebuild', async () => {
	const enabled = resolveParams({
		policyResource: './input.json',
		projectUrl: endpoint,
	});
	const disabled = resolveParams({ projectUrl: endpoint });
	const firstPlist = applyInfoPlist(enabled, {
		CFBundleDisplayName: 'Privacy demo',
	});
	expect(firstPlist[IOS_PLIST_KEY.policyResource]).toBe(POLICY_RESOURCE_NAME);
	const nextPlist = applyInfoPlist(disabled, firstPlist);
	expect(nextPlist[IOS_PLIST_KEY.policyResource]).toBeUndefined();
	expect(nextPlist.CFBundleDisplayName).toBe('Privacy demo');
	expect(firstPlist[IOS_PLIST_KEY.policyResource]).toBe(POLICY_RESOURCE_NAME);

	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	applyAndroidManifest(enabled, manifest);
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	expect(
		application['meta-data']?.some(
			(item) => item.$['android:name'] === ANDROID_META.policyResource
		)
	).toBe(true);
	applyAndroidManifest(disabled, manifest);
	expect(
		application['meta-data']?.some(
			(item) => item.$['android:name'] === ANDROID_META.policyResource
		)
	).toBe(false);
	expect(
		application['meta-data']?.find(
			(item) => item.$['android:name'] === ANDROID_META.backendUrl
		)?.$['android:value']
	).toBe(endpoint);
});

it('preserves host-owned policy resources when no plugin resource is configured', async () => {
	const params = resolveParams({ projectUrl: endpoint });
	const customResource = 'app-authored-policy.json';
	const plist = applyInfoPlist(params, {
		[IOS_PLIST_KEY.policyResource]: customResource,
	});
	expect(plist[IOS_PLIST_KEY.policyResource]).toBe(customResource);
	const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
		join(FIXTURE_DIR, 'AndroidManifest.xml')
	);
	const application =
		AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
	AndroidConfig.Manifest.addMetaDataItemToMainApplication(
		application,
		ANDROID_META.policyResource,
		customResource
	);
	AndroidConfig.Manifest.addMetaDataItemToMainApplication(
		application,
		'com.example.RESOURCE',
		'other.json'
	);
	applyAndroidManifest(params, manifest);
	expect(
		application['meta-data']?.find(
			(item) => item.$['android:name'] === ANDROID_META.policyResource
		)?.$['android:value']
	).toBe(customResource);
	expect(
		application['meta-data']?.find(
			(item) => item.$['android:name'] === 'com.example.RESOURCE'
		)?.$['android:value']
	).toBe('other.json');
});

describe('prebuild refuses the resources devices discard', () => {
	const fixture = JSON.parse(
		readFileSync(
			resolve(
				import.meta.dirname,
				'../../../../native-protocol/bundled-policy/invalid-resources.json'
			),
			'utf8'
		)
	) as {
		cases: {
			name: string;
			endpoint: string;
			now: number;
			resource: unknown;
			structural: boolean;
		}[];
	};

	it('finds a problem in every structural case the native cores refuse', () => {
		const missed = fixture.cases
			.filter((entry) => entry.structural)
			.filter(
				(entry) =>
					policyResourceProblem(
						JSON.stringify(entry.resource),
						entry.endpoint,
						entry.now
					) === null
			);
		expect(missed.map((entry) => entry.name)).toEqual([]);
	});

	it('carries the same vendor-list entry check as the CLI', () => {
		const copy = (path: string) =>
			readFileSync(resolve(import.meta.dirname, path), 'utf8');
		expect(copy('../gvl-fields.ts')).toBe(
			copy('../../../../cli/vendor/c15t-mobile/src/mobile/gvl-fields.ts')
		);
	});

	it('accepts the shared resources both native cores load', () => {
		for (const name of ['parity', 'iab']) {
			const source = JSON.parse(
				readFileSync(
					resolve(
						import.meta.dirname,
						`../../../../native-protocol/bundled-policy/${name}.json`
					),
					'utf8'
				)
			);
			expect(
				policyResourceProblem(
					JSON.stringify(source.resource),
					source.endpoint,
					source.now
				),
				name
			).toBeNull();
		}
	});
});
