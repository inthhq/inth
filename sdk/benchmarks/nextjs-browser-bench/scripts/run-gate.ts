#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@c15t/benchmarking/consent-gate';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.C15T_GATE_SERVER_PORT ?? '4332');

try {
	await runConsentGate({
		framework: 'nextjs',
		notes: [
			"ConsentRoot with an unawaited resolveConsent() over the typical-install config (manifest mode, local backend), as CookieBench's Next.js fixture sets it up.",
		],
		packageName: '@c15t/nextjs-browser-bench',
		paths: { control: '/gate/control', gate: '/gate' },
		proxyPort: Number(process.env.C15T_GATE_PORT ?? '4432'),
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
				env: { C15T_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}` },
				origin: `http://127.0.0.1:${port}`,
				readyPath: '/gate/control',
			}),
		target: 'nextjs',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
