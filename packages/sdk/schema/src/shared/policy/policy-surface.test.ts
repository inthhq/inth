import * as v from 'valibot';
import { assert, describe, expect, test } from 'vite-plus/test';

import {
	consentInitResponseSchema,
	consentManifestResponseSchema,
} from '../../api/v1/generated/schemas';
import { v1ConsentInitOutputSchema } from '../../api/v1/v1-consent.model';
import {
	buildConsentManifestFromConfig,
	createConsentManifestPolicyPack,
	resolveInitFromManifest,
	resolvePolicyResolutionFromManifest,
} from '../consent-manifest';
import { parseConsentManifest } from '../parse-consent-manifest';
import {
	readPolicyResolutionWire,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from './policy-resolution.model';
import {
	createPolicyRuleFingerprints,
	createPresentationFingerprint,
	policySurfacePresentationInput,
} from './policy-rule-fingerprint.model';
import { collectResolvedPolicyRuleIssues } from './policy-rule-invariants';
import {
	inspectPolicyRules,
	normalizePolicyRule,
	validatePolicyRules,
} from './policy-rule.model';
import type { PolicyRule } from './policy-rule.model';
import {
	policyResolutionWireSchema,
	resolvedPolicyRuleSchema,
} from './policy-wire-schema.model';

const optIn: PolicyRule = {
	id: 'eu',
	match: { isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
};

const optOut: PolicyRule = {
	id: 'us',
	match: { isDefault: true },
	model: 'opt-out',
	prompt: 'none',
};

const errorsOf = (rule: unknown) => inspectPolicyRules([rule]).errors;

/** A matched wire for one rule, after a JSON round trip. */
const matchedWire = (rule: PolicyRule) =>
	JSON.parse(
		JSON.stringify(
			writePolicyResolutionWire(
				resolvePolicyRules({
					countryCode: 'DE',
					regionCode: null,
					rules: [rule],
				})
			)
		)
	) as Record<string, unknown> & {
		fingerprints: Record<string, unknown>;
		policy: Record<string, unknown>;
	};

describe('surface validation', () => {
	test('accepts every container, edge style and blocking constraint', () => {
		for (const container of [
			{ type: 'card' },
			{ position: 'end', type: 'card' },
			{ position: 'center', type: 'card' },
			{ edge: 'top', type: 'banner' },
			{ side: 'start', type: 'drawer' },
		] as const) {
			for (const edgeStyle of ['inset', 'flush'] as const) {
				for (const blocking of ['forbidden', 'allowed', 'required'] as const) {
					expect(
						errorsOf({ ...optIn, surface: { blocking, container, edgeStyle } })
					).toEqual([]);
				}
			}
		}
		expect(errorsOf({ ...optIn, surface: {} })).toEqual([]);
	});

	test.each([
		[
			'a non-object surface',
			'drawer',
			"Policy 'eu' surface must be an object.",
		],
		[
			'an unknown surface field',
			{ blocks: true },
			'Policy \'eu\' surface has unknown field "blocks".',
		],
		[
			'a non-object container',
			{ container: 'card' },
			"Policy 'eu' surface.container must be an object.",
		],
		[
			'an unknown container type',
			{ container: { type: 'modal' } },
			"Policy 'eu' surface.container.type must be one of card, banner, drawer.",
		],
		[
			'a position on a banner',
			{ container: { position: 'center', type: 'banner' } },
			'Policy \'eu\' surface.container has unknown field "position".',
		],
		[
			'an invalid card position',
			{ container: { position: 'top-left', type: 'card' } },
			"Policy 'eu' surface.container.position must be one of start, end, center.",
		],
		[
			'a physical card corner',
			{ container: { position: 'bottom-left', type: 'card' } },
			"Policy 'eu' surface.container.position must be one of start, end, center.",
		],
		[
			'an invalid drawer side',
			{ container: { side: 'middle', type: 'drawer' } },
			"Policy 'eu' surface.container.side must be one of bottom, top, start, end.",
		],
		[
			'a physical drawer side',
			{ container: { side: 'right', type: 'drawer' } },
			"Policy 'eu' surface.container.side must be one of bottom, top, start, end.",
		],
		[
			'an invalid edge style',
			{ edgeStyle: 'rounded' },
			"Policy 'eu' surface.edgeStyle must be one of inset, flush.",
		],
		[
			'an invalid blocking constraint',
			{ blocking: true },
			"Policy 'eu' surface.blocking must be one of forbidden, allowed, required.",
		],
	])('rejects %s', (_label, surface, error) => {
		expect(errorsOf({ ...optIn, surface })).toEqual([error]);
		expect(() => normalizePolicyRule({ ...optIn, surface } as never)).toThrow(
			error
		);
	});

	test('[BNR-13] required blocking needs a choice prompt outside the opt-out model', () => {
		for (const rule of [
			optOut,
			{ ...optOut, prompt: 'notice' },
			{ ...optOut, prompt: 'choice' },
			{ ...optIn, id: 'none', model: 'none', prompt: 'none' },
		] as PolicyRule[]) {
			const [error] = errorsOf({ ...rule, surface: { blocking: 'required' } });
			expect(error).toContain(
				'surface.blocking "required" needs prompt "choice"'
			);
		}
		expect(errorsOf({ ...optIn, surface: { blocking: 'required' } })).toEqual(
			[]
		);
		expect(
			errorsOf({ ...optIn, model: 'iab', surface: { blocking: 'required' } })
		).toEqual([]);
	});

	test('reads own fields only', () => {
		const surface = Object.create({ blocking: 'required' }) as object;
		expect(errorsOf({ ...optOut, surface })).toEqual([
			"Policy 'us' surface must be an object.",
		]);
		const inherited = Object.assign(Object.create(null) as object, {
			container: Object.create({ type: 'card' }) as object,
		});
		expect(errorsOf({ ...optIn, surface: inherited })).toEqual([
			"Policy 'eu' surface.container must be an object.",
		]);
	});

	test('validatePolicyRules throws the first surface error', () => {
		expect(() =>
			validatePolicyRules([{ ...optIn, surface: { edgeStyle: 'x' } }])
		).toThrow("Policy 'eu' surface.edgeStyle must be one of inset, flush.");
	});
});

describe('surface normalization', () => {
	test('a rule without surface resolves without one', () => {
		expect(normalizePolicyRule(optIn)).not.toHaveProperty('surface');
	});

	test('fills the container default, keeps soft defaults, and drops the edge style beside a card', () => {
		expect(
			normalizePolicyRule({
				...optIn,
				surface: { container: { type: 'card' }, edgeStyle: 'inset' },
			}).surface
		).toEqual({ container: { position: 'start', type: 'card' } });
		expect(
			normalizePolicyRule({
				...optIn,
				surface: { container: { type: 'banner' }, edgeStyle: 'flush' },
			}).surface
		).toEqual({
			container: { edge: 'bottom', type: 'banner' },
			edgeStyle: 'flush',
		});
		expect(
			normalizePolicyRule({
				...optIn,
				surface: { container: { type: 'banner' } },
			}).surface
		).toEqual({ container: { edge: 'bottom', type: 'banner' } });
		expect(
			normalizePolicyRule({
				...optIn,
				surface: { container: { type: 'drawer' } },
			}).surface
		).toEqual({ container: { side: 'bottom', type: 'drawer' } });
	});

	test('keeps a blocking constraint that changes what the rule may do', () => {
		expect(
			normalizePolicyRule({ ...optIn, surface: { blocking: 'required' } })
				.surface
		).toEqual({ blocking: 'required' });
		expect(
			normalizePolicyRule({ ...optIn, surface: { blocking: 'forbidden' } })
				.surface
		).toEqual({ blocking: 'forbidden' });
	});

	test('[BNR-13] drops a blocking constraint the rule already implies', () => {
		expect(
			normalizePolicyRule({ ...optIn, surface: { blocking: 'allowed' } })
		).not.toHaveProperty('surface');
		for (const prompt of ['none', 'notice', 'choice'] as const) {
			expect(
				normalizePolicyRule({
					...optOut,
					prompt,
					surface: { blocking: 'forbidden' },
				})
			).not.toHaveProperty('surface');
		}
		expect(
			normalizePolicyRule({
				...optOut,
				surface: { blocking: 'forbidden', edgeStyle: 'flush' },
			}).surface
		).toEqual({ edgeStyle: 'flush' });
	});

	test('an empty surface resolves without one', () => {
		expect(normalizePolicyRule({ ...optIn, surface: {} })).not.toHaveProperty(
			'surface'
		);
	});
});

describe('surface fingerprints', () => {
	const surfaces = [
		{ blocking: 'required' },
		{ blocking: 'forbidden' },
		{ container: { position: 'center', type: 'card' } },
		{ container: { edge: 'top', type: 'banner' }, edgeStyle: 'flush' },
		{ container: { side: 'end', type: 'drawer' }, edgeStyle: 'inset' },
	] as const;

	test('adding or changing surface leaves policy, choice and notice unchanged', () => {
		const base = createPolicyRuleFingerprints(normalizePolicyRule(optIn));
		expect(base).not.toHaveProperty('presentation');
		const presentations = new Set<string>();
		for (const surface of surfaces) {
			const fingerprints = createPolicyRuleFingerprints(
				normalizePolicyRule({ ...optIn, surface })
			);
			expect(fingerprints.policy).toBe(base.policy);
			expect(fingerprints.choice).toBe(base.choice);
			expect(fingerprints.notice).toBe(base.notice);
			expect(fingerprints.presentation).toMatch(/^[0-9a-f]{64}$/u);
			presentations.add(fingerprints.presentation ?? '');
		}
		expect(presentations.size).toBe(surfaces.length);
	});

	test('the frozen legacy comparator ignores surface', () => {
		const legacy = {
			input: {},
			policyFingerprint: createPolicyRuleFingerprints(
				normalizePolicyRule(optIn)
			).policy,
		} as never;
		const without = createPolicyRuleFingerprints(
			normalizePolicyRule(optIn),
			legacy
		);
		const withSurface = createPolicyRuleFingerprints(
			normalizePolicyRule({ ...optIn, surface: { blocking: 'required' } }),
			legacy
		);
		expect(withSurface.legacyMaterial).toBe(without.legacyMaterial);
	});

	test('two spellings of one surface share a presentation fingerprint', () => {
		const short = createPolicyRuleFingerprints(
			normalizePolicyRule({
				...optIn,
				surface: { container: { type: 'card' } },
			})
		);
		const long = createPolicyRuleFingerprints(
			normalizePolicyRule({
				...optIn,
				surface: {
					blocking: 'allowed',
					container: { position: 'start', type: 'card' },
				},
			})
		);
		expect(long.presentation).toBe(short.presentation);
	});

	test('hashes the canonical surface, so a wire-decoded rule hashes like its normalized form', () => {
		const normalized = normalizePolicyRule({
			...optIn,
			surface: { container: { type: 'drawer' } },
		});
		const decoded = {
			...normalized,
			surface: { blocking: 'allowed', container: { type: 'drawer' } },
		} as const;
		expect(createPolicyRuleFingerprints(decoded).presentation).toBe(
			createPolicyRuleFingerprints(normalized).presentation
		);
	});

	test('an empty surface emits no presentation fingerprint', () => {
		const rule = { ...normalizePolicyRule(optIn), surface: {} };
		expect(createPolicyRuleFingerprints(rule)).not.toHaveProperty(
			'presentation'
		);
	});

	test('an edge style beside a card container does not change the hash', () => {
		const card = { container: { position: 'end', type: 'card' } } as const;
		const rule = normalizePolicyRule(optIn);
		expect(
			createPolicyRuleFingerprints({
				...rule,
				surface: { ...card, edgeStyle: 'flush' },
			}).presentation
		).toBe(
			createPolicyRuleFingerprints({ ...rule, surface: card }).presentation
		);
	});

	test('hashes surface in the presentation domain', () => {
		const surface = { edgeStyle: 'flush' } as const;
		expect(
			createPolicyRuleFingerprints(normalizePolicyRule({ ...optIn, surface }))
				.presentation
		).toBe(
			createPresentationFingerprint(policySurfacePresentationInput(surface))
		);
		// A host presentation that happens to look like a surface hashes apart.
		expect(createPresentationFingerprint(surface)).not.toBe(
			createPresentationFingerprint(policySurfacePresentationInput(surface))
		);
	});
});

describe('surface on the wire', () => {
	test('an old-shape resolution without surface reads unchanged', () => {
		const wire = matchedWire(optIn);
		expect(wire.policy).not.toHaveProperty('surface');
		expect(wire.fingerprints).not.toHaveProperty('presentation');
		const read = readPolicyResolutionWire(wire);
		assert(read.status === 'matched');
		expect(read.policy).not.toHaveProperty('surface');
		expect(v.safeParse(policyResolutionWireSchema, wire).success).toBe(true);
		expect(
			v.safeParse(consentInitResponseSchema.entries.policyResolution, wire)
				.success
		).toBe(true);
	});

	test('a resolution with surface round-trips through every reader', () => {
		const rule = {
			...optIn,
			surface: {
				blocking: 'required',
				container: { side: 'start', type: 'drawer' },
				edgeStyle: 'flush',
			},
		} satisfies PolicyRule;
		const wire = matchedWire(rule);
		expect(wire.policy.surface).toEqual(rule.surface);
		expect(wire.fingerprints.presentation).toEqual(expect.any(String));
		const read = readPolicyResolutionWire(wire);
		assert(read.status === 'matched');
		expect(read.policy.surface).toEqual(rule.surface);
		expect(read.fingerprints.presentation).toBe(wire.fingerprints.presentation);
		expect(v.safeParse(policyResolutionWireSchema, wire).success).toBe(true);
		expect(
			v.safeParse(consentInitResponseSchema.entries.policyResolution, wire)
				.success
		).toBe(true);
	});

	test('the reader accepts a container without its default position, and canonicalizes it', () => {
		const wire = matchedWire({
			...optIn,
			surface: { container: { type: 'card' } },
		});
		wire.policy.surface = { container: { type: 'card' } };
		const read = readPolicyResolutionWire(wire);
		assert(read.status === 'matched');
		expect(read.policy.surface).toEqual({
			container: { position: 'start', type: 'card' },
		});
	});

	test('every reader refuses a surface without its presentation fingerprint', () => {
		const wire = matchedWire({
			...optIn,
			surface: { container: { type: 'drawer' } },
		});
		delete wire.fingerprints.presentation;
		expect(readPolicyResolutionWire(wire)).toEqual({
			policy: null,
			reason: 'invalid-payload',
			status: 'failed',
		});
		expect(v.safeParse(policyResolutionWireSchema, wire).success).toBe(false);
	});

	test('every reader takes an empty surface as no surface', () => {
		const wire = matchedWire(optIn);
		wire.policy.surface = {};
		const read = readPolicyResolutionWire(wire);
		assert(read.status === 'matched');
		expect(read.policy).not.toHaveProperty('surface');
		expect(read.fingerprints).not.toHaveProperty('presentation');
		expect(v.safeParse(policyResolutionWireSchema, wire).success).toBe(true);
	});

	test('a surface the rule already implies needs no presentation fingerprint', () => {
		const wire = matchedWire(optIn);
		wire.policy.surface = { blocking: 'allowed' };
		const read = readPolicyResolutionWire(wire);
		assert(read.status === 'matched');
		expect(read.policy).not.toHaveProperty('surface');
	});

	test.each([
		['an unknown surface field', { extra: 1 }],
		['an unknown container type', { container: { type: 'modal' } }],
		[
			'an unknown card position',
			{ container: { position: 'top', type: 'card' } },
		],
		[
			'a physical card corner',
			{ container: { position: 'bottom-right', type: 'card' } },
		],
		['a physical drawer side', { container: { side: 'left', type: 'drawer' } }],
		[
			'a field another container owns',
			{ container: { side: 'start', type: 'card' } },
		],
		['an unknown edge style', { edgeStyle: 'rounded' }],
		['an unknown blocking constraint', { blocking: 'sometimes' }],
	])('the strict readers refuse %s as unsupported', (_label, surface) => {
		const wire = matchedWire(optIn);
		wire.policy.surface = surface;
		expect(readPolicyResolutionWire(wire)).toEqual({
			policy: null,
			reason: 'unsupported-contract',
			status: 'failed',
		});
		expect(v.safeParse(resolvedPolicyRuleSchema, wire.policy).success).toBe(
			false
		);
	});

	test.each([
		['a surface that is not an object', 'card'],
		['a container that is not an object', { container: 'card' }],
		['a container without a type', { container: {} }],
		['an edge style that is not a string', { edgeStyle: 1 }],
	])('the strict readers refuse %s as invalid', (_label, surface) => {
		const wire = matchedWire(optIn);
		wire.policy.surface = surface;
		expect(readPolicyResolutionWire(wire)).toEqual({
			policy: null,
			reason: 'invalid-payload',
			status: 'failed',
		});
		expect(v.safeParse(resolvedPolicyRuleSchema, wire.policy).success).toBe(
			false
		);
	});

	test('[BNR-13] every reader refuses required blocking on a rule that cannot block', () => {
		const wire = matchedWire(optOut);
		wire.policy.surface = { blocking: 'required' };
		expect(readPolicyResolutionWire(wire)).toMatchObject({
			reason: 'invalid-payload',
			status: 'failed',
		});
		expect(v.safeParse(resolvedPolicyRuleSchema, wire.policy).success).toBe(
			false
		);
		expect(
			collectResolvedPolicyRuleIssues(wire.policy as never).join('\n')
		).toContain('surface.blocking "required"');
	});

	test('refuses an empty presentation fingerprint', () => {
		const wire = matchedWire(optIn);
		wire.fingerprints.presentation = '';
		expect(readPolicyResolutionWire(wire)).toMatchObject({
			reason: 'invalid-payload',
			status: 'failed',
		});
		expect(v.safeParse(policyResolutionWireSchema, wire).success).toBe(false);
	});

	test('the /v1 init schema reads a resolution with surface', () => {
		const init = resolveInitFromManifest(
			{
				branding: 'inth',
				policyPacks: [
					createConsentManifestPolicyPack({
						...optIn,
						surface: { container: { edge: 'top', type: 'banner' } },
					}),
				],
				revision: 'r',
				schemaVersion: 2,
			},
			{ country: 'DE' }
		);
		const parsed = v.safeParse(
			v1ConsentInitOutputSchema,
			JSON.parse(JSON.stringify(init))
		);
		expect(parsed.success).toBe(true);
	});
});

describe('surface in the manifest', () => {
	test('a pack carries surface and its presentation fingerprint', async () => {
		const manifest = await buildConsentManifestFromConfig({
			policyRules: [{ ...optIn, surface: { container: { type: 'drawer' } } }],
		});
		const [pack] = manifest.policyPacks ?? [];
		expect(pack?.rule.surface).toEqual({
			container: { side: 'bottom', type: 'drawer' },
		});
		expect(pack?.fingerprints.presentation).toEqual(expect.any(String));
		const json = JSON.parse(JSON.stringify(manifest)) as unknown;
		expect(() => parseConsentManifest(json)).not.toThrow();
		expect(v.safeParse(consentManifestResponseSchema, json).success).toBe(true);
		const resolution = resolvePolicyResolutionFromManifest(manifest, {
			countryCode: 'DE',
			regionCode: null,
		});
		assert(resolution.status === 'matched');
		expect(resolution.policy.surface).toEqual(pack?.rule.surface);
		expect(resolution.fingerprints.presentation).toBe(
			pack?.fingerprints.presentation
		);
	});

	test('a pack without surface keeps the old shape', async () => {
		const manifest = await buildConsentManifestFromConfig({
			policyRules: [optIn],
		});
		const [pack] = manifest.policyPacks ?? [];
		expect(pack?.rule).not.toHaveProperty('surface');
		expect(pack?.fingerprints).not.toHaveProperty('presentation');
		const json = JSON.parse(JSON.stringify(manifest)) as unknown;
		expect(() => parseConsentManifest(json)).not.toThrow();
		expect(v.safeParse(consentManifestResponseSchema, json).success).toBe(true);
	});

	test('a pack with a surface and no presentation fingerprint is invalid', () => {
		const pack = createConsentManifestPolicyPack({
			...optIn,
			surface: { container: { type: 'drawer' } },
		});
		const { presentation: _, ...fingerprints } = pack.fingerprints;
		const manifest = {
			branding: 'inth',
			policyPacks: [{ ...pack, fingerprints }],
			revision: 'r',
			schemaVersion: 2,
		} as const;
		expect(() =>
			parseConsentManifest(JSON.parse(JSON.stringify(manifest)))
		).toThrow();
		expect(
			resolvePolicyResolutionFromManifest(manifest as never, {
				countryCode: 'DE',
				regionCode: null,
			})
		).toEqual({
			policy: null,
			reason: 'invalid-configuration',
			status: 'failed',
		});
	});

	test('a pack with an empty surface resolves without one', () => {
		const pack = createConsentManifestPolicyPack(optIn);
		const manifest = {
			branding: 'inth',
			policyPacks: [{ ...pack, rule: { ...pack.rule, surface: {} } }],
			revision: 'r',
			schemaVersion: 2,
		} as const;
		expect(() =>
			parseConsentManifest(JSON.parse(JSON.stringify(manifest)))
		).not.toThrow();
		const resolution = resolvePolicyResolutionFromManifest(manifest as never, {
			countryCode: 'DE',
			regionCode: null,
		});
		assert(resolution.status === 'matched');
		expect(resolution.policy).not.toHaveProperty('surface');
	});

	test('a pack with a malformed surface is invalid configuration', () => {
		const pack = createConsentManifestPolicyPack(optIn);
		const resolution = resolvePolicyResolutionFromManifest(
			{
				branding: 'inth',
				policyPacks: [
					{ ...pack, rule: { ...pack.rule, surface: { edgeStyle: 'x' } } },
				] as never,
				revision: 'r',
				schemaVersion: 2,
			},
			{ countryCode: 'DE', regionCode: null }
		);
		expect(resolution).toEqual({
			policy: null,
			reason: 'invalid-configuration',
			status: 'failed',
		});
	});
});
