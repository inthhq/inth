import { init } from '@inth/sdk';

import { scripts } from './scripts';
import { testBackend } from './test-backend';

const consent = init({
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
	scripts,
});

document
	.querySelector('#privacy-settings')
	?.addEventListener('click', () => consent.openDialog());

if (import.meta.env.DEV) {
	const { mountDevTools } = await import('@inth/sdk/devtools');
	mountDevTools(consent, { defaultTab: 'scripts' });
}
