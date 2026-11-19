import { NextResponse } from 'next/server';

export const GET = async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id } = await params;
	const body = [
		`window.__inthScriptBench?.recordScriptExecution?.(${JSON.stringify(id)});`,
		`window.__inthScriptBench && (window.__inthScriptBench.scriptEvents[${JSON.stringify(id)}] = performance.now());`,
	].join('\n');

	return new NextResponse(body, {
		headers: {
			'cache-control': 'no-store',
			'content-type': 'application/javascript; charset=utf-8',
		},
	});
};
