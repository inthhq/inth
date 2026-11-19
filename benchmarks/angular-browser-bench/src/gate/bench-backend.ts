import { setTimeout as sleep } from 'node:timers/promises';

import { buildBrowserBenchManifest } from '@inth/benchmarking/policy-fixtures';
import express from 'express';

/**
 * Stand-in for the consent backend, mounted at `/api/bench-consent` by
 * `server.ts`. It serves the opt-in manifest every browser bench uses and
 * accepts saves and session reports. Each request waits
 * `INTH_BENCH_BACKEND_LATENCY_MS` first, as the other benches' fixtures do.
 */
export const benchBackend = express.Router();

const manifest = buildBrowserBenchManifest();
const MANIFEST_ETAG = '"angular-browser-bench-manifest"';

const latency = async function latency(): Promise<void> {
	const ms = Number(process.env['INTH_BENCH_BACKEND_LATENCY_MS'] ?? '0');
	if (Number.isFinite(ms) && ms > 0) {
		await sleep(ms);
	}
};

const serveManifest = async function serveManifest(
	request: express.Request,
	response: express.Response
): Promise<void> {
	await latency();
	response.set({
		'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
		etag: MANIFEST_ETAG,
	});
	if (request.get('if-none-match') === MANIFEST_ETAG) {
		response.status(304).end();
		return;
	}
	response.json(await manifest);
};

const saveSubject = async function saveSubject(
	request: express.Request,
	response: express.Response
): Promise<void> {
	await latency();
	const body: unknown = request.body;
	const subjectId =
		typeof body === 'object' && body !== null
			? (body as { subjectId?: unknown }).subjectId
			: undefined;
	response.set('cache-control', 'no-store').json({
		ok: true,
		subjectId:
			typeof subjectId === 'string' && subjectId
				? subjectId
				: 'benchmark-subject',
	});
};

type Handler = (
	request: express.Request,
	response: express.Response
) => Promise<void>;

/** Runs an async handler, handing a failure to `next`. Never rejects. */
const settle = async function settle(
	handler: Handler,
	request: express.Request,
	response: express.Response,
	next: express.NextFunction
): Promise<void> {
	try {
		await handler(request, response);
	} catch (failure) {
		return next(failure);
	}
};

benchBackend.get('/manifest', (request, response, next) => {
	void settle(serveManifest, request, response, next);
});
benchBackend.post('/subjects', express.json(), (request, response, next) => {
	void settle(saveSubject, request, response, next);
});

// The consent route reports each init it resolves; nothing waits on it.
benchBackend.post('/sessions', (_request, response) => {
	response.status(204).end();
});
