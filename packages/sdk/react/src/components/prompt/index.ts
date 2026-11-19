'use client';

import type { FC } from 'react';

import { Overlay } from './atoms/overlay';
import { Root } from './atoms/root';
import {
	AcceptButton,
	Card,
	CustomizeButton,
	Description,
	DismissButton,
	Footer,
	FooterSubGroup,
	Header,
	RejectButton,
	RightLink,
	Rights,
	Title,
} from './components';
import { PolicyActions } from './policy-actions';
import { ConsentBanner as ConsentBannerComponent } from './prompt';
import type {
	ConsentBannerButton,
	ConsentBannerLayout,
	ConsentBannerProps,
} from './prompt';

export interface ConsentBannerCompoundComponent extends FC<ConsentBannerProps> {
	Root: typeof Root;
	Card: typeof Card;
	Header: typeof Header;
	Title: typeof Title;
	Description: typeof Description;
	PolicyActions: typeof PolicyActions;
	Footer: typeof Footer;
	FooterSubGroup: typeof FooterSubGroup;
	RejectButton: typeof RejectButton;
	CustomizeButton: typeof CustomizeButton;
	AcceptButton: typeof AcceptButton;
	DismissButton: typeof DismissButton;
	Rights: typeof Rights;
	RightLink: typeof RightLink;
	Overlay: typeof Overlay;
}
/**
 * A customizable consent banner component.
 *
 * @remarks
 * Start with the pre-built component and its existing configuration surface.
 * For most customization, use `InthProvider` options, theme tokens,
 * slots, and `theme.consentActions` before reaching for compound composition.
 *
 * @example
 * Simple usage with default settings:
 * ```tsx
 * <ConsentBanner />
 * ```
 *
 * @example
 * Preferred customization via provider `i18n`, theme tokens, and components:
 * ```tsx
 * <InthProvider
 *   options={{
 *     mode: hosted({ projectUrl: '/api/inth' }),
 *     i18n: {
 *       locale: 'en',
 *       messages: {
 *         en: {
 *           cookieBanner: { title: 'Privacy choices' },
 *         },
 *       },
 *     },
 *     theme: {
 *       colors: {
 *         surface: '#fffdf8',
 *         surfaceHover: '#f6f3ee',
 *       },
 *     },
 *     components: {
 *       banner: {
 *         card: { className: 'rounded-3xl' },
 *         footer: { className: 'border-t border-black/10' },
 *       },
 *     },
 *   }}
 * >
 *   <ConsentBanner primaryButton="accept" />
 * </InthProvider>
 * ```
 *
 * @example
 * Advanced custom markup with compound components:
 * ```tsx
 * <ConsentBanner.Root>
 *   <ConsentBanner.Card>
 *     <ConsentBanner.Header>
 *       <ConsentBanner.Title />
 *       <ConsentBanner.Description />
 *     </ConsentBanner.Header>
 *     <ConsentBanner.Footer>
 *       <ConsentBanner.CustomizeButton />
 *       <ConsentBanner.FooterSubGroup>
 *         <ConsentBanner.RejectButton />
 *         <ConsentBanner.AcceptButton />
 *       </ConsentBanner.FooterSubGroup>
 *     </ConsentBanner.Footer>
 *   </ConsentBanner.Card>
 * </ConsentBanner.Root>
 * ```
 * Note: Next.js Server Components do not support compound components. Ensure you add `'use client'` to the file.
 *
 * @public
 */
const ConsentBanner = Object.assign(ConsentBannerComponent, {
	AcceptButton,
	Actions: FooterSubGroup,

	Card,
	// Aliases for backward compatibility
	Content: Card,
	CustomizeButton,
	Description,
	DismissButton,
	Footer,
	FooterSubGroup,
	Header,
	Overlay,
	PolicyActions,
	RejectButton,
	RightLink,
	Rights,
	Root,
	Title,
}) as ConsentBannerCompoundComponent;

export default ConsentBanner;

// Export individual components for backward compatibility
export { ConsentBannerOverlay, Overlay } from './atoms/overlay';
export { ConsentBannerRoot, Root } from './atoms/root';
export {
	AcceptButton,
	Card,
	ConsentBannerAcceptButton,
	ConsentBannerCard,
	ConsentBannerCustomizeButton,
	ConsentBannerDescription,
	ConsentBannerDismissButton,
	ConsentBannerFooter,
	ConsentBannerFooterSubGroup,
	ConsentBannerHeader,
	ConsentBannerRejectButton,
	type ConsentBannerRight,
	ConsentBannerRightLink,
	type ConsentBannerRightLinkProps,
	ConsentBannerRights,
	type ConsentBannerRightsProps,
	ConsentBannerTitle,
	CustomizeButton,
	Description,
	DismissButton,
	Footer,
	FooterSubGroup,
	Header,
	RejectButton,
	RightLink,
	Rights,
	Title,
} from './components';
export {
	type ConsentBannerSurface,
	useConsentBannerSurface,
} from './surface-context';
export { useBannerCopy } from './use-banner-copy';
export {
	type ConsentBannerPolicyActionRenderProps,
	ConsentBannerPolicyActions,
	type ConsentBannerPolicyActionsProps,
	PolicyActions,
} from './policy-actions';
export {
	ConsentBanner,
	type ConsentBannerButton,
	type ConsentBannerLayout,
	type ConsentBannerProps,
};
