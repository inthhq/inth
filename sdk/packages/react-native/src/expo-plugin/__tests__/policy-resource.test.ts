import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AndroidConfig } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

import { applyAndroidManifest } from '../android';
import { ANDROID_META, IOS_PLIST_KEY } from '../constants';
import { applyInfoPlist } from '../ios';
import { resolveParams } from '../params';
import { embedPolicyResource, POLICY_RESOURCE_NAME } from '../policy-resource';
import { FIXTURE_DIR } from './helpers';

const endpoint = 'https://demo.example.test';
describe('Expo native policy embedding', () => {
	it('copies exact bytes to assets and refuses wrong project or expired authority', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-policy-'));
		try {
			const payload = JSON.stringify({
				disclosures: { atp: { fetchedAt: 123 } },
				endpoint,
				expiresAt: Date.now() + 60000,
				issuedAt: Date.now() - 1000,
				schemaVersion: 1,
			});
			const source = JSON.stringify({
				payload,
				sha256: createHash('sha256').update(payload).digest('hex'),
			});
			await writeFile(join(root, 'input.json'), source);
			const output = join(root, 'android/app/src/main/assets/c15t-policy.json');
			await embedPolicyResource(root, 'input.json', endpoint, output);
			expect(await readFile(output, 'utf8')).toBe(source);
			await expect(
				embedPolicyResource(
					root,
					'input.json',
					'https://wrong.example.test',
					output
				)
			).rejects.toThrow('different backendURL');
			await Promise.all(
				[
					{ expiresAt: Date.now() - 1 },
					{ issuedAt: Date.now() + 60000 },
					{ schemaVersion: 2 },
				].map(async (patch, index) => {
					const invalidPayload = JSON.stringify({
						...JSON.parse(payload),
						...patch,
					});
					const name = `invalid-${index}.json`;
					await writeFile(
						join(root, name),
						JSON.stringify({
							payload: invalidPayload,
							sha256: createHash('sha256').update(invalidPayload).digest('hex'),
						})
					);
					await expect(
						embedPolicyResource(root, name, endpoint, output)
					).rejects.toThrow('invalid, expired');
				})
			);
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
		backendURL: endpoint,
		policyResource: './input.json',
	});
	const disabled = resolveParams({ backendURL: endpoint });
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
	const params = resolveParams({ backendURL: endpoint });
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
