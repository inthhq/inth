/**
 * Preloading a deferred root's engine for a visitor it must serve at once,
 * such as a returning visitor with consent.
 *
 * The engine's chunk URLs are the bundler's, and a library cannot ask for
 * them from the server render. So the browser learns them: when the shell
 * imports the engine, it records the bundler's scripts the `import()` call
 * added, keyed by the bundler's scripts the server rendered. On a later visit the
 * server, knowing the visitor needs the engine at once, leaves an inline
 * script that preloads those URLs while the HTML is still parsing, long
 * before the shell's own chunk runs. A new build changes the key, so stale
 * URLs are never fetched.
 *
 * Both sides read only URLs whose path holds the bundler's chunk path,
 * such as Next.js's `/_next/static/`. Other scripts, such as the
 * consent-gated vendor scripts Inth starts while the engine loads, are
 * neither preloaded (a visitor who later rejects would still fetch them)
 * nor part of the key (they change from one visit to the next). The
 * preload also requires each URL to sit under a chunk base, origin and
 * path, of the page's own server-rendered chunks, so a vendor script that
 * another Next.js site serves never qualifies. `basePath` and `assetPrefix`
 * move the base, and the check follows them.
 *
 * @packageDocumentation
 * @internal
 */

/** `localStorage` key. @internal */
export const ENGINE_CHUNKS_KEY = 'inth-engine-chunks';

/**
 * The origin and path up to the end of `chunks` in `src`'s path, or `''`
 * when its path does not hold `chunks`. A query string never counts. Kept
 * in step with `enginePreloadScript`.
 *
 * @internal
 */
const chunkBase = (src: string, chunks: string): string => {
	try {
		const url = new URL(src, document.baseURI);
		const index = url.pathname.indexOf(chunks);
		return index === -1
			? ''
			: url.origin + url.pathname.slice(0, index + chunks.length);
	} catch {
		return '';
	}
};

/**
 * The bundler's scripts the server rendered into `<head>`: `async` in the
 * App Router, `defer` in the Pages Router. Scripts a bundler inserts at
 * runtime carry neither attribute. Kept in step with `enginePreloadScript`.
 */
const SERVER_SCRIPTS = 'script[src][async],script[src][defer]';

/**
 * The key a list belongs to: the bundler's scripts the server rendered
 * into `<head>` (see {@link SERVER_SCRIPTS}).
 */
const pageKey = (chunks: string): string =>
	Array.from(
		document.head.querySelectorAll<HTMLScriptElement>(SERVER_SCRIPTS),
		(script) => script.src
	)
		.filter((src) => chunkBase(src, chunks))
		.sort()
		.join(' ');

/**
 * Runs `load` (the engine's `import()`) and records the bundler's script
 * URLs the call itself added to the document, once the import succeeds.
 * Never throws for the recording.
 *
 * @param load - Imports the engine.
 * @param chunks - The path every bundler chunk URL contains, such as
 * `/_next/static/`.
 * @returns What `load` returns.
 * @internal
 */
export const learnEngineChunks = function learnEngineChunks<Value>(
	load: () => Promise<Value>,
	chunks: string
): Promise<Value> {
	let before: Set<string> | undefined;
	let key = '';
	try {
		before = new Set(Array.from(document.scripts, (script) => script.src));
		key = pageKey(chunks);
	} catch {
		return load();
	}
	const loading = load();
	// The bundler adds the import's chunk scripts within the `import()` call
	// itself. Reading them now, before any other task runs, leaves out every
	// script that starts later: a consent-gated script Inth inserts, even one
	// served from the chunk base, and chunks of a later, separate import.
	let added: string[] = [];
	try {
		added = Array.from(document.scripts, (script) => script.src).filter(
			(src) => chunkBase(src, chunks) && !before?.has(src)
		);
	} catch {
		// Nothing to record.
	}
	const learn = (): void => {
		try {
			if (added.length) {
				localStorage.setItem(
					ENGINE_CHUNKS_KEY,
					JSON.stringify({ k: key, u: added })
				);
			}
		} catch {
			// Storage blocked or full: no preload next time.
		}
	};
	const record = async (): Promise<void> => {
		try {
			await loading;
		} catch {
			// The caller handles the failure; there is nothing to record.
			return;
		}
		learn();
	};
	void record();
	return loading;
};
