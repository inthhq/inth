/**
 * The old prompt geometry API, for the adapters that still read it.
 *
 * React reads `container`. Vue, Svelte, Angular, Astro, the script tag and
 * the dev tools still read the old `variant`, `position` and `design`
 * fields, so they resolve through `resolveLegacyConsentPresentation` until
 * they move to `container` too. Nothing here is public API.
 *
 * @deprecated temporary — removed in phase B
 * @internal
 */
import type { ConsentContainer } from './consent-layout';
import { resolveConsentPresentation } from './policy-actions';
import type {
	ConsentPresentation,
	PreferencesPresentation,
	PromptPresentation,
	ResolvedConsentPresentation,
} from './policy-actions';

/** @deprecated temporary — removed in phase B */
export type PromptVariant = 'floating' | 'bar' | 'widget' | 'wall';

/** @deprecated temporary — removed in phase B */
export type PromptPosition =
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right'
	| 'bottom-center'
	| 'top-center'
	| 'top'
	| 'bottom'
	| 'center';

/** @deprecated temporary — removed in phase B */
export type ConsentDesign = 'privacy-choices';

/**
 * There is one consent UI now.
 * @deprecated temporary — removed in phase B
 */
export const resolveConsentDesign = function resolveConsentDesign(
	_presentation?: unknown,
	_override?: unknown
): ConsentDesign {
	return 'privacy-choices';
};

/** @deprecated temporary — removed in phase B */
interface LegacyGeometry {
	variant?: PromptVariant;
	position?: PromptPosition;
	scrollLock?: boolean;
	trapFocus?: boolean;
}

/** @deprecated temporary — removed in phase B */
export type LegacyPromptPresentation = PromptPresentation & LegacyGeometry;

/** @deprecated temporary — removed in phase B */
export type LegacyPreferencesPresentation = PreferencesPresentation &
	LegacyGeometry;

/** @deprecated temporary — removed in phase B */
export interface LegacyConsentPresentation extends Omit<
	ConsentPresentation,
	'prompt' | 'preferences'
> {
	design?: string;
	prompt?: LegacyPromptPresentation;
	preferences?: LegacyPreferencesPresentation;
}

/** @deprecated temporary — removed in phase B */
export interface LegacyPresentationFields {
	design: ConsentDesign;
	variant: PromptVariant;
	position: PromptPosition;
	positionSource: 'host' | 'default';
	scrollLock: boolean;
	trapFocus: boolean;
}

/** @deprecated temporary — removed in phase B */
export type LegacyResolvedConsentPresentation = ResolvedConsentPresentation &
	LegacyPresentationFields;

/** The container an old `variant` and `position` described. */
const containerOf = function containerOf(
	variant: PromptVariant | undefined,
	position: PromptPosition | undefined
): ConsentContainer {
	switch (variant) {
		case 'bar':
			return { edge: position === 'top' ? 'top' : 'bottom', type: 'banner' };
		case 'wall':
			return { position: 'center', type: 'card' };
		default:
			if (position === undefined) {
				return {
					position: variant === 'widget' ? 'end' : 'start',
					type: 'card',
				};
			}
			return {
				position: position.endsWith('-right') ? 'end' : 'start',
				type: 'card',
			};
	}
};

/** Map one tier's old fields onto `container` and `blocking`. */
const modernize = function modernize<T extends LegacyGeometry>(
	tier: T | undefined,
	surface: 'prompt' | 'preferences'
): Omit<T, keyof LegacyGeometry> | undefined {
	if (tier === undefined) {
		return undefined;
	}
	const { variant, position, scrollLock, trapFocus, ...rest } = tier;
	const next: Record<string, unknown> = { ...rest };
	const legacyBlocking =
		scrollLock === false || trapFocus === false
			? false
			: (scrollLock ?? trapFocus);
	if (next.blocking === undefined && legacyBlocking !== undefined) {
		next.blocking = legacyBlocking;
	}
	if (
		surface === 'prompt' &&
		next.container === undefined &&
		(variant !== undefined || position !== undefined)
	) {
		next.container = containerOf(variant, position);
	}
	return next as Omit<T, keyof LegacyGeometry>;
};

/** The old fields, read back from the resolved container. */
const legacyFieldsOf = function legacyFieldsOf(
	resolved: ResolvedConsentPresentation,
	hostPosition: boolean
): LegacyPresentationFields {
	const base = {
		design: 'privacy-choices' as const,
		positionSource: hostPosition ? ('host' as const) : ('default' as const),
		scrollLock: resolved.blocking,
		trapFocus: resolved.blocking,
	};
	switch (resolved.container?.desktop.placement) {
		case undefined:
		case 'card-center':
			return { ...base, position: 'center', variant: 'wall' };
		case 'banner-top':
			return { ...base, position: 'top', variant: 'bar' };
		case 'banner-bottom':
			return { ...base, position: 'bottom', variant: 'bar' };
		case 'card-end':
			return { ...base, position: 'bottom-right', variant: 'floating' };
		default:
			return { ...base, position: 'bottom-left', variant: 'floating' };
	}
};

/**
 * `resolveConsentPresentation` for adapters that still pass and read the
 * old `variant`, `position`, `scrollLock`, `trapFocus` and `design`.
 * @deprecated temporary — removed in phase B
 */
export const resolveLegacyConsentPresentation =
	function resolveLegacyConsentPresentation(input: {
		policy: Parameters<typeof resolveConsentPresentation>[0]['policy'];
		surface: 'prompt' | 'preferences';
		presentation?: LegacyConsentPresentation;
		override?: LegacyPromptPresentation | LegacyPreferencesPresentation;
		actionAppearance?: Parameters<
			typeof resolveConsentPresentation
		>[0]['actionAppearance'];
	}): LegacyResolvedConsentPresentation {
		const { design: _design, ...presentation } = input.presentation ?? {};
		const resolved = resolveConsentPresentation({
			actionAppearance: input.actionAppearance,
			override: modernize(input.override, input.surface),
			policy: input.policy,
			presentation: input.presentation
				? {
						...presentation,
						preferences: modernize(presentation.preferences, 'preferences'),
						prompt: modernize(presentation.prompt, 'prompt'),
					}
				: undefined,
			surface: input.surface,
		});
		const hostPosition =
			input.override?.position !== undefined ||
			input.presentation?.prompt?.position !== undefined;
		return { ...resolved, ...legacyFieldsOf(resolved, hostPosition) };
	};
