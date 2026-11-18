#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@inth/benchmarking/consent-gate';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INTH_GATE_SERVER_PORT ?? '4336');

try {
	await runConsentGate({
		framework: 'tanstack-start',
		notes: [
			"ConsentRoot with server-resolved state from the route loader (the ssr arm's per-request /init), stock banner and dialog, after CookieBench's TanStack Start fixture.",
		],
		packageName: '@inth/tanstack-start-browser-bench',
		paths: { control: '/gate-control', gate: '/gate' },
		proxyPort: Number(process.env.INTH_GATE_PORT ?? '4436'),
		startServer: (backendLatencyMs) =>
			spawnGateServer({
				command: ['node', join(appDir, 'scripts', 'serve.mjs')],
				cwd: appDir,
				env: {
					INTH_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}`,
					DIST_DIR: 'dist',
					HOST: '127.0.0.1',
					PORT: `${port}`,
				},
				origin: `http://127.0.0.1:${port}`,
				readyPath: '/gate-control',
			}),
		target: 'tanstack-start',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
