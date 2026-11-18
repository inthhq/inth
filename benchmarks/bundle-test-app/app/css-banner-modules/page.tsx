'use client';

import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import { ConsentBanner } from '@inth/react/consent-banner';
import { ConsentProvider } from '@inth/react/provider';

const CssBannerModulesPage = () => (
	<ConsentProvider
		options={{
			mode: benchPolicy({
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
		<main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
			<h1>React Banner + CSS Modules Benchmark</h1>
		</main>
		<ConsentBanner />
	</ConsentProvider>
);

export default CssBannerModulesPage;
