import { NextResponse } from 'next/server';

import {
	applyBenchConsentLatency,
	recordBenchConsentFixtureExecution,
} from '../../../fixture';

export const POST = async function POST(request: Request) {
	recordBenchConsentFixtureExecution('subjects');
	await applyBenchConsentLatency();
	const body = await request.json();
	return NextResponse.json(
		{
			recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
			subjectId: body.subjectId,
		},
		{
			headers: {
				'cache-control': 'no-store',
			},
		}
	);
};
