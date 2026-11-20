import { NextResponse } from 'next/server';

import { applyBenchBackendLatency } from '../../../../../bench-latency';

export const POST = async function POST(request: Request) {
	await applyBenchBackendLatency();
	const body = (await request.json()) as { subjectId?: string };
	return NextResponse.json(
		{
			recordId: '019a0000-0000-7000-8000-000000000002',
			subjectId: body.subjectId ?? 'benchmark-subject',
		},
		{
			headers: {
				'cache-control': 'no-store',
			},
		}
	);
};
