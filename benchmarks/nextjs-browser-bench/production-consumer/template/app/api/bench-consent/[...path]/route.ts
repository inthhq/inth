import { setTimeout as sleep } from 'node:timers/promises';

import init from '../../../../fixture/init.json';
import manifest from '../../../../fixture/manifest.json';

/**
 * Deterministic consent backend for the production consumer. The harness
 * writes the fixture JSON before building. Every endpoint except `stats` answers
 * after `INTH_BENCH_BACKEND_LATENCY_MS`. `GET stats` reads how often the
 * SDK reached this origin; `POST stats` resets the counts.
 */
interface FixtureCounts {
	init: number;
	manifest: number;
	subjects: number;
	sessions: number;
}

const globalWithCounts = globalThis as typeof globalThis & {
	__inthConsumerFixtureCounts?: FixtureCounts;
};

const counts = (): FixtureCounts => {
	globalWithCounts.__inthConsumerFixtureCounts ??= {
		init: 0,
		manifest: 0,
		sessions: 0,
		subjects: 0,
	};
	return globalWithCounts.__inthConsumerFixtureCounts;
};

const applyLatency = async () => {
	const latencyMs = Number(process.env.INTH_BENCH_BACKEND_LATENCY_MS ?? '0');
	if (Number.isFinite(latencyMs) && latencyMs > 0) {
		await sleep(latencyMs);
	}
};

interface RouteContext {
	params: Promise<{ path: string[] }>;
}

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, context: RouteContext) => {
	const endpoint = (await context.params).path.join('/');
	if (endpoint === 'v1/consent/manifest') {
		counts().manifest += 1;
		await applyLatency();
		return Response.json(manifest, {
			headers: {
				'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400',
				etag: '"production-consumer-manifest"',
			},
		});
	}
	if (endpoint === 'v1/consent/init') {
		counts().init += 1;
		await applyLatency();
		return Response.json(init, { headers: { 'cache-control': 'no-store' } });
	}
	if (endpoint === 'stats') {
		return Response.json(counts(), {
			headers: { 'cache-control': 'no-store' },
		});
	}
	return new Response('Not found', { status: 404 });
};

export const POST = async (request: Request, context: RouteContext) => {
	const endpoint = (await context.params).path.join('/');
	if (endpoint === 'v1/consent/records') {
		counts().subjects += 1;
		await applyLatency();
		const body = (await request.json().catch(() => ({}))) as {
			subjectId?: string;
		};
		return Response.json(
			{
				recordId: '019a0000-0000-7000-8000-000000000002',
				subjectId: body.subjectId ?? 'benchmark-subject',
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	}
	if (endpoint === 'v1/consent/sessions') {
		counts().sessions += 1;
		await applyLatency();
		return new Response(null, { status: 204 });
	}
	if (endpoint === 'stats') {
		const current = counts();
		current.init = 0;
		current.manifest = 0;
		current.sessions = 0;
		current.subjects = 0;
		return Response.json(current, { headers: { 'cache-control': 'no-store' } });
	}
	return new Response('Not found', { status: 404 });
};
