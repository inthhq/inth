'use client';


import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import { IABConsentDialog } from '@c15t/react/iab';
import { ConsentProvider } from '@c15t/react/provider';

const CssIabModulesPage = () => (
	<ConsentProvider
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
	</ConsentProvider>
);

export default CssIabModulesPage;
