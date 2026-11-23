/** Resolve host presentation under the active policy constraints. */
import type {
	PolicyConsentCategory,
	PolicyRight,
	ResolvedPolicyRule,
} from '@inth/sdk-schema/types';

import type { OptOutLinkVariant } from './consent-copy';
import { resolveLayout } from './consent-layout.model';
import type {
	ConsentContainer,
	ConsentLayoutOptions,
	ResolvedConsentLayout,
} from './consent-layout.model';

/** Semantic control roles, independent of their visual variant. */
export type PresentationAction =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

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
}

/**
 * Presentation of the first interaction required by a policy: its Card,
 * Banner or Drawer (`container`), `edgeStyle` and `blockUntilChoice`.
 * `blockUntilChoice` is the prompt's one blocking option.
 */
export interface PromptPresentation
	extends SurfacePresentation, ConsentLayoutOptions {}

/** Presentation of persistent category preferences. */
export interface PreferencesPresentation extends SurfacePresentation {
	/**
	 * Controls backdrop, scroll lock and focus trapping together. The stock
	 * dialog always blocks; this reaches the IAB dialog.
	 * @default true
	 */
	blocking?: boolean;
	/** Initial displayed selections for categories without an explicit receipt. */
	defaults?: Partial<Record<PolicyConsentCategory, boolean>>;
}

/**
 * Application-owned presentation; never part of a policy fingerprint. It
 * overrides the policy's `surface` layout defaults, but not its blocking
 * constraint.
 */
export interface ConsentPresentation {
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
		| 'removed-option';
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
	direction: 'row' | 'column';
	uiProfile: 'balanced' | 'compact' | 'strict';
	shouldFillActions: boolean;
	/**
	 * Backdrop, scroll lock, focus trap and no outside dismissal, resolved.
	 * On the prompt it is `container.desktop.blocking`: both viewports
	 * resolve blocking the same way. Where the policy forbids blocking, as
	 * under an opt-out model, nothing blocks (BNR-13).
	 */
	blocking: boolean;
	/**
	 * Card, Banner or Drawer layout for the prompt, resolved for desktop and
	 * for phone (see `PHONE_LAYOUT_QUERY`). `null` on the preferences
	 * surface.
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
 * The blocking the host asks for, in tier order: the override first, then
 * the provider's presentation. The prompt reads `blockUntilChoice`,
 * preferences read `blocking`.
 */
const requestedTierBlocking = function requestedTierBlocking(
	override: PromptPresentation & PreferencesPresentation,
	presentation: ConsentPresentation | undefined,
	surface: 'prompt' | 'preferences'
): boolean | undefined {
	for (const tier of [override, presentation?.[surface]]) {
		const explicit =
			surface === 'prompt'
				? (tier as PromptPresentation | undefined)?.blockUntilChoice
				: (tier as PreferencesPresentation | undefined)?.blocking;
		if (explicit !== undefined) {
			return explicit;
		}
	}
	return undefined;
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
 * 4. The policy's `surface.container` and `surface.edgeStyle`, defaults
 *    for installs without host presentation.
 * 5. The SDK default, an inset Card in the `start` corner.
 *
 * Edge style arrives merged in `options`; the blocking request arrives
 * decided per tier.
 */
const resolvePromptContainer = function resolvePromptContainer(
	options: PromptPresentation,
	requested: boolean | undefined,
	policy: ResolvedPolicyRule
): NonNullable<ResolvedConsentPresentation['container']> {
	// `options` merges the tiers, so an override's container wins over the
	// provider's. A malformed `null` is forwarded so the resolver reports it.
	const container: ConsentContainer | undefined =
		options.container === undefined
			? policy.surface?.container
			: options.container;
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
	return {
		desktop: resolveLayout({ ...input, viewport: 'desktop' }),
		phone: resolveLayout({ ...input, viewport: 'phone' }),
	};
};

/**
 * Blocking on the preferences surface: the host's request, else blocking.
 * The policy's prompt constraint doesn't apply to preferences.
 */
const resolvePreferencesBlocking = function resolvePreferencesBlocking(
	requested: boolean | undefined
): boolean {
	return requested ?? true;
};

/**
 * Prompt options this version removed, with what replaces each. A site
 * upgrading with one left in place gets a development warning instead of
 * an option that silently does nothing.
 */
const REMOVED_PROMPT_OPTIONS = {
	blocking: 'blockUntilChoice',
	position: 'container',
	variant: 'container',
} as const;

const reportRemovedPromptOptions = function reportRemovedPromptOptions(
	tiers: readonly unknown[],
	diagnostics: PresentationDiagnostic[]
): void {
	const found = new Set<keyof typeof REMOVED_PROMPT_OPTIONS>();
	for (const tier of tiers) {
		if (typeof tier !== 'object' || tier === null) {
			continue;
		}
		for (const option of Object.keys(
			REMOVED_PROMPT_OPTIONS
		) as (keyof typeof REMOVED_PROMPT_OPTIONS)[]) {
			if ((tier as Record<string, unknown>)[option] !== undefined) {
				found.add(option);
			}
		}
	}
	for (const option of found) {
		diagnostics.push({
			actions: [],
			code: 'removed-option',
			message: `presentation.prompt.${option} was removed and does nothing; use ${REMOVED_PROMPT_OPTIONS[option]} instead.`,
		});
	}
};

/**
 * Resolve host presentation without changing policy behavior.
 * @param input - Active policy, target surface, host options and local overrides.
 * @returns Ordered controls, required actions, rights and diagnostics.
 */
export const resolveConsentPresentation =
	// oxlint-disable-next-line complexity -- Each branch resolves one presentation field against the policy.
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
		const override: PromptPresentation & PreferencesPresentation =
			Object.fromEntries(
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
		if (!preferences) {
			reportRemovedPromptOptions(
				[input.presentation?.prompt, input.override],
				diagnostics
			);
		}
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
		const direction = options.direction ?? 'row';
		// `compact` sizes buttons to their labels so the default split layout
		// reads as one row; `balanced` and `strict` fill and stack instead.
		const uiProfile = options.uiProfile ?? 'compact';
		const requested = requestedTierBlocking(
			override,
			input.presentation,
			input.surface
		);
		const container = preferences
			? null
			: resolvePromptContainer(options, requested, input.policy);
		const blocking =
			container === null
				? resolvePreferencesBlocking(requested)
				: container.desktop.blocking;
		return {
			actionGroups,
			allowedActions,
			blocking,
			container,
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
			shouldFillActions: uiProfile === 'strict' || uiProfile === 'balanced',
			uiProfile,
		};
	};
