#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runConsentGate } from '@c15t/benchmarking/consent-gate';
import {
	GATE_STATE_GLOBAL,
	gateConsentCategories,
	gatePageCSS,
	gatePageHTML,
	gateScripts,
} from '@c15t/benchmarking/consent-gate-page';

/**
 * Script-tag consent gate. CookieBench's script fixture loads
 * `@c15t/browser`'s `c15t.js` with `data-manual` and calls `c15t.init` in
 * hosted mode from a module script; this page does the same, served by the
 * gate proxy with the checkout's own `packages/sdk/browser/dist` and the gate's
 * fixture backend. The bridge below is `updateGateBridge` from
 * `consent-gate-page.ts` as plain page JavaScript.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// The bench's own build graph does not include @c15t/browser; build it here
// (a Turbo cache hit when nothing changed) so each revision serves its own.
execFileSync(
	'bun',
	[
		'turbo',
		'run',
		'build',
		'--filter=@c15t/browser',
		'--output-logs=errors-only',
	],
	{ cwd: root, stdio: 'inherit' }
);

const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>c15t consent gate</title><style>${gatePageCSS}</style>`;

const bridge = `const global = ${JSON.stringify(GATE_STATE_GLOBAL)};
const bridge = (window[global] ??= { allowedCategories: [], consent: 'unset', scripts: [] });
const update = (snapshot) => {
	bridge.allowedCategories = Object.entries(snapshot.effectivePermissions ?? {})
		.filter(([category, allowed]) => category !== 'necessary' && allowed)
		.map(([category]) => category);
	const choices = Object.entries(snapshot.explicitChoice?.categories ?? {})
		.filter(([category]) => category !== 'necessary')
		.map(([, choice]) => choice);
	bridge.consent = 'unset';
	if (snapshot.explicitChoice && choices.length) {
		if (choices.every((choice) => choice?.value)) bridge.consent = 'accepted';
		else if (choices.every((choice) => !choice?.value)) bridge.consent = 'rejected';
		else bridge.consent = 'custom';
	}
	bridge.ready = snapshot.resolution?.status === 'matched';
	if (bridge.ready && bridge.resolvedAt === undefined) bridge.resolvedAt = performance.now();
	document.documentElement.dataset.consentReady = String(bridge.ready);
};`;

const gatePage = `<!doctype html><html lang="en"><head>${head}</head><body><div id="content">${gatePageHTML}</div><a href="#c15t-preferences" data-testid="consent-dialog-link">Privacy settings</a><script src="/__gate/browser/c15t.js" data-manual></script><script type="module">${bridge}
const client = window.c15t.init(${JSON.stringify({
	backendURL: '/__gate/api',
	consentCategories: gateConsentCategories,
	mode: 'hosted',
	scripts: gateScripts(),
})});
client.subscribe(update);
update(client.getSnapshot());
</script></body></html>`;

const controlPage = `<!doctype html><html lang="en"><head>${head}</head><body><div id="content">${gatePageHTML}</div></body></html>`;

try {
	await runConsentGate({
		backendPrefix: '/__gate/api',
		directories: {
			'/__gate/browser/': join(root, 'packages/sdk/browser/dist'),
		},
		framework: 'script-tag',
		notes: [
			"@c15t/browser c15t.js with data-manual and c15t.init in hosted mode, as CookieBench's script fixture loads it.",
		],
		packageName: '@c15t/script-lifecycle-bench',
		pages: { '/gate': gatePage, '/gate/control': controlPage },
		paths: { control: '/gate/control', gate: '/gate' },
		proxyPort: Number(process.env.C15T_GATE_PORT ?? '4437'),
		target: 'script-tag',
	});
} catch (error) {
	console.error(error);
	process.exit(1);
}
