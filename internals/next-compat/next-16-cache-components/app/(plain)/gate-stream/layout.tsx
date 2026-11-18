import { COMPAT_HOSTED_CONFIG } from '@inth/next-compat-shared/config';
import { ConsentShell } from '@inth/next-compat-shared/consent-shell';
import { resolveConsent } from '@inth/nextjs/server';
import type { ReactNode } from 'react';

/** The `ssr-stream` layout, with a gated embed in the page. */
const GateStreamLayout = ({ children }: { children: ReactNode }) => {
	const state = resolveConsent({ config: COMPAT_HOSTED_CONFIG });

	return (
		<ConsentShell
			styles={false}
			state={state}
			scenario="gate-stream"
		>
			{children}
		</ConsentShell>
	);
};

export default GateStreamLayout;
