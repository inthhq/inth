'use client';

import { benchPolicy } from '@inth/benchmarking/bench-policy';
import { ConsentBanner, useEffectivePermissions } from '@inth/nextjs';
import { InthProvider } from '@inth/react';
// The provider takes a transport; `offline` from `@inth/nextjs` is data.

const BasicState = () => {
	const consents = useEffectivePermissions();
	return <pre>{JSON.stringify(consents, null, 2)}</pre>;
};
const NextjsBasicPage = () => (
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
			<h1>Next.js Basic Benchmark</h1>
			<BasicState />
		</main>
		<ConsentBanner />
	</InthProvider>
);

export default NextjsBasicPage;
