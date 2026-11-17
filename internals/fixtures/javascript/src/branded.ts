import { init } from '@c15t/browser';

import { scripts } from './scripts';
import { testBackend } from './test-backend';

const consent = init({
	projectUrl: 'https://your-project.inth.app',
	...testBackend('projectUrl'),
	scripts,
	ui: {
		theme: {
			colors: {
				primary: '#6943a3',
				primaryHover: '#533285',
				textOnPrimary: '#ffffff',
			},
			radius: { lg: '18px' },
		},
	},
});

document
	.querySelector('#privacy-settings')
	?.addEventListener('click', () => consent.openDialog());
