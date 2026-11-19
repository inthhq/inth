import { createElement } from 'react';

import {
	ConsentBanner,
	ConsentDialog,
	InthProvider,
} from '../../../packages/sdk/react/src/index';
import { testing } from '../../../packages/sdk/react/src/testing';
import { benchmarkConsentOptions } from './fixtures';

export const CurrentConsentSurfaces = () => (
	<InthProvider
		options={{
			...benchmarkConsentOptions,
			mode: testing({
				policy: [
					{
						id: 'bench-opt-in',
						match: { fallback: true, isDefault: true },
						model: 'opt-in',
						prompt: 'choice',
					},
				],
			}),
		}}
	>
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);

export default createElement(CurrentConsentSurfaces);
