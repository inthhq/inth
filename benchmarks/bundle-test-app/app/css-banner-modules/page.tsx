'use client';

import { benchPolicy } from '@inth/benchmarking/bench-policy';
import { ConsentBanner } from '@inth/react/consent-banner';
import { InthProvider } from '@inth/react/provider';

const CssBannerModulesPage = () => (
	<InthProvider
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
	</InthProvider>
);

export default CssBannerModulesPage;
