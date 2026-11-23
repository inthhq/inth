import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	InthProvider,
} from '@inth/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './app.css';

const projectUrl = 'https://your-project.inth.app';

// #region docs:slot
const options = {
	components: {
		banner: {
			root: { className: 'p-[7px] dark:p-[11px]' },
		},
	},
	projectUrl,
};
// #endregion docs:slot

const root = document.querySelector('#root');
if (!root) {
	throw new Error('Missing #root');
}

createRoot(root).render(
	<StrictMode>
		<InthProvider options={{ ...options, persistence: false }}>
			<p
				className="bg-emerald-600 text-white"
				data-testid="tailwind-probe"
			>
				Tailwind utilities are active on this page.
			</p>
			<ConsentDialogLink />
			<ConsentBanner />
			<ConsentDialog />
		</InthProvider>
	</StrictMode>
);
