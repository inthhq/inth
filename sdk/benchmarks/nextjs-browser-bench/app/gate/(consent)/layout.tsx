import { resolveConsent } from '@c15t/nextjs/server';
import type { ReactNode } from 'react';

import { typicalInstallConfig } from '../../_bench/typical-install-config';
import { GateConsent } from '../consent';

/**
 * Consent resolves without being awaited, so the article streams while it
 * settles, as CookieBench's Next.js fixture and the quickstart do. The
 * config is the `typical-install` arm's: this bench's local backend, which
 * sleeps for `C15T_BENCH_BACKEND_LATENCY_MS`.
 */
const GateLayout = ({ children }: { children: ReactNode }) => (
	<GateConsent state={resolveConsent({ config: typicalInstallConfig })}>
		{children}
	</GateConsent>
);

export default GateLayout;
