/**
 * The page `script-files.e2e.test.ts` drives in Chromium: the production
 * consent runtime with `experimentalScriptRegistry` and the LogRocket
 * integration, bundled from source.
 */
import { createConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import type {
	KernelTransport,
	ProviderTransportFactory,
} from '@inth/sdk/transports';

import { logRocket } from '../vendors/analytics/logrocket';

const APP_ID = 'inth-test/script-files';

/** A mode whose init answers as `init` does, standing in for the backend. */
const initMode = (init: () => Promise<unknown>): ProviderTransportFactory =>
	Object.assign(
		(): KernelTransport => ({
			init: init as never,
			save: () => Promise.resolve({ ok: true }),
		}),
		{ kind: 'hosted' as const }
	);

export interface ScriptFilesPage {
	/** The script id the registry's `sources` key LogRocket by. */
	logRocketId: string;
	/**
	 * Load LogRocket by a registry list a resolved prefetch carries, with
	 * consent management off so it loads at once.
	 */
	start: (registry: unknown, initOptions?: Record<string, unknown>) => void;
	/** The script loader's `onDebug` errors, by message. */
	errors: string[];
	/**
	 * Start LogRocket on a runtime whose init waits for
	 * {@link ScriptFilesPage.answer}, so the list is pending.
	 */
	startPending: () => void;
	/** Answer the pending init with `registry`. */
	answer: (registry: unknown) => void;
	dispose: () => void;
}

declare global {
	interface Window {
		__scriptFiles: ScriptFilesPage;
	}
}

const runtimes: ConsentRuntime[] = [];
let answer: (registry: unknown) => void = () => undefined;

window.__scriptFiles = {
	answer: (registry) => answer(registry),
	dispose() {
		for (const runtime of runtimes.splice(0)) {
			runtime.dispose();
		}
	},
	errors: [],
	logRocketId: logRocket({ appId: APP_ID }).id,
	start(registry, initOptions) {
		const runtime = createConsentRuntime({
			enabled: false,
			experimentalScriptRegistry: true,
			mode: initMode(() => Promise.resolve({})),
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: registry as never,
			},
			scriptLoader: {
				onDebug: (event) => {
					if (event.action === 'error') {
						window.__scriptFiles.errors.push(event.message);
					}
				},
			},
			scripts: [logRocket({ appId: APP_ID, initOptions })],
		});
		runtimes.push(runtime);
		runtime.start();
	},
	startPending() {
		// Consent management on, so the runtime asks init; `necessary`, so
		// LogRocket needs no choice to load.
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			mode: initMode(
				() =>
					// oxlint-disable-next-line promise/avoid-new -- Settled by the test.
					new Promise((resolve) => {
						answer = (registry) => resolve({ scriptRegistry: registry });
					})
			),
			persistence: false,
			scripts: [{ ...logRocket({ appId: APP_ID }), category: 'necessary' }],
		});
		runtimes.push(runtime);
		runtime.start();
	},
};
