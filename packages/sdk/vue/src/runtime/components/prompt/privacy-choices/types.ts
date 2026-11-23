import type { ResolvedConsentPresentation } from '@inth/sdk/engine';

/** The prompt's resolved containers, for desktop and phone. */
export type PrivacyChoicesContainer = NonNullable<
	ResolvedConsentPresentation['container']
>;

/** Class names of one presentation's sheet (`consent-card`, `consent-bar` or `consent-drawer`). */
export type PresentationStyles = Readonly<Record<string, string>>;
