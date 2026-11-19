/** Accepts consent writes and session reports so nothing leaves the machine. */
export const GET = () => Response.json({});

export const POST = async (request: Request) => {
	const body = (await request.json().catch(() => ({}))) as {
		subjectId?: string;
	};
	return Response.json({
		recordId: '019a0000-0000-7000-8000-000000000002',
		subjectId: body.subjectId,
	});
};

export const PATCH = POST;
