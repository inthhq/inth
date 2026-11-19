#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@inth/benchmarking/consent-gate';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.INTH_GATE_SERVER_PORT ?? '4331');

try {
	await runConsentGate({
		framework: 'react',
		notes: [
			'Client-rendered ConsentProvider in a Next.js app router page; the banner renders after hydration.',
		],
		packageName: '@inth/react-browser-bench',
		paths: { control: '/gate/control', gate: '/gate' },
		proxyPort: Number(process.env.INTH_GATE_PORT ?? '4431'),
		startServer: (backendLatencyMs) =>
			spawnGateServer({
				command: [
					'bun',
					'run',
					'start',
					'--',
					'-H',
					'127.0.0.1',
					'-p',
					`${port}`,
				],
				cwd: appDir,
				env: { INTH_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}` },
				origin: `http://127.0.0.1:${port}`,
				readyPath: '/gate/control',
			}),
		target: 'react',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
