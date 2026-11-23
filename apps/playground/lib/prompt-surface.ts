/**
 * URL-driven prompt surface for the demo pages.
 *
 * `container`, `position` and `blocking=1` search params layer over a
 * scenario's own presentation so a visitor can try every Card, Banner and
 * Drawer without editing config. Kept free of React so
 * `prompt-surface.test.ts` runs in Node.
 */

import type {
	ConsentContainer,
	ConsentContainerType,
	ConsentExperiment,
	ConsentPresentation,
	PromptPresentation,
} from '@inth/sdk/engine';

/**
 * Arms of the demo's banner-shape experiment (`?experiment=1`). `control`
 * is the default banner shape.
 */
export const EXPERIMENT_ARMS = ['control', 'banner'] as const;

export type ExperimentArm = (typeof EXPERIMENT_ARMS)[number];

/** Prompt container chosen in the URL. Empty strings mean "let the resolver pick". */
export interface SurfaceParams {
	container: ConsentContainerType | '';
	/** The Card's position, the Banner's edge or the Drawer's side. */
	position: string;
	blocking: boolean;
	/** `experiment=1`: run the banner-shape experiment instead of `presentation`. */
	experiment: boolean;
	/** `arm=`: set the arm, as a flag provider would. Empty lets Inth pick. */
	arm: ExperimentArm | '';
}

export const EMPTY_SURFACE: SurfaceParams = {
	arm: '',
	blocking: false,
	container: '',
	experiment: false,
	position: '',
};

export const isExperimentArm = function isExperimentArm(
	value: string
): value is ExperimentArm {
	return (EXPERIMENT_ARMS as readonly string[]).includes(value);
};

export const CONTAINER_TYPES = [
	'card',
	'banner',
	'drawer',
] as const satisfies readonly ConsentContainerType[];

/** Where each container type may sit. Positions are logical. */
export const CONTAINER_POSITIONS = {
	banner: ['bottom', 'top'],
	card: ['start', 'end', 'center'],
	drawer: ['bottom', 'top', 'start', 'end'],
} as const satisfies Record<ConsentContainerType, readonly string[]>;

export const isContainerType = function isContainerType(
	value: string
): value is ConsentContainerType {
	return (CONTAINER_TYPES as readonly string[]).includes(value);
};

/** Whether a container accepts a position. Any container when `type` is empty. */
export const isPositionFor = function isPositionFor(
	type: ConsentContainerType | '',
	value: string
): boolean {
	const types = type ? [type] : CONTAINER_TYPES;
	return types.some((item) =>
		(CONTAINER_POSITIONS[item] as readonly string[]).includes(value)
	);
};

/**
 * Read the surface from search params. Unknown containers and positions the
 * container does not accept are dropped rather than passed to the resolver.
 */
export const parseSurfaceParams = function parseSurfaceParams(
	searchParams: URLSearchParams
): SurfaceParams {
	const rawContainer = searchParams.get('container') ?? '';
	const container = isContainerType(rawContainer) ? rawContainer : '';
	const rawPosition = searchParams.get('position') ?? '';
	const position = isPositionFor(container, rawPosition) ? rawPosition : '';
	const experiment = searchParams.get('experiment') === '1';
	const rawArm = searchParams.get('arm') ?? '';
	return {
		// An arm without the experiment has nothing to force.
		arm: experiment && isExperimentArm(rawArm) ? rawArm : '',
		blocking: searchParams.get('blocking') === '1',
		container,
		experiment,
		position,
	};
};

/** Write the surface into search params, omitting anything left to the resolver. */
export const applySurfaceParams = function applySurfaceParams(
	params: URLSearchParams,
	surface: SurfaceParams
): URLSearchParams {
	params.delete('container');
	params.delete('position');
	params.delete('blocking');
	params.delete('experiment');
	params.delete('arm');
	if (surface.container) {
		params.set('container', surface.container);
	}
	if (surface.position) {
		params.set('position', surface.position);
	}
	if (surface.blocking) {
		params.set('blocking', '1');
	}
	if (surface.experiment) {
		params.set('experiment', '1');
		if (surface.arm) {
			params.set('arm', surface.arm);
		}
	}
	return params;
};

/** Change the container and drop a position it cannot accept. */
export const setSurfaceContainer = function setSurfaceContainer(
	surface: SurfaceParams,
	container: ConsentContainerType | ''
): SurfaceParams {
	const position =
		surface.position && isPositionFor(container, surface.position)
			? surface.position
			: '';
	return { ...surface, container, position };
};

/** Positions the position control may offer for the chosen container. */
export const surfacePositionOptions = function surfacePositionOptions(
	container: ConsentContainerType | ''
): readonly string[] {
	return container ? CONTAINER_POSITIONS[container] : [];
};

/** The container the URL asks for, or `undefined` when it asks for none. */
export const surfaceContainer = function surfaceContainer(
	surface: Pick<SurfaceParams, 'container' | 'position'>
): ConsentContainer | undefined {
	switch (surface.container) {
		case 'card':
			return {
				position: (surface.position || undefined) as
					| 'start'
					| 'end'
					| 'center'
					| undefined,
				type: 'card',
			};
		case 'banner':
			return {
				edge: (surface.position || undefined) as 'bottom' | 'top' | undefined,
				type: 'banner',
			};
		case 'drawer':
			return {
				side: (surface.position || undefined) as
					| 'bottom'
					| 'top'
					| 'start'
					| 'end'
					| undefined,
				type: 'drawer',
			};
		default:
			return undefined;
	}
};

/** Layer the URL surface over a scenario's own presentation. */
export const withSurface = function withSurface(
	presentation: ConsentPresentation | undefined,
	surface: SurfaceParams
): ConsentPresentation | undefined {
	if (!surface.container && !surface.blocking) {
		return presentation;
	}
	const prompt: PromptPresentation = { ...presentation?.prompt };
	const container = surfaceContainer(surface);
	if (container) {
		prompt.container = container;
	}
	if (surface.blocking) {
		prompt.blockUntilChoice = true;
	}
	return { ...presentation, prompt };
};

/**
 * The demo's banner-shape experiment, or `undefined` when the URL did not
 * ask for one. `control` is the default Card; `banner` is the arm under
 * test, a bottom Banner, which is valid for both `choice` and `notice`
 * prompts. An `arm` in the URL shows host-resolved assignment; otherwise
 * Inth picks.
 */
export const demoExperiment = function demoExperiment(
	surface: Pick<SurfaceParams, 'arm' | 'experiment'>
): ConsentExperiment | undefined {
	if (!surface.experiment) {
		return undefined;
	}
	const experiment: ConsentExperiment<'banner'> = {
		arms: {
			banner: { prompt: { container: { edge: 'bottom', type: 'banner' } } },
		},
		id: 'banner-shape',
	};
	return surface.arm ? { ...experiment, arm: surface.arm } : experiment;
};
