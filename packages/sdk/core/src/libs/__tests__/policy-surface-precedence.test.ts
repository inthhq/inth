import { normalizePolicyRule, policyRulePresets } from '@inth/sdk-schema/types';
import type { PolicyRule, PolicySurface } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import type { ConsentLayoutDiagnostic } from '../consent-layout';
import { resolveConsentPresentation } from '../policy-actions';
import type { PromptPresentation } from '../policy-actions';

const optIn = (surface?: PolicySurface) =>
	normalizePolicyRule({
		id: 'eu',
		match: { isDefault: true },
		model: 'opt-in',
		prompt: 'choice',
		...(surface && { surface }),
	} satisfies PolicyRule);

const SOFT = {
	container: { edge: 'top', type: 'banner' },
	edgeStyle: 'flush',
} as const satisfies PolicySurface;

interface Row {
	label: string;
	policy: ReturnType<typeof optIn>;
	presentation?: PromptPresentation;
	override?: PromptPresentation;
	placement: string;
	edgeStyle: 'inset' | 'flush';
	blocking: boolean;
	diagnostic?: ConsentLayoutDiagnostic['code'];
}

/**
 * Highest first: policy blocking (hard), override (experiment arm or
 * component prop), provider presentation, policy container and edge style
 * (soft), SDK default.
 */
const ROWS: Row[] = [
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'the SDK default without policy surface or host presentation',
		placement: 'card-start',
		policy: optIn(),
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label: 'the policy soft container and edge style without host presentation',
		placement: 'banner-top',
		policy: optIn(SOFT),
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label: 'a host container over the policy container, keeping its edge style',
		placement: 'drawer-end',
		policy: optIn(SOFT),
		presentation: { container: { side: 'end', type: 'drawer' } },
	},
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'a host edge style over the policy edge style',
		placement: 'banner-top',
		policy: optIn(SOFT),
		presentation: { edgeStyle: 'inset' },
	},
	{
		blocking: true,
		edgeStyle: 'inset',
		label: 'an override over the host presentation and the policy container',
		override: { container: { position: 'center', type: 'card' } },
		placement: 'card-center',
		policy: optIn(SOFT),
		presentation: { container: { side: 'start', type: 'drawer' } },
	},
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'an override edge style over the host and the policy',
		override: { edgeStyle: 'inset' },
		placement: 'drawer-start',
		policy: optIn(SOFT),
		presentation: {
			container: { side: 'start', type: 'drawer' },
			edgeStyle: 'flush',
		},
	},
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'a policy flush edge style on its own card, silently inset',
		placement: 'card-end',
		policy: optIn({
			container: { position: 'end', type: 'card' },
			edgeStyle: 'flush',
		}),
	},
	{
		blocking: false,
		diagnostic: 'edge-style-ignored',
		edgeStyle: 'inset',
		label: 'a host flush edge style on a card, which reports it',
		placement: 'card-start',
		policy: optIn(),
		presentation: { edgeStyle: 'flush' },
	},
	{
		blocking: true,
		edgeStyle: 'inset',
		label: 'a policy centred card, which blocks',
		placement: 'card-center',
		policy: optIn({ container: { position: 'center', type: 'card' } }),
	},
	{
		blocking: true,
		edgeStyle: 'inset',
		label: 'required blocking without host presentation',
		placement: 'card-start',
		policy: optIn({ blocking: 'required' }),
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		edgeStyle: 'inset',
		label: 'required blocking over a host that turns blocking off',
		placement: 'card-start',
		policy: optIn({ blocking: 'required' }),
		presentation: { blockUntilChoice: false },
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		edgeStyle: 'inset',
		label: 'required blocking over an override that turns blocking off',
		override: { blockUntilChoice: false },
		placement: 'banner-top',
		policy: optIn({ ...SOFT, blocking: 'required' }),
		presentation: { blockUntilChoice: true, edgeStyle: 'inset' },
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		edgeStyle: 'inset',
		label: 'forbidden blocking over a host that turns blocking on',
		placement: 'card-start',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: false,
		diagnostic: 'center-unavailable',
		edgeStyle: 'inset',
		label: 'forbidden blocking over a host centred card',
		placement: 'card-start',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { container: { position: 'center', type: 'card' } },
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label: 'a provider container over the policy container',
		placement: 'drawer-end',
		policy: optIn(SOFT),
		presentation: {
			container: { side: 'end', type: 'drawer' },
		},
	},
	{
		blocking: false,
		diagnostic: 'center-unavailable',
		edgeStyle: 'inset',
		label: 'forbidden blocking over an override centred card',
		override: { container: { position: 'center', type: 'card' } },
		placement: 'card-start',
		policy: optIn({ blocking: 'forbidden' }),
	},
];

interface TopLevelRow {
	label: string;
	policy: ReturnType<typeof optIn>;
	presentation?: PromptPresentation;
	override?: PromptPresentation;
	blocking: boolean;
	diagnostic?: string;
}

const OPT_OUT_CHOICE = normalizePolicyRule({
	id: 'us',
	match: { isDefault: true },
	model: 'opt-out',
	prompt: 'choice',
});

/**
 * The top-level `blocking` the IAB banner reads. The policy's constraint
 * comes first. The blocking request is decided per tier, override first,
 * and the top-level value is the container's, so the two always agree.
 */
const TOP_LEVEL_ROWS: TopLevelRow[] = [
	{
		blocking: true,
		label: 'no constraint and a host centred card',
		policy: optIn(),
		presentation: { container: { position: 'center', type: 'card' } },
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'no constraint and a centred card the host turns blocking off for',
		policy: optIn(),
		presentation: {
			blockUntilChoice: false,
			container: { position: 'center', type: 'card' },
		},
	},
	{
		// The centred card moves to the corner first (`center-unavailable`).
		blocking: false,
		label: '[BNR-13] an opt-out choice rule over a host centred card',
		policy: OPT_OUT_CHOICE,
		presentation: { container: { position: 'center', type: 'card' } },
	},
	{
		blocking: false,
		label: 'no constraint and no host request',
		policy: optIn(),
	},
	{
		blocking: true,
		label: 'no constraint and a host blockUntilChoice',
		policy: optIn(),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: true,
		label:
			'an override that blocks over a provider blockUntilChoice that does not',
		override: { blockUntilChoice: true },
		policy: optIn(),
		presentation: { blockUntilChoice: false },
	},
	{
		blocking: false,
		label:
			'an override blockUntilChoice that does not block over a provider that does',
		override: { blockUntilChoice: false },
		policy: optIn(),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: true,
		label: 'a provider request when the override says nothing about blocking',
		override: { primaryActions: ['accept'] },
		policy: optIn(),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over a host that blocks',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: true,
		label: 'required without host presentation',
		policy: optIn({ blocking: 'required' }),
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'required over a host that turns blocking off',
		policy: optIn({ blocking: 'required' }),
		presentation: { blockUntilChoice: false },
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'required over an override blockUntilChoice that turns it off',
		override: { blockUntilChoice: false },
		policy: optIn({ blocking: 'required' }),
		presentation: { blockUntilChoice: true },
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label:
			'an opt-out choice rule, which cannot block, over a host that blocks',
		policy: OPT_OUT_CHOICE,
		presentation: { blockUntilChoice: true },
	},
];

describe('resolveConsentPresentation: top-level blocking under the policy', () => {
	it.each(TOP_LEVEL_ROWS)(
		'$label',
		({ blocking, diagnostic, override, policy, presentation }) => {
			const resolved = resolveConsentPresentation({
				override,
				policy,
				presentation: presentation && { prompt: presentation },
				surface: 'prompt',
			});
			expect(resolved.blocking).toBe(blocking);
			expect(resolved.container?.desktop.blocking).toBe(blocking);
			expect(resolved.container?.phone.blocking).toBe(blocking);
			expect(
				resolved.container?.desktop.diagnostics
					.map(({ code }) => code)
					.filter((code) => code.startsWith('blocking-'))
			).toEqual(diagnostic ? [diagnostic] : []);
		}
	);

	it('leaves the preferences dialog blocking whatever the policy forbids', () => {
		expect(
			resolveConsentPresentation({
				policy: optIn({ blocking: 'forbidden' }),
				surface: 'preferences',
			}).blocking
		).toBe(true);
	});
});

describe('resolveConsentPresentation: policy surface precedence', () => {
	it.each(ROWS)(
		'$label',
		({
			blocking,
			diagnostic,
			edgeStyle,
			override,
			placement,
			policy,
			presentation,
		}) => {
			const { container } = resolveConsentPresentation({
				override,
				policy,
				presentation: presentation && { prompt: presentation },
				surface: 'prompt',
			});
			expect(container?.desktop).toMatchObject({
				blocking,
				edgeStyle,
				placement,
			});
			expect(container?.desktop.diagnostics.map(({ code }) => code)).toEqual(
				diagnostic ? [diagnostic] : []
			);
		}
	);

	it('applies the policy container per viewport', () => {
		const { container } = resolveConsentPresentation({
			policy: optIn({ container: { side: 'start', type: 'drawer' } }),
			surface: 'prompt',
		});
		expect(container?.desktop).toMatchObject({
			flow: 'all-in-one',
			placement: 'drawer-start',
		});
		expect(container?.phone).toMatchObject({
			flow: 'expand-in-place',
			placement: 'drawer-bottom',
		});
	});

	it('applies required blocking on both viewports', () => {
		const { container } = resolveConsentPresentation({
			policy: optIn({ blocking: 'required' }),
			presentation: { prompt: { blockUntilChoice: false } },
			surface: 'prompt',
		});
		expect(container?.desktop.blocking).toBe(true);
		expect(container?.phone.blocking).toBe(true);
	});

	it('leaves preferences without a container', () => {
		expect(
			resolveConsentPresentation({
				policy: optIn({ ...SOFT, blocking: 'required' }),
				surface: 'preferences',
			}).container
		).toBeNull();
	});

	it.each(['none', 'notice'] as const)(
		'[BNR-13] the US opt-out preset with prompt %s never blocks, whatever the host asks',
		(prompt) => {
			const policy = normalizePolicyRule(
				policyRulePresets.usPrivacyStatesOptOut({ prompt })
			);
			for (const presentation of [
				{ blockUntilChoice: true },
				{ container: { position: 'center', type: 'card' } },
				{
					blockUntilChoice: true,
					container: { position: 'center', type: 'card' },
				},
			] satisfies PromptPresentation[]) {
				const { container } = resolveConsentPresentation({
					policy,
					presentation: { prompt: presentation },
					surface: 'prompt',
				});
				expect(container?.desktop.blocking).toBe(false);
				expect(container?.phone.blocking).toBe(false);
			}
		}
	);

	it('[BNR-13] a host-built opt-in rule from the US preset keeps its blocking ban', () => {
		const policy = normalizePolicyRule({
			...policyRulePresets.usPrivacyStatesOptOut(),
			model: 'opt-in',
			prompt: 'choice',
		});
		const { container } = resolveConsentPresentation({
			policy,
			presentation: { prompt: { blockUntilChoice: true } },
			surface: 'prompt',
		});
		expect(container?.desktop.blocking).toBe(false);
	});
});
