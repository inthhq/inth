import type {
	ConsentExperiment,
	OnChoiceRecordedPayload,
	OnSurfaceShownPayload,
} from '@inth/sdk/engine';

/** One experiment event the page lists. */
export interface ExperimentLogEntry {
	name: 'inth_surface_shown' | 'inth_choice_recorded';
	arm: string;
	/** The surface shown, or the consent action recorded. */
	detail: string;
}

/** Impressions and choices made under the arm so far; the page lists them. */
export const experimentEvents = $state<ExperimentLogEntry[]>([]);

const pushToDataLayer = function pushToDataLayer(
	event: Record<string, unknown>
): void {
	const page = window as Window & { dataLayer?: unknown[] };
	page.dataLayer ??= [];
	page.dataLayer.push(event);
};

/**
 * Provider callbacks that log each impression and choice made under an
 * arm, and push them to `window.dataLayer` for GTM.
 */
export const experimentCallbacks = {
	onChoiceRecorded: ({
		consentAction,
		experiment,
	}: OnChoiceRecordedPayload) => {
		if (!experiment) {
			return;
		}
		pushToDataLayer({
			arm: experiment.arm,
			consent_action: consentAction,
			event: 'inth_choice_recorded',
			experiment_id: experiment.id,
		});
		experimentEvents.push({
			arm: experiment.arm,
			detail: consentAction,
			name: 'inth_choice_recorded',
		});
	},
	onSurfaceShown: ({ experiment, surface }: OnSurfaceShownPayload) => {
		if (!experiment) {
			return;
		}
		pushToDataLayer({
			arm: experiment.arm,
			event: 'inth_surface_shown',
			experiment_id: experiment.id,
			surface,
		});
		experimentEvents.push({
			arm: experiment.arm,
			detail: surface,
			name: 'inth_surface_shown',
		});
	},
};

/**
 * The banner-shape experiment, or `undefined` when the URL did not ask for
 * one. `control` is the default banner; `wall` blocks the page until the
 * visitor chooses. `?experiment=1` lets Inth pick the arm; `&arm=wall` sets
 * it the way a flag provider would.
 */
export const experimentFromSearch = function experimentFromSearch(
	params: Pick<URLSearchParams, 'get'>
): ConsentExperiment | undefined {
	if (params.get('experiment') !== '1') {
		return undefined;
	}
	const experiment: ConsentExperiment<'wall'> = {
		arms: {
			wall: { prompt: { container: { position: 'center', type: 'card' } } },
		},
		id: 'banner-shape',
	};
	const arm = params.get('arm');
	if (arm === null) {
		return experiment;
	}
	// From your flag provider. Omit it to let Inth pick.
	return { ...experiment, arm: arm === 'wall' ? 'wall' : 'control' };
};
