/**
 * The attributes the server-rendered banner's buttons and every
 * `<ConsentDialogLink />` carry, and the action a click on one asks for.
 *
 * @internal
 */

import type { ConsentAction } from '../astro-consent-client.model';
import type { ConsentDialogKind } from '../ui/register-dialog-adapter';

/** Attribute the server-rendered banner puts on its action buttons. */
export const ACTION_ATTRIBUTE = 'data-inth-action';

/** Attribute selecting which dialog a `customize` action opens. */
export const DIALOG_ATTRIBUTE = 'data-inth-dialog';

/**
 * Attribute selecting which tab the IAB preference centre opens on.
 *
 * The IAB banner's "N partners" link is a `customize` action that should
 * land on the vendors tab rather than purposes, the way the React, Svelte
 * and Vue banners do.
 */
export const DIALOG_TAB_ATTRIBUTE = 'data-inth-tab';

/** A banner action and what it opens. @internal */
export interface ResolvedAction {
	action: ConsentAction;
	dialog: ConsentDialogKind;
	element: HTMLElement | null;
	tab?: 'purposes' | 'vendors';
}

/**
 * The action a click or press on `target` asks for.
 *
 * @returns The action, or `null` when the target is not an action control.
 * @internal
 */
export const resolveAction = function resolveAction(
	target: EventTarget | null
): ResolvedAction | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const element = target.closest(`[${ACTION_ATTRIBUTE}]`);
	const action = element?.getAttribute(ACTION_ATTRIBUTE);
	if (
		action !== 'accept' &&
		action !== 'reject' &&
		action !== 'customize' &&
		action !== 'opt-out' &&
		action !== 'dismiss' &&
		action !== 'close'
	) {
		return null;
	}
	const dialog = element?.getAttribute(DIALOG_ATTRIBUTE);
	const tab = element?.getAttribute(DIALOG_TAB_ATTRIBUTE);
	return {
		action,
		dialog: dialog === 'iab' ? 'iab' : 'preferences',
		element: element instanceof HTMLElement ? element : null,
		tab: tab === 'vendors' || tab === 'purposes' ? tab : undefined,
	};
};
