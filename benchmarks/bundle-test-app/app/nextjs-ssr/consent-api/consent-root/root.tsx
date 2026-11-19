'use client';

/**
 * Adapter over the `@inth/nextjs` API from before the root was named
 * `InthProvider`. `next.config.ts` copies it to `../root.tsx` on a base
 * revision that still ships `ConsentRoot`; `tsconfig.json` excludes the
 * variant directories so neither side has to type-check the other's
 * imports.
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
