/**
 * Import a consent chunk so that a retry on the same page can succeed.
 *
 * A chunk the host's bundler emits loads in one of two ways:
 *
 * - With a classic `<script>` (webpack, rspack, Next.js): a failed chunk
 *   is forgotten, and calling `import()` again sends a new request.
 * - With a native `import()` (Vite, Rollup, esbuild, Astro, SvelteKit,
 *   Nuxt, the Angular CLI): the browser's module map decides. The HTML
 *   standard used to keep a failed fetch there for the life of the
 *   document, so a later `import()` of the same URL failed at once,
 *   without a request. It no longer does for network and HTTP errors
 *   (whatwg/html#10327, July 2026): Firefox 155 and Chrome 156 fetch
 *   again, and so does WebKit for the chunk itself. Older Chromium and
 *   Firefox still keep the failure.
 *
 * {@link importChunk} calls `load` again on every try, never keeping a
 * rejected promise, which is all a retry needs everywhere but those older
 * browsers. There, the error names the chunk's URL ("Failed to fetch
 * dynamically imported module: <url>"), and the chunk loads again from
 * that URL with `inth-retry=<n>` in its query: a new key in the module
 * map. A page's later tries reuse the chunk that loaded, so no chunk
 * runs twice.
 *
 * What stays unrecoverable on the page: a chunk whose dependency failed
 * (every browser keeps a failed dependency of a module graph), older
 * WebKit (Safari before the change, whose error names no URL), a chunk
 * whose exports the bundler renamed (`pick` rejects it), and a chunk a
 * deploy removed. The caller keeps its UI and records nothing; the next
 * page load fetches the chunk again.
 *
 * @packageDocumentation
 */

/** The query parameter a retry adds to a chunk's URL. */
export const CHUNK_RETRY_PARAM = 'inth-retry';

/** Chromium's and Firefox's message for a failed `import()`. */
const FAILED_IMPORT = /dynamically imported module:?\s+/u;

/**
 * The first releases that fetch a failed module again: Chrome 156 and
 * Firefox 155. Every Chromium-based browser names its Chromium version
 * in a `Chrome/` token (`HeadlessChrome/` when headless).
 */
const RETRIABLE_FROM: readonly [RegExp, number][] = [
	[/(?:^|\s)(?:Headless)?Chrome\/\d+/u, 156],
	[/(?:^|\s)Firefox\/\d+/u, 155],
];

/**
 * Whether this browser keeps a failed module fetch for the life of the
 * document, as the HTML standard required until July 2026.
 *
 * @param userAgent - The browser's user agent string.
 * @internal
 */
export const keepsFailedImports = function keepsFailedImports(
	userAgent: string
): boolean {
	for (const [pattern, fixed] of RETRIABLE_FROM) {
		const token = pattern.exec(userAgent)?.[0];
		if (token !== undefined) {
			return Number(token.split('/')[1]) < fixed;
		}
	}
	return false;
};

const importUrl = (url: string): Promise<unknown> =>
	import(
		// oxlint-disable-next-line no-inline-comments -- Bundler hints: a host's bundler must leave this `import()` of a URL to the browser.
		/* @vite-ignore */ /* webpackIgnore: true */ /* turbopackIgnore: true */ url
	);

interface ChunkImport {
	importUrl: (url: string) => Promise<unknown>;
	keepsFailedImports: () => boolean;
}

const defaults: ChunkImport = {
	importUrl,
	keepsFailedImports: () =>
		typeof navigator !== 'undefined' && keepsFailedImports(navigator.userAgent),
};

let current: ChunkImport = defaults;

/** Chunks loaded again from a URL of their own, by the URL that failed. */
const recovered = new Map<string, Promise<unknown>>();

/** Retries so far on this page: each gets a URL of its own. */
let retries = 0;

/**
 * Replaces how a chunk loads again from a URL, and whether the browser
 * keeps failed imports, so a test can fail a chunk once in any browser.
 * Call with no argument to restore the real ones and forget every chunk
 * loaded again.
 *
 * Tests only.
 *
 * @internal
 */
export const setChunkImportForTest = function setChunkImportForTest(
	overrides?: Partial<ChunkImport>
): void {
	current = { ...defaults, ...overrides };
	recovered.clear();
	retries = 0;
};

/** The URL a failed `import()`'s error names, when it names one. */
const failedUrl = function failedUrl(error: unknown): string | null {
	const message = error instanceof Error ? error.message : '';
	const url = message.split(FAILED_IMPORT)[1]?.split(/\s/u)[0];
	if (!url) {
		return null;
	}
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:'
			? parsed.href
			: null;
	} catch {
		return null;
	}
};

/** Load the chunk that failed at `url` again, once per page. */
const loadAgain = function loadAgain(url: string): Promise<unknown> {
	let loading = recovered.get(url);
	if (!loading) {
		retries += 1;
		const next = new URL(url);
		next.searchParams.set(CHUNK_RETRY_PARAM, String(retries));
		const attempt = current.importUrl(next.href);
		loading = attempt;
		recovered.set(url, attempt);
		// A retry that fails is forgotten, so the next try asks again.
		const forget = async (): Promise<void> => {
			try {
				await attempt;
			} catch {
				if (recovered.get(url) === attempt) {
					recovered.delete(url);
				}
			}
		};
		void forget();
	}
	return loading;
};

/**
 * Import a chunk with `load`, and pick what the caller needs from it.
 *
 * Call it again to retry: `load` runs again every time. In a browser that
 * keeps a failed import, a failure whose error names the chunk's URL loads
 * the chunk again from that URL with `inth-retry=<n>` added, and `pick`
 * must find its export in what that URL exports.
 *
 * @param load - Imports the chunk, as `() => import('./chunk')`.
 * @param pick - Returns what the caller needs from the chunk's module, or
 * `undefined` when the module does not have it.
 * @returns What `pick` returned. Rejects with `load`'s error when the
 * chunk did not load.
 */
export const importChunk = async function importChunk<Module, Value>(
	load: () => Promise<Module>,
	pick: (module: Module) => Value | undefined
): Promise<Value> {
	let module: Module;
	try {
		module = await load();
	} catch (error) {
		const url = current.keepsFailedImports() ? failedUrl(error) : null;
		if (!url) {
			throw error;
		}
		let value: Value | undefined;
		try {
			value = pick((await loadAgain(url)) as Module);
		} catch {
			throw error;
		}
		if (value === undefined) {
			// The URL exports the chunk under other names: the bundler
			// renamed them, so only `load` knows where the module is.
			throw error;
		}
		return value;
	}
	return pick(module) as Value;
};
