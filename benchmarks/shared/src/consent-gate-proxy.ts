import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { constants as zlibConstants, createGzip, gzipSync } from 'node:zlib';

import { createGateHeroPng, gateScriptBody } from './consent-gate-assets';
import { GATE_HERO_PATH, GATE_SCRIPT_PATH } from './consent-gate-page';
import { loadBrowserBenchInit } from './policy-fixtures';

/**
 * What the gate proxy serves itself; everything else goes to `upstream`.
 */
export interface GateProxyOptions {
	port: number;
	/** Framework server origin, for example `http://127.0.0.1:4311`. */
	upstream?: string;
	/** Whole HTML pages served at exact paths (the script-tag fixture). */
	pages?: Record<string, string>;
	/** Path prefix to directory, served as static files. */
	directories?: Record<string, string>;
	/**
	 * Answer inth's hosted endpoints under this prefix (init, subjects)
	 * after `backendLatencyMs`, the way every bench's own fixture backend does.
	 */
	backendPrefix?: string;
	backendLatencyMs: number;
}

const TEXT_TYPES =
	/^(?:text\/|application\/(?:javascript|json|xml)|image\/svg)/u;

const contentTypes: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.mjs': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
};

const acceptsGzip = (request: IncomingMessage) =>
	/\bgzip\b/u.test(String(request.headers['accept-encoding'] ?? ''));

/**
 * Send a body the gate owns. Text is gzipped when the browser accepts it,
 * so a page's own bytes and the gate's are compressed alike.
 */
const send = function send(
	request: IncomingMessage,
	response: ServerResponse,
	body: Buffer | string,
	type: string
) {
	const bytes = typeof body === 'string' ? Buffer.from(body) : body;
	const compress = TEXT_TYPES.test(type) && acceptsGzip(request);
	const headers: Record<string, string> = {
		'cache-control': 'no-store',
		'content-type': type,
	};
	if (compress) {
		headers['content-encoding'] = 'gzip';
		headers.vary = 'accept-encoding';
	}
	response.writeHead(200, headers);
	response.end(compress ? gzipSync(bytes) : bytes);
};

/**
 * Forward to the framework server. Streaming responses stay streamed:
 * uncompressed text is gzipped with a sync flush per chunk, so a server that
 * flushes its banner early still reaches the browser early. Responses the
 * server already compressed pass through untouched.
 */
const forward = function forward(
	upstream: URL,
	request: IncomingMessage,
	response: ServerResponse
) {
	const outgoing = httpRequest(
		{
			headers: request.headers,
			host: upstream.hostname,
			method: request.method,
			path: request.url,
			port: upstream.port,
		},
		(incoming) => {
			const headers = { ...incoming.headers };
			const type = String(headers['content-type'] ?? '');
			const compress =
				!headers['content-encoding'] &&
				TEXT_TYPES.test(type) &&
				acceptsGzip(request) &&
				request.method !== 'HEAD' &&
				incoming.statusCode !== 204 &&
				incoming.statusCode !== 304;
			if (compress) {
				delete headers['content-length'];
				headers['content-encoding'] = 'gzip';
				headers.vary = headers.vary
					? `${headers.vary}, accept-encoding`
					: 'accept-encoding';
			}
			response.writeHead(incoming.statusCode ?? 502, headers);
			if (compress) {
				incoming
					.pipe(createGzip({ flush: zlibConstants.Z_SYNC_FLUSH }))
					.pipe(response);
			} else {
				incoming.pipe(response);
			}
		}
	);
	outgoing.on('error', (error) => {
		if (!response.headersSent) {
			response.writeHead(502, { 'content-type': 'text/plain' });
		}
		response.end(`gate proxy: ${error.message}`);
	});
	request.pipe(outgoing);
};

const serveDirectory = function serveDirectory(
	request: IncomingMessage,
	response: ServerResponse,
	directory: string,
	relative: string
): boolean {
	const path = normalize(join(directory, relative));
	if (!path.startsWith(normalize(directory)) || !existsSync(path)) {
		return false;
	}
	if (!statSync(path).isFile()) {
		return false;
	}
	send(
		request,
		response,
		readFileSync(path),
		contentTypes[extname(path)] ?? 'application/octet-stream'
	);
	return true;
};

/**
 * Start the proxy every gate visit goes through. It serves the hero image
 * and the gated scripts for every framework, so those bytes and their
 * headers are identical across frameworks and revisions, as CookieBench's
 * fixture proxy does for its shared article assets.
 *
 * @returns A function that closes the server.
 */
export const startGateProxy = async function startGateProxy(
	options: GateProxyOptions
): Promise<() => Promise<void>> {
	const hero = createGateHeroPng();
	const init = options.backendPrefix ? loadBrowserBenchInit() : undefined;
	const upstream = options.upstream ? new URL(options.upstream) : undefined;
	const handle = async (request: IncomingMessage, response: ServerResponse) => {
		const url = new URL(request.url ?? '/', 'http://gate.local');
		if (url.pathname === GATE_HERO_PATH) {
			send(request, response, hero, 'image/png');
			return;
		}
		if (url.pathname === GATE_SCRIPT_PATH) {
			send(
				request,
				response,
				gateScriptBody(
					url.searchParams.get('id') ?? 'unknown',
					url.searchParams.get('category') ?? 'unknown'
				),
				'text/javascript; charset=utf-8'
			);
			return;
		}
		const page = options.pages?.[url.pathname];
		if (page !== undefined) {
			send(request, response, page, 'text/html; charset=utf-8');
			return;
		}
		for (const [prefix, directory] of Object.entries(
			options.directories ?? {}
		)) {
			if (
				url.pathname.startsWith(prefix) &&
				serveDirectory(
					request,
					response,
					directory,
					url.pathname.slice(prefix.length)
				)
			) {
				return;
			}
		}
		if (
			init &&
			options.backendPrefix &&
			url.pathname.startsWith(options.backendPrefix)
		) {
			request.resume();
			await sleep(options.backendLatencyMs);
			const endpoint = url.pathname.slice(options.backendPrefix.length);
			send(
				request,
				response,
				JSON.stringify(
					endpoint.startsWith('/init')
						? await init
						: { ok: true, subjectId: 'benchmark-subject' }
				),
				'application/json'
			);
			return;
		}
		if (upstream) {
			forward(upstream, request, response);
			return;
		}
		response.writeHead(404, { 'content-type': 'text/plain' });
		response.end('not found');
	};
	const server: Server = createServer(async (request, response) => {
		try {
			await handle(request, response);
		} catch (error) {
			if (!response.headersSent) {
				response.writeHead(500, { 'content-type': 'text/plain' });
			}
			response.end(String(error));
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(options.port, '127.0.0.1', () => resolve());
	});
	return () =>
		new Promise<void>((resolve) => {
			server.closeAllConnections();
			server.close(() => resolve());
		});
};
