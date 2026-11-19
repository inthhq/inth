// #region docs:experiment-consent title="src/consent.tsx"
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/react';
import type { InthProviderCallbacks } from '@inth/react';
import { defineExperiment } from '@inth/react/engine';
import type { ReactNode } from 'react';

import { scripts } from './scripts';

const projectUrl = 'https://your-project.inth.app';

// `control` is the stock banner. `wall` blocks the page until the visitor
// chooses.
const bannerExperiment = defineExperiment({
	arms: { wall: { prompt: { variant: 'wall' } } },
	id: 'banner-shape',
});

const pushToDataLayer = (event: Record<string, unknown>) => {
	const page = window as Window & { dataLayer?: unknown[] };
	page.dataLayer ??= [];
	page.dataLayer.push(event);
};

// Forward each impression and choice made under an arm to your analytics.
const callbacks = {
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
} satisfies InthProviderCallbacks;

export const Consent = ({
	arm,
	children,
}: {
	/**
	 * The arm your flag provider resolved. Omit it to let Inth pick, or pass
	 * `off` to leave this visitor out of the experiment.
	 */
	arm?: 'control' | 'wall' | 'off';
	children: ReactNode;
}) => (
	<InthProvider
		options={{
			callbacks,
			experiment: arm === 'off' ? undefined : { ...bannerExperiment, arm },
			projectUrl,
			scripts,
		}}
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
		<footer>
			<ConsentDialogLink>Privacy settings</ConsentDialogLink>
		</footer>
	</InthProvider>
);
// #endregion docs:experiment-consent
