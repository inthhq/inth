import type {
	PresentationAction,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

/** The prompt's resolved containers, for desktop and phone. */
export type PromptContainer = NonNullable<
	ResolvedConsentPresentation['container']
>;

/** Class names of one container's sheet (`consent-card`, `consent-banner` or `consent-drawer`). */
export type ContainerStyles = Readonly<Record<string, string>>;

/**
 * The first-layer actions the policy allows, in the host's order and
 * groups.
 */
export type ActionGroups = readonly (readonly PresentationAction[])[];
