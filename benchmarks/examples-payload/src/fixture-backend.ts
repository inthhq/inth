/**
 * A consent backend for the examples: the `/v1` consent routes and the
 * script-tag build at `/inth.js`.
 *
 * The manifest comes from the measured checkout's own
 * `buildBrowserBenchManifest()`, so its schema and the example's runtime
 * always come from the same revision. Every example builds and runs
 * against this server, and the runner routes the hard-coded
 * `*.inth.app` hosts here too.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export interface FixtureBackend {
	url: string;
	manifest: unknown;
	init: unknown;
	/** Requests per endpoint since the last reset, keyed `GET /v1/consent/init`. */
	counts: () => Record<string, number>;
	reset: () => void;
	close: () => Promise<void>;
}

export interface FixtureBackendOptions {
	/** Checkout whose policy fixtures and browser build to serve. */
	root: string;
	port: number;
	latencyMs: number;
}

interface PolicyFixturesModule {
	buildBrowserBenchManifest: () => unknown;
	resolveBrowserBenchInit: (manifest: never) => unknown;
}

/**
 * Set by the runner when it routes a hard-coded host here, so `/inth.js`
 * is configured for the origin the page asked for.
 */
export const PUBLIC_ORIGIN_HEADER = 'x-examples-payload-origin';

const FIXTURE_SUBJECT_ID = '019a0000-0000-7000-8000-000000000001';
const FIXTURE_RECORD_ID = '019a0000-0000-7000-8000-000000000002';

/**
 * The configuration `@c15t/backend` puts in front of the full script-tag
 * build (`packages/backend/src/http/script.ts`): hosted mode against the
 * backend that served it.
 */
export const scriptPrelude = function scriptPrelude(projectUrl: string) {
	const config = JSON.stringify({ mode: 'hosted', projectUrl });
	return `(function(c){window.inth=window.inth||[];Array.isArray(window.inth)?window.inth.unshift(["config",c]):window.inth.config(c)})(${config});\n`;
};

const readBody = async function readBody(
	request: IncomingMessage
): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
};

/**
 * Cross-origin with credentials: echo the caller's origin and any
 * requested headers, because examples send Inth's protocol headers.
 */
const corsHeaders = function corsHeaders(
	request: IncomingMessage
): Record<string, string> {
	const { origin } = request.headers;
	if (!origin) {
		return {};
	}
	return {
		'access-control-allow-credentials': 'true',
		'access-control-allow-headers':
			request.headers['access-control-request-headers'] ?? '*',
		'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
		'access-control-allow-origin': origin,
		'access-control-max-age': '600',
		vary: 'origin',
	};
};

/**
 * Start the fixture backend for one checkout.
 *
 * @param options - Checkout root, port and simulated latency.
 * @returns The running backend.
 */
export const startFixtureBackend = async function startFixtureBackend(
	options: FixtureBackendOptions
): Promise<FixtureBackend> {
	const fixturesPath = join(
		options.root,
		'benchmarks/shared/src/policy-fixtures.ts'
	);
	const fixtures = (await import(
		pathToFileURL(fixturesPath).href
	)) as PolicyFixturesModule;
	const manifest = await fixtures.buildBrowserBenchManifest();
	const init = await fixtures.resolveBrowserBenchInit(manifest as never);
	const browserDist = join(options.root, 'packages/sdk/browser/dist');
	let counts: Record<string, number> = {};

	const json = function json(
		request: IncomingMessage,
		response: ServerResponse,
		status: number,
		body: unknown,
		cacheControl = 'no-store'
	) {
		response.writeHead(status, {
			...corsHeaders(request),
			'cache-control': cacheControl,
			'content-type': 'application/json',
		});
		response.end(JSON.stringify(body));
	};

	/** The script-tag build and the chunks it loads next to itself. */
	const serveScript = function serveScript(
		request: IncomingMessage,
		response: ServerResponse,
		path: string
	) {
		const file = join(browserDist, basename(path));
		if (!existsSync(file)) {
			response.writeHead(404, corsHeaders(request));
			response.end();
			return;
		}
		response.writeHead(200, {
			...corsHeaders(request),
			'cache-control': 'no-store',
			'content-type': path.endsWith('.css')
				? 'text/css'
				: 'text/javascript; charset=utf-8',
		});
		const projectUrl =
			request.headers[PUBLIC_ORIGIN_HEADER] ?? `http://${request.headers.host}`;
		response.end(
			path === '/inth.js'
				? `${scriptPrelude(String(projectUrl))}${readFileSync(file, 'utf8')}`
				: readFileSync(file)
		);
	};

	const handle = async function handle(
		request: IncomingMessage,
		response: ServerResponse
	) {
		const method = request.method ?? 'GET';
		const path = new URL(request.url ?? '/', 'http://fixture').pathname;
		if (method === 'OPTIONS') {
			response.writeHead(204, corsHeaders(request));
			response.end();
			return;
		}
		const key = path.startsWith('/v1/subjects/')
			? `${method} /v1/subjects/:id/link`
			: `${method} ${path}`;
		counts[key] = (counts[key] ?? 0) + 1;
		if (method === 'GET' && /\.(?:js|css)$/u.test(path)) {
			serveScript(request, response, path);
			return;
		}
		if (options.latencyMs > 0) {
			await sleep(options.latencyMs);
		}
		if (path === '/v1/consent/manifest' && method === 'GET') {
			json(request, response, 200, manifest, 'public, max-age=60');
			return;
		}
		if (path === '/v1/consent/init') {
			json(request, response, 200, init);
			return;
		}
		if (path === '/v1/consent/records' && method === 'POST') {
			const body = (JSON.parse((await readBody(request)) || '{}') ?? {}) as {
				subjectId?: string;
			};
			// A `sub_` ID is answered with the subject's UUID, as the backend does.
			json(request, response, 200, {
				recordId: FIXTURE_RECORD_ID,
				subjectId:
					body.subjectId && !body.subjectId.startsWith('sub_')
						? body.subjectId
						: FIXTURE_SUBJECT_ID,
			});
			return;
		}
		if (path.startsWith('/v1/subjects/') && method === 'POST') {
			await readBody(request);
			json(request, response, 200, {});
			return;
		}
		json(request, response, 404, { error: `no fixture for ${key}` });
	};

	const server = createServer(async (request, response) => {
		try {
			await handle(request, response);
		} catch (error) {
			response.writeHead(500);
			response.end(String(error));
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port, '127.0.0.1', () => resolve());
	});

	return {
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
		counts: () => ({ ...counts }),
		init,
		manifest,
		reset: () => {
			counts = {};
		},
		url: `http://127.0.0.1:${options.port}`,
	};
};
