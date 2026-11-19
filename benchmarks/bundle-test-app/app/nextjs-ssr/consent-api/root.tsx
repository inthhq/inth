'use client';

/**
 * Adapter over the current `@inth/nextjs` API. `next.config.ts` copies the
 * variant matching the installed package to `../root.tsx`, so the measured
 * fixture files stay identical on the base and head revisions. The
 * fixture's `projectUrl` prop goes into `config`, where the current root
 * reads it.
 */
import { InthProvider } from '@inth/nextjs';
import type { InthProviderProps } from '@inth/nextjs';

export type RootState = InthProviderProps['state'];

export const Root = ({
	projectUrl,
	...rest
}: InthProviderProps & { projectUrl: string }) => (
	<InthProvider
		config={{ projectUrl }}
		{...rest}
	/>
);
