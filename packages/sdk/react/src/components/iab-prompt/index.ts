'use client';

import type { FC } from 'react';

import {
	IABConsentBannerButtonGroup,
	IABConsentBannerFooterSpacer,
} from './atoms/iab-prompt-button-group';
import { IABConsentBannerCard } from './atoms/iab-prompt-card';
import { IABConsentBannerDescription } from './atoms/iab-prompt-description';
import { IABConsentBannerFooter } from './atoms/iab-prompt-footer';
import { IABConsentBannerHeader } from './atoms/iab-prompt-header';
import { IABConsentBannerOverlay } from './atoms/iab-prompt-overlay';
import { IABConsentBannerRoot } from './atoms/iab-prompt-root';
import { IABConsentBannerTitle } from './atoms/iab-prompt-title';
import { IABConsentBanner as IABConsentBannerComponent } from './iab-prompt';
import type { IABConsentBannerProps } from './iab-prompt';

export interface IABConsentBannerCompoundComponent extends FC<IABConsentBannerProps> {
	Root: typeof IABConsentBannerRoot;
	Card: typeof IABConsentBannerCard;
	Header: typeof IABConsentBannerHeader;
	Title: typeof IABConsentBannerTitle;
	Description: typeof IABConsentBannerDescription;
	Footer: typeof IABConsentBannerFooter;
	ButtonGroup: typeof IABConsentBannerButtonGroup;
	FooterSpacer: typeof IABConsentBannerFooterSpacer;
	Overlay: typeof IABConsentBannerOverlay;
}

/**
 * IAB TCF 2.4 compliant cookie consent banner component.
 *
 * @example
 * Simple usage with default settings:
 * ```tsx
 * <IABConsentBanner />
 * ```
 *
 * @example
 * Using compound components for custom layout:
 * ```tsx
 * <IABConsentBanner.Root>
 *   <IABConsentBanner.Card>
 *     <IABConsentBanner.Header>
 *       <IABConsentBanner.Title>Privacy Settings</IABConsentBanner.Title>
 *       <IABConsentBanner.Description>We and our partners...</IABConsentBanner.Description>
 *     </IABConsentBanner.Header>
 *     <IABConsentBanner.Footer>
 *       <IABConsentBanner.ButtonGroup>
 *         <Button onClick={handleReject}>Reject All</Button>
 *         <Button onClick={handleAccept}>Accept All</Button>
 *       </IABConsentBanner.ButtonGroup>
 *     </IABConsentBanner.Footer>
 *   </IABConsentBanner.Card>
 * </IABConsentBanner.Root>
 * ```
 *
 * Note: Next.js Server Components do not support compound components.
 * Ensure you add 'use client' to the file.
 *
 * @public
 */
const IABConsentBanner = Object.assign(IABConsentBannerComponent, {
	ButtonGroup: IABConsentBannerButtonGroup,
	Card: IABConsentBannerCard,
	Description: IABConsentBannerDescription,
	Footer: IABConsentBannerFooter,
	FooterSpacer: IABConsentBannerFooterSpacer,
	Header: IABConsentBannerHeader,
	Overlay: IABConsentBannerOverlay,
	Root: IABConsentBannerRoot,
	Title: IABConsentBannerTitle,
}) as IABConsentBannerCompoundComponent;

export default IABConsentBanner;

export {
	IABConsentBannerButtonGroup,
	IABConsentBannerFooterSpacer,
} from './atoms/iab-prompt-button-group';
export { IABConsentBannerCard } from './atoms/iab-prompt-card';
export { IABConsentBannerDescription } from './atoms/iab-prompt-description';
export { IABConsentBannerFooter } from './atoms/iab-prompt-footer';
export { IABConsentBannerHeader } from './atoms/iab-prompt-header';
export { IABConsentBannerOverlay } from './atoms/iab-prompt-overlay';
export { IABConsentBannerRoot } from './atoms/iab-prompt-root';
export { IABConsentBannerTitle } from './atoms/iab-prompt-title';
export { IABConsentBanner, type IABConsentBannerProps };
