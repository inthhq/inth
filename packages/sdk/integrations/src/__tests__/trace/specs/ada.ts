import { vi } from 'vite-plus/test';

import { ada } from '../../../vendors/functional/ada';
import type { TraceSpec, TraceStep, TraceStubs } from '../harness';

const SDK_URL = 'https://messaging-assets.ada.support/sdk.js';

const createGate = () => {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { promise, resolve: open };
};

let stubs: TraceStubs | undefined;
let gate: ReturnType<typeof createGate> | undefined;
let gateOpen = false;
let entered = createGate();

// The SDK is an ES module the helper imports, not a tag.
const prepare = (pending: boolean) => () => {
	gate = pending ? createGate() : undefined;
	gateOpen = !pending;
	entered = createGate();
	// oxlint-disable-next-line anti-slop/no-module-mocking -- The remote ESM URL is the vendor boundary, as in the Ada e2e suite.
	vi.doMock(SDK_URL, async () => {
		stubs?.note({ import: SDK_URL });
		entered.resolve();
		await gate?.promise;
		return {
			createAdaEmbedInterface: stubs?.fn('createAdaEmbedInterface', () =>
				stubs?.api('adaEmbed', {
					start: () => Promise.resolve(),
					stop: () => Promise.resolve(),
				})
			),
		};
	});
};

const script: TraceSpec['script'] = () =>
	ada({ cluster: 'eu', handle: 'agent' });

export const adaTrace: TraceSpec = {
	granted: { functionality: true },
	name: 'ada',
	prepare: prepare(false),
	script,
	setup(current) {
		stubs = current;
	},
};

const importResolves: TraceStep = {
	label: 'the SDK import resolves',
	run() {
		gateOpen = true;
		gate?.resolve();
	},
};

/** The SDK import settles only when a step says so. */
export const adaPendingImportTrace: TraceSpec = {
	...adaTrace,
	name: 'ada.pending-import',
	prepare: prepare(true),
	scenarios: [
		{
			name: 'revoke while the SDK import is pending',
			start: 'granted',
			steps: ['deny', importResolves, 'grant', 'dispose'],
		},
		{
			name: 'revoke and regrant while the SDK import is pending',
			start: 'granted',
			steps: ['deny', 'grant', importResolves, 'deny', 'dispose'],
		},
	],
	standardScenarios: false,
	// While the gate is shut, an import that reached the mock never
	// settles; wait only until it starts.
	waitForImports: () =>
		gateOpen
			? vi.dynamicImportSettled()
			: Promise.race([vi.dynamicImportSettled(), entered.promise]),
};

export const traces = [adaTrace, adaPendingImportTrace];
