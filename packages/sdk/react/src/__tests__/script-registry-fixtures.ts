/**
 * Scripts and registry answers for the `experimentalScriptRegistry` tests,
 * with the `serveScript` browser command from `vitest.config.ts`.
 */
import type { Script } from '@inth/sdk/modules/script-loader';

import { transportMode } from './fixtures/transport-mode';

declare module 'vitest/browser' {
	interface BrowserCommands {
		/** Answers requests for `url` with `body` as JavaScript. */
		serveScript: (url: string, body: string) => Promise<void>;
		/** How many requests `serveScript` answered for `url`. */
		servedScriptCount: (url: string) => Promise<number>;
	}
}

declare global {
	interface Window {
		__registryCopy?: string;
	}
}

/** The `integrity` value for `body`, as the browser computes it. */
export const sha384 = async (body: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		'SHA-384',
		new TextEncoder().encode(body)
	);
	return `sha384-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`;
};

let runs = 0;

/** URLs and bytes no other test has served. */
export const registryFixture = () => {
	runs += 1;
	const run = `${Date.now()}-${runs}`;
	return {
		body: `window.__registryCopy = 'registry-${run}';`,
		registrySrc: `https://acme.inth.app/scripts/vendor@${run}.js`,
		run,
		vendorSrc: `https://cdn.vendor.example/vendor-${run}.js`,
	};
};

/** A script `@inth/integrations` built, which loads without consent. */
export const integrationScript = (
	src: string,
	callbacks: Pick<Script, 'onError' | 'onLoad'> = {}
): Script => ({
	category: 'necessary',
	id: 'vendor',
	integration: 'vendor',
	src,
	...callbacks,
});

/** A mode whose init answers with the registry's sources. */
export const listing = (sources: Record<string, unknown>) =>
	transportMode({
		init: () => Promise.resolve({ scriptRegistry: { sources } }) as never,
		save: () => Promise.resolve({ ok: true }),
	});
