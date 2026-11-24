/**
 * Init output round-trips backend vendor declarations through the kernel
 * config.
 */
import { writePolicyResolutionWire } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vite-plus/test';

import {
	kernelConfigToInitResponse,
	mapInitOutputToInitResponse,
	mergeInitResponseIntoKernelConfig,
} from '../init-output';

describe('init output', () => {
	const vendors = [
		{
			category: 'marketing' as const,
			id: 'meta-pixel',
			name: 'Meta Pixel',
			privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
		},
	];
	const output = {
		branding: 'inth' as const,
		location: { countryCode: 'DE', regionCode: null },
		policyResolution: {
			policy: null,
			reason: 'invalid-configuration' as const,
			status: 'failed' as const,
			version: 1 as const,
		},
		translations: { language: 'en', translations: {} as never },
		vendorListVersion: '2026-09',
		vendors,
	};

	test('forwards vendors and the list version into the init response', () => {
		const mapped = mapInitOutputToInitResponse(output, {});
		expect(mapped.vendors).toEqual(vendors);
		expect(mapped.vendorListVersion).toBe('2026-09');
	});

	test('folds into the kernel config and survives a non-matched resolution', () => {
		const config = mergeInitResponseIntoKernelConfig(
			{},
			mapInitOutputToInitResponse(output, {})
		);
		expect(config.initialVendors?.listVersion).toBe('2026-09');
		expect(config.initialVendors?.declared[0]).toMatchObject({
			id: 'meta-pixel',
			presentable: true,
			source: 'manifest',
		});
	});

	test('an empty backend list with no version clears previous manifest vendors', () => {
		const withVendors = mergeInitResponseIntoKernelConfig(
			{},
			mapInitOutputToInitResponse(output, {})
		);
		const cleared = mergeInitResponseIntoKernelConfig(withVendors, {
			policyResolution: writePolicyResolutionWire({
				policy: null,
				reason: 'invalid-configuration',
				status: 'failed',
			}),
			vendors: [],
		});
		// The old label described the old list. A replacement without a
		// version and without entries leaves nothing to keep.
		expect(cleared.initialVendors).toBeUndefined();
		// A version-only response relabels the current declarations.
		const relabelled = mergeInitResponseIntoKernelConfig(withVendors, {
			policyResolution: undefined,
			vendorListVersion: '2026-10',
		});
		expect(relabelled.initialVendors?.listVersion).toBe('2026-10');
		expect(relabelled.initialVendors?.declared).toEqual(
			withVendors.initialVendors?.declared
		);
	});

	test('lifts manifest vendors back into an init response', () => {
		const config = mergeInitResponseIntoKernelConfig(
			{},
			mapInitOutputToInitResponse(output, {})
		);
		const response = kernelConfigToInitResponse(config);
		expect(response?.vendors).toEqual(vendors);
		expect(response?.vendorListVersion).toBe('2026-09');
	});
});
