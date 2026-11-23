import type { AllConsentNames } from '@inth/sdk/engine';
import { EARLY_TAP_OPT_OUT } from '@inth/sdk/surface-actions';
import { resolveActionAppearance } from '@inth/sdk/ui/theme';
import type { ConsentActionKey } from '@inth/sdk/ui/theme';
import { forwardRef as createForwardRef, useCallback } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent } from 'react';

import { useIdleDialogWarming, warmDialogChunk } from '~/chunk-warming';
import {
	toSaveUISource,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { useConsentSaveAction } from '~/draft-context';
import { useSetActiveUI, useDismissNotice } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import type { CSSPropertiesWithVars, CSSVariables } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { Slot } from '../libs/slot';
import * as Button from '../ui/button';
import type { ButtonVariantsProps } from '../ui/button/button';
import type { ConsentButtonElement, ConsentButtonProps } from './button.types';

const NON_DOM_PROPS = [
	'primary',
	'secondary',
	'neutral',
	'consentAction',
	'isPrimary',
	'performDefaultAction',
] as const;

/**
 * The `data-action` the banner's pre-hydration script replays for each
 * button action. It records the choice from that attribute alone.
 */
const EARLY_TAP_ACTIONS: Partial<Record<string, string>> = {
	'accept-consent': 'accept',
	'dismiss-notice': 'dismiss',
	'open-consent-dialog': 'customize',
	'reject-consent': 'reject',
};

/**
 * Whether the pre-hydration script must leave this button's taps alone.
 * It replays from `data-action` alone, so a button whose action does not
 * match its `data-action`, that skips the default action, or whose click
 * does more than the stock action opts out. The replay then never records
 * a choice the hydrated button would not. An `asChild` element can carry
 * its own `data-action`, so it always opts out.
 */
const skipsEarlyTap = function skipsEarlyTap(params: {
	action: string;
	asChild: boolean | undefined;
	dataAction: unknown;
	earlyTap: boolean;
	ownsClick: boolean;
	performDefaultAction: boolean;
}): boolean {
	const { action, dataAction, earlyTap, ownsClick, performDefaultAction } =
		params;
	// A surface that replays the tap through this button's own handler
	// (the Privacy Choices prompt) keeps it, whatever the click does.
	const replays =
		(earlyTap && params.asChild !== true) ||
		(!ownsClick &&
			(performDefaultAction || action === 'open-consent-dialog') &&
			EARLY_TAP_ACTIONS[action] === dataAction);
	return (
		!replays &&
		(params.asChild === true ||
			Object.values(EARLY_TAP_ACTIONS).includes(String(dataAction)))
	);
};

/**
 * Whether a click does more than the stock action. A click handler can veto
 * it. An `asChild` element brings its own `data-action`, handlers, and
 * perhaps a link to follow. A submit or reset button acts on its form. The
 * script stops the click but not its default, so a link or form would leave
 * the page before the replay.
 */
const ownsClick = function ownsClick(params: {
	asChild: boolean | undefined;
	onClick: unknown;
	type: unknown;
}): boolean {
	return (
		params.onClick !== undefined ||
		params.asChild === true ||
		params.type === 'submit' ||
		params.type === 'reset'
	);
};

/**
 * The value `key` renders with after the button's prop spreads. As in JSX,
 * the last layer that has the key wins, even with `undefined`.
 */
const renderedProp = function renderedProp(
	key: string,
	layers: readonly Readonly<Record<string, unknown>>[]
): unknown {
	let value: unknown;
	for (const layer of layers) {
		if (key in layer) {
			value = layer[key];
		}
	}
	return value;
};

/**
 * Resolves the final variant and mode for a consent button: explicit
 * `variant` / `mode` props first, then the theme's `consentActions`
 * through `resolveActionAppearance`.
 */
const resolveConsentButtonStyle = function resolveConsentButtonStyle(params: {
	consentAction?: ConsentActionKey;
	isPrimary?: boolean;
	theme?: ReturnType<typeof useTheme>['theme'];
	variant?: ButtonVariantsProps['variant'];
	mode?: ButtonVariantsProps['mode'];
}) {
	if (params.variant || params.mode) {
		return {
			mode: params.mode ?? 'stroke',
			variant: params.variant ?? 'neutral',
		};
	}
	// A button without an action has no key of its own, as `save` has none.
	return resolveActionAppearance(
		params.theme,
		params.consentAction ?? 'save',
		params.isPrimary === true
	);
};

export const ConsentButton = createForwardRef<
	ConsentButtonElement,
	ConsentButtonProps &
		ButtonVariantsProps & {
			consentAction?: ConsentActionKey;
			isPrimary?: boolean;
			action:
				| 'accept-consent'
				| 'reject-consent'
				| 'custom-consent'
				| 'open-consent-dialog'
				| 'set-consent'
				| 'dismiss-notice';
			category?: AllConsentNames;
			closeConsentDialog?: boolean;
			closeConsentBanner?: boolean;
			performDefaultAction?: boolean;
			/**
			 * The surface replays a tap the pre-hydration script held
			 * through this button's own click handler, so the script keeps
			 * taps on it even though the click does more than the stock
			 * action. Off, such a button opts out of the script.
			 */
			earlyTap?: boolean;
		}
>(
	(
		{
			asChild,
			className: forwardedClassName,
			style,
			noStyle,
			action,
			slotKey,
			baseClassName,
			variant,
			mode,
			size = 'small',
			consentAction,
			isPrimary,
			onClick: forwardedOnClick,
			onFocus: forwardedOnFocus,
			onPointerEnter: forwardedOnPointerEnter,
			closeConsentBanner = false,
			closeConsentDialog = false,
			performDefaultAction = true,
			earlyTap = false,
			category,
			...props
		},
		ref
	) => {
		const saveKernelConsents = useConsentSaveAction();
		// The nearest surface root declares which UI collected the consent.
		const { uiSource: trackedUISource } = useConsentTracking();
		const saveConsents = useCallback(
			(input?: Parameters<typeof saveKernelConsents>[0]) =>
				saveKernelConsents(input, toSaveUISource(trackedUISource)),
			[saveKernelConsents, trackedUISource]
		);
		const setActiveUI = useSetActiveUI();
		const dismissNotice = useDismissNotice();
		const { noStyle: contextNoStyle, theme } = useTheme();
		const { components } = useUIConfig();
		const resolvedButtonStyle = resolveConsentButtonStyle({
			consentAction,
			isPrimary,
			mode,
			theme,
			variant,
		});

		const defaultSlotKey =
			resolvedButtonStyle.variant === 'primary'
				? 'button.primary'
				: 'button.secondary';

		const slotProps = getSlotProps(components, slotKey ?? defaultSlotKey);
		const buttonStyleProps = mergeSlotProps(slotProps, {
			baseClassName: [
				Button.buttonVariants({
					mode: resolvedButtonStyle.mode,
					size,
					variant: resolvedButtonStyle.variant,
				}).root(),
				baseClassName,
			],
			className: forwardedClassName,
			noStyle: contextNoStyle || noStyle,
			style: {
				...(style as CSSPropertiesWithVars<CSSVariables>),
			},
		});

		if (!category && action === 'set-consent') {
			throw new Error('Category is required for set-consent action');
		}

		const buttonClick = useCallback(
			(e: MouseEvent<HTMLButtonElement>) => {
				forwardedOnClick?.(e);
				if (e.defaultPrevented) {
					return;
				}
				const actionSavesConsent =
					action === 'accept-consent' ||
					action === 'reject-consent' ||
					action === 'custom-consent';
				if ((closeConsentBanner || closeConsentDialog) && !actionSavesConsent) {
					setActiveUI('none');
				}

				if (action === 'open-consent-dialog') {
					setActiveUI('dialog');
				}

				if (performDefaultAction && action !== 'open-consent-dialog') {
					switch (action) {
						case 'accept-consent':
							saveConsents('all');
							break;
						case 'reject-consent':
							saveConsents('none');
							break;
						case 'custom-consent':
							void saveConsents();
							break;
						case 'dismiss-notice':
							void dismissNotice();
							break;
						case 'set-consent':
							if (!category) {
								throw new Error('Category is required for set-consent action');
							}

							void saveConsents({ [category]: true });
							break;
						default:
							break;
					}
				}
			},
			[
				closeConsentBanner,
				closeConsentDialog,
				forwardedOnClick,
				saveConsents,
				setActiveUI,
				action,
				category,
				dismissNotice,
				performDefaultAction,
			]
		);

		// Buttons that open the dialog start loading its deferred module on
		// hover or focus, so the chunk downloads during the lead time before the
		// click instead of after it. While one is mounted, the module also loads
		// in idle time after the page loads, for opens with no lead time.
		//
		// These handlers replace the ones spread from `buttonStyleProps`, so they
		// call the caller's handler first: a direct prop, else the
		// `components.button.*` slot's handler.
		const opensDialog = action === 'open-consent-dialog';
		useIdleDialogWarming(opensDialog);
		const onFocus = forwardedOnFocus ?? buttonStyleProps.onFocus;
		const onPointerEnter =
			forwardedOnPointerEnter ?? buttonStyleProps.onPointerEnter;
		const buttonFocus = useCallback(
			(event: FocusEvent<HTMLButtonElement>) => {
				onFocus?.(event);
				if (opensDialog) {
					warmDialogChunk();
				}
			},
			[onFocus, opensDialog]
		);
		const buttonPointerEnter = useCallback(
			(event: PointerEvent<HTMLButtonElement>) => {
				onPointerEnter?.(event);
				if (opensDialog) {
					warmDialogChunk();
				}
			},
			[onPointerEnter, opensDialog]
		);

		const Comp = asChild ? Slot : 'button';

		const domProps = Object.fromEntries(
			Object.entries(props).filter(
				([key]) =>
					!NON_DOM_PROPS.includes(key as (typeof NON_DOM_PROPS)[number])
			)
		);

		const isStyled = !(contextNoStyle || noStyle);

		// The same layers, in the same order, as the spreads below. A
		// `components.button.*` slot can set `data-action` or `type` too.
		const ownProps = {
			'data-action': consentAction,
			type: asChild ? undefined : ('button' as const),
		};
		const renderedLayers = [ownProps, buttonStyleProps, domProps];
		const earlyTapOptOut = skipsEarlyTap({
			action,
			asChild,
			dataAction: renderedProp('data-action', renderedLayers),
			earlyTap,
			ownsClick: ownsClick({
				asChild,
				onClick: forwardedOnClick,
				type: renderedProp('type', renderedLayers),
			}),
			performDefaultAction,
		})
			? { [EARLY_TAP_OPT_OUT]: 'off' }
			: undefined;

		return (
			<Comp
				ref={ref}
				data-variant={isStyled ? resolvedButtonStyle.variant : undefined}
				data-mode={isStyled ? resolvedButtonStyle.mode : undefined}
				data-size={isStyled ? size : undefined}
				{...ownProps}
				{...buttonStyleProps}
				onClick={buttonClick}
				onFocus={buttonFocus}
				onPointerEnter={buttonPointerEnter}
				{...domProps}
				{...earlyTapOptOut}
			/>
		);
	}
);

ConsentButton.displayName = 'ConsentButton';
