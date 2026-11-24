import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, expect, it } from 'vite-plus/test';

interface Captured {
	vendor: string;
	path: string;
	kind: 'capture' | 'config' | 'other';
	events: string[];
	items: string[];
}

/** Poll for the port the server writes once it is listening. */
const readPort = async (file: string, attempts: number): Promise<string> => {
	const port = await readFile(file, 'utf8').catch(() => '');
	if (port) {
		return port;
	}
	if (attempts <= 0) {
		throw new Error('vendor capture server did not start');
	}
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});
	return readPort(file, attempts - 1);
};

let base = '';
let stop: () => void = () => {
	// Replaced once the server starts.
};

beforeAll(async () => {
	const out = await mkdtemp(join(tmpdir(), 'inth-vendor-capture-'));
	const server = spawn(
		'python3',
		[
			new URL('./vendor_capture.py', import.meta.url).pathname,
			'--port',
			'0',
			'--out',
			out,
		],
		{ stdio: 'ignore' }
	);
	stop = () => {
		server.kill();
	};
	const port = await readPort(join(out, 'vendor-capture-ready'), 100);
	base = `http://127.0.0.1:${port}`;
});

afterAll(() => stop());

const captured = async (query = ''): Promise<Captured[]> =>
	(await (await fetch(`${base}/captured${query}`)).json()).requests;

it('separates capture traffic from config fetches for each vendor', async () => {
	await fetch(`${base}/captured/reset`, { method: 'POST' });

	// PostHog mobile SDKs gzip their batches and fetch flags separately.
	const flags = await fetch(`${base}/vendor/posthog/flags/?v=2&config=true`, {
		body: '{}',
		method: 'POST',
	});
	expect((await flags.json()).featureFlags).toEqual({});
	const batch = await fetch(`${base}/vendor/posthog/batch/`, {
		body: gzipSync(
			JSON.stringify({ api_key: 'k', batch: [{ event: 'inth_probe' }] })
		),
		headers: { 'Content-Encoding': 'gzip' },
		method: 'POST',
	});
	expect(await batch.json()).toEqual({ status: 1 });

	// Mixpanel posts a form body and expects a bare "1".
	const track = await fetch(`${base}/vendor/mixpanel/track/?ip=1`, {
		body: `data=${encodeURIComponent(JSON.stringify([{ event: 'inth_probe' }]))}`,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		method: 'POST',
	});
	expect(await track.text()).toBe('1');

	await fetch(`${base}/vendor/amplitude/2/httpapi`, {
		body: JSON.stringify({
			api_key: 'k',
			events: [{ event_type: 'inth_probe' }],
		}),
		method: 'POST',
	});

	// A replay video payload declares its length and may contain newlines.
	const video = 'frame\nframe\n';
	await fetch(`${base}/vendor/sentry/api/1/envelope/`, {
		body: [
			'{"event_id":"1"}',
			'{"type":"replay_event"}',
			'{"type":"replay_event"}',
			`{"type":"replay_video","length":${video.length}}`,
			video,
			'{"type":"session"}',
			'{"status":"ok"}',
		].join('\n'),
		method: 'POST',
	});
	await fetch(`${base}/vendor/sentry/api/1/envelope/`, {
		body: ['{}', '{"type":"session"}', '{"status":"ok"}'].join('\n'),
		method: 'POST',
	});

	const all = await captured();
	expect(
		all.map(({ events, items, kind, vendor }) => ({
			events,
			items,
			kind,
			vendor,
		}))
	).toEqual([
		{ events: [], items: [], kind: 'config', vendor: 'posthog' },
		{ events: ['inth_probe'], items: [], kind: 'capture', vendor: 'posthog' },
		{ events: ['inth_probe'], items: [], kind: 'capture', vendor: 'mixpanel' },
		{ events: ['inth_probe'], items: [], kind: 'capture', vendor: 'amplitude' },
		{
			events: [],
			items: ['replay_event', 'replay_video', 'session'],
			kind: 'capture',
			vendor: 'sentry',
		},
		// A session update alone is not user data under Replay consent.
		{ events: [], items: ['session'], kind: 'other', vendor: 'sentry' },
	]);

	expect(
		(await captured('?vendor=posthog&kind=capture')).map(({ path }) => path)
	).toEqual(['/batch/']);
});

it('reads Mixpanel rows sent as base64 and rejects unknown vendors', async () => {
	await fetch(`${base}/captured/reset`, { method: 'POST' });
	const rows = Buffer.from(JSON.stringify([{ event: 'b64' }])).toString(
		'base64'
	);
	await fetch(`${base}/vendor/mixpanel/track/`, {
		body: `data=${rows}`,
		method: 'POST',
	});
	expect((await captured()).map(({ events }) => events)).toEqual([['b64']]);
	expect(
		(await fetch(`${base}/vendor/unknown/x`, { method: 'POST' })).status
	).toBe(404);
	expect(await captured()).toHaveLength(1);
});

it('reads chunked request bodies', async () => {
	await fetch(`${base}/captured/reset`, { method: 'POST' });
	const envelope = ['{}', '{"type":"replay_event"}', '{}'].join('\n');
	// A stream body makes fetch send Transfer-Encoding: chunked.
	await fetch(`${base}/vendor/sentry/api/1/envelope/`, {
		body: new Blob([envelope]).stream(),
		duplex: 'half',
		method: 'POST',
	} as RequestInit);
	expect(
		(await captured()).map(({ items, kind }) => ({ items, kind }))
	).toEqual([{ items: ['replay_event'], kind: 'capture' }]);
});
