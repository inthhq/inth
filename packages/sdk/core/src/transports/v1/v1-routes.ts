/**
 * The `/v1` route paths of an Inth backend. Code on first load (the init
 * script, the prefetch, the manifest URL) reads only these, so they are a
 * module of their own: the request helpers in `v1-request.api.ts` stay out of
 * first load.
 *
 * @internal
 */

/** Route paths below the project URL. */
export const V1_ROUTES = {
	acceptances: '/v1/documents/acceptances',
	currentDocument: '/v1/documents/:type/current',
	init: '/v1/consent/init',
	manifest: '/v1/consent/manifest',
	optOutLift: '/v1/consent/opt-outs/lift',
	optOuts: '/v1/consent/opt-outs',
	records: '/v1/consent/records',
	sessions: '/v1/consent/sessions',
	subjectLink: '/v1/subjects/:id/link',
} as const;

export const trimTrailingSlash = function trimTrailingSlash(
	url: string
): string {
	return url.replace(/\/+$/u, '');
};
