'use client';

import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
	hosted,
} from '@inth/react';
import type { InthProviderOptions, WithProjectUrl } from '@inth/react';
import type { ReactNode } from 'react';

import { ReactBenchmarkProbe } from './probe';
import { getBenchState } from './state';
import type { ReactBenchScenario } from './state';

// Keep this fixture compatible with revisions before automatic styles.
type BenchmarkProviderOptions = WithProjectUrl<InthProviderOptions> & {
	styles?: boolean;
};

const consentCategories = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
] satisfies NonNullable<InthProviderOptions['consentCategories']>;

const benchTheme: NonNullable<InthProviderOptions['theme']> = {
	motion: {
		duration: {
			fast: '1ms',
			normal: '1ms',
			slow: '1ms',
		},
	},
};

export const ReactBenchmarkProvider = ({
	children,
	scenario,
	styles,
	theme = benchTheme,
}: {
	children: ReactNode;
	scenario: ReactBenchScenario;
	/** Set false for experiments that import their CSS explicitly. */
	styles?: BenchmarkProviderOptions['styles'];
	/** Defaults to the 1ms motion override only. */
	theme?: InthProviderOptions['theme'];
}) => {
	const options: BenchmarkProviderOptions = {
		callbacks: {
			onChoiceRecorded() {
				const state = getBenchState(scenario);
				if (state) {
					state.onChoiceRecordedCount += 1;
				}
			},
			onError() {
				const state = getBenchState(scenario);
				if (state) {
					state.onErrorCount += 1;
				}
			},
		},
		consentCategories,
		mode: hosted(),
		projectUrl: '/api/bench-consent',
		styles,
		theme,
	};

	return (
		<InthProvider options={options}>
			<ReactBenchmarkProbe scenario={scenario} />
			<ConsentBanner disableAnimation />
			<ConsentDialog disableAnimation />
			{children}
		</InthProvider>
	);
};
