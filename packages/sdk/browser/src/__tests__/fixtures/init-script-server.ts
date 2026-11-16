/**
 * Dev-server routes for `init-script.browser.test.ts`: the built
 * `c15t.js` and `c15t.hosted.js`, a backend that answers `/init` and
 * `/subjects`, and gated scripts that report when they run.
 *
 * - `/__c15t-dist__/<file>?delay=<ms>`: a file from `dist/`, held back
 *   `delay` ms.
 * - `/__c15t-init__/page?<query>`: a page whose `c15t.js` tag uses the
 *   query: `manual`, `head` (tag in `<head>`), `hosted-delay`, `commit`,
 *   `records` and `dialog` (a delay for that file in ms, `fail` for a 404,
 *   or for `dialog`, `stale` for a file from another release),
 *   `queue` (a `window.c15t` queue before the tag that records `ready`) and
 *   `hero` (a `fetchpriority="high"` image held back that many ms, so the
 *   engine waits for it).
 * - `/__c15t-init__/hero.svg?delay=<ms>`: a small image, held back.
 * - `/__c15t-init__/missing.js`: a 404.
 * - `/__c15t-init__/stale-dialog.js`: a `c15t.dialog.js` from another
 *   release.
 * - `/__c15t-init__/init-delay?ms=<ms>`: hold the next `/init` answers.
 * - `/__c15t-init__/backend/init`: the `/init` answer, an opt-in policy for
 *   measurement and marketing with English copy.
 * - `/__c15t-init__/backend/subjects`: counts saves.
 * - `/__c15t-init__/saves`: how many saves arrived since the last read.
 * - `/__c15t-init__/inits`: how many `/init` requests arrived since the
 *   last read.
 * - `/__c15t-init__/gated.js?name=<name>`: pushes `name` onto
 *   `window.__ran`.
 */
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve as resolvePath } from 'node:path';

import {
	policyRulePresets,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@c15t/schema/types';
import { enTranslations } from '@c15t/translations';

const initBody = () =>
	JSON.stringify({
		branding: 'c15t',
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
		? `<script>window.__heard = []; window.c15t = [['on', 'ready', function () { window.__heard.push('queued ready'); }]];</script>`
		: '';
	// `commit` and `records`: a delay in ms, or `fail` for a 404. Without
	// either, `c15t.js` finds the file next to itself.
	const part = (name: 'commit' | 'records' | 'dialog'): string => {
		const value = query.get(name);
		if (value === null) {
			return '';
		}
		let src = `/__c15t-dist__/c15t.${name}.js?delay=${Number(value)}`;
		if (value === 'fail') {
			src = '/__c15t-init__/missing.js';
		} else if (value === 'stale') {
			src = '/__c15t-init__/stale-dialog.js';
		}
		return ` data-${name}-src="${src}"`;
	};
	const tag = `${queue}<script src="/__c15t-dist__/c15t.js" data-backend-url="/__c15t-init__/backend" data-hosted-src="/__c15t-dist__/c15t.hosted.js?delay=${Number(query.get('hosted-delay') ?? 0)}"${part('commit')}${part('records')}${part('dialog')}${query.has('manual') ? ' data-manual' : ''}></script>`;
	const head = query.has('head') ? tag : '';
	const body = query.has('head') ? '' : tag;
	return `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>
<script>window.__ran = [];</script>
${query.has('hero') ? `<img fetchpriority="high" alt="" src="/__c15t-init__/hero.svg?delay=${Number(query.get('hero'))}">` : ''}
<p>Page</p>
<button type="button" data-c15t-action="customize" id="page-customize">Settings</button>
<script type="text/plain" data-c15t-category="measurement" src="/__c15t-init__/gated.js?name=measurement"></script>
<script type="text/plain" data-c15t-category="marketing" src="/__c15t-init__/gated.js?name=marketing"></script>
${body}
</body></html>`;
};

/**
 * Answer one fixture request, or call `next`.
 *
 * @param request - The request.
 * @param response - The response.
 * @param next - The next middleware.
 * @param dist - The package's `dist` directory.
 */
export const serveInitScriptFixture = async function serveInitScriptFixture(
	request: IncomingMessage,
	response: ServerResponse,
	next: () => void,
	dist: string
): Promise<void> {
	const url = new URL(request.url ?? '/', 'http://fixture.test');
	if (url.pathname.startsWith('/__c15t-dist__/')) {
		await wait(Number(url.searchParams.get('delay') ?? 0));
		const file = url.pathname.slice('/__c15t-dist__/'.length);
		response.setHeader('Content-Type', 'text/javascript');
		response.end(await readFile(resolvePath(dist, file)));
		return;
	}
	if (url.pathname === '/__c15t-init__/hero.svg') {
		await wait(Number(url.searchParams.get('delay') ?? 0));
		response.setHeader('Content-Type', 'image/svg+xml');
		response.end(
			'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
		);
		return;
	}
	if (url.pathname === '/__c15t-init__/stale-dialog.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(
			"window.__c15tDialog = { version: '0.0.0-stale', createDialog() { throw new Error('stale'); }, openEarlyDialog() { throw new Error('stale'); } };"
		);
		return;
	}
	if (url.pathname === '/__c15t-init__/missing.js') {
		response.statusCode = 404;
		response.end();
		return;
	}
	if (url.pathname === '/__c15t-init__/page') {
		response.setHeader('Content-Type', 'text/html');
		response.end(page(url.searchParams));
		return;
	}
	if (url.pathname === '/__c15t-init__/init-delay') {
		initDelay = Number(url.searchParams.get('ms') ?? 0);
		response.end('{}');
		return;
	}
	if (url.pathname === '/__c15t-init__/inits') {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(inits));
		inits = 0;
		return;
	}
	if (url.pathname === '/__c15t-init__/saves') {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(saves));
		saves = 0;
		return;
	}
	if (url.pathname === '/__c15t-init__/gated.js') {
		response.setHeader('Content-Type', 'text/javascript');
		response.end(
			`window.__ran.push(${JSON.stringify(url.searchParams.get('name'))});`
		);
		return;
	}
	const backend = /^\/__c15t-init__\/backend\/(?<route>.+)$/u.exec(
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
