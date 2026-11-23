import type {
	ConsentPresentation,
	PreferencesPresentation,
	PromptPresentation,
} from '@inth/sdk/engine';
import {
	applyExperimentAssignment,
	applyExperimentTheme,
} from '@inth/sdk/engine';
import { useMemo } from 'react';

import type { Theme } from '../types/theme';
import { useKernelSelector } from '../use-kernel-selector';
import { useUIConfig } from '../use-ui-config';

/** The assigned experiment arm; `useExperiment` without the import cycle. */
const useAssignment = () =>
	useKernelSelector((snapshot) => snapshot.experiment);

/**
 * The host presentation with the assigned experiment arm merged over it.
 *
 * @returns The presentation to render: `options.presentation` itself while
 * no arm is assigned.
 */
export const useResolvedPresentation = function useResolvedPresentation():
	| ConsentPresentation
	| undefined {
	const { experiment, presentation } = useUIConfig();
	const assignment = useAssignment();
	return useMemo(
		() => applyExperimentAssignment(presentation, experiment, assignment),
		[presentation, experiment, assignment]
	);
};

/**
 * The host theme with the assigned experiment arm's `theme` merged over it.
 * Render its tokens with `<ConsentTheme theme={useResolvedTheme()} />`.
 *
 * @returns The theme to render: `options.theme` itself while no arm is
 * assigned or the arm has no theme.
 */
export const useResolvedTheme = function useResolvedTheme(): Theme | undefined {
	const { experiment, theme } = useUIConfig();
	const assignment = useAssignment();
	return useMemo(
		() => applyExperimentTheme(theme, experiment, assignment),
		[theme, experiment, assignment]
	);
};

const EMPTY_PROMPT: PromptPresentation = {};
const EMPTY_PREFERENCES: PreferencesPresentation = {};
/** Host first-layer presentation, with the experiment arm applied. */
export const usePromptPresentation =
	function usePromptPresentation(): PromptPresentation {
		return useResolvedPresentation()?.prompt ?? EMPTY_PROMPT;
	};
/** Host persistent preferences presentation, with the experiment arm applied. */
export const usePreferencesPresentation =
	function usePreferencesPresentation(): PreferencesPresentation {
		return useResolvedPresentation()?.preferences ?? EMPTY_PREFERENCES;
	};
