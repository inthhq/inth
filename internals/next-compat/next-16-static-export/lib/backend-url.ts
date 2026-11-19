/**
 * Absolute backend URL for the static export.
 *
 * @remarks
 * A static export has no server to proxy `/api/inth`, so the browser calls
 * the backend directly and the URL has to be absolute. The compat suite's
 * global setup starts the stub on its own port and hands it to `next build`
 * through this public variable, which Next inlines into the bundle.
 */
const projectUrl = process.env.NEXT_PUBLIC_COMPAT_BACKEND_URL;
if (!projectUrl) {
	throw new Error('NEXT_PUBLIC_COMPAT_BACKEND_URL was not set at build time');
}

export const COMPAT_STATIC_BACKEND_URL: string = projectUrl;
