'use client';

import styles from '@inth/sdk/ui/styles/components/consent-manager';
import { useMemo } from 'react';
import type { FC, ReactNode } from 'react';

import { Box } from '~/components/shared/primitives/box';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '~/components/shared/surface-styles';
import { WIDGET_SHEETS } from '~/components/shared/widget-sheets';
import {
	ConsentTrackingContext,
	useConsentTracking,
} from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';
import { ConsentDraftProvider } from '~/draft';
import { useHasConsentUI } from '~/hooks';
import { useOptInConfirmationHost } from '~/hooks/use-opt-out';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useTranslationLanguage } from '~/hooks/use-translation-language';
import { createDeferredModule } from '~/utils/create-deferred-module';

const LazyOptInConfirmation = createDeferredModule(
	() => import('~/components/opt-in-confirmation')
).component((module) => module.OptInConfirmation);

/**
 * Props for the ConsentWidgetRoot component.
 *
 * @public
 */
export interface ConsentWidgetRootProps extends ThemeContextValue {
	/**
	 * Child components to be rendered within the consent manager context.
	 */
	children: ReactNode;

	/**
	 * Determines whether to use the context provider.
	 * If false, the component will not wrap children in a context provider.
	 *
	 * @defaultValue true
	 */
	useProvider?: boolean;

	/**
	 * @remarks
	 * When true, removes all default styling from the widget and its children.
	 */
	noStyle?: boolean;

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'widget'
	 */
	uiSource?: string;
}

/**
 * Root component of the ConsentWidget that provides context and styling.
 *
 * @example
 * ```tsx
 * <ConsentWidget.Root>
 *   <ConsentWidget.Accordion>
 *     <ConsentWidget.AccordionItems />
 *   </ConsentWidget.Accordion>
 * </ConsentWidget.Root>
 * ```
 *
 * @public
 */
const ConsentWidgetRoot: FC<ConsentWidgetRootProps> = ({
	children,
	noStyle = false,
	disableAnimation = false,
	useProvider = true,
	uiSource,
}) => {
	const language = useTranslationLanguage();
	const textDirection = useTextDirection(language);
	const parentTracking = useConsentTracking();

	const contextValue = useMemo<ThemeContextValue>(
		() => ({
			disableAnimation,
			noStyle,
		}),
		[disableAnimation, noStyle]
	);

	// If an explicit uiSource prop is given, always use it.
	// Otherwise, inherit from a parent context (e.g. dialog wrapping this widget).
	// Only fall back to 'widget' when used standalone with no parent context.
	const resolvedUiSource = uiSource ?? parentTracking.uiSource ?? 'widget';
	const trackingContextValue = useMemo(
		() => ({ uiSource: resolvedUiSource }),
		[resolvedUiSource]
	);
	const hasConsentUI = useHasConsentUI();
	const sheetsReady = useSurfaceSheetsReady(WIDGET_SHEETS, noStyle);
	const optInConfirmationActive = useOptInConfirmationHost();
	if (!(hasConsentUI && sheetsReady)) {
		// No resolved policy, or a `none` rule with no right to exercise: there
		// is nothing to manage, so render nothing.
		return null;
	}

	const content = (
		<>
			<SurfaceStyles
				sheets={WIDGET_SHEETS}
				noStyle={noStyle}
			/>
			{optInConfirmationActive && (
				<LazyOptInConfirmation
					disableAnimation={disableAnimation}
					noStyle={noStyle}
				/>
			)}
			<Box
				baseClassName={styles.manager}
				data-testid="consent-widget-root"
				slotKey="manager.root"
				dir={textDirection}
			>
				{children}
			</Box>
		</>
	);

	if (useProvider) {
		return (
			<ConsentTrackingContext.Provider value={trackingContextValue}>
				<LocalThemeContext.Provider value={contextValue}>
					<ConsentDraftProvider>{content}</ConsentDraftProvider>
				</LocalThemeContext.Provider>
			</ConsentTrackingContext.Provider>
		);
	}

	return (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<ConsentDraftProvider>{content}</ConsentDraftProvider>
		</ConsentTrackingContext.Provider>
	);
};

const Root = ConsentWidgetRoot;

export { ConsentWidgetRoot, Root };
