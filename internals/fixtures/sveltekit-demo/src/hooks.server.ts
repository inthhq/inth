import { c15tHandle, hosted, manifest } from '@c15t/svelte/kit';
import type { C15tHandle } from '@c15t/svelte/kit';
import { testing } from '@c15t/svelte/testing';

import { testBackend } from '#lib/test-backend.js';

// Reads the consent cookie, location headers and GPC once per request and
// stores them on `event.locals.c15t`, with the mode `loadConsent` resolves
// with. Each area of this app talks to its own backend, so each gets its own
// handle.
const { projectUrl = 'https://your-project.inth.app' } =
	testBackend('projectUrl');

// `/consent-example` and `/experiment-example`: the server asks the
// backend's `/init`. A prerendered page carries no visitor's consent, so the
// browser asks the backend there.
const hostedHandle = c15tHandle({ mode: hosted(), projectUrl });

// `/manifest-example`: the server resolves from the backend's cached policy
// manifest, and the browser re-inits through the route in
// `src/routes/api/c15t`.
const manifestHandle = c15tHandle({
	mode: manifest(),
	projectUrl,
	routePrefix: '/api/c15t',
});

// The showcase resolves its policy on this server with no backend. Consent
// stays in the visitor's browser and no record of it is kept.
const showcaseHandle = c15tHandle({
	mode: testing(),
});

const areaHandles: readonly (readonly [prefix: string, handle: C15tHandle])[] =
	[
		['/consent-example', hostedHandle],
		['/experiment-example', hostedHandle],
		['/manifest-example', manifestHandle],
	];

export const handle: C15tHandle = (input) => {
	const { pathname } = input.event.url;
	const area = areaHandles.find(
		([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
	return (area?.[1] ?? showcaseHandle)(input);
};
