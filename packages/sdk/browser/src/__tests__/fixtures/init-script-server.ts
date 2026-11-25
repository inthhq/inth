/**
 * Dev-server routes for `init-script.browser.test.ts`: the built
 * `inth.js`, `inth.hosted.js` and the files they load, a backend that answers
 * `/v1/consent/init` and `/v1/consent/records`, and gated scripts that
 * report when they run.
 *
 * - `/__inth-dist__/<file>?delay=<ms>`: a file from `dist/`, held back
 *   `delay` ms. With `fail=<n>`, the first `n` such requests after a page
 *   loads get a 404.
 * - `/__inth-init__/page?<query>`: a page whose `inth.js` tag uses the
 *   query: `manual`, `head` (tag in `<head>`), `hosted-delay`,
 *   `hosted-fail` (that many 404s for `inth.hosted.js`), `records` and
 *   `choices` (a delay for that file in ms, `fail` for a 404, or
 *   `fail-once` for a 404 then the file),
 *   `queue` (a `window.inth` queue before the tag that records `ready`) and
 *   `hero` (a `fetchpriority="high"` image held back that many ms, so the
 *   engine waits for it).
 * - `/__inth-init__/hero.svg?delay=<ms>`: a small image, held back.
 * - `/__inth-init__/missing.js`: a 404.
 * - `/__inth-init__/init-delay?ms=<ms>`: hold the next `/v1/consent/init` answers.
 * - `/__inth-init__/backend/v1/consent/init`: the init answer, an opt-in policy for
 *   measurement and marketing with English copy.
 * - `/__inth-init__/backend/v1/consent/records`: counts saves.
 * - `/__inth-init__/saves`: how many saves arrived since the last read.
 * - `/__inth-init__/inits`: how many `/v1/consent/init` requests arrived since the
 *   last read.
 * - `/__inth-init__/hosted-requests`: how many `fail=<n>` requests (for
 *   `inth.hosted.js` or `inth.choices.js`) arrived since the last read.
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
let hostedRequests = 0;
let failsSincePage = 0;

const page = (query: URLSearchParams): string => {
	const queue = query.has('queue')
		? `<script>window.__heard = []; window.inth = [['on', 'ready', function () { window.__heard.push('queued ready'); }]];</script>`
		: '';
	// `records` and `choices`: a delay in ms, `fail` for a 404, or
	// `fail-once` for a 404 then the file. Without either, the file is found
	// next to `inth.js` (`records`) or `inth.hosted.js` (`choices`).
	const part = (name: 'records' | 'choices'): string => {
		const value = query.get(name);
		if (value === null) {
			return '';
		}
		let src = `/__inth-dist__/inth.${name}.js?delay=${Number(value)}`;
		if (value === 'fail') {
			src = '/__inth-init__/missing.js';
		} else if (value === 'fail-once') {
			src = `/__inth-dist__/inth.${name}.js?fail=1`;
		}
		return ` data-${name}-src="${src}"`;
	};
	const tag = `${queue}<script src="/__inth-dist__/inth.js" data-project-url="/__inth-init__/backend" data-hosted-src="/__inth-dist__/inth.hosted.js?delay=${Number(query.get('hosted-delay') ?? 0)}${query.has('hosted-fail') ? `&amp;fail=${Number(query.get('hosted-fail'))}` : ''}"${part('records')}${part('choices')}${query.has('manual') ? ' data-manual' : ''}></script>`;
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

/** Count a `fail=<n>` request; whether it gets a 404. */
const countedFailure = function countedFailure(
	query: URLSearchParams
): boolean {
	if (!query.has('fail')) {
		return false;
	}
	hostedRequests += 1;
	failsSincePage += 1;
	return failsSincePage <= Number(query.get('fail'));
};

/** What `POST /v1/consent/records` answers: the subject the save named. */
const recordAnswer = async function recordAnswer(
	request: IncomingMessage
): Promise<string> {
	let body = '';
	for await (const chunk of request) {
		body += String(chunk);
	}
	const { subjectId } = JSON.parse(body) as { subjectId: string };
	return JSON.stringify({
		recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
		subjectId,
	});
};

const disableFixtureCache = (url: URL, response: ServerResponse): void => {
	if (
		!url.pathname.startsWith('/__inth-dist__/') &&
		!url.pathname.startsWith('/__inth-init__/')
	) {
		return;
	}
	// Vitest 5's browser server pins `Cache-Control: private,max-age=31536000`
	// on `sec-fetch-dest: script` GETs ahead of plugin middlewares (by guarding
	// `setHeader('Cache-Control', ...)`). Fixture routes are stateful per
	// request, so clear it and opt out of caching.
	response.removeHeader('Cache-Control');
	response.setHeader('cache-control', 'no-store');
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
	disableFixtureCache(url, response);
	if (url.pathname.startsWith('/__inth-dist__/')) {
		await wait(Number(url.searchParams.get('delay') ?? 0));
		if (countedFailure(url.searchParams)) {
			response.statusCode = 404;
			response.end();
			return;
		}
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
	if (url.pathname === '/__inth-init__/missing.js') {
		response.statusCode = 404;
		response.end();
		return;
	}
	if (url.pathname === '/__inth-init__/page') {
		failsSincePage = 0;
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
	if (url.pathname === '/__inth-init__/hosted-requests') {
		response.setHeader('Content-Type', 'application/json');
		response.end(JSON.stringify(hostedRequests));
		hostedRequests = 0;
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
		if (backend.groups.route === 'v1/consent/init') {
			inits += 1;
			await wait(initDelay);
			response.end(initBody());
			return;
		}
		if (request.method === 'POST') {
			saves += 1;
			response.end(await recordAnswer(request));
			return;
		}
		response.end('{}');
		return;
	}
	next();
};
