import {
	MANIFEST_RUNTIME_LEVEL,
	namedAdapters,
	requiresLevelThree,
} from '@inth/sdk-core/manifest-runtime';
/**
 * What the every-integration tests check for each integration the Inth
 * server lists, and the table they print when one does not load.
 *
 * Vendor files are on third-party hosts. The `watchRequests` browser
 * command (`vitest.config.ts`) answers each with empty JavaScript and records
 * the URL, so a vendor's tag loads and the test never reaches the vendor. It
 * also records the `inth.*.js` files the page fetched.
 */
import { ADA_MESSAGING_SDK_URL } from '@inth/sdk-core/manifest-runtime/adapters/ada';

import type {
	ListedIntegration,
	RemoteIntegrationList,
} from './remote-integrations-list';

declare module 'vitest/browser' {
	interface BrowserCommands {
		/**
		 * Answers every request to another host with empty JavaScript, and
		 * records it and each `/__inth-dist__/` file requested.
		 */
		watchRequests: () => Promise<void>;
		/** What `watchRequests` saw since the last call. */
		takeRequests: () => Promise<{ dist: string[]; thirdParty: string[] }>;
	}
}

/** A script loader debug event, as `window.__inthScriptDebugListeners` gets it. */
export interface DebugEvent {
	action: string;
	message: string;
	scriptId: string;
	source: string;
}

/** The page's Zaraz consent API stand-in records each `set` here. */
export type ZarazCalls = Record<string, boolean>[];

/**
 * Integrations that load no vendor tag, and how a test sees that their
 * adapter ran. Ada's adapter imports Ada's module and starts it with the
 * entry's handle; Zaraz's sets purposes on the page's Zaraz consent API.
 */
const noTagChecks: Record<
	string,
	{
		what: string;
		ran: (page: PageState, entry: ListedIntegration) => boolean;
	}
> = {
	ada: {
		ran: (page, entry) =>
			page.thirdParty.includes(ADA_MESSAGING_SDK_URL) &&
			page.adaStarts.some(
				(settings) =>
					settings.handle ===
					(entry.manifest as { adapter?: { options?: { handle?: unknown } } })
						.adapter?.options?.handle
			),
		what: `imported ${ADA_MESSAGING_SDK_URL} and started it with the entry's handle`,
	},
	cloudflareZaraz: {
		ran: (page) => page.zarazCalls.length > 0,
		what: 'set purposes on zaraz.consent',
	},
};

/**
 * Whether each Zaraz purpose the entry maps ended with the consent of its
 * category: `granted` says which categories the visitor allowed. The page's
 * Zaraz stand-in starts every purpose off.
 */
const zarazProblems = function zarazProblems(
	entry: ListedIntegration,
	page: PageState,
	granted: (category: string) => boolean
): string[] {
	const { adapter } = entry.manifest as {
		adapter?: { options?: { purposes?: Record<string, string[]> } };
	};
	const purposes: Record<string, boolean> = Object.assign(
		{},
		...page.zarazCalls
	);
	return Object.entries(adapter?.options?.purposes ?? {}).flatMap(
		([category, ids]) =>
			ids
				.filter((id) => (purposes[id] ?? false) !== granted(category))
				.map(
					(id) =>
						`Zaraz purpose ${id} (${category}) is ${String(purposes[id] ?? false)}`
				)
	);
};

/** The window properties named by each manifest's `globals`. */
const declaredGlobals = (entry: ListedIntegration): string[] => {
	const { globals } = entry.manifest as { globals?: unknown };
	return Array.isArray(globals)
		? globals.filter((name): name is string => typeof name === 'string')
		: [];
};

/**
 * The cookies and storage keys `win` has that Inth itself did not write.
 * Before a choice and after a reject, no vendor may store anything.
 */
export const vendorStorage = function vendorStorage(win: Window): string[] {
	const keys = [
		...win.document.cookie
			.split(';')
			.map((part) => part.split('=')[0]?.trim() ?? '')
			.filter((name) => name !== '')
			.map((name) => `cookie ${name}`),
		...Object.keys(win.localStorage).map((key) => `localStorage ${key}`),
		...Object.keys(win.sessionStorage).map((key) => `sessionStorage ${key}`),
	];
	return keys.filter((key) => !/ inth(?:-|$)/u.test(key));
};

/** Every global some listed manifest declares that `win` has. */
export const definedGlobals = function definedGlobals(
	list: RemoteIntegrationList,
	win: Window
): string[] {
	return [
		...new Set(list.integrations.flatMap((entry) => declaredGlobals(entry))),
	].filter((name) => Object.hasOwn(win, name));
};

/** What a test read from the page once the list had time to load. */
export interface PageState {
	/** The declared globals the page has; see `definedGlobals`. */
	globals: string[];
	/** The settings each `start` of the Ada stand-in got. */
	adaStarts: { handle?: unknown }[];
	debug: DebugEvent[];
	/** `dist/` files the page fetched; `undefined` for the npm runtime. */
	distFiles: string[] | undefined;
	/** Script `src`s in the document. */
	scriptSrcs: string[];
	thirdParty: string[];
	zarazCalls: ZarazCalls;
}

/** One integration's row. `problems` is empty when it loaded. */
export interface VendorRow {
	key: string;
	id: string;
	level: number;
	adapter: string;
	runtimeFile: string;
	src: string;
	loaded: string;
	problems: string[];
}

export const fetchRemoteIntegrations =
	async function fetchRemoteIntegrations(): Promise<RemoteIntegrationList> {
		const response = await fetch('/__inth-init__/remote-integrations');
		const body = (await response.json()) as RemoteIntegrationList & {
			error?: string;
		};
		if (!response.ok) {
			throw new Error(body.error);
		}
		return body;
	};

/** The manifest's main script URL, or `undefined` for one with no tag. */
export const vendorSrc = (entry: ListedIntegration): string | undefined => {
	const { loadScript } = entry.manifest as { loadScript?: { src?: string } };
	return loadScript?.src === undefined
		? undefined
		: new URL(loadScript.src).href;
};

export const alwaysLoads = (entry: ListedIntegration): boolean =>
	entry.manifest.alwaysLoad === true;

/** The runtime file the script tag needs for `entry`'s steps. */
const neededRuntimeFile = (entry: ListedIntegration): string =>
	requiresLevelThree([entry.manifest])
		? 'inth.manifests3.js'
		: 'inth.manifests.js';

/** Whether `entry`'s tag pins its bytes with an `integrity` hash. */
const pinsIntegrity = (entry: ListedIntegration): boolean => {
	const { loadScript } = entry.manifest as {
		loadScript?: { attributes?: Record<string, unknown> };
	};
	return typeof loadScript?.attributes?.integrity === 'string';
};

/**
 * The debug events that mean an entry did not do what its manifest says:
 * the loader's errors and refusals, and each manifest step that threw or
 * whose call the runtime refused. A failed step does not stop the tag, so
 * without these a vendor whose setup broke still reads as loaded.
 */
const problemActions: Record<string, readonly string[]> = {
	'manifest-runtime': ['step_error', 'skipped'],
	'script-loader': ['error', 'skipped'],
};

/**
 * The problem events reported for `entry`, and an error for every entry
 * when the runtime failed to load. The empty body the
 * test answers a vendor host with fails an `integrity` hash, so for a tag
 * that pins one, its load error is a note, not a problem.
 */
const loaderEvents = function loaderEvents(
	debug: DebugEvent[],
	entry: ListedIntegration
): { notes: string[]; problems: string[] } {
	const notes: string[] = [];
	const problems: string[] = [];
	for (const event of debug) {
		if (
			!problemActions[event.source]?.includes(event.action) ||
			!(
				event.scriptId === entry.id ||
				(event.scriptId === '' && event.message.includes('remote scripts'))
			)
		) {
			continue;
		}
		if (
			event.action === 'error' &&
			event.message.startsWith('Script failed:') &&
			pinsIntegrity(entry)
		) {
			notes.push('its integrity hash refuses the empty stand-in body');
			continue;
		}
		problems.push(`${event.action}: ${event.message}`);
	}
	return { notes, problems };
};

/** Each integration's state after an accept granted every category. */
export const acceptedRows = function acceptedRows(
	list: RemoteIntegrationList,
	page: PageState
): VendorRow[] {
	return list.integrations.map((entry) => {
		const problems: string[] = [];
		if (entry.level > MANIFEST_RUNTIME_LEVEL) {
			problems.push(
				`the server holds it back: level ${entry.level}, this SDK runs ${MANIFEST_RUNTIME_LEVEL}`
			);
		}
		const events = loaderEvents(page.debug, entry);
		problems.push(...events.problems);
		const adapters = namedAdapters([entry.manifest]);
		let runtimeFile = '-';
		if (page.distFiles) {
			const needed = neededRuntimeFile(entry);
			// inth.manifests3.js is the same runtime with level 3, so it also
			// runs a manifest that needs only inth.manifests.js.
			const fetched = [needed, 'inth.manifests3.js'].find((file) =>
				page.distFiles?.includes(file)
			);
			runtimeFile = fetched ?? `missing ${needed}`;
			if (!fetched) {
				problems.push(`${needed} was not fetched`);
			}
			for (const id of adapters) {
				if (!page.distFiles.includes(`inth.adapter-${id}.js`)) {
					problems.push(`inth.adapter-${id}.js was not fetched`);
				}
			}
		}
		if (entry.integration === 'cloudflareZaraz') {
			problems.push(...zarazProblems(entry, page, () => true));
		}
		const src = vendorSrc(entry);
		let loaded: string;
		if (src === undefined) {
			const check = noTagChecks[entry.integration];
			if (check === undefined) {
				loaded = 'no tag, no check';
				problems.push(
					'it loads no tag, and this test has no check that its adapter ran; add one to noTagChecks'
				);
			} else if (check.ran(page, entry)) {
				loaded = `adapter ${check.what}`;
			} else {
				loaded = 'adapter did not run';
				problems.push(`its adapter never ${check.what}`);
			}
		} else {
			const tag = page.scriptSrcs.includes(src);
			const requested = page.thirdParty.includes(src);
			loaded = [
				tag ? 'tag' : 'no tag',
				requested ? 'fetched' : 'not fetched',
				...events.notes,
			].join(', ');
			if (!tag) {
				problems.push(`no <script src="${src}"> in the page`);
			}
			if (!requested) {
				problems.push(`${src} was never requested`);
			}
		}
		return {
			adapter: adapters.join(',') || '-',
			id: entry.id,
			key: entry.integration,
			level: entry.level,
			loaded,
			problems,
			runtimeFile,
			src: src ?? '-',
		};
	});
};

/**
 * The integrations whose sampled manifest may load before a choice: each
 * sends only what its consent mode or consent API allows. Kept here, not
 * read from the manifests, so a manifest wrongly marked `alwaysLoad` fails.
 */
const EARLY_LOAD = new Set([
	'cloudflareZaraz',
	'googleTagManager',
	'gtag',
	'microsoftUet',
	'mixpanelAnalytics',
	'posthog',
	'sentry',
]);

/**
 * Each integration's state before a choice or after a reject: only an
 * integration in `EARLY_LOAD`, whose manifest has `alwaysLoad`, may insert
 * its tag or run its adapter, and every third-party request is one of
 * theirs.
 */
export const deniedRows = function deniedRows(
	list: RemoteIntegrationList,
	page: PageState
): VendorRow[] {
	return list.integrations.map((entry) => {
		const events = loaderEvents(page.debug, entry);
		const { problems } = events;
		const may = alwaysLoads(entry);
		// A global an early vendor also declares, such as `dataLayer`, is
		// theirs to create.
		const earlyGlobals = new Set(
			list.integrations
				.filter((other) => EARLY_LOAD.has(other.integration))
				.flatMap((other) => declaredGlobals(other))
		);
		const created = may
			? []
			: declaredGlobals(entry).filter(
					(name) => page.globals.includes(name) && !earlyGlobals.has(name)
				);
		if (created.length > 0) {
			problems.push(`it created ${created.join(', ')} without consent`);
		}
		if (entry.integration === 'cloudflareZaraz') {
			problems.push(
				...zarazProblems(entry, page, (category) => category === 'necessary')
			);
		}
		if (may !== EARLY_LOAD.has(entry.integration)) {
			problems.push(
				may
					? 'its manifest loads before a choice, and it is not in EARLY_LOAD'
					: 'it is in EARLY_LOAD, and its manifest waits for consent'
			);
		}
		const src = vendorSrc(entry);
		let loaded: string;
		if (src === undefined) {
			const ran = noTagChecks[entry.integration]?.ran(page, entry) ?? false;
			loaded = ran ? 'adapter ran' : 'adapter did not run';
			if (ran !== may) {
				problems.push(
					may
						? 'its manifest may load before a choice, but its adapter did not run'
						: 'its adapter ran without consent'
				);
			}
		} else {
			const tag = page.scriptSrcs.includes(src);
			const requested = page.thirdParty.includes(src);
			loaded = [
				tag ? 'tag' : 'no tag',
				requested ? 'fetched' : 'not fetched',
				...events.notes,
			].join(', ');
			if (tag !== may || requested !== may) {
				problems.push(
					may
						? 'its manifest may load before a choice, but it did not load'
						: 'it loaded without consent'
				);
			}
		}
		return {
			adapter: namedAdapters([entry.manifest]).join(',') || '-',
			id: entry.id,
			key: entry.integration,
			level: entry.level,
			loaded: `${may ? 'alwaysLoad' : 'waits'}; ${loaded}`,
			problems,
			runtimeFile: '-',
			src: src ?? '-',
		};
	});
};

/** Third-party requests that no `alwaysLoad` manifest names as its tag. */
export const unexpectedRequests = (
	list: RemoteIntegrationList,
	page: PageState
): string[] => {
	const allowed = new Set(
		list.integrations.filter(alwaysLoads).flatMap((entry) => {
			const src = vendorSrc(entry);
			return src === undefined ? [] : [src];
		})
	);
	return page.thirdParty.filter((url) => !allowed.has(url));
};

/** A plain-text table of `rows`, one integration per line. */
export const formatRows = function formatRows(rows: VendorRow[]): string {
	const header = ['integration', 'id', 'level', 'adapter', 'runtime', 'state'];
	const lines = rows.map((row) => [
		row.key,
		row.id,
		String(row.level),
		row.adapter,
		row.runtimeFile,
		`${row.problems.length === 0 ? 'ok' : 'FAIL'}: ${row.loaded}${row.problems.length === 0 ? '' : ` | ${row.problems.join(' | ')}`}`,
	]);
	const widths = header.map((title, column) =>
		Math.max(title.length, ...lines.map((line) => line[column]?.length ?? 0))
	);
	return [header, ...lines]
		.map((line) =>
			line
				.map((cell, column) =>
					column === line.length - 1 ? cell : cell.padEnd(widths[column] ?? 0)
				)
				.join('  ')
		)
		.join('\n');
};

/**
 * Integrations known not to load from the server, by registry key, with the
 * reason. The test expects exactly these to fail, so a fix shows up as a
 * failure until its entry is removed here.
 */
export const KNOWN_GAPS: Readonly<Record<string, string>> = {};

/** The keys of `rows` with a problem. */
export const failingKeys = (rows: VendorRow[]): string[] =>
	rows.filter((row) => row.problems.length > 0).map((row) => row.key);

/**
 * Resolves once `ready()` holds or `timeout` ms pass. Unlike `expect.poll`,
 * it does not fail on the timeout, so the test can print every row.
 */
export const settle = async function settle(
	ready: () => boolean | Promise<boolean>,
	timeout: number,
	end = Date.now() + timeout
): Promise<void> {
	if ((await ready()) || Date.now() >= end) {
		return;
	}
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});
	await settle(ready, timeout, end);
};
