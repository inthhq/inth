#!/usr/bin/env node
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@inth/benchmarking/consent-gate';
import type { GateServer } from '@inth/benchmarking/consent-gate';

/**
 * The gate page and the control page are two Angular applications.
 * `provideInthServer()` reads `provideInth()` from the root injector, so an
 * SSR app set up as the rendering guide says carries Inth in its main
 * bundle on every route. A inth-free control therefore needs its own build,
 * and each `@angular/ssr` server bundle runs one app per process. A small
 * router in front sends `/gate-control/*` to the control server and the
 * rest to the gate server, so both pages take the same extra hop.
 */
const appDir = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const routerPort = Number(process.env.INTH_GATE_SERVER_PORT ?? '4338');
const gatePort = Number(process.env.INTH_GATE_APP_PORT ?? '4339');
const controlPort = Number(process.env.INTH_GATE_CONTROL_PORT ?? '4340');
const proxyPort = Number(process.env.INTH_GATE_PORT ?? '4438');
const CONTROL_PREFIX = '/gate-control';

const forward = function forward(
	port: number,
	request: IncomingMessage,
	response: ServerResponse
): void {
	const outgoing = httpRequest(
		{
			headers: request.headers,
			host,
			method: request.method,
			path: request.url,
			port,
		},
		(incoming) => {
			response.writeHead(incoming.statusCode ?? 502, incoming.headers);
			incoming.pipe(response);
		}
	);
	outgoing.on('error', (error) => {
		if (!response.headersSent) {
			response.writeHead(502, { 'content-type': 'text/plain' });
		}
		response.end(`angular gate router: ${error.message}`);
	});
	request.pipe(outgoing);
};

const startRouter = async function startRouter(): Promise<Server> {
	const server = createServer((request, response) => {
		const path = request.url ?? '/';
		const control =
			path === CONTROL_PREFIX ||
			path.startsWith(`${CONTROL_PREFIX}/`) ||
			path.startsWith(`${CONTROL_PREFIX}?`);
		forward(control ? controlPort : gatePort, request, response);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(routerPort, host, () => resolve());
	});
	return server;
};

const startServers = async function startServers(
	backendLatencyMs: number
): Promise<GateServer> {
	const stops: (() => Promise<void>)[] = [];
	const stopAll = async () => {
		for (const stop of stops.toReversed()) {
			// oxlint-disable-next-line no-await-in-loop -- Shut down in order.
			await stop();
		}
	};
	try {
		const gate = await spawnGateServer({
			command: ['node', 'dist/gate/server/server.mjs'],
			cwd: appDir,
			env: {
				INTH_PROJECT_URL: `http://${host}:${gatePort}/api/bench-consent`,
				INTH_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}`,
				HOST: host,
				PORT: `${gatePort}`,
			},
			origin: `http://${host}:${gatePort}`,
			readyPath: '/gate',
		});
		stops.push(gate.stop);
		const control = await spawnGateServer({
			command: ['node', 'dist/control/server/server.mjs'],
			cwd: appDir,
			env: { HOST: host, PORT: `${controlPort}` },
			origin: `http://${host}:${controlPort}`,
			readyPath: `${CONTROL_PREFIX}/`,
		});
		stops.push(control.stop);
		const router = await startRouter();
		stops.push(
			() =>
				new Promise<void>((resolve) => {
					router.closeAllConnections();
					router.close(() => resolve());
				})
		);
	} catch (error) {
		await stopAll();
		throw error;
	}
	return { origin: `http://${host}:${routerPort}`, stop: stopAll };
};

try {
	await runConsentGate({
		framework: 'angular',
		notes: [
			'@inth/angular as the quickstart and rendering guide set it up: provideInth() with hosted() on the /api/inth consent route, provideInthServer() with that route, and the stock banner, dialog and inthConsentDialogLink in the root component. The control is a second Angular SSR app without inth.',
		],
		packageName: '@inth/angular-browser-bench',
		paths: { control: `${CONTROL_PREFIX}/`, gate: '/gate' },
		proxyPort,
		startServer: startServers,
		target: 'angular',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
