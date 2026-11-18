'use client';

import { benchPolicy } from '@c15t/benchmarking/bench-policy';
import {
	ConsentBanner,
	ConsentProvider,
	useEffectivePermissions,
} from '@inth/nextjs';
// The provider takes a transport; `offline` from `@inth/nextjs` is data.

const BasicState = () => {
	const consents = useEffectivePermissions();
	return <pre>{JSON.stringify(consents, null, 2)}</pre>;
};
const NextjsBasicPage = () => (
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
			<h1>Next.js Basic Benchmark</h1>
			<BasicState />
		</main>
		<ConsentBanner />
	</ConsentProvider>
);

export default NextjsBasicPage;
