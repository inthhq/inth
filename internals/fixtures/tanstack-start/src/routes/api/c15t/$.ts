import { createFileRoute } from '@tanstack/react-router';
import { createConsentRoute } from 'c15t/tanstack-start/api';

import { testBackend } from '../../../test-backend';

export const Route = createFileRoute('/api/c15t/$')({
	server: {
		handlers: createConsentRoute({
			projectUrl: 'https://your-project.inth.app',
			...testBackend('projectUrl'),
			proxy: true,
		}),
	},
});
