import type { ConsentActionStyle, Theme } from './types';

/** A consent action a stock button performs. */
export type ConsentActionKey =
	| 'accept'
	| 'reject'
	| 'customize'
	| 'dismiss'
	| 'save';

/**
 * The button treatment for one consent action. Mode and variant each come
 * from the first layer that sets them: the action's own
 * `theme.consentActions` key (`save` has none), then `primary` when the
 * policy marks the action primary, then `default`. Without any, the button
 * is `stroke`, with the `primary` variant when the action is primary and
 * `neutral` otherwise.
 */
export const resolveActionAppearance = function resolveActionAppearance(
	theme: Pick<Theme, 'consentActions'> | undefined,
	action: ConsentActionKey,
	isPrimary: boolean
): Required<ConsentActionStyle> {
	const actions = theme?.consentActions;
	const layers: (ConsentActionStyle | undefined)[] = [
		action === 'save' ? undefined : actions?.[action],
		isPrimary ? actions?.primary : undefined,
		actions?.default,
	];
	return {
		mode: layers.find((layer) => layer?.mode)?.mode ?? 'stroke',
		variant:
			layers.find((layer) => layer?.variant)?.variant ??
			(isPrimary ? 'primary' : 'neutral'),
	};
};
