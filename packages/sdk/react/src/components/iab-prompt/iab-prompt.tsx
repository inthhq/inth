'use client';

import type * as CoreTypes from '@inth/sdk/engine';
import { resolveIABBannerCopy } from '@inth/sdk/iab/headless';
import actionStyles from '@inth/sdk/ui/styles/components/consent-actions';
import styles from '@inth/sdk/ui/styles/components/iab-consent-banner';
import type { FC } from 'react';

import { warmDialogChunk } from '~/chunk-warming';
import { Box } from '~/components/shared/primitives/box';
import { BrandingTag } from '~/components/shared/ui/branding';
import * as Button from '~/components/shared/ui/button';
import { useComponentConfig } from '~/hooks/use-component-config';
import { useFocusBlocking } from '~/hooks/use-focus-blocking';
import { useHeadlessIABConsentUI } from '~/hooks/use-headless-iab-consent-ui';
import { useIABConsentManager } from '~/hooks/use-iab-manager';
import { useUIConfig } from '~/ui-config-context';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { useIABTranslations } from '../iab-panel/use-iab-translations';
import { IABConsentBannerCard } from './atoms/card';
import { IABConsentBannerRoot } from './atoms/root';

/**
 * Props for the IABConsentBanner component.
 * @public
 */
export interface IABConsentBannerProps {
	/**
	 * When true, removes all default styling from the component.
	 * @default false
	 */
	noStyle?: boolean;

	/**
	 * When true, disables entrance/exit animations.
	 * @default false
	 */
	disableAnimation?: boolean;

	/**
	 * When true, locks page scroll when the banner is visible.
	 * @default true
	 */
	scrollLock?: boolean;

	/**
	 * When true, traps keyboard focus within the banner.
	 * @default true
	 */
	trapFocus?: boolean;

	/**
	 * Specifies which button should be highlighted as primary.
	 * @default 'customize'
	 */
	primaryButton?: 'reject' | 'accept' | 'customize';

	/**
	 * Hides the "Consent by" tag.
	 * @default false
	 */
	hideBranding?: boolean;

	/**
	 * Which consent models this banner responds to.
	 * @default ['iab']
	 */
	models?: CoreTypes.Model[];

	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'iab_banner'
	 */
	uiSource?: string;
}

/**
 * IAB TCF 2.4 compliant cookie consent banner.
 *
 * @remarks
 * This component implements the required IAB TCF 2.4 UI elements:
 * - Partner count disclosure
 * - Purpose summary
 * - Legitimate interest notice
 * - Accept All / Reject All / Customize buttons
 *
 * The banner only renders when IAB mode is enabled in the consent manager.
 *
 * @example
 * ```tsx
 * <InthProvider
 *   options={{
 *     mode: hosted({ projectUrl: '/api/inth' }),
 *     iab: { cmpId: 123, vendors: [1, 2, 10] },
 *   }}
 * >
 *   <IABConsentBanner />
 * </InthProvider>
 * ```
 *
 * @public
 */
// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const IABConsentBanner: FC<IABConsentBannerProps> = ({
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	primaryButton = 'customize',
	hideBranding = false,
	models,
	uiSource,
}) => {
	const iabT = useIABTranslations();
	const {
		iab: iabState,
		banner,
		openVendorsDialog,
		performBannerAction,
	} = useHeadlessIABConsentUI();
	const blocking = useFocusBlocking('prompt', localScrollLock, localTrapFocus);
	const { policyBanner } = useIABConsentManager({ prompt: { blocking } });
	const { components } = useUIConfig();
	const resolvedScrollLock = policyBanner.blocking;

	const config = useComponentConfig({
		disableAnimation: localDisableAnimation,
		noStyle: localNoStyle,
		scrollLock: resolvedScrollLock,
		trapFocus: policyBanner.blocking,
	});

	const handleAcceptAll = () => performBannerAction('accept');

	const handleRejectAll = () => performBannerAction('reject');

	const handleCustomize = () => {
		void performBannerAction('customize');
	};

	const handleViewVendors = () => {
		openVendorsDialog();
	};

	const isPrimary = (button: 'reject' | 'accept' | 'customize') =>
		button === primaryButton;

	// Don't render if IAB is disabled (e.g., server returned null GVL) or calculations not complete
	if (!iabState?.config.enabled || !banner.isReady) {
		return null;
	}

	const bannerCopy = resolveIABBannerCopy(iabT, banner);

	const scopeNotice = iabT.banner.scopeServiceSpecific;
	const titleProps = mergeSlotProps(components?.['iab-banner']?.title, {
		baseClassName: styles.title,
		noStyle: config.noStyle,
	});
	const descriptionProps = mergeSlotProps(
		components?.['iab-banner']?.description,
		{
			baseClassName: styles.description,
			noStyle: config.noStyle,
		}
	);
	const partnersLinkProps = mergeSlotProps(
		components?.['iab-banner']?.partnersLink,
		{
			baseClassName: styles.partnersLink,
			noStyle: config.noStyle,
		}
	);
	const purposeListProps = mergeSlotProps(
		components?.['iab-banner']?.purposeList,
		{
			baseClassName: styles.purposeList,
			noStyle: config.noStyle,
		}
	);
	const purposeMoreProps = mergeSlotProps(
		components?.['iab-banner']?.purposeMore,
		{
			baseClassName: styles.purposeMore,
			noStyle: config.noStyle,
		}
	);
	const legitimateInterestNoticeProps = mergeSlotProps(
		components?.['iab-banner']?.legitimateInterestNotice,
		{
			baseClassName: styles.legitimateInterestNotice,
			noStyle: config.noStyle,
		}
	);
	const actionsProps = mergeSlotProps(components?.['iab-banner']?.actions, {
		baseClassName: actionStyles.actionRoot,
		'data-direction': 'row',
		'data-split': true,
		noStyle: config.noStyle,
	});
	const actionGroupProps = mergeSlotProps(
		components?.['iab-banner']?.actionGroup,
		{
			baseClassName: actionStyles.actionGroup,
			'data-direction': 'row',
			noStyle: config.noStyle,
		}
	);

	return (
		<IABConsentBannerRoot
			{...config}
			models={models}
			uiSource={uiSource}
		>
			<Box
				baseClassName={styles.cardShell}
				slotKey="iab-banner.cardShell"
			>
				<BrandingTag
					surface="iab-banner"
					hideBranding={hideBranding}
				/>
				<IABConsentBannerCard aria-label={iabT.banner.title}>
					{/* Header */}
					<Box
						baseClassName={styles.header}
						slotKey="iab-banner.header"
						data-testid="iab-consent-banner-header"
					>
						<h2 {...titleProps}>{iabT.banner.title}</h2>
						<p {...descriptionProps}>
							{bannerCopy.descriptionBefore}
							<button
								{...partnersLinkProps}
								type="button"
								data-testid="iab-consent-banner-partners-link"
								onClick={handleViewVendors}
								onFocus={(event) => {
									partnersLinkProps.onFocus?.(event);
									warmDialogChunk();
								}}
								onPointerEnter={(event) => {
									partnersLinkProps.onPointerEnter?.(event);
									warmDialogChunk();
								}}
							>
								{bannerCopy.partnersLink}
							</button>
							{bannerCopy.descriptionAfter}
						</p>
						<ul {...purposeListProps}>
							{banner.displayItems.map((name, index) => (
								<li key={index}>{name}</li>
							))}
							{bannerCopy.andMore && (
								<li {...purposeMoreProps}>{bannerCopy.andMore}</li>
							)}
						</ul>
						<p {...legitimateInterestNoticeProps}>
							{`${iabT.banner.legitimateInterestNotice} ${scopeNotice}`}
						</p>
					</Box>

					{/* Footer with buttons */}
					<Box
						baseClassName={styles.footer}
						slotKey="iab-banner.footer"
						data-testid="iab-consent-banner-footer"
						{...actionsProps}
					>
						<div {...actionGroupProps}>
							<Button.Root
								variant={isPrimary('reject') ? 'primary' : 'neutral'}
								mode="stroke"
								size="small"
								onClick={handleRejectAll}
								data-action="reject"
								data-testid="iab-consent-banner-reject-button"
							>
								{iabT.common.rejectAll}
							</Button.Root>
							<Button.Root
								variant={isPrimary('accept') ? 'primary' : 'neutral'}
								mode={isPrimary('accept') ? 'filled' : 'stroke'}
								size="small"
								onClick={handleAcceptAll}
								data-action="accept"
								data-testid="iab-consent-banner-accept-button"
							>
								{iabT.common.acceptAll}
							</Button.Root>
						</div>
						<div {...actionGroupProps}>
							<Button.Root
								variant={isPrimary('customize') ? 'primary' : 'neutral'}
								mode={isPrimary('customize') ? 'filled' : 'stroke'}
								size="small"
								onClick={handleCustomize}
								onFocus={warmDialogChunk}
								onPointerEnter={warmDialogChunk}
								data-action="customize"
								data-testid="iab-consent-banner-customize-button"
							>
								{iabT.common.customize}
							</Button.Root>
						</div>
					</Box>
				</IABConsentBannerCard>
			</Box>
		</IABConsentBannerRoot>
	);
};
