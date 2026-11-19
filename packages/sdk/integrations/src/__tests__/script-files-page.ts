/**
 * The page `script-files.e2e.test.ts` drives in Chromium: the production
 * consent runtime with `experimentalScriptRegistry` and the LogRocket
 * integration, bundled from source.
 */
import { createConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { custom } from '@inth/sdk/transports';

import { logRocket } from '../vendors/analytics/logrocket';

const APP_ID = 'inth-test/script-files';

export interface ScriptFilesPage {
	/** The script id the registry's `sources` key LogRocket by. */
	logRocketId: string;
	/**
	 * Load LogRocket by a registry list a resolved prefetch carries, with
	 * consent management off so it loads at once.
	 */
	start: (registry: unknown) => void;
	/**
	 * Start a runtime whose init waits for {@link ScriptFilesPage.answer},
	 * so the list is pending.
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
	logRocketId: logRocket({ appId: APP_ID }).id,
	start(registry) {
		const runtime = createConsentRuntime({
			enabled: false,
			experimentalScriptRegistry: true,
			mode: custom({ init: () => Promise.resolve({}) as never }),
			persistence: false,
			prefetch: {
				initialPolicyPending: false,
				initialScriptRegistry: registry as never,
			},
			scripts: [logRocket({ appId: APP_ID })],
		});
		runtimes.push(runtime);
		runtime.start();
	},
	startPending() {
		const runtime = createConsentRuntime({
			experimentalScriptRegistry: true,
			mode: custom({
				init: () =>
					// oxlint-disable-next-line promise/avoid-new -- Settled by the test.
					new Promise((resolve) => {
						answer = (registry) => resolve({ scriptRegistry: registry });
					}) as never,
			}),
			persistence: false,
			// An integration, so the runtime mounts its script loader.
			scripts: [
				{
					category: 'necessary',
					id: 'placeholder',
					integration: 'placeholder',
					src: 'https://gateway.inth.test/scripts/placeholder.js',
				},
			],
		});
		runtimes.push(runtime);
		runtime.start();
	},
};
