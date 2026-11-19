#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@inth/benchmarking/consent-gate';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = Number(process.env.INTH_GATE_SERVER_PORT ?? '4335');
const proxyPort = Number(process.env.INTH_GATE_PORT ?? '4435');

try {
	await runConsentGate({
		framework: 'svelte',
		notes: [
			'@inth/svelte/kit inthHandle in manifest() mode with loadConsent; ConsentRoot server-renders the banner.',
		],
		packageName: '@inth/sveltekit-browser-bench',
		paths: { control: '/gate-control', gate: '/gate' },
		proxyPort,
		startServer: (backendLatencyMs) =>
			spawnGateServer({
				command: ['node', 'build/index.js'],
				cwd: appDir,
				env: {
					HOST: host,
					INTH_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}`,
					// The browser talks to the gate proxy, so adapter-node resolves
					// the relative manifest URL and checks request origins against it.
					ORIGIN: `http://${host}:${proxyPort}`,
					PORT: `${port}`,
				},
				origin: `http://${host}:${port}`,
				readyPath: '/gate-control',
			}),
		target: 'sveltekit',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
