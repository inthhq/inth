/**
 * Keeps `packages/native-protocol/policy-surface/cases.json` in step with the
 * web: how a policy rule's `surface` block is read, for the Swift and Kotlin
 * policy readers to match.
 *
 * Each case is one `policyResolution` wire value. Its expected half comes from
 * the web code that reads it:
 *
 * - `readPolicyResolutionWire` in `@inth/sdk-schema` decides whether the wire
 *   is readable, and if not, the failure reason. When it is, the rule's
 *   canonical `surface` is what it kept: defaults filled, a card's edge style
 *   dropped, a blocking constraint the rule already implies dropped, and an
 *   empty `surface` read as none.
 * - `resolveLayout`, for the `phone` viewport and with no host presentation,
 *   gives the layout that surface asks for. This is what
 *   `resolvePromptContainer` passes it when a host sets nothing, which is the
 *   only case a native app is in: native presenters have no web container
 *   options. A rule without a surface has no layout here, so a snapshot under
 *   it reads exactly as it did before `surface` existed.
 *
 * The file lives under `packages/native-protocol/policy-surface/` rather than
 * the top level, because every top-level fixture must be listed in
 * `packages/native-protocol/index.json`.
 *
 * Regenerate it with `INTH_WRITE_POLICY_SURFACE_FIXTURE=1 vp test run
 * src/libs/__tests__/policy-surface-native-fixture.test.ts` in
 * `packages/sdk/core`. Without the variable this test fails when the
 * committed file is stale.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readPolicyResolutionWire } from '@inth/sdk-schema/types';
import { expect, it } from 'vite-plus/test';

import { resolveLayout } from '../consent-layout.model';

/** Fingerprints the cases share. Their values are opaque to the readers. */
const FINGERPRINTS = {
	choice: 'c'.repeat(64),
	notice: 'b'.repeat(64),
	policy: 'a'.repeat(64),
} as const;

const PRESENTATION = 'd'.repeat(64);

const OPTIONAL = ['experience', 'functionality', 'marketing', 'measurement'];

/** Base rules, one per kind of prompt the layout resolver tells apart. */
const RULES = {
	// A choice prompt outside the opt-out model: the one rule that can block.
	'opt-in-choice': {
		actions: {
			allowed: ['accept', 'customize', 'reject'],
			equivalent: [['accept', 'reject']],
			required: ['accept', 'reject'],
		},
		copyRevision: null,
		id: 'eu_opt_in',
		model: 'opt-in',
		preselectedCategories: [],
		privacySignals: { gpc: { denyCategories: [] } },
		prompt: 'choice',
		proof: { storeIp: true, storeLanguage: true, storeUserAgent: true },
		rights: ['disclosure', 'preferences'],
		scope: OPTIONAL,
		scopeMode: 'strict',
		validity: { choiceMs: 31_536_000_000, noticeMs: 31_536_000_000 },
	},
	// A notice: it can never block, so `forbidden` is implied.
	'opt-out-notice': {
		actions: { allowed: ['dismiss'], equivalent: [], required: ['dismiss'] },
		copyRevision: null,
		id: 'us_notice',
		model: 'opt-out',
		preselectedCategories: [],
		privacySignals: { gpc: { denyCategories: ['marketing'] } },
		prompt: 'notice',
		proof: { storeIp: true, storeLanguage: true, storeUserAgent: true },
		rights: ['disclosure', 'opt-out', 'preferences'],
		scope: OPTIONAL,
		scopeMode: 'permissive',
		validity: { choiceMs: 31_536_000_000, noticeMs: 31_536_000_000 },
	},
} as const;

type RuleName = keyof typeof RULES;

interface Case {
	readonly id: string;
	readonly why: string;
	readonly rule: RuleName;
	/** The rule's `surface`, or `undefined` to leave the key out. */
	readonly surface?: unknown;
	/** `fingerprints.presentation`, or `undefined` to leave the key out. */
	readonly presentation?: unknown;
}

const CASES: readonly Case[] = [
	{
		id: 'no-surface',
		rule: 'opt-in-choice',
		why: 'A rule without a surface reads as it did before surface existed.',
	},
	{
		id: 'empty-surface',
		rule: 'opt-in-choice',
		surface: {},
		why: 'An empty surface is no surface, and needs no presentation fingerprint.',
	},
	{
		id: 'presentation-without-surface',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		why: 'A presentation fingerprint alone is readable and asks for nothing.',
	},
	{
		id: 'banner-default-edge',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { type: 'banner' } },
		why: 'A banner with no edge sits at the bottom.',
	},
	{
		id: 'banner-top-flush',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { edge: 'top', type: 'banner' }, edgeStyle: 'flush' },
		why: 'A banner takes the edge style the policy names.',
	},
	{
		id: 'card-default-position-drops-edge-style',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { type: 'card' }, edgeStyle: 'flush' },
		why: 'A card sits at start and is always inset, so its edge style is dropped.',
	},
	{
		id: 'card-center-blocks',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { position: 'center', type: 'card' } },
		why: 'A centred card always blocks.',
	},
	{
		id: 'card-center-blocking-forbidden',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: {
			blocking: 'forbidden',
			container: { position: 'center', type: 'card' },
		},
		why: 'A centred card cannot sit where blocking is forbidden, so it moves to start and does not block.',
	},
	{
		id: 'drawer-end-on-phone',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { side: 'end', type: 'drawer' } },
		why: 'A side drawer has no room on a phone and becomes a bottom drawer that expands in place.',
	},
	{
		id: 'drawer-top-flush-on-notice',
		presentation: PRESENTATION,
		rule: 'opt-out-notice',
		surface: { container: { side: 'top', type: 'drawer' }, edgeStyle: 'flush' },
		why: 'A top drawer stays on top, and a notice never blocks.',
	},
	{
		id: 'blocking-required',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { blocking: 'required' },
		why: 'Required blocking on a rule that can block keeps the default card and blocks.',
	},
	{
		id: 'blocking-allowed-is-implied',
		rule: 'opt-in-choice',
		surface: { blocking: 'allowed' },
		why: 'Allowed is the default, so it is dropped and the surface is empty.',
	},
	{
		id: 'blocking-forbidden-implied-by-notice',
		rule: 'opt-out-notice',
		surface: { blocking: 'forbidden' },
		why: 'A notice can never block, so forbidden is implied and dropped.',
	},
	{
		id: 'blocking-required-on-notice',
		presentation: PRESENTATION,
		rule: 'opt-out-notice',
		surface: { blocking: 'required' },
		why: 'Required blocking needs a choice prompt outside the opt-out model.',
	},
	{
		id: 'surface-without-presentation',
		rule: 'opt-in-choice',
		surface: { container: { type: 'banner' } },
		why: 'A surface with anything in it needs the presentation fingerprint.',
	},
	{
		id: 'presentation-empty',
		presentation: '',
		rule: 'opt-in-choice',
		surface: { container: { type: 'banner' } },
		why: 'The presentation fingerprint must be a non-empty string.',
	},
	{
		id: 'presentation-not-a-string',
		presentation: 7,
		rule: 'opt-in-choice',
		why: 'The presentation fingerprint must be a string.',
	},
	{
		id: 'surface-not-an-object',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: 'banner',
		why: 'A surface must be a plain object.',
	},
	{
		id: 'surface-unknown-field',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { animation: 'slide' },
		why: 'An unknown surface field is a newer contract.',
	},
	{
		id: 'container-unknown-type',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { type: 'modal' } },
		why: 'An unknown container type is a newer contract.',
	},
	{
		id: 'container-missing-type',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { edge: 'top' } },
		why: 'A container must name its type.',
	},
	{
		id: 'container-field-of-another-type',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { edge: 'top', type: 'card' } },
		why: 'A card has a position, not an edge.',
	},
	{
		id: 'container-unknown-position',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: { position: 'middle', type: 'card' } },
		why: 'An unknown card position is a newer contract.',
	},
	{
		id: 'container-not-an-object',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { container: 'banner' },
		why: 'A container must be a plain object.',
	},
	{
		id: 'edge-style-unknown',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { edgeStyle: 'rounded' },
		why: 'An unknown edge style is a newer contract.',
	},
	{
		id: 'edge-style-not-a-string',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { edgeStyle: 1 },
		why: 'An edge style must be a string.',
	},
	{
		id: 'blocking-unknown',
		presentation: PRESENTATION,
		rule: 'opt-in-choice',
		surface: { blocking: 'sometimes' },
		why: 'An unknown blocking constraint is a newer contract.',
	},
];

const wireFor = function wireFor(entry: Case): Record<string, unknown> {
	const base = RULES[entry.rule];
	const policy =
		entry.surface === undefined ? base : { ...base, surface: entry.surface };
	const fingerprints =
		entry.presentation === undefined
			? FINGERPRINTS
			: { ...FINGERPRINTS, presentation: entry.presentation };
	return {
		fingerprints,
		matchedBy: 'region',
		policy,
		policyId: base.id,
		status: 'matched',
		version: 1,
	};
};

const expectedFor = function expectedFor(wire: Record<string, unknown>) {
	const read = readPolicyResolutionWire(wire);
	if (read.status === 'failed') {
		return { reason: read.reason, status: 'failed' as const };
	}
	if (read.status !== 'matched') {
		throw new Error(`Unexpected status ${read.status}`);
	}
	const { surface } = read.policy;
	if (surface === undefined) {
		return { layout: null, status: 'matched' as const, surface: null };
	}
	// `resolvePromptContainer` with no host presentation: the policy's
	// container, its edge style beside anything but a card, and its blocking.
	const { container } = surface;
	const resolved = resolveLayout({
		blockingConstraint: surface.blocking,
		container,
		edgeStyle: container?.type === 'card' ? undefined : surface.edgeStyle,
		model: read.policy.model,
		prompt: read.policy.prompt,
		viewport: 'phone',
	});
	return {
		layout: {
			blocking: resolved.blocking,
			edgeStyle: resolved.edgeStyle,
			flow: resolved.flow,
			placement: resolved.placement,
			type: resolved.type,
		},
		status: 'matched' as const,
		surface,
	};
};

// Every base rule must read on its own, or a case that fails would be
// failing for a reason that has nothing to do with its surface.
for (const name of Object.keys(RULES) as RuleName[]) {
	const read = readPolicyResolutionWire(
		wireFor({ id: name, rule: name, why: '' })
	);
	if (read.status !== 'matched') {
		throw new Error(`Base rule ${name} does not read: ${JSON.stringify(read)}`);
	}
}

const fixture = {
	cases: CASES.map((entry) => {
		const wire = wireFor(entry);
		return {
			expected: expectedFor(wire),
			id: entry.id,
			input: { policyResolution: wire },
			why: entry.why,
		};
	}),
	description:
		"A policy rule's surface block: whether the policyResolution wire that carries it is readable, the canonical surface the reader keeps, and the phone layout that surface resolves to when the host sets no presentation.",
	generatedBy:
		'INTH_WRITE_POLICY_SURFACE_FIXTURE=1 vp test run src/libs/__tests__/policy-surface-native-fixture.test.ts (in packages/sdk/core)',
	oracle: [
		'packages/sdk/schema/src/shared/policy-resolution-wire.ts',
		'packages/sdk/schema/src/shared/policy/policy-surface.ts',
		'packages/sdk/core/src/libs/consent-layout.model.ts',
	],
};

const FIXTURE = resolve(
	import.meta.dirname,
	'../../../../../native-protocol/policy-surface/cases.json'
);

it('keeps the native policy surface fixture in step with the web reader', () => {
	const written = `${JSON.stringify(fixture, null, '\t')}\n`;
	if (process.env.INTH_WRITE_POLICY_SURFACE_FIXTURE === '1') {
		writeFileSync(FIXTURE, written);
	}
	expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(
		JSON.parse(written)
	);
});
