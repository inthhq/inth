import { NextResponse } from 'next/server';

export const POST = async function POST(request: Request) {
	const body = (await request.json().catch(() => ({}))) as {
		subjectId?: string;
	};
	return NextResponse.json(
		{
			recordId: '019a0000-0000-7000-8000-000000000002',
			subjectId: body.subjectId,
		},
		{
			headers: {
				'cache-control': 'no-store',
			},
		}
	);
};
