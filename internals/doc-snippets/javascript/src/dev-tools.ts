import { hosted, init } from '@inth/sdk';

import { runtime } from './consent-runtime';

const consent = init({
	mode: hosted(),
	projectUrl: 'https://your-project.inth.app',
});

// #region docs:devtools title="src/main.ts"
if (import.meta.env.DEV) {
	const { mountDevTools } = await import('@inth/sdk/devtools');
	mountDevTools(consent, { defaultTab: 'scripts' });
}
// #endregion docs:devtools

const { kernel } = runtime;

// #region docs:runtime-devtools title="src/consent-ui.ts"
if (import.meta.env.DEV) {
	const { createDevTools } = await import('@inth/sdk/devtools');
	const tools = createDevTools({ kernel });
	import.meta.hot?.dispose(() => tools.destroy());
}
// #endregion docs:runtime-devtools
