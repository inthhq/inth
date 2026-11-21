'use client';

import type * as CoreTypes from '@inth/sdk/engine';
import type { FC } from 'react';

import type { ConsentDialogTriggerProps } from '~/components/panel-trigger';
import type { InlineLegalLinksProps } from '~/components/shared/primitives/legal-links';
import { useActiveUI } from '~/hooks';
import { useComponentConfig } from '~/hooks/use-component-config';
import {
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptOutConfirmationOpen,
} from '~/hooks/use-opt-out';
import { createDeferredModule } from '~/utils/deferred-module';

import { ConsentCustomizationCard } from './atoms/card';
import { Root as ConsentDialogRoot } from './atoms/root';

/**
 * The floating trigger, with its drag handling, icons and DevTools
 * launcher, loads only for a dialog that shows it: opening the dialog
 * does not wait for that code.
 */
const LazyConsentDialogTrigger = createDeferredModule(
	() => import('~/components/panel-trigger')
).component((module) => module.ConsentDialogTrigger);

const LazyOptOutConfirmation = createDeferredModule(
	() => import('~/components/opt-out-confirmation')
).component((module) => module.OptOutConfirmation);

const LazyOptInConfirmation = createDeferredModule(
	() => import('~/components/opt-in-confirmation')
).component((module) => module.OptInConfirmation);

/**
 * Props for the `<ConsentDialog />` convenience component.
 */
export interface ConsentDialogProps {
	/**
	 * Theme configuration override (deprecated)
	 * @deprecated Theme should be set on the InthProvider
	 */
	theme?: never;

	/**
	 * Disables all animations when true
	 */
	disableAnimation?: boolean;

	/**
	 * Removes default styles when true
	 */
	noStyle?: boolean;

	/**
	 * Locks the scroll when true
	 */
	scrollLock?: boolean;

	/**
	 * Traps keyboard focus within a dialog when true
	 */
	trapFocus?: boolean;

	/**
	 * Control the open state. If omitted the dialog follows
	 * `useActiveUI() === 'dialog'`.
	 */
	open?: boolean;

	/**
	 * Controls which legal links to display.
	 *
	 * - `undefined` (default): Shows all available legal links
	 * - `null`: Explicitly hides all legal links
	 * - Array of keys: Shows only the specified legal links
	 *
	 * @defaultValue undefined
	 *
	 * @example
	 * ```tsx
	 * // Show all links
	 * <ConsentDialog legalLinks={undefined} />
	 *
	 * // Show no links
	 * <ConsentDialog legalLinks={null} />
	 *
	 * // Show only privacy policy
	 * <ConsentDialog legalLinks={['privacyPolicy']} />
	 * ```
	 *
	 * @remarks
	 * You must set the legal links in the InthProvider options.
	 */
	legalLinks?: InlineLegalLinksProps['links'];

	/**
	 * Controls whether to hide the branding in the dialog footer.
	 *
	 * @defaultValue false
	 */
	hideBranding?: boolean;

	/**
	 * Show a floating trigger button to resurface the consent dialog.
	 * Useful for allowing users to re-open the dialog after dismissing.
	 *
	 * - `true` - Show trigger with default settings
	 * - `false` - Hide trigger (default)
	 * - `ConsentDialogTriggerProps` - Show trigger with custom props
	 *
	 * @default false
	 */
	showTrigger?: boolean | ConsentDialogTriggerProps;

	/**
	 * Which consent models this dialog responds to.
	 * @default ['opt-in', 'opt-out', 'none']
	 */
	models?: CoreTypes.Model[];

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'dialog'
	 */
	uiSource?: string;
}

export const ConsentDialog: FC<ConsentDialogProps> = ({
	open,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	hideBranding,
	legalLinks,
	showTrigger = false,
	models,
	uiSource,
}) => {
	const activeUI = useActiveUI();
	const confirmationOpen = useOptOutConfirmationOpen();
	const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
	const optInConfirmationActive = useOptInConfirmationHost();

	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
	});

	const rootProps = {
		open: open ?? activeUI === 'dialog',
		...config,
		models,
		scrollLock: localScrollLock,
		trapFocus: localTrapFocus,
		uiSource,
	};

	const triggerProps: ConsentDialogTriggerProps | null =
		// oxlint-disable-next-line no-nested-ternary -- Preserve established branch order and control flow.
		showTrigger === true
			? // oxlint-disable-next-line no-inline-comments -- Preserve declaration order, interface shape, and public compatibility.
				// Use defaults
				{}
			: showTrigger === false
				? null
				: showTrigger;

	return (
		<>
			{triggerProps && <LazyConsentDialogTrigger {...triggerProps} />}
			{confirmationOpen && !hasStandaloneConfirmation && (
				<LazyOptOutConfirmation
					embedded
					noStyle={config.noStyle}
					disableAnimation={config.disableAnimation}
					scrollLock={localScrollLock}
					trapFocus={localTrapFocus}
				/>
			)}
			{optInConfirmationActive && (
				<LazyOptInConfirmation
					noStyle={config.noStyle}
					disableAnimation={config.disableAnimation}
					scrollLock={localScrollLock}
					trapFocus={localTrapFocus}
				/>
			)}
			<ConsentDialogRoot {...rootProps}>
				<ConsentCustomizationCard
					noStyle={rootProps.noStyle}
					legalLinks={legalLinks}
					hideBranding={hideBranding}
				/>
			</ConsentDialogRoot>
		</>
	);
};
