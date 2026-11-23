/** Resolve host presentation under the active policy constraints. */
import { canPolicyBlock } from '@inth/sdk-schema/types';
import type {
	PolicyConsentCategory,
	PolicyRight,
	ResolvedPolicyRule,
} from '@inth/sdk-schema/types';

import type { OptOutLinkVariant } from './consent-copy';
import { containerFromLegacyPrompt, resolveLayout } from './consent-layout';
import type {
	ConsentBlockingConstraint,
	ConsentContainer,
	ConsentLayoutDiagnostic,
	ConsentLayoutOptions,
	ResolvedConsentLayout,
} from './consent-layout';

/** Semantic control roles, independent of their visual variant. */
export type PresentationAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

/** Shape of a prompt surface. Structure only; tokens style it. */
export type PromptVariant = 'floating' | 'bar' | 'widget' | 'wall';

/** Corners and edge centers a floating card may occupy. */
export type FloatingPromptPosition =
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right'
	| 'bottom-center'
	| 'top-center';

/** Viewport edges a full-width bar may occupy. */
export type BarPromptPosition = 'top' | 'bottom';

/** Corners a compact widget may occupy. */
export type WidgetPromptPosition =
	| 'bottom-left'
	| 'bottom-right'
	| 'top-left'
	| 'top-right';

/** A wall always sits in the middle of the viewport. */
export type WallPromptPosition = 'center';

/** Every position any variant accepts. Validity depends on the variant. */
export type PromptPosition =
	| FloatingPromptPosition
	| BarPromptPosition
	| WidgetPromptPosition
	| WallPromptPosition;

/** Positions each variant accepts. Anything else falls back with a diagnostic. */
export const PROMPT_VARIANT_POSITIONS = {
	bar: ['top', 'bottom'],
	floating: [
		'bottom-left',
		'bottom-right',
		'top-left',
		'top-right',
		'bottom-center',
		'top-center',
	],
	wall: ['center'],
	widget: ['bottom-left', 'bottom-right', 'top-left', 'top-right'],
} as const satisfies Record<PromptVariant, readonly PromptPosition[]>;

/** Position used when the host supplies none for the variant. */
export const PROMPT_VARIANT_DEFAULT_POSITION = {
	bar: 'bottom',
	floating: 'bottom-left',
	wall: 'center',
	widget: 'bottom-right',
} as const satisfies Record<PromptVariant, PromptPosition>;

/** Host layout and visual choices for a consent surface. */
export interface SurfacePresentation {
	layout?: readonly (PresentationAction | readonly PresentationAction[])[];
	primaryActions?: readonly PresentationAction[];
	/** @default 'row' */
	direction?: 'row' | 'column';
	/**
	 * `compact` sizes buttons to their labels. `balanced` and `strict`
	 * stretch every button to the full width and stack the groups.
	 * @default 'compact'
	 */
	uiProfile?: 'balanced' | 'compact' | 'strict';
	/** @deprecated Use `blocking` to control scroll, focus and backdrop together. */
	scrollLock?: boolean;
	/** @deprecated Use `blocking` to control scroll, focus and backdrop together. */
	trapFocus?: boolean;
	/**
	 * Controls backdrop, scroll lock and focus trapping together. Explicit
	 * `blocking` takes precedence over the deprecated scroll/focus options,
	 * and `blockUntilChoice` over all three. Notices never block. Choice
	 * walls always block; where the policy forbids blocking, a wall becomes
	 * floating. Preferences default to blocking; other prompts default to
	 * non-blocking.
	 */
	blocking?: boolean;
}

/** Presentation of the first interaction required by a policy. */
export interface PromptPresentation
	extends SurfacePresentation, ConsentLayoutOptions {
	/**
	 * Shape of the prompt. Defaults to `floating`. A notice cannot use `wall`.
	 * Ignored by the resolved `container` when `container` is set.
	 */
	variant?: PromptVariant;
	/**
	 * Where the surface sits. Must be valid for the resolved variant; an
	 * invalid pair falls back to the variant default with a diagnostic.
	 */
	position?: PromptPosition;
}

/** Presentation of persistent category preferences. */
export interface PreferencesPresentation extends SurfacePresentation {
	/** Initial displayed selections for categories without an explicit receipt. */
	defaults?: Partial<Record<PolicyConsentCategory, boolean>>;
}

/**
 * Which consent UI the stock components render. `classic` is today's
 * banner and dialog. `privacy-choices` is the v6 surface: Card, Banner or
 * Drawer, with the options expanding in place.
 */
export type ConsentDesign = 'classic' | 'privacy-choices';

/**
 * Application-owned presentation; never part of a policy fingerprint. It
 * overrides the policy's `surface` layout defaults, but not its blocking
 * constraint.
 */
export interface ConsentPresentation {
	/**
	 * The consent UI to render. Setting `prompt.container` chooses
	 * `privacy-choices` too, since only that design reads it; an explicit
	 * value always wins.
	 * @default 'classic'
	 */
	design?: ConsentDesign;
	prompt?: PromptPresentation;
	preferences?: PreferencesPresentation;
	/**
	 * Opt-out link form when the active policy carries the `opt-out` right.
	 * `'privacy-choices'` and `'california-privacy-choices'` always render
	 * with the CPPA opt-out icon.
	 * @default 'do-not-sell'
	 */
	optOutLink?: OptOutLinkVariant;
}

/** Mechanical findings for headless hosts and development diagnostics. */
export interface PresentationDiagnostic {
	code:
		| 'forbidden-action'
		| 'required-action-restored'
		| 'equivalent-prominence-overridden'
		| 'invalid-variant'
		| 'invalid-position'
		| 'blocking-forbidden'
		| 'blocking-required';
	actions: PresentationAction[];
	message: string;
}

/** Resolved controls and behavioral constraints for one surface. */
export interface ResolvedConsentPresentation {
	allowedActions: PresentationAction[];
	requiredActions: PresentationAction[];
	equivalentActions: PresentationAction[][];
	orderedActions: PresentationAction[];
	actionGroups: PresentationAction[][];
	primaryActions: PresentationAction[];
	diagnostics: PresentationDiagnostic[];
	rights: readonly PolicyRight[];
	/**
	 * Additional buttons the stock UI renders to open preferences. The value
	 * selects the label; every button opens the same preference center.
	 * This is a rendering recommendation, not verification of policy rights.
	 * Hosts remain responsible for disclosure and persistent access.
	 */
	preferenceControls: Exclude<PolicyRight, 'disclosure'>[];
	/** Resolved opt-out link form. Defaults to `'do-not-sell'`. */
	optOutLink: OptOutLinkVariant;
	/**
	 * The consent UI the stock components render: the host's `design`, else
	 * `privacy-choices` when the host set a prompt `container`, else
	 * `classic`.
	 */
	design: ConsentDesign;
	direction: 'row' | 'column';
	uiProfile: 'balanced' | 'compact' | 'strict';
	scrollLock: boolean;
	trapFocus: boolean;
	shouldFillActions: boolean;
	/** Resolved shape of the surface. */
	variant: PromptVariant;
	/** Resolved position, always valid for `variant`. */
	position: PromptPosition;
	/**
	 * `host` when the position came from presentation or an override,
	 * `default` when the variant default filled it. Adapters may mirror a
	 * defaulted corner for right-to-left text; a host position is final.
	 */
	positionSource: 'host' | 'default';
	/** Backdrop, scroll lock, focus trap and no outside dismissal, resolved. */
	blocking: boolean;
	/**
	 * Card, Banner or Drawer layout for the prompt, resolved for desktop and
	 * for phone (see `PHONE_LAYOUT_QUERY`). Built from `container`, or from
	 * the legacy `variant` and `position` when `container` is absent. `null`
	 * on the preferences surface.
	 *
	 * Renderers that read `container` take its `blocking`, not the top-level
	 * `blocking`. Both read the same blocking request and the same policy
	 * constraint, so they agree on it. Where the policy forbids blocking, as
	 * under an opt-out model, a legacy `wall` resolves to `floating` and
	 * maps to a `start` card, and neither blocks (BNR-13).
	 */
	container: {
		desktop: ResolvedConsentLayout;
		phone: ResolvedConsentLayout;
	} | null;
}

/**
 * Layout used when the host supplies none: reject and accept share one
 * group at equal prominence, and every other allowed action (customize on
 * the prompt, save in preferences, dismiss on a notice) follows on its
 * own. With the default `compact` profile and customize as the default
 * primary, that renders as `[reject] [accept] ---- [customize]` on one row.
 */
const defaultLayout = function defaultLayout(
	allowedActions: PresentationAction[]
): NonNullable<SurfacePresentation['layout']> {
	const choicePair: PresentationAction[] = ['reject', 'accept'].filter(
		(action): action is PresentationAction =>
			allowedActions.includes(action as PresentationAction)
	);
	const rest = allowedActions.filter((action) => !choicePair.includes(action));
	return choicePair.length > 0 ? [choicePair, ...rest] : rest;
};

const resolveRequiredGroups = function resolveRequiredGroups(
	allowedActions: PresentationAction[],
	requiredActions: PresentationAction[],
	suppliedLayout: SurfacePresentation['layout'],
	diagnostics: PresentationDiagnostic[]
): PresentationAction[][] {
	const seen = new Set<PresentationAction>();
	const actionGroups: PresentationAction[][] = [];
	const layout = suppliedLayout ?? defaultLayout(allowedActions);
	for (const entry of layout) {
		const group: PresentationAction[] = [];
		for (const action of typeof entry === 'string' ? [entry] : entry) {
			if (!allowedActions.includes(action)) {
				diagnostics.push({
					actions: [action],
					code: 'forbidden-action',
					message: `The policy does not allow ${action} on this surface.`,
				});
			} else if (!seen.has(action)) {
				seen.add(action);
				group.push(action);
			}
		}
		if (group.length) {
			actionGroups.push(group);
		}
	}
	const missing = requiredActions.filter((action) => !seen.has(action));
	if (missing.length) {
		if (!actionGroups.length) {
			actionGroups.push([]);
		}
		actionGroups[0]?.push(...missing);
		diagnostics.push({
			actions: missing,
			code: 'required-action-restored',
			message:
				'Required actions omitted by the layout were restored at the same interaction depth.',
		});
	}

	return actionGroups;
};

/**
 * Choose an additional preferences button when the action row needs one.
 * These labels do not establish that the host implements a policy right.
 */
const resolvePreferenceControls = function resolvePreferenceControls(
	rights: readonly PolicyRight[],
	orderedActions: readonly PresentationAction[],
	preferences: boolean,
	messageProfile?: string
): ResolvedConsentPresentation['preferenceControls'] {
	if (preferences) {
		return [];
	}
	if (rights.includes('opt-out') && !orderedActions.includes('reject')) {
		return [messageProfile === 'preferences' ? 'preferences' : 'opt-out'];
	}
	return rights.includes('preferences') && !orderedActions.includes('customize')
		? ['preferences']
		: [];
};

/**
 * Blocking the host asked for, reading the deprecated scroll and focus
 * options when `blocking` is absent. Legacy controls select one mode,
 * never independent partial modes.
 */
const requestedBlocking = function requestedBlocking(
	options: SurfacePresentation
): boolean | undefined {
	const legacyBlocking =
		options.scrollLock === false || options.trapFocus === false
			? false
			: (options.scrollLock ?? options.trapFocus);
	return options.blocking ?? legacyBlocking;
};

/**
 * The blocking the host asks for. An explicit request (`blockUntilChoice`,
 * then `blocking`) wins in tier order: the override first, then the
 * provider's presentation. Only when no tier asks explicitly do the
 * deprecated `scrollLock` and `trapFocus` decide, again override first. So
 * a provider's `blockUntilChoice: false` never beats an override's
 * `blocking: true`, and explicit `blocking` always beats the deprecated
 * options, whichever tier carries them.
 */
const requestedTierBlocking = function requestedTierBlocking(
	override: PromptPresentation,
	presentation: ConsentPresentation | undefined,
	surface: 'prompt' | 'preferences'
): boolean | undefined {
	const tiers = [override, presentation?.[surface]].filter(
		(tier): tier is PromptPresentation => tier !== undefined
	);
	for (const tier of tiers) {
		const explicit = tier.blockUntilChoice ?? tier.blocking;
		if (explicit !== undefined) {
			return explicit;
		}
	}
	for (const tier of tiers) {
		const legacy = requestedBlocking({ ...tier, blocking: undefined });
		if (legacy !== undefined) {
			return legacy;
		}
	}
	return undefined;
};

/**
 * The policy's blocking constraint on the prompt. A rule that cannot block
 * (a notice, or the opt-out model) forbids it, which is what its canonical
 * `surface` leaves implied.
 */
const policyBlockingConstraint = function policyBlockingConstraint(
	policy: ResolvedPolicyRule
): ConsentBlockingConstraint {
	if (!canPolicyBlock(policy)) {
		return 'forbidden';
	}
	return policy.surface?.blocking ?? 'allowed';
};

/**
 * Resolve focus, scrolling and backdrop as one mode. On the prompt, the
 * policy's constraint wins over the host: `forbidden` never blocks, and
 * `required` always blocks.
 */
const resolveBlocking = (
	requested: boolean | undefined,
	variant: PromptVariant,
	notice: boolean,
	preferences: boolean,
	constraint: ConsentBlockingConstraint,
	diagnostics: PresentationDiagnostic[]
): boolean => {
	let blocking = requested ?? (preferences || variant === 'wall');
	if (notice && blocking) {
		blocking = false;
		diagnostics.push({
			actions: [],
			code: 'blocking-forbidden',
			message: 'A notice prompt is never blocking; blocking was disabled.',
		});
	} else if (!preferences && constraint === 'forbidden' && blocking) {
		blocking = false;
		diagnostics.push({
			actions: [],
			code: 'blocking-forbidden',
			message: 'The policy forbids blocking; blocking was disabled.',
		});
	} else if (!preferences && constraint === 'required' && !blocking) {
		blocking = true;
		// Report it only when the host turned blocking off.
		if (requested === false) {
			diagnostics.push({
				actions: [],
				code: 'blocking-required',
				message: 'The policy requires blocking; blocking was enabled.',
			});
		}
	} else if (!preferences && variant === 'wall' && !blocking) {
		blocking = true;
		diagnostics.push({
			actions: [],
			code: 'blocking-required',
			message: 'The wall variant is always blocking; blocking was enabled.',
		});
	}
	return blocking;
};

const isValidPromptPosition = function isValidPromptPosition(
	variant: PromptVariant,
	position: PromptPosition
): boolean {
	return (PROMPT_VARIANT_POSITIONS[variant] as readonly string[]).includes(
		position
	);
};

/**
 * Resolve the surface geometry. The policy's hard constraint comes first:
 * where it forbids blocking, a `wall` becomes `floating`, so no renderer
 * draws a wall that does not block. Then the variant, then the position,
 * validated against it, then blocking, forced by the prompt kind or, on
 * the prompt surface, by the constraint and the variant.
 */
const resolveSurfaceGeometry = function resolveSurfaceGeometry(
	options: PromptPresentation,
	requested: boolean | undefined,
	notice: boolean,
	preferences: boolean,
	constraint: ConsentBlockingConstraint,
	diagnostics: PresentationDiagnostic[]
): Pick<
	ResolvedConsentPresentation,
	'variant' | 'position' | 'positionSource' | 'blocking'
> {
	const defaultVariant: PromptVariant = preferences ? 'wall' : 'floating';
	let variant = preferences
		? defaultVariant
		: (options.variant ?? defaultVariant);
	if (notice && variant === 'wall') {
		variant = 'floating';
		diagnostics.push({
			actions: [],
			code: 'invalid-variant',
			message: 'A notice cannot use a blocking wall; using floating.',
		});
	} else if (!preferences && constraint === 'forbidden' && variant === 'wall') {
		variant = 'floating';
		diagnostics.push({
			actions: [],
			code: 'blocking-forbidden',
			message:
				'The policy forbids blocking, and a wall always blocks; using floating.',
		});
	}
	if (
		preferences &&
		(options.variant !== undefined || options.position !== undefined)
	) {
		diagnostics.push({
			actions: [],
			code: 'invalid-variant',
			message:
				'Preferences use a centered dialog; variant and position are prompt options.',
		});
	}
	const defaultPosition = PROMPT_VARIANT_DEFAULT_POSITION[variant];
	let position: PromptPosition = defaultPosition;
	let positionSource: 'host' | 'default' = 'default';
	if (!preferences && options.position !== undefined) {
		if (isValidPromptPosition(variant, options.position)) {
			({ position } = options);
			positionSource = 'host';
		} else {
			diagnostics.push({
				actions: [],
				code: 'invalid-position',
				message: `Position "${options.position}" is not valid for the ${variant} variant; using "${defaultPosition}".`,
			});
		}
	}
	const blocking = resolveBlocking(
		requested,
		variant,
		notice,
		preferences,
		constraint,
		diagnostics
	);
	return { blocking, position, positionSource, variant };
};

/**
 * The container one host tier asks for: its `container`, else its legacy
 * `variant` or `position` mapped onto one, else nothing, so the next tier
 * decides. The legacy mapping reads the validated geometry, which merges
 * every tier the way the shipped renderers read it.
 */
const tierContainer = function tierContainer(
	tier: PromptPresentation | undefined,
	geometry: Pick<ResolvedConsentPresentation, 'variant' | 'position'>
):
	| { container: ConsentContainer; diagnostics: ConsentLayoutDiagnostic[] }
	| undefined {
	if (tier === undefined) {
		return undefined;
	}
	if (tier.container !== undefined) {
		return { container: tier.container, diagnostics: [] };
	}
	return tier.variant !== undefined || tier.position !== undefined
		? containerFromLegacyPrompt(geometry)
		: undefined;
};

/**
 * Resolve the prompt's Card, Banner or Drawer layout for both viewports.
 *
 * Precedence, highest first:
 *
 * 1. The policy's `surface.blocking`, a hard constraint `resolveLayout`
 *    applies whatever the host asks for.
 * 2. An experiment arm or component override.
 * 3. The provider's `presentation`.
 * 4. The policy's `surface.container` and `surface.edgeStyle`, soft
 *    defaults for installs without host presentation.
 * 5. The SDK default, an inset Card in the `start` corner.
 *
 * The container is decided within each tier before the next one is read:
 * a tier's `container`, else its legacy `variant` or `position` mapped onto
 * a container. So an override's legacy `variant` beats a provider's
 * `container`, and a provider's legacy geometry beats the policy's
 * container. Edge style arrives merged in `options`; the blocking request
 * arrives decided per tier, the same value the top-level `blocking` reads.
 * Legacy `blocking`, `scrollLock` and `trapFocus` map onto
 * `blockUntilChoice`.
 */
const resolvePromptContainer = function resolvePromptContainer(
	surface: 'prompt' | 'preferences',
	options: PromptPresentation,
	requested: boolean | undefined,
	override: PromptPresentation,
	presentation: ConsentPresentation | undefined,
	policy: ResolvedPolicyRule,
	geometry: Pick<ResolvedConsentPresentation, 'variant' | 'position'>
): ResolvedConsentPresentation['container'] {
	if (surface === 'preferences') {
		return null;
	}
	let host:
		| { container: ConsentContainer; diagnostics: ConsentLayoutDiagnostic[] }
		| undefined;
	for (const tier of [override, presentation?.prompt]) {
		host = tierContainer(tier, geometry);
		if (host) {
			break;
		}
	}
	// A malformed `null` is forwarded so the resolver reports it.
	const container: ConsentContainer | undefined = host
		? host.container
		: policy.surface?.container;
	// The policy's edge style is a default for banners and drawers. A card
	// is always inset, so on a card it stays silent instead of reporting
	// `edge-style-ignored` for a choice the host never made.
	const policyEdgeStyle =
		typeof container === 'object' &&
		container !== null &&
		container.type !== 'card'
			? policy.surface?.edgeStyle
			: undefined;
	const input = {
		blockUntilChoice: requested,
		blockingConstraint: policy.surface?.blocking,
		container,
		edgeStyle: options.edgeStyle ?? policyEdgeStyle,
		model: policy.model,
		prompt: policy.prompt,
	};
	const desktop = resolveLayout({ ...input, viewport: 'desktop' });
	const phone = resolveLayout({ ...input, viewport: 'phone' });
	const legacyDiagnostics = host?.diagnostics ?? [];
	desktop.diagnostics.unshift(...legacyDiagnostics.map((d) => ({ ...d })));
	phone.diagnostics.unshift(...legacyDiagnostics.map((d) => ({ ...d })));
	return { desktop, phone };
};

/**
 * The consent UI to render. An explicit `design` wins. Otherwise a prompt
 * `container` from the host, in `presentation` or in a component override,
 * opts in to `privacy-choices`, since only that design reads it.
 */
export const resolveConsentDesign = function resolveConsentDesign(
	presentation: ConsentPresentation | undefined,
	override?: PromptPresentation | PreferencesPresentation
): ConsentDesign {
	const requested = presentation?.design;
	if (requested === 'classic' || requested === 'privacy-choices') {
		return requested;
	}
	const container =
		(override as PromptPresentation | undefined)?.container ??
		presentation?.prompt?.container;
	return container === undefined ? 'classic' : 'privacy-choices';
};

/**
 * Resolve host presentation without changing policy behavior.
 * @param input - Active policy, target surface, host options and local overrides.
 * @returns Ordered controls, required actions, rights and diagnostics.
 */
export const resolveConsentPresentation =
	function resolveConsentPresentation(input: {
		policy: ResolvedPolicyRule;
		surface: 'prompt' | 'preferences';
		presentation?: ConsentPresentation;
		override?: PromptPresentation | PreferencesPresentation;
		/** Host appearance tokens after theme resolution, used to check equivalent prominence. */
		actionAppearance?: Partial<
			Record<PresentationAction, { variant?: string; mode?: string }>
		>;
	}): ResolvedConsentPresentation {
		const preferences = input.surface === 'preferences';
		const override: PromptPresentation = Object.fromEntries(
			Object.entries(input.override ?? {}).filter(
				([, value]) => value !== undefined
			)
		);
		const options: PromptPresentation = {
			...input.presentation?.[input.surface],
			...override,
		};
		// Prompt actions constrain the first layer; persistent preferences are a separate right.
		const constraints = preferences
			? {
					allowed: ['reject', 'accept', 'save'] satisfies PresentationAction[],
					equivalent: [['accept', 'reject']] satisfies PresentationAction[][],
					required: ['reject', 'accept', 'save'] satisfies PresentationAction[],
				}
			: input.policy.actions;
		const allowedActions: PresentationAction[] = [
			...new Set(constraints.allowed),
		];
		const requiredActions: PresentationAction[] = [
			...new Set(constraints.required),
		];
		const equivalentActions: PresentationAction[][] =
			constraints.equivalent.map((group) => [...group]);
		const diagnostics: PresentationDiagnostic[] = [];
		const actionGroups = resolveRequiredGroups(
			allowedActions,
			requiredActions,
			options.layout,
			diagnostics
		);
		const orderedActions = actionGroups.flat();
		// Customize is the default primary on the prompt so reject and accept
		// stay neutral together; preferences lead with save.
		const defaultPrimary: PresentationAction[] = preferences
			? ['save']
			: ['customize'];
		const hostPrimary = (options.primaryActions ?? defaultPrimary).filter(
			(action) => orderedActions.includes(action)
		);
		// A notice never offers customize, so it would resolve with nothing
		// primary. A lone dismiss leads instead.
		const primaryActions =
			hostPrimary.length === 0 &&
			orderedActions.length === 1 &&
			orderedActions[0] === 'dismiss'
				? ['dismiss' as const]
				: hostPrimary;
		for (const group of equivalentActions) {
			const primaryCount = group.filter((action) =>
				primaryActions.includes(action)
			).length;
			const appearances = new Set(
				group.map((action) => {
					const style = input.actionAppearance?.[action];
					return `${style?.variant ?? (primaryActions.includes(action) ? 'primary' : 'neutral')}:${style?.mode ?? 'stroke'}`;
				})
			);
			if (
				(primaryCount > 0 && primaryCount < group.length) ||
				appearances.size > 1
			) {
				diagnostics.push({
					actions: [...group],
					code: 'equivalent-prominence-overridden',
					message:
						'Host presentation gives equivalent actions different prominence.',
				});
			}
		}
		const notice = !preferences && input.policy.prompt === 'notice';
		const direction = options.direction ?? 'row';
		// `compact` sizes buttons to their labels so the default split layout
		// reads as one row; `balanced` and `strict` fill and stack instead.
		const uiProfile = options.uiProfile ?? 'compact';
		// One blocking request for both the top-level `blocking` and the
		// container, so the two agree on what the host asked for.
		const requested = requestedTierBlocking(
			override,
			input.presentation,
			input.surface
		);
		const geometry = resolveSurfaceGeometry(
			options,
			requested,
			notice,
			preferences,
			policyBlockingConstraint(input.policy),
			diagnostics
		);
		const scrollLock = geometry.blocking;
		const trapFocus = geometry.blocking;
		return {
			...geometry,
			actionGroups,
			allowedActions,
			container: resolvePromptContainer(
				input.surface,
				options,
				requested,
				override,
				input.presentation,
				input.policy,
				geometry
			),
			design: resolveConsentDesign(input.presentation, input.override),
			diagnostics,
			direction,
			equivalentActions,
			optOutLink: input.presentation?.optOutLink ?? 'do-not-sell',
			orderedActions,
			preferenceControls: resolvePreferenceControls(
				input.policy.rights,
				orderedActions,
				preferences,
				input.policy.i18n?.messageProfile
			),
			primaryActions,
			requiredActions,
			rights: input.policy.rights,
			scrollLock,
			shouldFillActions: uiProfile === 'strict' || uiProfile === 'balanced',
			trapFocus,
			uiProfile,
		};
	};
