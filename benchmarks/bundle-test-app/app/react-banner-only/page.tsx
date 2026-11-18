'use client';

import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import { ConsentBanner } from '@inth/react/components/consent-banner';
import { ConsentProvider } from '@inth/react/provider';

const ReactBannerOnlyPage = () => (
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
			<h1>React Banner Only Benchmark</h1>
			<p>This route isolates the consent banner component.</p>
		</main>
		<ConsentBanner />
	</ConsentProvider>
);

export default ReactBannerOnlyPage;
