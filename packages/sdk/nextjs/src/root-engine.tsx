'use client';

import userConfig from '@inth/nextjs/user-config';
import { rootNeedsEngine } from '@inth/react/deferred';
import type { DeferredCommitted, DeferredEngine } from '@inth/react/deferred';
import {
	ConsentBootData,
	DeferredEngineHost,
	importScriptServerStart,
	read,
	renderFor,
	renderPlan,
	settledState,
} from '@inth/react/deferred/engine';
import type { ScriptServerStartModule } from '@inth/react/deferred/engine';
import { InthProvider as ReactProvider } from '@inth/react/provider';
import type { InthProviderOptions as ReactProviderOptions } from '@inth/react/provider';
/**
 * The engine side of `InthProvider`, loaded on demand by `./root`.
 *
 * `EagerRoot` is the whole root: the React provider around the page,
 * then the boot data and the scripts the server starts. The server always
 * renders it. `DeferredEngineRoot` is what the browser loads into a
 * deferred root: the provider and the same elements after the page, with
 * the page itself left to the root's shell.
 *
 * Receives the visitor's `ConsentState` from a Server Component and
 * forwards it to the React provider as `options.prefetch`. Kernel creation,
 * persistence, init, and module wiring live in `@inth/react`.
 */
import { clientMode } from '@inth/sdk/runtime/client-mode';
import type { WithProjectUrl } from '@inth/sdk/runtime/provider';
import { preloadScriptLoaderWith } from '@inth/sdk/runtime/script-loader-preload';
import { resolveStreamedInit } from '@inth/sdk/runtime/streamed-init';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';

import type { ConsentConfig } from './config';
import { readProjectUrlFromEnv } from './config';
import { NEXT_CHUNKS } from './engine-chunks';
import { mergeOptions } from './root-options';
import type { InthProviderProps } from './root-options';
import type { ConsentClientOptions, ConsentState } from './types';

// The stock surfaces a deferred root renders come from this chunk, so
// they share its modules instead of carrying copies.
export {
	ConsentBanner,
	ConsentDialog,
	OptOutConfirmation,
	preloadServerContainer,
} from '@inth/react/deferred/engine';

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the warning behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

let warnedMissingConfig = false;

const warnMissingConfig = function warnMissingConfig(): void {
	if (warnedMissingConfig) {
		return;
	}
	warnedMissingConfig = true;
	console.warn(
		'[inth] InthProvider found no config. Export `defineConsentConfig()` as the default export of inth.config.ts at the project root and wrap next.config.ts in `withConsentManifest()`, or pass `config`.'
	);
};

/**
 * The transport for the config's mode, or for `options.mode`.
 *
 * @throws {Error} When the mode needs a backend URL and neither the config
 * nor `NEXT_PUBLIC_INTH_PROJECT_URL` (or `NEXT_PUBLIC_C15T_BACKEND_URL`)
 * sets one.
 */
const createMode = function createMode(
	config: ConsentConfig | undefined,
	options: ConsentClientOptions['options']
) {
	// With `proxy` the consent route forwards writes, so the browser sends
	// everything to it, even for a `hosted()` with its own `projectUrl`.
	return clientMode(
		options?.mode ?? config?.mode,
		config
			? {
					projectUrl: config.proxy ? config.routePrefix : config.projectUrl,
					routePrefix: config.routePrefix,
				}
			: { projectUrl: readProjectUrlFromEnv() },
		'@inth/nextjs/testing'
	);
};

/**
 * Starts the scripts the server's consent state already lets run. An
 * inline script runs the setup of each one with a `serverStart` and
 * inserts it before hydration, and the loader adopts it. In the browser
 * it only hydrates the inline script.
 *
 * Neither the vendor scripts nor the loader's chunk get a
 * `<link rel="preload">`. On a throttled mobile profile, vendor preloads
 * delayed the page's own chunks and hydration by about 100 ms, and a
 * preload of the loader's chunk delayed first paint by about 36 ms. The
 * vendor scripts gained under 200 ms, and the loader's chunk 9 ms.
 *
 * It suspends on a streamed state and on its module inside its own
 * boundary, so the rest of the page, and the boot data, stream without it. `resolveConsent()` marks the render
 * request-time, so the inline script never lands in prerendered HTML.
 */
const ServerScriptStart = ({
	options,
}: {
	options: ReactProviderOptions;
}): ReactNode => {
	if (typeof document !== 'undefined') {
		// Hydrates the server's start script without running or replacing it.
		return (
			<script
				// oxlint-disable-next-line react/no-danger -- Empty: keeps the server's script.
				dangerouslySetInnerHTML={{ __html: '' }}
				suppressHydrationWarning
			/>
		);
	}
	const { prefetch } = options;
	const state =
		typeof (prefetch as PromiseLike<unknown> | undefined)?.then === 'function'
			? read(settledState(prefetch as Promise<ConsentState>))
			: (prefetch as ConsentState | undefined);
	// Suspends in its own boundary (`AfterPage`), so the boot data never
	// waits for the module or falls back with it.
	const module = read(importScriptServerStart());
	// A failed import still renders the empty script the browser hydrates.
	const code = module ? renderPlan(module, options, state).code : undefined;
	return (
		// Runs a granted vendor's setup and inserts its tag before the page
		// hydrates. The script loader adopts the tag.
		<script
			// oxlint-disable-next-line react/no-danger -- Inth's own code; serverScriptStart escapes `<` in every value.
			dangerouslySetInnerHTML={{ __html: code ?? '' }}
			nonce={options.nonce}
			suppressHydrationWarning
		/>
	);
};

/**
 * The start module, when it has loaded. Never suspends: a synchronous
 * `renderToString` as the first render in a process would otherwise leave
 * the boot data to the browser. The render then leaves no stored-choice
 * check, so the browser loads the engine at once and keeps the preload.
 */
const loadedScriptServerStart = (): ScriptServerStartModule | undefined => {
	const loaded = importScriptServerStart();
	return loaded.status === 'fulfilled' ? loaded.value : undefined;
};

if (typeof document === 'undefined') {
	// Start loading as the server imports the engine, so a request's render
	// finds the module in place.
	importScriptServerStart();
}

/**
 * The boot data a deferred root reads, with the stored-choice check
 * (`storedChoiceCheckScript`). Core leaves the check out for a root that
 * needs the engine at once, by the rule `./root` applies in the browser (a
 * network blocker, an experiment, `enabled: false`, a script the root
 * cannot start, counting a `serverStart` entry as started only when the
 * server start emits it), so the browser starts the engine's download as
 * its chunk runs. The engine preload follows the check: skipped in the
 * browser only when the check finds the choice current. Without a check
 * (no request clock, `persistence.skipHydration: false`, a consent source,
 * a module that has not loaded) the preload always runs.
 */
const CheckedBootData = ({
	options,
	serverStart,
}: {
	options: ReactProviderOptions;
	/** Whether the render emits the server start, and so has its plan. */
	serverStart: boolean;
}): ReactNode => {
	const preload = rootNeedsEngine({
		clearOnRevocation: options.clearOnRevocation,
		networkBlocker: options.networkBlocker,
		options,
	});
	if (typeof document !== 'undefined') {
		return (
			<ConsentBootData
				chunks={NEXT_CHUNKS}
				preload={preload}
				storedChoice
			/>
		);
	}
	const { prefetch } = options;
	const state =
		typeof (prefetch as PromiseLike<unknown> | undefined)?.then === 'function'
			? read(settledState(prefetch as Promise<ConsentState>))
			: (prefetch as ConsentState | undefined);
	const module = loadedScriptServerStart();
	const render = renderFor(options, state);
	return (
		<ConsentBootData
			chunks={NEXT_CHUNKS}
			preload={preload}
			renderId={render.id}
			storedChoice
			storedChoiceCheck={module?.storedChoiceCheckScript(
				{
					...(options as unknown as Parameters<
						ScriptServerStartModule['storedChoiceCheckScript']
					>[0]),
					prefetch: state,
				},
				serverStart ? renderPlan(module, options, state) : undefined,
				render.id
			)}
		/>
	);
};

/** The provider options and what renders after the page, from the props. */
const useRootOptions = function useRootOptions(props: InthProviderProps) {
	// Read at render, not at module top level: `inth.config.ts` imports
	// `@inth/nextjs`, so the browser graph has a cycle through this module.
	const config = props.config ?? userConfig;
	if (
		process.env.NODE_ENV !== 'production' &&
		!config &&
		!props.options?.mode
	) {
		warnMissingConfig();
	}
	const {
		children,
		clearOnRevocation,
		networkBlocker,
		options,
		persistence,
		scriptLoader,
		scripts,
		state,
		vendors,
	} = {
		...config,
		...props,
		options: mergeOptions(config?.options, props.options),
	};
	// Initial-only, like the provider's own `mode`. A new one on every
	// render would make each rerender load the runtime's update module.
	const [mode, setMode] = useState(() => createMode(config, options));
	void setMode;

	const providerOptions: ReactProviderOptions = {
		...options,
		__debugPkg: '@inth/nextjs',
		// A returning visitor's state often lets a script run. Start the
		// script loader's download during the first render, not after
		// hydration, a round trip later.
		__preloadScriptLoader: preloadScriptLoaderWith,
		// `state` is often a promise the server streams in. Apply it
		// with code from the engine's chunk: loading that code after
		// hydration would hold the banner back by a round trip.
		__resolveStreamedInit: resolveStreamedInit,
		clearOnRevocation,
		journey: options?.journey ?? config?.journey,
		mode,
		networkBlocker,
		persistence,
		prefetch: state,
		scriptLoader,
		scripts,
		vendors,
	};
	// Without `state` there is nothing to start, and a static page keeps
	// its HTML free of inline scripts.
	const serverStart = Boolean(
		scripts?.length &&
		state !== undefined &&
		scriptLoader?.serverStart !== false
	);
	return { children, providerOptions, serverStart };
};

/**
 * What the server renders after the page, in one Suspense boundary: the
 * snapshots a deferred root reads, then the scripts the server starts.
 * After the page: an inline script waits for the stylesheets, so ahead of
 * the content it would hold back first paint. With a streamed state the
 * boundary follows in a later chunk of the response.
 */
const AfterPage = ({
	options,
	serverStart,
}: {
	options: ReactProviderOptions;
	serverStart: boolean;
}) => (
	<>
		{/* Without a state the browser renders the whole root at once and
		reads no boot data. A root whose options need the engine at once
		(a network blocker) gets its preload whatever the snapshot says. */}
		{options.prefetch === undefined ? null : (
			<CheckedBootData
				options={options}
				serverStart={serverStart}
			/>
		)}
		{/* Its own boundary: a synchronous first render in a process leaves
		it to the browser while its module loads, and keeps the boot data. */}
		{serverStart ? (
			<Suspense fallback={null}>
				<ServerScriptStart options={options} />
			</Suspense>
		) : null}
	</>
);

/**
 * The whole root: provider, page, boot data and server script start. The
 * server always renders this; the browser does when it cannot defer.
 *
 * @internal
 */
export const EagerRoot = (props: InthProviderProps) => {
	const { children, providerOptions, serverStart } = useRootOptions(props);
	return (
		// `createMode` threw already when there is no backend.
		<ReactProvider
			options={providerOptions as WithProjectUrl<ReactProviderOptions>}
		>
			{children}
			<Suspense fallback={null}>
				<AfterPage
					options={providerOptions}
					serverStart={serverStart}
				/>
			</Suspense>
		</ReactProvider>
	);
};

/**
 * The engine a deferred root loads: the provider, attached to the root's
 * stand-in kernel, hydrating what the server rendered after the page.
 *
 * @internal
 */
export const DeferredEngineRoot = (
	props: InthProviderProps & {
		attach: (engine: DeferredEngine) => void;
		/** A banner choice the root recorded before this loaded. */
		committed?: DeferredCommitted;
	}
) => {
	const { providerOptions, serverStart } = useRootOptions(props);
	return (
		<DeferredEngineHost
			attach={props.attach}
			committed={props.committed}
			options={providerOptions}
		>
			<AfterPage
				options={providerOptions}
				serverStart={serverStart}
			/>
		</DeferredEngineHost>
	);
};
