import { sentry } from '../../../vendors/analytics/sentry';
import type { SentryClient } from '../../../vendors/analytics/sentry';
import type { TraceSpec, TraceStep, TraceStubs } from '../harness';

interface Integration {
	name?: string;
	beforeSetup?: (client: SentryClient) => void;
	setup?: (client: SentryClient) => void;
}

interface ClientState {
	dataCollection: { userInfo: boolean };
	metadata: { sdk: { settings: { infer_ip: string } } };
	options: { enabled?: boolean };
}

let client: SentryClient | undefined;
let state: ClientState | undefined;

// A Replay that samples the session when it is added, like Sentry Replay.
const createReplay = (stubs: TraceStubs) => {
	let mode: 'session' | undefined;
	return {
		flush: stubs.fn('replay.flush', () => Promise.resolve()),
		getRecordingMode: () => mode,
		name: 'Replay',
		setup() {
			mode = 'session';
		},
		start: stubs.fn('replay.start', () => {
			mode = 'session';
		}),
		startBuffering: stubs.fn('replay.startBuffering'),
		stop: stubs.fn('replay.stop', () => {
			mode = undefined;
			return Promise.resolve();
		}),
	};
};

// The browser client keeps live option objects the adapter changes.
const createClient = (stubs: TraceStubs, enabled: unknown) => {
	const integrations = new Map<string, Integration>();
	const current: ClientState = {
		dataCollection: { userInfo: true },
		metadata: { sdk: { settings: { infer_ip: 'auto' } } },
		options: { enabled: enabled as boolean | undefined },
	};
	state = current;
	const created = {
		addEventProcessor: stubs.fn('client.addEventProcessor'),
		addIntegration: stubs.fn('client.addIntegration', (integration) => {
			const added = integration as Integration;
			if (added.name && !integrations.has(added.name)) {
				integrations.set(added.name, added);
				added.setup?.(created as unknown as SentryClient);
			}
		}),
		captureException: stubs.fn('client.captureException'),
		getDataCollectionOptions: () => current.dataCollection,
		getDsn: () => ({ host: 'o0.ingest.sentry.io' }),
		getIntegrationByName: (name: string) => integrations.get(name),
		getOptions: () => current.options,
		getSdkMetadata: () => current.metadata,
		on: stubs.fn('client.on'),
	};
	return created as unknown as SentryClient;
};

// bundle.min.js defines `Sentry`; replay.min.js adds `replayIntegration`.
const runFile = (src: string, stubs: TraceStubs) => {
	const existing = stubs.win.Sentry as Record<string, unknown> | undefined;
	if (src.endsWith('/replay.min.js')) {
		if (existing) {
			existing.replayIntegration = stubs.fn('Sentry.replayIntegration', () =>
				createReplay(stubs)
			);
		}
		return;
	}
	stubs.install('Sentry', {
		SDK_VERSION: '11.4.0',
		getClient: () => client,
		init: stubs.fn('Sentry.init', (options) => {
			const { enabled, integrations } = options as {
				enabled?: unknown;
				integrations?: (defaults: Integration[]) => Integration[];
			};
			client = createClient(stubs, enabled);
			for (const integration of integrations?.([]) ?? []) {
				integration.beforeSetup?.(client);
				integration.setup?.(client);
			}
		}),
		setUser: stubs.fn('Sentry.setUser'),
	});
};

/** What the client would send with now. */
const readClient: TraceStep = {
	label: 'read the client options',
	run({ stubs }) {
		stubs.note({ client: stubs.json(state ?? '[no client]') });
	},
};

export const sentryCdnTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'sentry.cdn',
	onFileLoad: runFile,
	scenarios: [
		{
			name: 'consent reaches the client',
			start: 'denied',
			steps: [
				'load',
				readClient,
				'grant',
				'load',
				readClient,
				'deny',
				readClient,
				'dispose',
				readClient,
			],
		},
	],
	script: () =>
		sentry({
			dsn: 'https://public@o0.ingest.sentry.io/0',
			initOptions: { release: 'trace@1.0.0', replaysSessionSampleRate: 1 },
		}),
	setup() {
		client = undefined;
		state = undefined;
	},
	// The adapter waits for paint, load and idle before it starts Replay.
	stepMs: 10_000,
};

export const traces = [sentryCdnTrace];
