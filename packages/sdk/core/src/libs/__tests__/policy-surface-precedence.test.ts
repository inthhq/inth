import { normalizePolicyRule, policyRulePresets } from '@inth/sdk-schema/types';
import type { PolicyRule, PolicySurface } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import type { ConsentLayoutDiagnostic } from '../consent-layout';
import { resolveConsentPresentation } from '../policy-actions';
import type { PromptPresentation, PromptVariant } from '../policy-actions';

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
		blocking: false,
		edgeStyle: 'inset',
		label: 'a host legacy variant and position over the policy container',
		placement: 'card-end',
		policy: optIn(SOFT),
		presentation: { position: 'bottom-right', variant: 'floating' },
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label: 'a host legacy bar over the policy container',
		placement: 'banner-bottom',
		policy: optIn(SOFT),
		presentation: { variant: 'bar' },
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
		// The wall is already a floating card when the container reads it.
		blocking: false,
		edgeStyle: 'inset',
		label: 'forbidden blocking over a host legacy wall',
		placement: 'card-start',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { variant: 'wall' },
	},
	{
		blocking: true,
		edgeStyle: 'inset',
		label: 'an override legacy wall over a provider container',
		override: { variant: 'wall' },
		placement: 'card-center',
		policy: optIn(SOFT),
		presentation: { container: { type: 'drawer' } },
	},
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'an override legacy position over a provider container',
		override: { position: 'bottom-right' },
		placement: 'card-end',
		policy: optIn(),
		presentation: { container: { side: 'top', type: 'drawer' } },
	},
	{
		blocking: false,
		edgeStyle: 'inset',
		label: 'an override container over a provider legacy variant',
		override: { container: { side: 'start', type: 'drawer' } },
		placement: 'drawer-start',
		policy: optIn(SOFT),
		presentation: { edgeStyle: 'inset', variant: 'bar' },
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label: 'a provider container over its own legacy variant',
		placement: 'drawer-end',
		policy: optIn(SOFT),
		presentation: {
			container: { side: 'end', type: 'drawer' },
			variant: 'bar',
		},
	},
	{
		blocking: false,
		edgeStyle: 'flush',
		label:
			'an override without geometry falls through to the provider legacy variant',
		override: { primaryActions: ['accept'] },
		placement: 'banner-bottom',
		policy: optIn(SOFT),
		presentation: { variant: 'bar' },
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
	variant: PromptVariant;
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
 * The top-level `variant`, `blocking`, `scrollLock` and `trapFocus` every
 * shipped renderer reads. The policy's constraint comes first, then the
 * variant's defaults, so a wall the policy cannot block becomes floating.
 * The blocking request is decided per tier, override first, and the
 * container reads the same one, so the two always agree.
 */
const TOP_LEVEL_ROWS: TopLevelRow[] = [
	{
		blocking: false,
		label: 'no constraint and no host request',
		policy: optIn(),
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'no constraint and a host that blocks',
		policy: optIn(),
		presentation: { blocking: true },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'no constraint and a host blockUntilChoice',
		policy: optIn(),
		presentation: { blockUntilChoice: true },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'no constraint and a host legacy wall',
		policy: optIn(),
		presentation: { variant: 'wall' },
		variant: 'wall',
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'no constraint and a wall the host turns blocking off for',
		policy: optIn(),
		presentation: { blocking: false, variant: 'wall' },
		variant: 'wall',
	},
	{
		blocking: true,
		label:
			'an override that blocks over a provider blockUntilChoice that does not',
		override: { blocking: true },
		policy: optIn(),
		presentation: { blockUntilChoice: false },
		variant: 'floating',
	},
	{
		blocking: false,
		label:
			'a provider blocking: false over an override that only sets the deprecated scrollLock and trapFocus',
		override: { scrollLock: true, trapFocus: true },
		policy: optIn(),
		presentation: { blocking: false },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'an override scrollLock over a provider that sets nothing explicit',
		override: { scrollLock: true },
		policy: optIn(),
		presentation: {},
		variant: 'floating',
	},
	{
		blocking: false,
		label:
			'an override blockUntilChoice that does not block over a provider that does',
		override: { blockUntilChoice: false },
		policy: optIn(),
		presentation: { blocking: true },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'an override scroll lock over a provider that turns focus off',
		override: { trapFocus: true },
		policy: optIn(),
		presentation: { scrollLock: false },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'a provider request when the override says nothing about blocking',
		override: { primaryActions: ['accept'] },
		policy: optIn(),
		presentation: { blockUntilChoice: true },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over a host that blocks',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { blocking: true },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over a host legacy wall, which becomes floating',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { variant: 'wall' },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over a host wall that does not block, never an open wall',
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { blocking: false, variant: 'wall' },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over an override wall',
		override: { variant: 'wall' },
		policy: optIn({ blocking: 'forbidden' }),
		presentation: { variant: 'bar' },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: 'forbidden over an override scroll lock',
		override: { scrollLock: true },
		policy: optIn({ blocking: 'forbidden' }),
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'required without host presentation',
		policy: optIn({ blocking: 'required' }),
		variant: 'floating',
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'required over a host that turns blocking off',
		policy: optIn({ blocking: 'required' }),
		presentation: { blocking: false },
		variant: 'floating',
	},
	{
		blocking: true,
		diagnostic: 'blocking-required',
		label: 'required over an override blockUntilChoice that turns it off',
		override: { blockUntilChoice: false },
		policy: optIn({ blocking: 'required' }),
		presentation: { blocking: true },
		variant: 'floating',
	},
	{
		blocking: true,
		label: 'required over an override bar',
		override: { variant: 'bar' },
		policy: optIn({ blocking: 'required' }),
		variant: 'bar',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label:
			'an opt-out choice rule, which cannot block, over a host that blocks',
		policy: OPT_OUT_CHOICE,
		presentation: { blocking: true },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label: '[BNR-13] an opt-out choice rule over a host legacy wall',
		policy: OPT_OUT_CHOICE,
		presentation: { variant: 'wall' },
		variant: 'floating',
	},
	{
		blocking: false,
		diagnostic: 'blocking-forbidden',
		label:
			'[BNR-13] an opt-out choice rule over a host wall that does not block',
		policy: OPT_OUT_CHOICE,
		presentation: { blocking: false, variant: 'wall' },
		variant: 'floating',
	},
];

describe('resolveConsentPresentation: top-level blocking under the policy', () => {
	it.each(TOP_LEVEL_ROWS)(
		'$label',
		({ blocking, diagnostic, override, policy, presentation, variant }) => {
			const resolved = resolveConsentPresentation({
				override,
				policy,
				presentation: presentation && { prompt: presentation },
				surface: 'prompt',
			});
			expect(resolved).toMatchObject({
				blocking,
				scrollLock: blocking,
				trapFocus: blocking,
				variant,
			});
			// The container reads the same request, so it agrees.
			expect(resolved.container?.desktop.blocking).toBe(blocking);
			expect(resolved.container?.phone.blocking).toBe(blocking);
			expect(
				resolved.diagnostics
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
				{ variant: 'wall' },
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
