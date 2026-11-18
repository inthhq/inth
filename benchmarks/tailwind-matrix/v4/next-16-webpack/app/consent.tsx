'use client';

import { ConsentBanner, ConsentDialog, ConsentRoot } from 'c15t/next';
import type { ReactNode } from 'react';

const projectUrl = 'https://your-project.inth.app';

export const Consent = ({ children }: { children: ReactNode }) => (
	<ConsentRoot
		config={{ projectUrl }}
		persistence={false}
		state={{}}
		// #region docs:slot
		options={{
			components: {
				banner: {
					root: { className: 'p-[7px] dark:p-[11px]' },
				},
			},
		}}
		// #endregion docs:slot
	>
		{children}
		<ConsentBanner />
		<ConsentDialog />
	</ConsentRoot>
);
