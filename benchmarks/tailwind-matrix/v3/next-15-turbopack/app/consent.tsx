'use client';

import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/nextjs';
import type { ReactNode } from 'react';

const projectUrl = 'https://your-project.inth.app';
export const Consent = ({ children }: { children: ReactNode }) => (
	<InthProvider
		config={{ projectUrl }}
		persistence={false}
		state={{}}
		// #region docs:slot
		options={{
			components: {
				banner: {
					root: { className: '!p-[7px] dark:!p-[11px]' },
				},
			},
			// Tailwind 3 builds Inth's stylesheet from globals.css.
			styles: false,
		}}
		// #endregion docs:slot
	>
		{children}
		<ConsentDialogLink />
		<ConsentBanner />
		<ConsentDialog />
	</InthProvider>
);
