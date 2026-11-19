import { createFileRoute } from '@tanstack/react-router';

import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '../../../../../bench/fixture';

export const Route = createFileRoute('/api/bench-consent/v1/consent/records')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				recordBenchConsentFixtureExecution('subjects');
				await applyBenchConsentLatency();
				const parsed: unknown = await request.json().catch(() => undefined);
				const subjectId =
					parsed !== null &&
					typeof parsed === 'object' &&
					'subjectId' in parsed &&
					typeof parsed.subjectId === 'string'
						? parsed.subjectId
						: 'benchmark-subject';
				return Response.json(
					{
						recordId: '019a0000-0000-7000-8000-000000000002',
						subjectId,
					},
					{
						headers: {
							'cache-control': 'no-store',
						},
					}
				);
			},
		},
	},
});
