import {
	actionAppearanceFromTheme,
	resolveConsentPresentation,
} from '@inth/sdk-core';
import type {
	ConsentPresentation,
	ConsentSnapshot,
	PresentationAction,
	PromptPresentation,
	ResolvedConsentPresentation,
} from '@inth/sdk-core';
import { resolveActionAppearance } from '@inth/sdk-ui/theme';
import type { Theme } from '@inth/sdk-ui/theme';

import { classes } from '../generated/styles';
import { cx, h } from './dom';
import type { BrowserSlotKey, SlotApplier } from './create-slot-applier';

/** Resolve buttons and the container with the same policy constraints as React. */
export const resolveActions = function resolveActions(
	snapshot: ConsentSnapshot,
	surface: 'prompt' | 'preferences',
	presentation?: ConsentPresentation,
	override?: PromptPresentation,
	theme?: Theme
): ResolvedConsentPresentation {
	return resolveConsentPresentation({
		actionAppearance: actionAppearanceFromTheme(theme),
		override,
		policy: snapshot.policyRule,
		presentation,
		surface,
	});
};

/** What {@link renderActionFooter} needs. */
export interface ActionFooterParams {
	actions: ResolvedConsentPresentation;
	/** Extra class on the footer root (the surface's `footer`). */
	footerClassName: string;
	/** Ship the DOM without class names. */
	noStyle: boolean;
	/** Test id for the footer. */
	testId: string;
	/** Test id for each sub group. */
	subGroupTestId: string;
	/** Label for an action. */
	label: (action: PresentationAction) => string;
	/** Test id for an action's button. */
	buttonTestId: (action: PresentationAction) => string;
	/** Click handler. */
	onAction: (action: PresentationAction) => void;
	/** Applies `theme.slots`; buttons take `buttonPrimary` or `buttonSecondary`. */
	slot: SlotApplier;
	/** The footer's slot key. */
	footerSlot: BrowserSlotKey;
	/** Each button group's slot key. The IAB theme has none. */
	groupSlot?: BrowserSlotKey;
	/** The theme whose `consentActions` style the buttons. */
	theme?: Theme;
}

/** Render a surface's button footer. */
export const renderActionFooter = function renderActionFooter(
	params: ActionFooterParams
): HTMLElement {
	const { actions, noStyle, slot } = params;
	const footer = slot(
		h('div', {
			class: noStyle
				? ''
				: cx(classes.actions.actionRoot, params.footerClassName),
			'data-direction': actions.direction,
			'data-fill': actions.shouldFillActions ? 'true' : undefined,
			'data-split':
				actions.actionGroups.length > 1 && !actions.shouldFillActions
					? 'true'
					: undefined,
			'data-testid': params.testId,
		}),
		params.footerSlot
	);
	for (const group of actions.actionGroups) {
		const groupElement = h('div', {
			class: noStyle ? '' : classes.actions.actionGroup,
			'data-direction': actions.direction,
			'data-fill': actions.shouldFillActions ? 'true' : undefined,
			'data-testid': params.subGroupTestId,
		});
		if (params.groupSlot) {
			slot(groupElement, params.groupSlot);
		}
		for (const action of group) {
			const { mode, variant } = resolveActionAppearance(
				params.theme,
				action,
				actions.primaryActions.includes(action)
			);
			groupElement.append(
				slot(
					h(
						'button',
						{
							class: noStyle ? '' : classes.button.button,
							'data-action': action,
							'data-mode': noStyle ? undefined : mode,
							'data-size': noStyle ? undefined : 'small',
							'data-testid': params.buttonTestId(action),
							'data-variant': noStyle ? undefined : variant,
							onclick: () => {
								params.onAction(action);
							},
							type: 'button',
						},
						params.label(action)
					),
					variant === 'primary' ? 'buttonPrimary' : 'buttonSecondary'
				)
			);
		}
		footer.append(groupElement);
	}
	return footer;
};
