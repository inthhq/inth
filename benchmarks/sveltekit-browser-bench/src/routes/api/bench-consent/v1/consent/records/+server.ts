import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '$lib/server/fixture';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	recordBenchConsentFixtureExecution('subjects');
	await applyBenchConsentLatency();
	// A body of literal `null` parses fine, so `.catch()` never runs and a
	// property read would throw; a non-string `subjectId` would also travel
	// straight back into the response.
	const body: unknown = await request.json().catch(() => null);
	const subjectId =
		typeof body === 'object' && body !== null
			? (body as { subjectId?: unknown }).subjectId
			: undefined;
	return json(
		{
			recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
			subjectId: typeof subjectId === 'string' ? subjectId : undefined,
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
