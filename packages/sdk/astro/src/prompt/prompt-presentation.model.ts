/**
 * The prompt's resolved presentation, and the container sheet a page
 * loads for it. Small and free of markup, so the server's stylesheet
 * component can ask before it renders anything.
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

/** The site options the prompt's presentation depends on. */
export interface PresentationOptions {
	presentation?: ConsentPresentation;
	experiment?: ConsentExperiment;
}

/**
 * The prompt's resolved presentation for a snapshot: the experiment arm
 * over the host's `presentation`, read the way React's banner reads it.
 */
export const resolvePromptPresentation = function resolvePromptPresentation(
	snapshot: ConsentSnapshot,
	options: PresentationOptions
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

/** The prompt's layouts, desktop and phone. */
export type PromptLayouts = NonNullable<
	ResolvedConsentPresentation['container']
>;

/** The container whose sheet a page loads: Card, Banner or Drawer. */
export type PromptContainerType = 'card' | 'banner' | 'drawer';

/** The sheet for the prompt's layouts: the desktop type decides, as in React. */
export const containerTypeOf = function containerTypeOf(
	layouts: PromptLayouts
): PromptContainerType {
	return layouts.desktop.type;
};

/**
 * The container a page renders the prompt in for this snapshot. The
 * prompt surface always resolves one.
 */
export const promptContainerType = function promptContainerType(
	snapshot: ConsentSnapshot,
	options: PresentationOptions
): PromptContainerType {
	const { container } = resolvePromptPresentation(snapshot, options);
	return container ? containerTypeOf(container) : 'card';
};
