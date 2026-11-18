import { createConsentRoute } from '@inth/tanstack-start/api';
import { createFileRoute } from '@tanstack/react-router';

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
