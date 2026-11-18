import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = ({ params }) => {
	const { id } = params;
	const body = [
		`window.__inthScriptBench?.recordScriptExecution?.(${JSON.stringify(id)});`,
		`window.__inthScriptBench && (window.__inthScriptBench.scriptEvents[${JSON.stringify(id)}] = performance.now());`,
	].join('\n');

	return new Response(body, {
		headers: {
			'cache-control': 'no-store',
			'content-type': 'application/javascript; charset=utf-8',
		},
	});
};
