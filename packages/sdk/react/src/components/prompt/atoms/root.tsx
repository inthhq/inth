'use client';

import type * as CoreTypes from '@inth/sdk/engine';
import type { PromptPosition, PromptVariant } from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import { defaultTranslationConfig } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-banner';
import {
	forwardRef as createForwardRef,
	useEffect,
	useLayoutEffect,
	useMemo,
} from 'react';
import type { CSSProperties, FC, HTMLAttributes, ReactNode } from 'react';

import { useHeadlessConsentUI } from '~/component-hooks/use-headless-consent-ui';
import { ConsentTrackingContext } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import {
	useActiveUI,
	useHasConsentUI,
	useTranslations as useKernelTranslations,
	useModel,
	usePolicyRule,
} from '~/hooks';
import { useIABPolicyGuard } from '~/hooks/use-iab-policy-guard';
import { useLateEntry } from '~/hooks/use-late-entry';
import { useTextDirection } from '~/hooks/use-text-direction';
import type { CSSPropertiesWithVars } from '~/types/theme';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { BANNER_SHEETS } from '../../shared/first-paint-sheets';
import { StreamedConsentSurface } from '../../shared/streamed-surface';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import { removeStaticBanner } from '../static-banner-shell';
import {
	ConsentBannerSurfaceContext,
	useConsentBannerSurface,
} from '../surface-context';
import type { ConsentBannerSurface } from '../surface-context';
import { EarlyTapScript } from './early-tap-script';
import { Overlay } from './overlay';

const DEFAULT_MODELS: CoreTypes.Model[] = ['opt-in', 'opt-out'];

/** A layout effect in the browser; nothing to run on the server. */
const useBrowserLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The banner renders in its visible state and shows on its first frame.
 * `bannerEntering` marks the mount; with `data-entry="late"` as well, the
 * stylesheet fades it in.
 */
const getBannerAnimationClass = (
	disableAnimation: boolean | undefined
): string => {
	if (disableAnimation) {
		return '';
	}
	return `${styles.bannerVisible} ${styles.bannerEntering}`;
};

/**
 * Props for the root component of the ConsentBanner.
 *
 * @public
 */
interface ConsentBannerRootProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;

	/**
	 * @remarks
	 * When true, removes all default styling from the banner and its children.
	 */
	noStyle?: boolean;

	/**
	 * @remarks
	 * When true, disables the entrance/exit animations.
	 */
	disableAnimation?: boolean;

	/**
	 * @remarks
	 * When true, the consent banner will lock the scroll of the page.
	 * @default false
	 */
	scrollLock?: boolean;

	/**
	 * @remarks
	 * When true, the consent banner will trap focus.
	 * @default true
	 */
	trapFocus?: boolean;

	/**
	 * Which consent models this banner responds to.
	 * @default ['opt-in', 'opt-out']
	 */
	models?: CoreTypes.Model[];

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'banner'
	 */
	uiSource?: string;

	/**
	 * Shape of the prompt. Overrides `presentation.prompt.variant`.
	 * @remarks A notice defaults to `bar`; a choice prompt defaults to `floating`.
	 */
	variant?: PromptVariant;

	/**
	 * Placement of the prompt. Overrides `presentation.prompt.position`.
	 * @remarks Must be valid for the resolved variant; otherwise the variant
	 * default is used and a development diagnostic is logged. Right-to-left
	 * text does not move the prompt.
	 */
	position?: PromptPosition;

	/**
	 * Backdrop, scroll lock, focus trap and no outside dismissal, as one value.
	 * Overrides `presentation.prompt.blocking`.
	 * @remarks `wall` is always blocking; a notice never is.
	 */
	blocking?: boolean;
}

const ConsentBannerRootChildren = createForwardRef<
	HTMLDivElement,
	ConsentBannerRootChildrenProps
>(
	(
		{
			asChild: _asChild,
			children,
			className,
			style,
			className: forwardedClassName,
			disableAnimation,
			noStyle,
			models = DEFAULT_MODELS,
			...props
		}: ConsentBannerRootChildrenProps & {
			style?: CSSProperties;
			className?: string;
		},
		ref
	) => {
		useIABPolicyGuard();
		const activeUI = useActiveUI();
		const { components } = useUIConfig();
		const hasConsentUI = useHasConsentUI();
		const model = useModel() ?? 'opt-in';
		const policy = usePolicyRule();
		const surface = useConsentBannerSurface();
		const translations = useKernelTranslations();
		const textDirection = useTextDirection(
			translations?.language ?? defaultTranslationConfig.defaultLanguage
		);
		// Runs on every page, banner or not, so a banner the browser shows
		// later finds its sheet loaded.
		const sheetsReady = useSurfaceSheetsReady(BANNER_SHEETS, noStyle);
		const shouldShowBanner =
			sheetsReady &&
			hasConsentUI &&
			activeUI === 'banner' &&
			models.includes(model);
		// A banner that arrives after the page painted fades in, unless it
		// replaces the static banner from `index.html`.
		const lateEntry = useLateEntry(shouldShowBanner) && !disableAnimation;
		// Before the browser paints this banner, so the two never show
		// together and never leave a frame with neither.
		useBrowserLayoutEffect(() => {
			if (shouldShowBanner) {
				removeStaticBanner();
			}
		}, [shouldShowBanner]);
		const contentStyle = mergeSlotProps(components?.banner?.root, {
			baseClassName: styles.root,
			className: className || forwardedClassName,
			noStyle,
			style: style as CSSPropertiesWithVars<Record<string, never>>,
			...props,
		});

		const finalClassName = noStyle
			? contentStyle.className || ''
			: `${contentStyle.className || ''} ${getBannerAnimationClass(disableAnimation)}`;
		return shouldShowBanner ? (
			<>
				{/* Before the buttons, so a tap on them is never missed. */}
				<EarlyTapScript />
				<SurfaceStyles
					sheets={BANNER_SHEETS}
					noStyle={noStyle}
				/>
				<Overlay />
				<div
					ref={ref}
					{...contentStyle}
					className={finalClassName}
					data-variant={surface.variant}
					data-position={surface.position}
					data-blocking={surface.blocking ? 'true' : undefined}
					data-prompt={policy.prompt}
					data-model={policy.model}
					data-entry={lateEntry ? 'late' : undefined}
					data-testid="consent-banner-root"
					{...{ [SURFACE_ROOT_ATTRIBUTE]: 'banner' }}
					dir={textDirection}
				>
					{children}
				</div>
			</>
		) : null;
	}
);
const ConsentBannerRootContent: FC<ConsentBannerRootProps> = ({
	children,
	className,
	noStyle,
	disableAnimation,
	scrollLock,
	trapFocus,
	models,
	uiSource,
	variant,
	position,
	blocking,
	...props
}) => {
	const { banner } = useHeadlessConsentUI({
		prompt: { blocking, position, scrollLock, trapFocus, variant },
	});
	const resolvedScrollLock = banner.scrollLock;
	const resolvedTrapFocus = banner.trapFocus;
	const contextValue = useMemo(
		() => ({
			disableAnimation,
			noStyle,
			scrollLock: resolvedScrollLock,
			trapFocus: resolvedTrapFocus,
		}),
		[disableAnimation, noStyle, resolvedScrollLock, resolvedTrapFocus]
	);
	const surfaceValue = useMemo<ConsentBannerSurface>(
		() => ({
			blocking: banner.blocking,
			position: banner.position,
			positionSource: banner.positionSource,
			variant: banner.variant,
		}),
		[banner.blocking, banner.position, banner.positionSource, banner.variant]
	);
	const trackingContextValue = useMemo(
		() => ({ uiSource: uiSource ?? 'banner' }),
		[uiSource]
	);

	return (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<LocalThemeContext.Provider value={contextValue}>
				<ConsentBannerSurfaceContext.Provider value={surfaceValue}>
					<ConsentBannerRootChildren
						disableAnimation={disableAnimation}
						className={className}
						noStyle={noStyle}
						models={models}
						{...props}
					>
						{children}
					</ConsentBannerRootChildren>
				</ConsentBannerSurfaceContext.Provider>
			</LocalThemeContext.Provider>
		</ConsentTrackingContext.Provider>
	);
};

/**
 * Props for the content section of the ConsentBanner.
 *
 * @public
 */
interface ConsentBannerRootChildrenProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;

	noStyle?: boolean;

	asChild?: boolean;

	disableAnimation?: boolean;

	/**
	 * Which consent models this banner responds to.
	 * @default ['opt-in', 'opt-out']
	 */
	models?: CoreTypes.Model[];
}

ConsentBannerRootChildren.displayName = 'ConsentBannerRootChildren';

/**
 * The banner, rendered where the server can stream it: see
 * `StreamedConsentSurface`.
 */
const ConsentBannerRoot: FC<ConsentBannerRootProps> = (props) => (
	<StreamedConsentSurface>
		<ConsentBannerRootContent {...props} />
	</StreamedConsentSurface>
);

const Root = ConsentBannerRoot;

export { ConsentBannerRoot, Root };
