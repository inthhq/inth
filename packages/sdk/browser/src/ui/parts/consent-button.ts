import { EARLY_TAP_OPT_OUT } from '@inth/sdk-core/surface-actions';
import { resolveActionAppearance } from '@inth/sdk-ui/theme';
import type { ConsentActionKey } from '@inth/sdk-ui/theme';

import { classes } from '../../generated/styles';
import type { BrowserSlotKey } from '../create-slot-applier';
import { el } from './el';
import type { PartChild, PartProps } from './el';
import type { PartEnv } from './part-env.model';

/** What {@link consentButton} renders. */
export interface ConsentButtonParams {
	env: Pick<PartEnv, 'ctx' | 'noStyle'>;
	/** The consent action, for `data-action` and the theme's appearance. */
	consentAction?: ConsentActionKey;
	isPrimary?: boolean;
	/** A fixed appearance instead of the theme's. */
	variant?: 'primary' | 'neutral';
	mode?: 'filled' | 'stroke' | 'lighter' | 'ghost';
	/** The slot that styles it, instead of `buttonPrimary` or `buttonSecondary`. */
	slotKey?: BrowserSlotKey;
	/** Extra class after the button's own. */
	className?: string;
	attrs?: PartProps;
	children: PartChild[];
}

/** Actions the static banner's early-tap script would replay. */
const EARLY_TAP_ACTIONS = new Set(['accept', 'dismiss', 'customize', 'reject']);

/**
 * The stock consent button, as React's `ConsentButton` renders it for a
 * surface that handles the click itself.
 */
export const consentButton = function consentButton(
	params: ConsentButtonParams
): HTMLButtonElement {
	const { env } = params;
	const { noStyle } = env;
	const appearance =
		params.variant || params.mode
			? {
					mode: params.mode ?? 'stroke',
					variant: params.variant ?? 'neutral',
				}
			: resolveActionAppearance(
					env.ctx.client.theme,
					params.consentAction ?? 'save',
					params.isPrimary === true
				);
	const button = el(
		'button',
		{
			class: noStyle
				? params.className
				: [classes.button.button, params.className].filter(Boolean).join(' '),
			'data-action': params.consentAction,
			'data-mode': noStyle ? undefined : appearance.mode,
			'data-size': noStyle ? undefined : 'small',
			'data-variant': noStyle ? undefined : appearance.variant,
			type: 'button',
			...params.attrs,
			[EARLY_TAP_OPT_OUT]:
				params.consentAction && EARLY_TAP_ACTIONS.has(params.consentAction)
					? 'off'
					: undefined,
		},
		...params.children
	);
	return env.ctx.slot(
		button,
		params.slotKey ??
			(appearance.variant === 'primary' ? 'buttonPrimary' : 'buttonSecondary')
	);
};
