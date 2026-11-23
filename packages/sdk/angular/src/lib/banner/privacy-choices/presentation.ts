/**
 * What the stock banner hands the Privacy Choices prompt, and how it loads
 * one presentation at a time.
 *
 * @packageDocumentation
 */

import { InjectionToken } from '@angular/core';
import type { Type } from '@angular/core';
import type {
	ConsentContainer,
	Model,
	PresentationAction,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

import type { SurfaceStyleSheet } from '../../core/consent-styles';
import type { LegalLinkSelection } from '../../shared/inline-legal-links';

/** Class names of one presentation's sheet (`consent-card`, `consent-bar` or `consent-drawer`). */
export type PresentationStyles = Readonly<Record<string, string>>;

/** One presentation: its stylesheets, in cascade order, and its class names. */
export interface PresentationModule {
	readonly sheets: readonly SurfaceStyleSheet[];
	readonly styles: PresentationStyles;
}

/** What the stock `<inth-consent-banner>` passes on to the Privacy Choices prompt. */
export interface PrivacyChoicesBannerOptions {
	readonly container: NonNullable<ResolvedConsentPresentation['container']>;
	/**
	 * The first-layer actions the policy allows, in the host's order and
	 * groups (`layout` on the stock banner).
	 */
	readonly actionGroups: readonly (readonly PresentationAction[])[];
	readonly noStyle: boolean;
	readonly disableAnimation: boolean;
	readonly legalLinks: LegalLinkSelection | undefined;
	readonly hideBranding: boolean;
	readonly models: readonly Model[];
	readonly heading: string | undefined;
	readonly description: string | undefined;
	readonly rejectButtonText: string | undefined;
	readonly acceptButtonText: string | undefined;
	readonly customizeButtonText: string | undefined;
	readonly dismissButtonText: string | undefined;
}

/** The prompt component the loaded chunk renders. */
export interface PrivacyChoicesSurfaceType {
	readonly options: unknown;
	readonly presentation: unknown;
}

/** Loaders for the prompt and each presentation, one chunk each. */
export interface PrivacyChoicesLoaders {
	readonly surface: () => Promise<Type<PrivacyChoicesSurfaceType>>;
	readonly presentation: (
		type: ConsentContainer['type']
	) => Promise<PresentationModule>;
}

/**
 * Loads the Privacy Choices prompt and the presentation it shows. One
 * chunk per presentation, each naming its own stylesheet, so a page
 * downloads only the presentation it shows; a page that never owes a
 * choice, or keeps the classic design, downloads none. Provide another to
 * test what a page loads.
 *
 * @internal
 */
export const PRIVACY_CHOICES_LOADERS =
	new InjectionToken<PrivacyChoicesLoaders>('INTH_PRIVACY_CHOICES_LOADERS', {
		factory: () => ({
			presentation: async (type) => {
				switch (type) {
					case 'banner':
						return (await import('./bar')).BAR_PRESENTATION;
					case 'drawer':
						return (await import('./drawer')).DRAWER_PRESENTATION;
					default:
						return (await import('./card')).CARD_PRESENTATION;
				}
			},
			surface: async () => (await import('./surface')).PrivacyChoicesSurface,
		}),
	});
