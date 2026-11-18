/**
 * Dev-server routes for `init-script.browser.test.ts`: the built
 * `c15t.js` and `c15t.hosted.js`, a backend that answers `/init` and
 * `/subjects`, and gated scripts that report when they run.
 *
 * - `/__inth-dist__/<file>?delay=<ms>`: a file from `dist/`, held back
 *   `delay` ms.
 * - `/__inth-init__/page?<query>`: a page whose `c15t.js` tag uses the
 *   query: `manual`, `head` (tag in `<head>`), `hosted-delay`, `commit`,
 *   `records` and `dialog` (a delay for that file in ms, `fail` for a 404,
 *   or for `dialog`, `stale` for a file from another release),
 *   `queue` (a `window.inth` queue before the tag that records `ready`) and
 *   `hero` (a `fetchpriority="high"` image held back that many ms, so the
 *   engine waits for it).
 * - `/__inth-init__/hero.svg?delay=<ms>`: a small image, held back.
 * - `/__inth-init__/missing.js`: a 404.
 * - `/__inth-init__/stale-dialog.js`: a `c15t.dialog.js` from another
 *   release.
 * - `/__inth-init__/init-delay?ms=<ms>`: hold the next `/init` answers.
 * - `/__inth-init__/backend/init`: the `/init` answer, an opt-in policy for
 *   measurement and marketing with English copy.
 * - `/__inth-init__/backend/subjects`: counts saves.
 * - `/__inth-init__/saves`: how many saves arrived since the last read.
 * - `/__inth-init__/inits`: how many `/init` requests arrived since the
 *   last read.
 * - `/__inth-init__/gated.js?name=<name>`: pushes `name` onto
 *   `window.__ran`.
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve as resolvePath } from 'node:path';

import {
	policyRulePresets,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk-schema/types';
import { enTranslations } from '@inth/sdk-translations';

const initBody = () =>
	JSON.stringify({
		branding: 'inth',
		location: { countryCode: 'DE', regionCode: null },
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({
				rules: [
					{
						...policyRulePresets.europeOptIn(),
						categories: ['measurement', 'marketing'],
						match: { isDefault: true },
						scopeMode: 'strict',
					},
				],
			})
		),
		translations: {
			language: 'en',
			translations: {
				...enTranslations,
				cookieBanner: {
					...enTranslations.cookieBanner,
					description: 'Backend description',
					title: 'Backend title',
				},
			},
		},
	});

const wait = (ms: number) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

let saves = 0;
let inits = 0;
let initDelay = 0;

const page = (query: URLSearchParams): string => {
	const queue = query.has('queue')
		? `<script>window.__heard = []; window.inth = [['on', 'ready', function () { window.__heard.push('queued ready'); }]];</script>`
		: '';
	// `commit` and `records`: a delay in ms, or `fail` for a 404. Without
	// either, `c15t.js` finds the file next to itself.
	const part = (name: 'commit' | 'records' | 'dialog'): string => {
		const value = query.get(name);
		if (value === null) {
			return '';
		}
		let src = `/__inth-dist__/c15t.${name}.js?delay=${Number(value)}`;
		if (value === 'fail') {
			src = '/__inth-init__/missing.js';
		} else if (value === 'stale') {
			src = '/__inth-init__/stale-dialog.js';
		}
		return ` data-${name}-src="${src}"`;
	};
	const tag = `${queue}<script src="/__inth-dist__/c15t.js" data-project-url="/__inth-init__/backend" data-hosted-src="/__inth-dist__/c15t.hosted.js?delay=${Number(query.get('hosted-delay') ?? 0)}"${part('commit')}${part('records')}${part('dialog')}${query.has('manual') ? ' data-manual' : ''}></script>`;
	const head = query.has('head') ? tag : '';
	const body = query.has('head') ? '' : tag;
	return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>
<script>window.__ran = [];</script>
${query.has('hero') ? `<img fetchpriority="high" alt="" src="/__inth-init__/hero.svg?delay=${Number(query.get('hero'))}">` : ''}
<p>Page</p>
<button type="button" data-inth-action="customize" id="page-customize">Settings</button>
<script type="text/plain" data-inth-category="measurement" src="/__inth-init__/gated.js?name=measurement"></script>
<script type="text/plain" data-inth-category="marketing" src="/__inth-init__/gated.js?name=marketing"></script>
${body}
</body></html>`;
};

/**
 * Answer one fixture request, or call `next`.
 *
 * @param dist - The package's `dist` directory.
 */
export const serveInitScriptFixture = async function serveInitScriptFixture(
	request: IncomingMessage,
	response: ServerResponse,
	next: () => void,
	dist: string
): Promise<void> {
	const url = new URL(request.url ?? '/', 'http://fixture.test');
	if (url.pathname.startsWith('/__inth-dist__/')) {
		await wait(Number(url.searchParams.get('delay') ?? 0));
		const file = url.pathname.slice('/__inth-dist__/'.length);
		response.setHeader('Content-Type', 'text/javascript');
		response.end(await readFile(resolvePath(dist, file)));
		return;
	}
	if (url.pathname === '/__inth-init__/hero.svg') {
		await wait(Number(url.searchParams.get('delay') ?? 0));
		response.setHeader('Content-Type', 'image/svg+xml');
		response.end(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
		);
		return;
	}
	if (url.pathname === '/__inth-init__/stale-dialog.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(
			"window.__inthDialog = { version: '0.0.0-stale', createDialog() { throw new Error('stale'); }, openEarlyDialog() { throw new Error('stale'); } };"
		);
		return;
	}
	if (url.pathname === '/__inth-init__/missing.js') {
		response.statusCode = 404;
		response.end();
		return;
	}
	if (url.pathname === '/__inth-init__/page') {
		response.setHeader('Content-Type', 'text/html');
		response.end(page(url.searchParams));
		return;
	}
	if (url.pathname === '/__inth-init__/init-delay') {
		initDelay = Number(url.searchParams.get('ms') ?? 0);
		response.end('{}');
		return;
	}
	if (url.pathname === '/__inth-init__/inits') {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(inits));
		inits = 0;
		return;
	}
	if (url.pathname === '/__inth-init__/saves') {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(saves));
		saves = 0;
		return;
	}
	if (url.pathname === '/__inth-init__/gated.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(
			`window.__ran.push(${JSON.stringify(url.searchParams.get('name'))});`
		);
		return;
	}
	const backend = /^\/__inth-init__\/backend\/(?<route>.+)$/u.exec(
		url.pathname
	);
	if (backend?.groups) {
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Content-Type', 'application/json');
		if (backend.groups.route === 'init') {
			inits += 1;
			await wait(initDelay);
			response.end(initBody());
			return;
		}
		if (request.method === 'POST') {
			saves += 1;
		}
		response.end('{}');
		return;
	}
	next();
};
