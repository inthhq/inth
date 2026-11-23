/**
 * Whether the stock banner renders the Privacy Choices design. Small and
 * free of markup, so the page's engine can ask before it loads the prompt.
 *
 * @internal
 */

import {
	applyExperimentAssignment,
	resolveConsentPresentation,
} from '@inth/sdk/engine';
import type {
	ConsentExperiment,
	ConsentPresentation,
	ConsentSnapshot,
	ResolvedConsentPresentation,
} from '@inth/sdk/engine';

/** The site options the design depends on. */
export interface DesignOptions {
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
}

/**
 * The prompt's resolved presentation for a snapshot: the experiment arm
 * over the host's `presentation`, read the way React's banner reads it.
 */
export const resolvePromptPresentation = function resolvePromptPresentation(
	snapshot: ConsentSnapshot,
	options: DesignOptions
): ResolvedConsentPresentation {
	return resolveConsentPresentation({
		policy: snapshot.policyRule,
		presentation: applyExperimentAssignment(
			options.presentation,
			options.experiment,
			snapshot.experiment
		),
		surface: 'prompt',
	});
};

/**
 * Whether the stock banner renders the Privacy Choices design for this
 * snapshot, with the same resolution React's `ConsentBanner` uses: the
 * host's `design`, else a prompt `container` from the host or the policy.
 */
export const usesPrivacyChoices = function usesPrivacyChoices(
	snapshot: ConsentSnapshot,
	options: DesignOptions
): boolean {
	const resolved = resolvePromptPresentation(snapshot, options);
	return resolved.design === 'privacy-choices' && resolved.container !== null;
};

/** The presentation whose sheet a page loads: the desktop container's type. */
export type PrivacyChoicesPresentation = 'card' | 'bar' | 'drawer';

/** The sheet for a container: the desktop type decides, as in React. */
export const presentationOf = function presentationOf(
	container: NonNullable<ResolvedConsentPresentation['container']>
): PrivacyChoicesPresentation {
	if (container.desktop.type === 'banner') {
		return 'bar';
	}
	return container.desktop.type === 'drawer' ? 'drawer' : 'card';
};

/**
 * The presentation a Privacy Choices page renders, or `null` on the
 * classic design.
 */
export const privacyChoicesPresentation = function privacyChoicesPresentation(
	snapshot: ConsentSnapshot,
	options: DesignOptions
): PrivacyChoicesPresentation | null {
	const resolved = resolvePromptPresentation(snapshot, options);
	return resolved.design === 'privacy-choices' && resolved.container
		? presentationOf(resolved.container)
		: null;
};
