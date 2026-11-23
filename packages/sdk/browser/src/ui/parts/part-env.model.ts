/**
 * What every UI part shares: the render environment, the
 * stock button and switch, the rights bundle, the phone layout query and
 * the icons. Mirrors `@inth/react`'s `components/privacy-choices`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	PHONE_LAYOUT_QUERY,
	resolveOptOutReceipt,
	resolveRightsBundle,
	resolveSurfaceTranslations,
} from '@inth/sdk-core';
import type {
	ConsentKernel,
	ConsentSnapshot,
	OptOutReceiptData,
	RightsBundle,
	SurfaceSession,
	SurfaceSessionState,
	Translations,
} from '@inth/sdk-core';
import type { PreferenceDraft } from '@inth/sdk-core/preference-draft';
import { EARLY_TAP_OPT_OUT } from '@inth/sdk-core/surface-actions';
import { resolveActionAppearance } from '@inth/sdk-ui/theme';
import type { ConsentActionKey } from '@inth/sdk-ui/theme';

import { classes } from '../../generated/styles';
import { classes as dialogStyles } from '../../generated/ui/dialog';
import type { BrowserSlotKey } from '../create-slot-applier';
import type { SurfaceContext } from '../surface.model';
import { el, icon } from './el';
import type { PartChild, PartProps } from './el';
import { getSurfaceSession } from './engine';

/** What a UI part renders against, refreshed on every render. */
export interface PartEnv {
	ctx: SurfaceContext;
	kernel: ConsentKernel;
	snapshot: ConsentSnapshot;
	/** The resolved bundle, bundled English filling any gaps. */
	t: Translations;
	session: SurfaceSession;
	state: SurfaceSessionState;
	/** The surface's own preference draft. */
	draft: PreferenceDraft;
	noStyle: boolean;
	/** The phone layout applies (`PHONE_LAYOUT_QUERY`). */
	phone: boolean;
	/** Render the surface again, after a part's own state changed. */
	rerender: () => void;
}

/** The kernel's surface session and the translations for a snapshot. */
export const surfaceBasics = function surfaceBasics(
	kernel: ConsentKernel,
	snapshot: ConsentSnapshot
): { session: SurfaceSession; t: Translations } {
	return {
		session: getSurfaceSession(kernel),
		t: resolveSurfaceTranslations(snapshot) as Translations,
	};
};

/**
 * The rights bundle the sale row names (COPY-01, SR-04): the confirmed
 * rights of a held opt-out, else sale, sharing and targeted ads, which
 * every US preset covers. The rights count as confirmed only through this
 * browser's local receipt data (`getOptOutReceiptData`), so it must be
 * passed.
 */
export const rightsBundleOf = function rightsBundleOf(
	snapshot: Pick<ConsentSnapshot, 'optOut'>,
	local: Partial<OptOutReceiptData> | null
): RightsBundle {
	return (
		resolveRightsBundle(resolveOptOutReceipt(snapshot, local).rights) ?? 'all'
	);
};

/**
 * Whether the phone layout applies, and a way to follow it. A browser
 * without `matchMedia` gets desktop.
 */
export const watchPhoneLayout = function watchPhoneLayout(
	onChange: () => void
): { matches: () => boolean; stop: () => void } {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return { matches: () => false, stop: () => undefined };
	}
	const query = window.matchMedia(PHONE_LAYOUT_QUERY);
	query.addEventListener('change', onChange);
	return {
		matches: () => query.matches,
		stop: () => query.removeEventListener('change', onChange),
	};
};

/** Whether the visitor asked for reduced motion. */
export const prefersReducedMotionNow = (): boolean =>
	typeof window !== 'undefined' &&
	typeof window.matchMedia === 'function' &&
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** What {@link choiceSwitch} renders. */
export interface ChoiceSwitchParams {
	checked: boolean;
	onChange: (checked: boolean) => void;
	/** The vendor table's switches are smaller. */
	size?: 'default' | 'small';
	noStyle: boolean;
	attrs: PartProps;
}

/**
 * A choice switch: a `role="switch"` button the row names with
 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
 * `disabled` for a vendor (CAT-03).
 */
export const choiceSwitch = function choiceSwitch(
	params: ChoiceSwitchParams
): HTMLButtonElement {
	return el('button', {
		...params.attrs,
		'aria-checked': params.checked ? 'true' : 'false',
		class: params.noStyle ? undefined : dialogStyles.switch,
		'data-size': params.size === 'small' ? 'small' : undefined,
		'data-state': params.checked ? 'checked' : 'unchecked',
		on: { click: () => params.onChange(!params.checked) },
		role: 'switch',
		type: 'button',
	});
};

/** A chevron, pointing down or toward the end. */
export const chevron = (
	direction: 'down' | 'end' = 'down',
	size = 14
): SVGSVGElement =>
	icon(size, [direction === 'down' ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6']);

/** A check mark. */
export const checkIcon = (size = 14): SVGSVGElement =>
	icon(size, ['M20 6 9 17l-5-5'], { strokeWidth: '2.5' });

/**
 * Whether a click on a row's text should toggle its switch (CAT-10): not
 * on a link or control, nor while the visitor selected text.
 */
export const isToggleClick = function isToggleClick(
	event: Event,
	row: Element
): boolean {
	const target = event.target as Element | null;
	if (target?.closest('a, button, input')) {
		return false;
	}
	const root = row.getRootNode() as Document | ShadowRoot;
	const selection =
		'getSelection' in root && typeof root.getSelection === 'function'
			? (root.getSelection as () => Selection | null)()
			: row.ownerDocument.getSelection();
	return !selection || selection.isCollapsed;
};
