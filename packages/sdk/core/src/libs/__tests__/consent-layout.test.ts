import { normalizePolicyRule } from '@inth/sdk-schema/types';
import type { PolicyPrompt, PolicyRuleModel } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import {
	containerFromLegacyPrompt,
	PHONE_LAYOUT_QUERY,
	resolveLayout,
} from '../consent-layout';
import type {
	ConsentBlockingConstraint,
	ConsentContainer,
	ConsentEdgeStyle,
	ConsentViewport,
	ResolveLayoutInput,
} from '../consent-layout';
import { resolveConsentPresentation } from '../policy-actions';

const EU = { model: 'opt-in', prompt: 'choice' } as const;
const US_OPT_OUT_NONE = { model: 'opt-out', prompt: 'none' } as const;
const US_OPT_OUT_NOTICE = { model: 'opt-out', prompt: 'notice' } as const;

const CONTAINERS: (ConsentContainer | undefined)[] = [
	undefined,
	{ type: 'card' },
	{ position: 'bottom-left', type: 'card' },
	{ position: 'bottom-right', type: 'card' },
	{ position: 'center', type: 'card' },
	{ type: 'banner' },
	{ edge: 'bottom', type: 'banner' },
	{ edge: 'top', type: 'banner' },
	{ type: 'drawer' },
	{ side: 'bottom', type: 'drawer' },
	{ side: 'top', type: 'drawer' },
	{ side: 'left', type: 'drawer' },
	{ side: 'right', type: 'drawer' },
];
const EDGE_STYLES: (ConsentEdgeStyle | undefined)[] = [
	undefined,
	'inset',
	'flush',
];
const BLOCK_UNTIL_CHOICE: (boolean | undefined)[] = [undefined, false, true];
const CONSTRAINTS: (ConsentBlockingConstraint | undefined)[] = [
	undefined,
	'allowed',
	'forbidden',
	'required',
];
/** Every model and prompt pair a policy rule accepts. */
const REGIMES: { model: PolicyRuleModel; prompt: PolicyPrompt }[] = [
	{ model: 'opt-in', prompt: 'choice' },
	{ model: 'iab', prompt: 'choice' },
	{ model: 'opt-out', prompt: 'choice' },
	{ model: 'opt-out', prompt: 'notice' },
	{ model: 'opt-out', prompt: 'none' },
	{ model: 'none', prompt: 'none' },
];
const VIEWPORTS: ConsentViewport[] = ['desktop', 'phone'];

const grid = function* grid(): Generator<ResolveLayoutInput> {
	for (const container of CONTAINERS) {
		for (const edgeStyle of EDGE_STYLES) {
			for (const blockUntilChoice of BLOCK_UNTIL_CHOICE) {
				for (const blockingConstraint of CONSTRAINTS) {
					for (const regime of REGIMES) {
						for (const viewport of VIEWPORTS) {
							yield {
								blockUntilChoice,
								blockingConstraint,
								container,
								edgeStyle,
								...regime,
								viewport,
							};
						}
					}
				}
			}
		}
	}
};

const blockable = (input: ResolveLayoutInput) =>
	input.blockingConstraint !== 'forbidden' &&
	input.prompt === 'choice' &&
	input.model !== 'opt-out';

describe('resolveLayout: every combination', () => {
	const cases = [...grid()];

	it('covers the full matrix', () => {
		expect(cases).toHaveLength(13 * 3 * 3 * 4 * 6 * 2);
	});

	it('[BNR-13] blocks only a choice prompt outside an opt-out model, never when forbidden', () => {
		const blocked = cases
			.filter((input) => !blockable(input))
			.filter((input) => resolveLayout(input).blocking);
		expect(blocked).toEqual([]);
	});

	it('blocks exactly when asked, required or centred, and allowed', () => {
		const wrong = cases.filter((input) => {
			const result = resolveLayout(input);
			const wants =
				input.blockUntilChoice === true ||
				input.blockingConstraint === 'required' ||
				result.placement === 'card-center';
			return result.blocking !== (wants && blockable(input));
		});
		expect(wrong).toEqual([]);
	});

	it('a centred card always blocks', () => {
		const unblocked = cases.filter((input) => {
			const result = resolveLayout(input);
			return result.placement === 'card-center' && !result.blocking;
		});
		expect(unblocked).toEqual([]);
	});

	it('a centred card falls back to bottom-left where blocking is not possible', () => {
		const wrong = cases
			.filter(
				(input) =>
					input.container?.type === 'card' &&
					input.container.position === 'center' &&
					!blockable(input)
			)
			.filter((input) => {
				const result = resolveLayout(input);
				return (
					result.placement !== 'card-bottom-left' ||
					!result.diagnostics.some((d) => d.code === 'center-unavailable')
				);
			});
		expect(wrong).toEqual([]);
	});

	it('shows every choice at once only in a desktop side drawer', () => {
		const wrong = cases.filter((input) => {
			const result = resolveLayout(input);
			const side =
				input.viewport === 'desktop' &&
				(result.placement === 'drawer-left' ||
					result.placement === 'drawer-right');
			return result.flow !== (side ? 'all-in-one' : 'expand-in-place');
		});
		expect(wrong).toEqual([]);
	});

	it('turns side drawers into a bottom drawer on phone and keeps every other placement', () => {
		const wrong = cases
			.filter((input) => input.viewport === 'phone')
			.filter((input) => {
				const phone = resolveLayout(input);
				const desktop = resolveLayout({ ...input, viewport: 'desktop' });
				const expected =
					desktop.placement === 'drawer-left' ||
					desktop.placement === 'drawer-right'
						? 'drawer-bottom'
						: desktop.placement;
				return (
					phone.placement !== expected ||
					phone.blocking !== desktop.blocking ||
					phone.edgeStyle !== desktop.edgeStyle
				);
			});
		expect(wrong).toEqual([]);
	});

	it('keeps a card inset and passes edge style through to banners and drawers', () => {
		const wrong = cases.filter((input) => {
			const result = resolveLayout(input);
			const edgeStyle =
				result.type === 'card' ? 'inset' : (input.edgeStyle ?? 'inset');
			return (
				!result.placement.startsWith(result.type) ||
				result.edgeStyle !== edgeStyle
			);
		});
		expect(wrong).toEqual([]);
	});

	it('defaults to a bottom-left card, inset, not blocking', () => {
		expect(resolveLayout(EU)).toEqual({
			blocking: false,
			diagnostics: [],
			edgeStyle: 'inset',
			flow: 'expand-in-place',
			placement: 'card-bottom-left',
			type: 'card',
		});
	});
});

describe('resolveLayout: named rules', () => {
	it('[BNR-13] never blocks under US opt-out, even with blockUntilChoice', () => {
		for (const regime of [US_OPT_OUT_NONE, US_OPT_OUT_NOTICE]) {
			const result = resolveLayout({ ...regime, blockUntilChoice: true });
			expect(result.blocking).toBe(false);
			expect(result.diagnostics.map((d) => d.code)).toEqual([
				'blocking-forbidden',
			]);
		}
	});

	it('[BNR-13] a centred card under US opt-out falls back to bottom-left', () => {
		const result = resolveLayout({
			...US_OPT_OUT_NOTICE,
			container: { position: 'center', type: 'card' },
		});
		expect(result.placement).toBe('card-bottom-left');
		expect(result.blocking).toBe(false);
	});

	it('blocks an EU choice when blockUntilChoice is set', () => {
		expect(resolveLayout({ ...EU, blockUntilChoice: true }).blocking).toBe(
			true
		);
	});

	it('a required policy blocks even when the host turns blocking off', () => {
		const result = resolveLayout({
			...EU,
			blockUntilChoice: false,
			blockingConstraint: 'required',
		});
		expect(result.blocking).toBe(true);
		expect(result.diagnostics.map((d) => d.code)).toEqual([
			'blocking-required',
		]);
	});

	it('a forbidden policy wins over a centred card', () => {
		const result = resolveLayout({
			...EU,
			blockingConstraint: 'forbidden',
			container: { position: 'center', type: 'card' },
		});
		expect(result.placement).toBe('card-bottom-left');
		expect(result.blocking).toBe(false);
	});

	it('a top drawer stays on top on phone', () => {
		const result = resolveLayout({
			...EU,
			container: { side: 'top', type: 'drawer' },
			viewport: 'phone',
		});
		expect(result.placement).toBe('drawer-top');
		expect(result.flow).toBe('expand-in-place');
	});

	it('a right drawer expands in place from the bottom on phone', () => {
		const result = resolveLayout({
			...EU,
			container: { side: 'right', type: 'drawer' },
			viewport: 'phone',
		});
		expect(result.placement).toBe('drawer-bottom');
		expect(result.flow).toBe('expand-in-place');
	});

	it('reports a flush card and keeps it inset', () => {
		const result = resolveLayout({ ...EU, edgeStyle: 'flush' });
		expect(result.edgeStyle).toBe('inset');
		expect(result.diagnostics.map((d) => d.code)).toEqual([
			'edge-style-ignored',
		]);
	});

	it('replaces an invalid container with its default and reports it', () => {
		const result = resolveLayout({
			...EU,
			container: { side: 'middle', type: 'drawer' } as never,
		});
		expect(result.placement).toBe('drawer-bottom');
		expect(result.diagnostics.map((d) => d.code)).toEqual([
			'invalid-container',
		]);
		expect(
			resolveLayout({ ...EU, container: { type: 'modal' } as never }).placement
		).toBe('card-bottom-left');
	});

	it('uses a 640px phone breakpoint', () => {
		expect(PHONE_LAYOUT_QUERY).toBe('(max-width: 640px)');
	});
});

describe('containerFromLegacyPrompt', () => {
	it.each([
		[{}, { position: 'bottom-left', type: 'card' }],
		[{ variant: 'floating' }, { position: 'bottom-left', type: 'card' }],
		[
			{ position: 'bottom-right', variant: 'floating' },
			{ position: 'bottom-right', type: 'card' },
		],
		[{ variant: 'widget' }, { position: 'bottom-right', type: 'card' }],
		[
			{ position: 'bottom-left', variant: 'widget' },
			{ position: 'bottom-left', type: 'card' },
		],
		[{ variant: 'bar' }, { edge: 'bottom', type: 'banner' }],
		[
			{ position: 'top', variant: 'bar' },
			{ edge: 'top', type: 'banner' },
		],
		[{ variant: 'wall' }, { position: 'center', type: 'card' }],
	] as const)('maps %j to %j', (legacy, container) => {
		const result = containerFromLegacyPrompt(legacy);
		expect(result.container).toEqual(container);
		expect(result.diagnostics).toEqual([]);
	});

	it.each(['top-left', 'top-right', 'top-center', 'bottom-center'])(
		'maps a floating %s card to bottom-left and reports it',
		(position) => {
			const result = containerFromLegacyPrompt({
				position,
				variant: 'floating',
			});
			expect(result.container).toEqual({
				position: 'bottom-left',
				type: 'card',
			});
			expect(result.diagnostics.map((d) => d.code)).toEqual([
				'legacy-presentation',
			]);
		}
	);
});

describe('resolveConsentPresentation: container', () => {
	const choice = normalizePolicyRule({
		id: 'choice',
		match: { fallback: true },
		model: 'opt-in',
		prompt: 'choice',
	});
	const notice = normalizePolicyRule({
		id: 'notice',
		match: { fallback: true },
		model: 'opt-out',
		prompt: 'notice',
	});

	it('is null on the preferences surface', () => {
		expect(
			resolveConsentPresentation({ policy: choice, surface: 'preferences' })
				.container
		).toBeNull();
	});

	it('defaults the prompt to a bottom-left card on both viewports', () => {
		const { container } = resolveConsentPresentation({
			policy: choice,
			surface: 'prompt',
		});
		expect(container?.desktop.placement).toBe('card-bottom-left');
		expect(container?.phone.placement).toBe('card-bottom-left');
	});

	it('resolves a host drawer per viewport', () => {
		const { container } = resolveConsentPresentation({
			policy: choice,
			presentation: {
				prompt: { container: { side: 'left', type: 'drawer' } },
			},
			surface: 'prompt',
		});
		expect(container?.desktop).toMatchObject({
			flow: 'all-in-one',
			placement: 'drawer-left',
		});
		expect(container?.phone).toMatchObject({
			flow: 'expand-in-place',
			placement: 'drawer-bottom',
		});
	});

	it('maps the legacy variant when no container is set', () => {
		const { container, variant } = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { position: 'top', variant: 'bar' } },
			surface: 'prompt',
		});
		expect(variant).toBe('bar');
		expect(container?.desktop.placement).toBe('banner-top');
	});

	it('maps a legacy wall to a blocking centred card', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { variant: 'wall' } },
			surface: 'prompt',
		});
		expect(result.blocking).toBe(true);
		expect(result.container?.desktop).toMatchObject({
			blocking: true,
			placement: 'card-center',
		});
	});

	it('maps legacy blocking onto blockUntilChoice', () => {
		const { container } = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { blocking: true } },
			surface: 'prompt',
		});
		expect(container?.desktop.blocking).toBe(true);
	});

	it('lets a component override pick the container', () => {
		const { container } = resolveConsentPresentation({
			override: { container: { edge: 'bottom', type: 'banner' } },
			policy: choice,
			presentation: { prompt: { container: { type: 'card' } } },
			surface: 'prompt',
		});
		expect(container?.desktop.placement).toBe('banner-bottom');
	});

	it('[BNR-13] never blocks a notice, even for a legacy wall', () => {
		const { container } = resolveConsentPresentation({
			policy: notice,
			presentation: { prompt: { blockUntilChoice: true, variant: 'wall' } },
			surface: 'prompt',
		});
		expect(container?.desktop).toMatchObject({
			blocking: false,
			placement: 'card-bottom-left',
		});
	});
});
