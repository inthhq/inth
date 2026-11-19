import type { APIRoute } from 'astro';

import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '../../../../../lib/fixture';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	recordBenchConsentFixtureExecution('subjects');
	await applyBenchConsentLatency();
	const body = (await request.json().catch(() => ({}))) as {
		subjectId?: string;
	};
	return Response.json(
		{
			recordId: '019a0000-0000-7000-8000-000000000002',
			subjectId: body.subjectId ?? 'benchmark-subject',
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
