/**
 * A deterministic backend failure for the dev prerender regression: the
 * manifest and the `/init` that manifest mode falls back to both fail.
 */
const unavailable = () =>
	Response.json({ error: 'Backend unavailable' }, { status: 503 });

export const GET = unavailable;
export const POST = unavailable;
