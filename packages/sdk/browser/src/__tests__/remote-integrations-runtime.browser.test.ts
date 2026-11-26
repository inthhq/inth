/**
 * Every integration in `@inth/integrations/remote`, sent by the same test
 * backend as `remote-integrations.browser.test.ts`, through the npm path:
 * the core runtime with `remoteScripts` and its default modules, which
 * import the manifest runtime and each adapter on demand.
 *
 * On a failure the message is a table of every integration's state.
 */
import { subscribeToScriptDebugEvents } from '@inth/sdk-core';
import { createConsentRuntime } from '@inth/sdk-core/runtime';
import { afterEach, beforeAll, expect, it } from 'vite-plus/test';
import { commands } from 'vite-plus/test/browser';

import type { RemoteIntegrationList } from './fixtures/remote-integrations-list';
import {
	KNOWN_GAPS,
	acceptedRows,
	failingKeys,
	fetchRemoteIntegrations,
	formatRows,
	settle,
} from './fixtures/remote-integrations-report';
import type {
	DebugEvent,
	PageState,
	ZarazCalls,
} from './fixtures/remote-integrations-report';

let list: RemoteIntegrationList;
const debug: DebugEvent[] = [];
const zarazCalls: ZarazCalls = [];
const cleanups: (() => void)[] = [];

beforeAll(async () => {
	await commands.watchRequests();
	list = await fetchRemoteIntegrations();
	cleanups.push(
		subscribeToScriptDebugEvents((event) => {
			debug.push(event);
		})
	);
	// Zaraz's consent API, with the purposes the site's Zaraz dashboard
	// defines, as the script-tag page has it.
	const purposes: Record<string, boolean> = Object.fromEntries(
		list.zarazPurposes.map((id) => [id, false])
	);
	(window as { zaraz?: unknown }).zaraz = {
		consent: {
			APIReady: true,
			getAll: () => ({ ...purposes }),
			sendQueuedEvents: () => undefined,
			set: (next: Record<string, boolean>) => {
				zarazCalls.push(next);
				Object.assign(purposes, next);
			},
		},
	};
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	localStorage.clear();
});

it('loads every integration the Inth server lists after an accept, through createConsentRuntime with remoteScripts', async () => {
	const runtime = createConsentRuntime({
		projectUrl: `${location.origin}/__inth-init__/backend-remote-all`,
		remoteScripts: true,
	});
	cleanups.push(() => runtime.dispose());
	runtime.start();
	await expect
		.poll(() => runtime.kernel.getSnapshot().policyPending, { timeout: 8000 })
		.toBe(false);
	await runtime.kernel.commands.save('all');

	const thirdParty: string[] = [];
	const read = async (): Promise<PageState> => {
		thirdParty.push(...(await commands.takeRequests()).thirdParty);
		return {
			debug: [...debug],
			distFiles: undefined,
			scriptSrcs: [...document.querySelectorAll('script')].map(
				(tag) => tag.src
			),
			thirdParty,
			zarazCalls: [...zarazCalls],
		};
	};
	await settle(
		async () =>
			failingKeys(acceptedRows(list, await read())).every(
				(key) => key in KNOWN_GAPS
			),
		15_000
	);

	const rows = acceptedRows(list, await read());
	expect(failingKeys(rows), `\n${formatRows(rows)}`).toEqual(
		Object.keys(KNOWN_GAPS)
	);
}, 45_000);
