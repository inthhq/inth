import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	return Response.json(
		{
			recordId: '019a0000-0000-7000-8000-000000000002',
			subjectId: typeof body.subjectId === 'string' ? body.subjectId : undefined,
		},
		{
			headers: {
				'cache-control': 'no-store',
			},
		}
	);
};
