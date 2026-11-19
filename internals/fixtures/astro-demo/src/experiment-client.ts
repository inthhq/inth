import type { InthClientOptionsExtension } from '@inth/astro';
/**
 * `consent-client.ts` plus callbacks that push each impression and choice
 * made under a banner-experiment arm to `window.dataLayer` for GTM. The
 * showcase build uses it as the client entrypoint with `INTH_EXPERIMENT=1`.
 */
import type {
	OnChoiceRecordedPayload,
	OnSurfaceShownPayload,
} from '@inth/sdk/engine';

import consentClient from './consent-client';

/** Window event `components/experiment-readout.astro` listens for. */
const EXPERIMENT_EVENT = 'inth-example:experiment';

const pushToDataLayer = function pushToDataLayer(
	event: Record<string, unknown>
): void {
	const page = window as Window & { dataLayer?: unknown[] };
	page.dataLayer ??= [];
	page.dataLayer.push(event);
	window.dispatchEvent(new CustomEvent(EXPERIMENT_EVENT));
};

export default {
	...consentClient,
	callbacks: {
		onChoiceRecorded: ({
			consentAction,
			experiment,
		}: OnChoiceRecordedPayload) => {
			if (experiment) {
				pushToDataLayer({
					arm: experiment.arm,
					consent_action: consentAction,
					event: 'inth_choice_recorded',
					experiment_id: experiment.id,
				});
			}
		},
		onSurfaceShown: ({ experiment, surface }: OnSurfaceShownPayload) => {
			if (experiment) {
				pushToDataLayer({
					arm: experiment.arm,
					event: 'inth_surface_shown',
					experiment_id: experiment.id,
					surface,
				});
			}
		},
	},
} satisfies InthClientOptionsExtension;
