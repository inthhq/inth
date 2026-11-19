'use client';

import { benchPolicy } from '@inth/benchmarking/bench-policy';
import { IABConsentDialog } from '@inth/react/iab';
import { InthProvider } from '@inth/react/provider';

const CssIabModulesPage = () => (
	<InthProvider
		options={{
			mode: benchPolicy({
				policy: [
					{
						id: 'bench-iab',
						match: { fallback: true, isDefault: true },
						model: 'iab',
						prompt: 'choice',
					},
				],
			}),
		}}
	>
		<main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
			<h1>React IAB + CSS Modules Benchmark</h1>
		</main>
		<IABConsentDialog />
	</InthProvider>
);

export default CssIabModulesPage;
