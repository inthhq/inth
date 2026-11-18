#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@c15t/benchmarking/consent-gate';
import type { GateServer } from '@c15t/benchmarking/consent-gate';
import { baselineServerOutputDir } from '@c15t/benchmarking/nuxt-baseline';

/**
 * Nuxt consent gate. The `@inth/vue` module applies to every page of the
 * full build, so the control page comes from the zero-consent baseline build
 * (C15T_BENCH_BASELINE=1), which omits the module. Both servers run, and a
 * small router in front of them sends the control page and the baseline's
 * `/_nuxt-baseline/` assets to the baseline server and everything else to
 * the full build. The gate proxy forwards to that router.
 */
const appDir = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const routerPort = Number(process.env.C15T_GATE_SERVER_PORT ?? '4333');
const fullPort = routerPort + 1;
const baselinePort = routerPort + 2;
const baselineEntry = join(baselineServerOutputDir, 'server', 'index.mjs');

const latestMtimeMs = (path: string): number =>
	statSync(path).isDirectory()
		? Math.max(
				statSync(path).mtimeMs,
				...readdirSync(path).map((name) => latestMtimeMs(join(path, name)))
			)
		: statSync(path).mtimeMs;

// Turbo builds the full app; the baseline build is this bench's own second
// build, so rebuild it whenever the app sources are newer than its output.
const baselineStale =
	!existsSync(baselineEntry) ||
	Math.max(
		latestMtimeMs(join(appDir, 'app')),
		statSync(join(appDir, 'nuxt.config.ts')).mtimeMs
	) > statSync(baselineEntry).mtimeMs;
if (baselineStale) {
	execFileSync('bun', ['run', 'build'], {
		cwd: appDir,
		env: { ...process.env, C15T_BENCH_BASELINE: '1' },
		stdio: 'inherit',
	});
}

const serverEnv = (port: number, backendLatencyMs: number) => ({
	C15T_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}`,
	HOST,
	NITRO_HOST: HOST,
	NITRO_PORT: `${port}`,
	// nuxt.config.ts bakes the fixture manifest URL for the default port.
	NUXT_PUBLIC_C15T_MODE_MANIFEST_URL: `http://${HOST}:${port}/api/bench-consent/manifest`,
	PORT: `${port}`,
});

const isBaselinePath = (url: string) =>
	url === '/gate/control' ||
	url.startsWith('/gate/control?') ||
	url.startsWith('/gate/control/') ||
	url.startsWith('/_nuxt-baseline/');

const startServers = async function startServers(
	backendLatencyMs: number
): Promise<GateServer> {
	const full = await spawnGateServer({
		command: ['node', join(appDir, '.output', 'server', 'index.mjs')],
		cwd: appDir,
		env: serverEnv(fullPort, backendLatencyMs),
		origin: `http://${HOST}:${fullPort}`,
		readyPath: '/gate',
	});
	const baseline = await spawnGateServer({
		command: ['node', baselineEntry],
		cwd: appDir,
		env: serverEnv(baselinePort, backendLatencyMs),
		origin: `http://${HOST}:${baselinePort}`,
		readyPath: '/gate/control',
	}).catch(async (error: unknown) => {
		await full.stop();
		throw error;
	});
	const router = createServer((request, response) => {
		const port = isBaselinePath(request.url ?? '/') ? baselinePort : fullPort;
		const outgoing = httpRequest(
			{
				headers: request.headers,
				host: HOST,
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
			response.end(`nuxt gate router: ${error.message}`);
		});
		request.pipe(outgoing);
	});
	await new Promise<void>((resolve, reject) => {
		router.once('error', reject);
		router.listen(routerPort, HOST, () => resolve());
	});
	return {
		origin: `http://${HOST}:${routerPort}`,
		stop: async () => {
			router.closeAllConnections();
			await new Promise<void>((resolve) => {
				router.close(() => resolve());
			});
			await Promise.all([full.stop(), baseline.stop()]);
		},
	};
};

try {
	await runConsentGate({
		framework: 'vue',
		notes: [
			'Nuxt with the @inth/vue module in its built manifest() mode, resolved on the server; the control page comes from the zero-consent baseline build.',
		],
		packageName: '@inth/vue',
		paths: { control: '/gate/control', gate: '/gate' },
		proxyPort: Number(process.env.C15T_GATE_PORT ?? '4433'),
		startServer: startServers,
		target: 'nuxt',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
