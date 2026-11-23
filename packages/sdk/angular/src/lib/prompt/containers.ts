/**
 * What the stock banner hands the consent prompt, and how it loads one
 * container at a time.
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

import type { SurfaceStyleSheet } from '../core/consent-styles';
import type { LegalLinkSelection } from '../shared/inline-legal-links';

/** Class names of one container's sheet (`consent-card`, `consent-banner` or `consent-drawer`). */
export type ContainerStyles = Readonly<Record<string, string>>;

/** One container: its stylesheets, in cascade order, and its class names. */
export interface ContainerModule {
	readonly sheets: readonly SurfaceStyleSheet[];
	readonly styles: ContainerStyles;
}

/** What the stock `<inth-consent-banner>` passes on to the prompt. */
export interface PromptSurfaceOptions {
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
export interface PromptSurfaceType {
	readonly options: unknown;
	readonly containerModule: unknown;
}

/** Loaders for the prompt and each container, one chunk each. */
export interface PromptLoaders {
	readonly surface: () => Promise<Type<PromptSurfaceType>>;
	readonly container: (
		type: ConsentContainer['type']
	) => Promise<ContainerModule>;
}

/**
 * Loads the consent prompt and the container it shows. One chunk per
 * container, each naming its own stylesheet, so a page downloads only the
 * container it shows; a page that never owes a choice downloads none.
 * Provide another to test what a page loads.
 *
 * @internal
 */
export const PROMPT_LOADERS = new InjectionToken<PromptLoaders>(
	'INTH_PROMPT_LOADERS',
	{
		factory: () => ({
			container: async (type) => {
				switch (type) {
					case 'banner':
						return (await import('./banner')).BANNER_CONTAINER;
					case 'drawer':
						return (await import('./drawer')).DRAWER_CONTAINER;
					default:
						return (await import('./card')).CARD_CONTAINER;
				}
			},
			surface: async () => (await import('./surface')).PromptSurface,
		}),
	}
);
