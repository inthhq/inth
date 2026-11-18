/**
 * Starts the scripts a server render allows before the app hydrates.
 *
 * When the visitor's stored consent already lets some `scripts` run, the
 * server can run their setup and insert their tags from the HTML, instead
 * of after hydration and the script loader's own chunk. The code goes into
 * a `<script>` at the end of `<body>`, which runs before the app's module
 * scripts. It comes from `serverScriptStart` in `@inth/sdk/engine`, never from
 * page markup, so nothing a page renders becomes a script that carries the
 * nonce.
 */
import type { C15tProviderOptions } from '@inth/angular';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import type { serverScriptStart } from '@inth/sdk/runtime/script-server-start';

const NONCE = /^[\w+/=-]+$/u;

type ServerStartOptions = Parameters<typeof serverScriptStart>[0];

/**
 * Adds the start of the scripts `state` allows to the end of `<body>`.
 * Does nothing for a shared render, which carries no visitor's consent, or
 * when no script may start; a failed import leaves the start to the loader
 * after hydration.
 *
 * @param document - The document the server renders.
 * @param options - The provider's options, with its `scripts`.
 * @param state - The state resolved for this request.
 * @param nonce - CSP nonce for the script.
 * @internal
 */
export const startScriptsOnServer = async function startScriptsOnServer(
	document: Document,
	options: C15tProviderOptions,
	state: RuntimePrefetch,
	nonce: string | null | undefined
): Promise<void> {
	let code: string | undefined;
	try {
		const loaded = await import('@inth/sdk/runtime/script-server-start');
		code = loaded.serverScriptStart({
			...options,
			prefetch: state,
		} as unknown as ServerStartOptions);
	} catch {
		return;
	}
	if (!code || !document.body) {
		return;
	}
	const script = document.createElement('script');
	if (nonce && NONCE.test(nonce)) {
		script.setAttribute('nonce', nonce);
	}
	script.textContent = code;
	// The server's DOM (domino) has no `append()`.
	document.body.appendChild(script);
};
