/**
 * Building blocks the stock surfaces share.
 *
 * @packageDocumentation
 * @internal
 */

export { Branding, resolveBranding, shouldShowBranding } from './branding';
export type {
	BrandingThemeKey,
	BrandingVariant,
	ResolvedBranding,
} from './branding';
export { ConsentButton } from './consent-button';
export type {
	ConsentButtonAction,
	ConsentButtonMode,
	ConsentButtonSize,
	ConsentButtonVariant,
} from './consent-button';
export { BrandMarkIcon, InthLogo } from './icons';
export { InlineLegalLinks, selectLegalLinks } from './inline-legal-links';
export type { LegalLinkEntry, LegalLinkSelection } from './inline-legal-links';
export { PolicyActions } from './policy-actions';
export type { PolicyActionContext } from './policy-actions';
export { resolvedTranslations } from './translations';
