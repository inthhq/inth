import { createElement } from 'react';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentProvider,
} from '../../../packages/sdk/react/src/index';
import { testing } from '../../../packages/sdk/react/src/testing';
import { benchmarkConsentOptions } from './fixtures';

export const CurrentConsentSurfaces = () => (
	<ConsentProvider
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
	</ConsentProvider>
);

export default createElement(CurrentConsentSurfaces);
