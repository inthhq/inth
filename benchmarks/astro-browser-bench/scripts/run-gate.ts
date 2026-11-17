#!/usr/bin/env node
/**
 * Astro consent gate.
 *
 * Astro bakes the integration's options in at build time, and its boot
 * script runs on every page of a build that has the integration, so the gate
 * page and its no-CMP control come from two builds: `gate` (`dist-gate`) and
 * `baseline` (`dist-gate-baseline`, no c15t at all). Each runs its own server,
 * and a small path router in front of them gives the gate proxy one upstream:
 * `/gate/control` goes to the baseline server, everything else to the gate
 * server.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runConsentGate,
	spawnGateServer,
} from '@c15t/benchmarking/consent-gate';
import type { GateServer } from '@c15t/benchmarking/consent-gate';

const HOST = '127.0.0.1';
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appDir, '..', '..');
const port = Number(process.env.C15T_GATE_SERVER_PORT ?? '4334');
// Off the 433x range the other benches' gate servers default to.
const gatePort = port + 10;
const controlPort = port + 20;
const gateOrigin = `http://${HOST}:${gatePort}`;
const stampFile = 'c15t-gate-build.json';

const builds = {
	baseline: { mode: 'baseline', outDir: 'dist-gate-baseline' },
	gate: { mode: 'gate', outDir: 'dist-gate' },
} as const;
type GateBuild = keyof typeof builds;

/** Files under `path`, sorted, skipping `node_modules` and build output. */
const listFiles = function listFiles(path: string): string[] {
	if (!existsSync(path)) {
		return [];
	}
	if (!statSync(path).isDirectory()) {
		return [path];
	}
	return readdirSync(path)
		.filter((entry) => entry !== 'node_modules')
		.sort()
		.flatMap((entry) => listFiles(join(path, entry)));
};

/**
 * Hash of the app's sources and the built output of every workspace package
 * it depends on, transitively (the same inputs `run-bench.ts` stamps), so a
 * build is reused across rounds until something it reads changes.
 */
const computeInputHash = function computeInputHash(): string {
	const workspace = new Map<string, { deps: string[]; dir: string }>();
	for (const parent of ['packages/sdk', 'benchmarks', 'internals']) {
		const parentDir = join(repoRoot, parent);
		for (const entry of existsSync(parentDir) ? readdirSync(parentDir) : []) {
			const manifestPath = join(parentDir, entry, 'package.json');
			if (!existsSync(manifestPath)) {
				continue;
			}
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
				dependencies?: Record<string, string>;
				name?: string;
			};
			if (manifest.name) {
				workspace.set(manifest.name, {
					deps: Object.keys(manifest.dependencies ?? {}),
					dir: join(parentDir, entry),
				});
			}
		}
	}
	const app = JSON.parse(
		readFileSync(join(appDir, 'package.json'), 'utf8')
	) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	const pending = Object.keys({ ...app.dependencies, ...app.devDependencies });
	const visited = new Set<string>();
	const inputs = ['astro.config.mjs', 'package.json', 'public', 'src'].map(
		(entry) => join(appDir, entry)
	);
	while (pending.length > 0) {
		const name = pending.pop() as string;
		const entry = workspace.get(name);
		if (visited.has(name) || !entry) {
			continue;
		}
		visited.add(name);
		pending.push(...entry.deps);
		const built = join(entry.dir, 'dist');
		inputs.push(
			existsSync(built) ? built : join(entry.dir, 'src'),
			join(entry.dir, 'package.json')
		);
	}
	const hash = createHash('sha256');
	for (const file of inputs.flatMap(listFiles)) {
		hash.update(relative(repoRoot, file));
		hash.update('\0');
		hash.update(readFileSync(file));
		hash.update('\0');
	}
	return hash.digest('hex');
};

const ensureBuild = async function ensureBuild(
	build: GateBuild,
	inputs: string
): Promise<void> {
	const { mode, outDir } = builds[build];
	const stampPath = join(appDir, outDir, stampFile);
	const stamp = existsSync(stampPath)
		? (JSON.parse(readFileSync(stampPath, 'utf8')) as {
				inputs?: string;
				origin?: string;
			})
		: {};
	if (
		existsSync(join(appDir, outDir, 'server', 'entry.mjs')) &&
		stamp.inputs === inputs &&
		stamp.origin === gateOrigin
	) {
		process.stdout.write(`Reusing the ${build} build in ${outDir}.\n`);
		return;
	}
	process.stdout.write(`Building ${build} into ${outDir}.\n`);
	await new Promise<void>((_resolve, reject) => {
		const child = spawn('bun', ['run', 'build'], {
			cwd: appDir,
			env: {
				...process.env,
				C15T_BENCH_ASTRO_MODE: mode,
				// The gate build's server fetches its manifest from itself.
				C15T_BENCH_ORIGIN: gateOrigin,
				C15T_BENCH_OUT_DIR: `./${outDir}`,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let logs = '';
		child.stdout.on('data', (chunk) => {
			logs += String(chunk);
		});
		child.stderr.on('data', (chunk) => {
			logs += String(chunk);
		});
		child.on('exit', (code) =>
			code === 0
				? _resolve()
				: reject(new Error(logs || `astro ${build} build failed`))
		);
		child.on('error', reject);
	});
	writeFileSync(
		stampPath,
		`${JSON.stringify({ inputs, origin: gateOrigin })}\n`
	);
};

const startAstro = function startAstro(
	build: GateBuild,
	serverPort: number,
	backendLatencyMs: number
): Promise<GateServer> {
	return spawnGateServer({
		command: ['node', join(builds[build].outDir, 'server', 'entry.mjs')],
		cwd: appDir,
		env: {
			C15T_BENCH_BACKEND_LATENCY_MS: `${backendLatencyMs}`,
			HOST,
			PORT: `${serverPort}`,
		},
		origin: `http://${HOST}:${serverPort}`,
		readyPath: build === 'gate' ? '/gate' : '/gate/control',
	});
};

/** One origin for the gate proxy: the control path to baseline, the rest to gate. */
const startRouter = async function startRouter(): Promise<() => Promise<void>> {
	const server = createServer((request, response) => {
		const path = new URL(request.url ?? '/', 'http://router.local').pathname;
		const outgoing = httpRequest(
			{
				headers: request.headers,
				host: HOST,
				method: request.method,
				path: request.url,
				port: path === '/gate/control' ? controlPort : gatePort,
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
			response.end(`astro gate router: ${error.message}`);
		});
		request.pipe(outgoing);
	});
	await new Promise<void>((_resolve, reject) => {
		server.once('error', reject);
		server.listen(port, HOST, () => _resolve());
	});
	return () =>
		new Promise<void>((_resolve) => {
			server.closeAllConnections();
			server.close(() => _resolve());
		});
};

try {
	const inputs = computeInputHash();
	await ensureBuild('gate', inputs);
	await ensureBuild('baseline', inputs);
	await runConsentGate({
		framework: 'astro',
		notes: [
			"@c15t/astro in manifest mode with a runtime manifest from the fixture backend; server-rendered banner and dialog, gated scripts from a clientEntrypoint, as CookieBench's Astro fixture. The control page is a build without the integration.",
		],
		packageName: '@c15t/astro-browser-bench',
		paths: { control: '/gate/control', gate: '/gate' },
		proxyPort: Number(process.env.C15T_GATE_PORT ?? '4434'),
		startServer: async (backendLatencyMs) => {
			const gate = await startAstro('gate', gatePort, backendLatencyMs);
			const control = await startAstro(
				'baseline',
				controlPort,
				backendLatencyMs
			).catch(async (error: unknown) => {
				await gate.stop();
				throw error;
			});
			const stopRouter = await startRouter();
			return {
				origin: `http://${HOST}:${port}`,
				stop: async () => {
					await stopRouter();
					await Promise.all([gate.stop(), control.stop()]);
				},
			};
		},
		target: 'astro',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
