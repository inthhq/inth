import { hosted } from '@c15t/nextjs';
import { resolveConsent } from '@c15t/nextjs/server';
import type { ReactNode } from 'react';

import { NextjsPrefetchedBenchmarkProvider } from '../_bench/provider';

const SSRLayout = async ({ children }: { children: ReactNode }) => {
	// The `ssr` arm resolves through the backend's /init on every request,
	// the same hosted mode its ConsentRoot uses. Without `mode`, the server
	// would resolve from the manifest instead.
	const state = await resolveConsent({
		config: { mode: hosted(), projectUrl: '/api/bench-consent' },
	});

	return (
		<NextjsPrefetchedBenchmarkProvider
			state={state}
			scenario="ssr"
		>
			{children}
		</NextjsPrefetchedBenchmarkProvider>
	);
};

export default SSRLayout;
