/**
 * `POST /api/inth/v1/consent/records`.
 *
 * `createConsentRoute()` without `proxy` serves init and manifest only —
 * saving consent is a backend write, so the manifest arms post to the same
 * fixture the direct arms do. Kept same-origin so the browser sees one
 * backend host.
 */
import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '$lib/server/fixture';
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	recordBenchConsentFixtureExecution('subjects');
	await applyBenchConsentLatency();
	const body = (await request.json().catch(() => ({}))) as {
		subjectId?: string;
	};
	return json(
		{
			recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
			subjectId: body.subjectId,
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
