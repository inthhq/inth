'use client';

/**
 * Adapter over the current `@inth/nextjs` API. `next.config.ts` copies the
 * variant matching the installed package to `../root.tsx`, so the measured
 * fixture files stay identical on the base and head revisions. The
 * fixture's `projectUrl` prop goes into `config`, where the current root
 * reads it.
 */
import { ConsentRoot } from '@inth/nextjs';
import type { ConsentRootProps } from '@inth/nextjs';

export type RootState = ConsentRootProps['state'];

export const Root = ({
	projectUrl,
	...rest
}: ConsentRootProps & { projectUrl: string }) => (
	<ConsentRoot
		config={{ projectUrl }}
		{...rest}
	/>
);
