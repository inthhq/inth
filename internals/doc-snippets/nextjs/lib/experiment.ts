import type { ConsentProviderCallbacks } from '@inth/nextjs';
import { defineExperiment } from '@inth/nextjs/engine';

/** `control` is the default banner; the `wall` arm blocks the page. */
export const bannerExperiment = defineExperiment({
	arms: { wall: { prompt: { variant: 'wall' } } },
	id: 'banner-shape',
});

const pushToDataLayer = (event: Record<string, unknown>) => {
	const page = window as Window & { dataLayer?: unknown[] };
	page.dataLayer ??= [];
	page.dataLayer.push(event);
};

export const experimentCallbacks = {
	onChoiceRecorded: ({ consentAction, experiment }) => {
		if (experiment) {
			pushToDataLayer({
				arm: experiment.arm,
				consent_action: consentAction,
				event: 'inth_choice_recorded',
				experiment_id: experiment.id,
			});
		}
	},
	onSurfaceShown: ({ experiment, surface }) => {
		if (experiment) {
			pushToDataLayer({
				arm: experiment.arm,
				event: 'inth_surface_shown',
				experiment_id: experiment.id,
				surface,
			});
		}
	},
} satisfies ConsentProviderCallbacks;
