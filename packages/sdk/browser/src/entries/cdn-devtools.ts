/**
 * `dist/c15t.devtools.js` — the DevTools panel as a second script tag.
 *
 * ```html
 * <script src=".../c15t.js" data-project-url="..." defer></script>
 * <script src=".../c15t.devtools.js" data-open data-tab="location" defer></script>
 * ```
 *
 * Order does not matter: loaded first, it queues itself on `window.inth`
 * the way any pre-load call does and mounts once the client initialises.
 * The panel lands on `window.c15t.devtools`.
 *
 * This file is its own bundle, so its copy of the launcher slot is not the
 * one the main tag's trigger reads. It publishes through
 * `window.inth.publishDevToolsLauncher`, the main tag's copy, instead.
 */

import type { DevToolsPosition, DevToolsTab } from '@inth/sdk-dev-tools';

import { createBrowserDevTools } from '../devtools-mount';
import type { BrowserDevToolsOptions } from '../devtools-mount';
import type { InthGlobal, QueuedCall } from '../global';
import { GLOBAL_NAME } from '../global-name';
import type { ConsentClient } from '../types';

const TABS: ReadonlySet<string> = new Set<DevToolsTab>([
	'consents',
	'scripts',
	'location',
	'policy',
	'iab',
	'events',
	'actions',
]);
const POSITIONS: ReadonlySet<string> = new Set<DevToolsPosition>([
	'bottom-right',
	'bottom-left',
	'top-right',
	'top-left',
]);

const readOptions = function readOptions(
	script: Element | null
): BrowserDevToolsOptions {
	const options: BrowserDevToolsOptions = {};
	if (!script) {
		return options;
	}
	if (script.hasAttribute('data-open')) {
		options.defaultOpen = script.getAttribute('data-open') !== 'false';
	}
	const tab = script.getAttribute('data-tab');
	if (tab && TABS.has(tab)) {
		options.defaultTab = tab as DevToolsTab;
	}
	const position = script.getAttribute('data-position');
	if (position && POSITIONS.has(position)) {
		options.position = position as DevToolsPosition;
	}
	return options;
};

type GlobalWindow = Window & {
	[GLOBAL_NAME]?: InthGlobal | QueuedCall[];
};

const options = readOptions(document.currentScript);
const mount = function mount(client: ConsentClient): void {
	const api = (window as GlobalWindow)[GLOBAL_NAME];
	const global = api && !Array.isArray(api) ? api : null;
	// The headless tag has no trigger and no slot; the panel keeps its own
	// launcher.
	const instance = createBrowserDevTools(
		client,
		options,
		global?.publishDevToolsLauncher
	);
	if (global) {
		global.devtools = instance;
	}
};

const existing = (window as GlobalWindow)[GLOBAL_NAME];
if (existing && !Array.isArray(existing)) {
	existing.onInit(mount);
} else {
	// The main tag has not run yet; it replays this once it installs.
	(window as GlobalWindow)[GLOBAL_NAME] = [
		...(existing ?? []),
		['onInit', mount],
	];
}
