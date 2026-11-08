/**
 * Preloading a deferred root's engine for a visitor it must serve at once,
 * such as a returning visitor with consent.
 *
 * The engine's chunk URLs are the bundler's, and a library cannot ask for
 * them from the server render. So the browser learns them: when the shell
 * imports the engine, it records the scripts the import added, keyed by
 * the page's server-rendered scripts. On a later visit the server, knowing
 * the visitor needs the engine at once, leaves an inline script that
 * preloads those URLs while the HTML is still parsing, long before the
 * shell's own chunk runs. A new build changes the key, so stale URLs are
 * never fetched.
 *
 * @packageDocumentation
 * @internal
 */

/** `localStorage` key. @internal */
export const ENGINE_CHUNKS_KEY = 'c15t-engine-chunks';

/**
 * The key a list belongs to: the `async` scripts the server rendered into
 * `<head>`. Scripts a bundler inserts at runtime carry no `async`
 * attribute. Kept in step with `ENGINE_PRELOAD_SCRIPT`.
 */
const pageKey = (): string =>
	Array.from(
		document.head.querySelectorAll<HTMLScriptElement>('script[src][async]'),
		(script) => script.src
	)
		.sort()
		.join(' ');

/**
 * Runs `load` (the engine's `import()`) and records the script URLs it
 * added to the document. Never throws for the recording.
 *
 * @param load - Imports the engine.
 * @returns What `load` returns.
 * @internal
 */
export const learnEngineChunks = function learnEngineChunks<Value>(
	load: () => Promise<Value>
): Promise<Value> {
	let before: Set<string> | undefined;
	let key = '';
	try {
		before = new Set(Array.from(document.scripts, (script) => script.src));
		key = pageKey();
	} catch {
		return load();
	}
	const loading = load();
	const learn = (): void => {
		try {
			const added = Array.from(document.scripts, (script) => script.src).filter(
				(src) => src && !before?.has(src)
			);
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
	// Records on the side; the caller gets `loading` itself.
	void record();
	return loading;
};
