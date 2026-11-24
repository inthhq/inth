/**
 * The policy wire at the transport boundary, independent of any kernel:
 *
 * - A producer's `policyResolution` is passed through raw; a response that
 *   lacks it is a failed payload, never a preserved or permissive policy.
 * - `Sec-GPC` is reported as a detected privacy signal, exactly, and never
 *   folded into the developer override.
 * - Offline resolution emits every outcome explicitly.
 */
import type { InitOutput, PolicyRule } from '@inth/sdk-schema/types';
import {
	readPolicyResolutionWire,
	SAFE_FALLBACK_POLICY_FINGERPRINTS,
} from '@inth/sdk-schema/types';
import { assert, describe, expect, test } from 'vite-plus/test';

import {
	createOfflineTransport,
	mapInitOutputToInitResponse,
	mapPrivacySignals,
	resolveInitPolicyWire,
} from '../transports';

// Deliberately missing the negotiated field: tests exercise untrusted responses.
const BASE_INIT = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	translations: { language: 'de', translations: {} as never },
} as unknown as InitOutput;

const MATCHED_WIRE = {
	fingerprints: {
		choice: 'c'.repeat(64),
		notice: 'n'.repeat(64),
		policy: 'p'.repeat(64),
	},
	matchedBy: 'country',
	policy: {
		actions: {
			allowed: ['accept', 'customize', 'reject'],
			equivalent: [['accept', 'reject']],
			required: ['accept', 'reject'],
		},
		copyRevision: null,
		id: 'eu',
		model: 'opt-in',
		preselectedCategories: [],
		privacySignals: { gpc: { denyCategories: [] } },
		prompt: 'choice',
		proof: { storeIp: false, storeLanguage: false, storeUserAgent: false },
		rights: ['disclosure', 'preferences'],
		scope: ['experience', 'functionality', 'marketing', 'measurement'],
		scopeMode: 'strict',
		validity: { choiceMs: 31_536_000_000, noticeMs: 31_536_000_000 },
	},
	policyId: 'eu',
	status: 'matched',
	version: 1,
} as const;

const LEGACY_POLICY = {
	consent: { categories: ['necessary', 'marketing'], gpc: true },
	id: 'legacy-eu',
	model: 'opt-in',
	ui: { mode: 'banner' },
} as const;

describe('resolveInitPolicyWire', () => {
	test('passes a negotiated producer wire through untouched', () => {
		const wire = resolveInitPolicyWire(
			{ ...BASE_INIT, policyResolution: MATCHED_WIRE as never },
			{ producerContract: 1 }
		);
		expect(wire).toBe(MATCHED_WIRE);
	});

	test('rejects a producer that predates the policy contract', () => {
		const payload = { ...BASE_INIT, policy: LEGACY_POLICY };
		expect(readPolicyResolutionWire(resolveInitPolicyWire(payload))).toEqual({
			policy: null,
			reason: 'unsupported-contract',
			status: 'failed',
		});
	});

	test('an absent legacy policy and the old no-banner sentinel cannot suppress a required prompt', () => {
		for (const payload of [
			BASE_INIT,
			{
				...BASE_INIT,
				policy: { id: 'no_banner', model: 'none', ui: { mode: 'none' } },
			},
		]) {
			expect(readPolicyResolutionWire(resolveInitPolicyWire(payload))).toEqual({
				policy: null,
				reason: 'unsupported-contract',
				status: 'failed',
			});
		}
	});

	test('fails a negotiated producer whose response lacks the field', () => {
		expect(
			readPolicyResolutionWire(
				resolveInitPolicyWire(
					{ ...BASE_INIT, policy: LEGACY_POLICY } as InitOutput,
					{
						producerContract: 1,
					}
				)
			)
		).toEqual({ policy: null, reason: 'invalid-payload', status: 'failed' });
		// A declared contract this client does not speak, or cannot parse, is
		// refused before the body is considered at all.
		for (const producerContract of [2, null]) {
			expect(
				readPolicyResolutionWire(
					resolveInitPolicyWire(
						{ ...BASE_INIT, policy: LEGACY_POLICY } as InitOutput,
						{
							producerContract,
						}
					)
				)
			).toEqual({
				policy: null,
				reason: 'unsupported-contract',
				status: 'failed',
			});
		}
	});

	test('keeps an unsupported producer wire failed, never lifted', () => {
		const wire = resolveInitPolicyWire(
			{
				...BASE_INIT,
				policy: LEGACY_POLICY,
				policyResolution: {
					policy: null,
					reason: 'unsupported-contract',
					status: 'failed',
					version: 1,
				},
			} as InitOutput,
			{ producerContract: 1 }
		);
		expect(readPolicyResolutionWire(wire)).toEqual({
			policy: null,
			reason: 'unsupported-contract',
			status: 'failed',
		});
	});
});

describe('privacy signals', () => {
	test('reports Sec-GPC exactly and never as an override', () => {
		expect(mapPrivacySignals({ 'sec-gpc': '1' })).toEqual({ gpc: true });
		expect(mapPrivacySignals({ 'sec-gpc': '0' })).toEqual({ gpc: false });
		expect(mapPrivacySignals({ 'sec-gpc': 'true' })).toBeUndefined();
		expect(mapPrivacySignals({})).toBeUndefined();

		const mapped = mapInitOutputToInitResponse(BASE_INIT, { 'sec-gpc': '1' });
		expect(mapped.resolvedPrivacySignals).toEqual({ gpc: true });
		expect(mapped.resolvedOverrides).not.toHaveProperty('gpc');
	});
});

describe('offline transport resolution', () => {
	const rules: PolicyRule[] = [
		{
			id: 'eu',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
		},
		{
			id: 'ca',
			match: { regions: [{ country: 'US', region: 'CA' }] },
			model: 'opt-out',
			privacySignals: { gpc: { denyCategories: ['marketing'] } },
			prompt: 'notice',
		},
	];

	test('resolves v3 rules once per init with precomputed fingerprints', async () => {
		const transport = createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: rules,
		});
		const response = await transport.init?.({
			overrides: { country: 'US', region: 'CA' },
			user: null,
		});
		const resolution = readPolicyResolutionWire(response?.policyResolution);
		expect(resolution).toMatchObject({ policyId: 'ca', status: 'matched' });
		assert(resolution.status === 'matched');
		expect(resolution.policy.prompt).toBe('notice');
		expect(resolution.fingerprints.choice).not.toBe(
			SAFE_FALLBACK_POLICY_FINGERPRINTS.choice
		);
		// The legacy field is the strictest v2 shape for the old kernel: a
		// notice-with-GPC rule cannot be expressed, so it is the opt-in banner.
		expect(response).not.toHaveProperty('policy');
	});

	test('emits the recommended default, no-match and failed explicitly', async () => {
		const read = async (
			transport: ReturnType<typeof createOfflineTransport>,
			country?: string
		) =>
			readPolicyResolutionWire(
				(await transport.init?.({ overrides: { country }, user: null }))
					?.policyResolution
			);

		expect(
			await read(
				createOfflineTransport({
					acknowledgeNoRecords: true,
					policyRules: undefined,
				}),
				'DE'
			)
		).toMatchObject({ policyId: 'europe_opt_in', status: 'matched' });
		expect(
			await read(
				createOfflineTransport({ acknowledgeNoRecords: true, policyRules: [] }),
				'DE'
			)
		).toEqual({
			policy: null,
			status: 'no-match',
		});
		expect(
			await read(
				createOfflineTransport({
					acknowledgeNoRecords: true,
					policyRules: rules,
				}),
				'BR'
			)
		).toEqual({ policy: null, status: 'no-match' });
		expect(
			await read(
				createOfflineTransport({
					acknowledgeNoRecords: true,
					policyRules: rules,
				})
			)
		).toEqual({
			policy: null,
			reason: 'insufficient-inputs',
			status: 'failed',
		});
		expect(
			await read(
				createOfflineTransport({
					acknowledgeNoRecords: true,
					policyRules: [
						{
							id: 'bad',
							match: { isDefault: true },
							model: 'opt-in',
							prompt: 'none',
						},
					],
				}),
				'DE'
			)
		).toEqual({
			policy: null,
			reason: 'invalid-configuration',
			status: 'failed',
		});
	});

	test('offline rules retain the explicit GPC mapping', async () => {
		const transport = createOfflineTransport({
			acknowledgeNoRecords: true,
			policyRules: [
				{
					id: 'local',
					match: { isDefault: true },
					model: 'opt-in',
					privacySignals: { gpc: { denyCategories: ['marketing'] } },
					prompt: 'choice',
				},
			],
		});
		const response = await transport.init({ overrides: {}, user: null });
		expect(readPolicyResolutionWire(response.policyResolution)).toMatchObject({
			policy: { privacySignals: { gpc: { denyCategories: ['marketing'] } } },
			status: 'matched',
		});
		expect(response).not.toHaveProperty('policy');
	});

	test('removed policy packs cannot override configured rules', async () => {
		const options = {
			acknowledgeNoRecords: true,
			policyPacks: [],
			policyRules: rules,
		};
		const response = await createOfflineTransport(options).init({
			overrides: { country: 'DE' },
			user: null,
		});
		expect(readPolicyResolutionWire(response.policyResolution)).toMatchObject({
			policyId: 'eu',
			status: 'matched',
		});
	});
});
