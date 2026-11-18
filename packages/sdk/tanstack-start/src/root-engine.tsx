'use client';

import type { DeferredCommitted, DeferredEngine } from '@inth/react/deferred';
import {
	ConsentBootData,
	DeferredEngineHost,
} from '@inth/react/deferred/engine';
import { ConsentProvider } from '@inth/react/provider';
import type { ConsentProviderOptions } from '@inth/react/provider';
/**
 * The engine side of `ConsentRoot`, loaded on demand by `./root`.
 *
 * `EagerConsentRoot` is the whole root: the React provider around the page,
 * then the boot data and the scripts the server starts. The server always
 * renders it. `DeferredEngineRoot` is what the browser loads into a
 * deferred root: the provider and the same elements after the page, with
 * the page itself left to the root's shell.
 *
 * Receives the visitor's `ConsentState` from the root route loader, resolved
 * or as a pending promise the loader streams, and forwards it to the React
 * provider as `options.prefetch`. Kernel creation, persistence, init, and
 * module wiring live in `@inth/react`.
 *
 * The state also carries the backend URL, the mode and the route prefix
 * `createConsentStateHandler()` was given. `clientMode()` turns them into a
 * transport whose init path loads only when the browser runs init.
 *
 * The state must travel through loader data (or a server function
 * result), never through module state: the server and the client each
 * create their own kernel from the same serialized value, which is what
 * keeps the first paint and the hydrated tree identical.
 */
import type {
	KernelOverrides,
	KernelTransport,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { projectUrl as generatedProjectUrl } from '@inth/sdk/generated';
import type { ConsentMode } from '@inth/sdk/modes';
import { clientMode } from '@inth/sdk/runtime/client-mode';
import type { WithProjectUrl } from '@inth/sdk/runtime/provider';
import { preloadScriptLoaderWith } from '@inth/sdk/runtime/script-loader-preload';
import type * as ScriptServerStart from '@inth/sdk/runtime/script-server-start';
import { resolveStreamedInit } from '@inth/sdk/runtime/streamed-init';
import * as React from 'react';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';

import { readPrefetchedInitialData } from './libs/prefetch-head';
import { isPending, startsFromHTML } from './root-options';
import type { ConsentRootProps } from './root-options';
import type { ConsentState } from './server';

// The stock surfaces a deferred root renders come from this chunk, so
// they share its modules instead of carrying copies.
export { ConsentBanner, ConsentDialog } from '@inth/react/deferred/engine';

type RecordedState = PromiseLike<ConsentState> & {
	status?: string;
	value?: ConsentState;
};

/** What the root picks a transport from, before the state's own. */
type ChosenMode = ConsentMode | ProviderTransportFactory | undefined;

const transportFor = function transportFor(
	state: ConsentState | undefined,
	mode: ChosenMode,
	overrides: KernelOverrides | undefined
): ProviderTransportFactory {
	const projectUrl = state?.projectUrl ?? generatedProjectUrl;
	const routePrefix = state?.routePrefix;
	return clientMode(
		mode ?? state?.mode,
		{
			// A `consentPrefetchHead()` script may have started the init request
			// before hydration. The transport consumes that promise on its first
			// init, so the first save stays bound to the decision it resolved.
			initialData: readPrefetchedInitialData({
				overrides,
				projectUrl,
				routePrefix,
			}),
			projectUrl,
			routePrefix,
		},
		'@inth/tanstack-start/testing'
	);
};

/** The kind a mode reports through `window.c15t.mode`. */
const kindOf = function kindOf(
	mode: ConsentMode | undefined
): ProviderTransportFactory['kind'] {
	if (mode === undefined || mode.type === 'manifest') {
		return 'manifest';
	}
	return mode.type === 'hosted' ? 'hosted' : 'offline';
};

/**
 * The transport for a state the server is still streaming. The backend URL,
 * mode and route prefix arrive with it, so every request waits for the
 * state; the streamed state answers the first init, so in practice only a
 * save or a re-init reaches this transport, after the state arrived.
 */
const deferredTransport = function deferredTransport(
	state: PromiseLike<ConsentState>,
	mode: ConsentMode | undefined,
	overrides: KernelOverrides | undefined
): ProviderTransportFactory {
	return Object.assign(
		(context: Parameters<ProviderTransportFactory>[0]): KernelTransport => {
			let loading: Promise<KernelTransport> | undefined;
			const load = function load(): Promise<KernelTransport> {
				loading ??= (async () => {
					let resolved: ConsentState | undefined;
					try {
						resolved = await state;
					} catch {
						// A rejected stream renders as though nothing was
						// prefetched; the backend URL then comes from the build.
					}
					return transportFor(resolved, mode, overrides)(context);
				})();
				return loading;
			};
			return {
				async identify(user, subjectId) {
					await (await load()).identify?.(user, subjectId);
				},
				async init(ctx) {
					return (await (await load()).init?.(ctx)) ?? {};
				},
				async loadSubjectRecord(subjectId) {
					return (await (await load()).loadSubjectRecord?.(subjectId)) ?? null;
				},
				async save(payload, saveContext) {
					const transport = await load();
					if (!transport.save) {
						throw new Error('c15t: the init transport cannot save.');
					}
					return await transport.save(payload, saveContext);
				},
			};
		},
		{ kind: kindOf(mode) }
	);
};

const resolveMode = function resolveMode(
	state: ConsentState | Promise<ConsentState>,
	mode: ChosenMode,
	overrides: KernelOverrides | undefined
): ProviderTransportFactory {
	if (typeof mode === 'function') {
		return clientMode(mode);
	}
	if (!isPending(state)) {
		return transportFor(state, mode, overrides);
	}
	// TanStack Router records a streamed promise's result on it once it
	// settled, as React's `use()` expects.
	const recorded: RecordedState = state;
	if (recorded.status === 'fulfilled' && recorded.value) {
		return transportFor(recorded.value, mode, overrides);
	}
	return deferredTransport(state, mode, overrides);
};

type ScriptServerStartModule = typeof ScriptServerStart;

/** A promise that keeps its result where React 18 reads it on a retry. */
type Recorded<Value> = Promise<Value> & {
	status?: 'fulfilled';
	value?: Value;
};

/** `promise`, which must not reject, recording its result on itself. */
const record = function record<Value>(
	promise: Promise<Value>
): Recorded<Value> {
	const holder: { recorded?: Recorded<Value> } = {};
	const recorded: Recorded<Value> = (async () => {
		const value = await promise;
		// Set by now: the await above yields.
		if (holder.recorded) {
			holder.recorded.status = 'fulfilled';
			holder.recorded.value = value;
		}
		return value;
	})();
	holder.recorded = recorded;
	return recorded;
};

const loadScriptServerStart = function loadScriptServerStart(): Recorded<
	ScriptServerStartModule | undefined
> {
	return record(
		(async () => {
			try {
				return await import('@inth/sdk/runtime/script-server-start');
			} catch {
				return undefined;
			}
		})()
	);
};

let scriptServerStartModule:
	| Recorded<ScriptServerStartModule | undefined>
	| undefined;
let retriedScriptServerStart:
	| Recorded<ScriptServerStartModule | undefined>
	| undefined;

/**
 * Loaded on the server only, so no browser chunk requests it. A failed
 * import skips the server start and retries on the side for later renders.
 */
const importScriptServerStart = function importScriptServerStart(): Recorded<
	ScriptServerStartModule | undefined
> {
	const loaded = scriptServerStartModule;
	if (loaded?.status === 'fulfilled' && !loaded.value) {
		// Every render gets the failed load until the retry settles. On
		// React 18 a render that waited for the load calls again, and a
		// pending import there would suspend it again.
		retriedScriptServerStart ??= loadScriptServerStart();
		if (retriedScriptServerStart.status !== 'fulfilled') {
			return loaded;
		}
		scriptServerStartModule = retriedScriptServerStart;
		retriedScriptServerStart = undefined;
	}
	scriptServerStartModule ??= loadScriptServerStart();
	return scriptServerStartModule;
};

const settledStates = new WeakMap<
	Promise<ConsentState>,
	Recorded<ConsentState | undefined>
>();

/**
 * `state` with a rejection as `undefined`: the provider falls back to its
 * transport then, and the server start has nothing to start. One promise
 * per input, so `use` sees the same value on a retry.
 */
const settledState = function settledState(
	state: Promise<ConsentState>
): Recorded<ConsentState | undefined> {
	let settled = settledStates.get(state);
	if (!settled) {
		settled = record(
			(async () => {
				try {
					return await state;
				} catch {
					return undefined;
				}
			})()
		);
		settledStates.set(state, settled);
	}
	return settled;
};

/** React 19's `use`, absent from React 18. */
const { use } = React as {
	use?: <Value>(value: Promise<Value>) => Value;
};

/**
 * `use` where React has it. React 18 suspends on a thrown promise and
 * reads its recorded result on the retry.
 */
const read = function read<Value>(promise: Recorded<Value>): Value {
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `read` is `use` with a React 18 fallback, so it keeps `use`'s rules: render only, conditions allowed.
		return use(promise);
	}
	if (promise.status === 'fulfilled') {
		return promise.value as Value;
	}
	throw promise;
};

/**
 * One id and one `serverScriptStartPlan` per render, shared by the boot
 * data, the stored-choice check and the start script: each `serverStart`
 * runs once, the check and the start describe the same script, and the
 * page object their inline scripts write carries the id the boot data
 * names. Keyed by the provider options all three receive from the render.
 * The id needs no module: boot data that renders while the module loads
 * names the render its later start script writes, so a root that goes
 * before that script runs ends it (`endPageRender`).
 */
const renders = new WeakMap<
	object,
	{
		id: string;
		plan?: ScriptServerStart.ServerScriptStartPlan;
		state: unknown;
	}
>();

const renderFor = function renderFor(
	options: ConsentProviderOptions,
	state: ConsentState | undefined
) {
	let render = renders.get(options);
	if (!render || render.state !== state) {
		// As `newRenderId` in `@inth/sdk/runtime/script-server-start`.
		render = { id: Math.random().toString(36).slice(2, 10), state };
		renders.set(options, render);
	}
	return render;
};

const renderPlan = function renderPlan(
	module: ScriptServerStartModule,
	options: ConsentProviderOptions,
	state: ConsentState | undefined
): ScriptServerStart.ServerScriptStartPlan {
	const render = renderFor(options, state);
	render.plan ??= module.serverScriptStartPlan(
		{
			...(options as unknown as Parameters<
				ScriptServerStartModule['serverScriptStartPlan']
			>[0]),
			prefetch: state,
		},
		render.id
	);
	return render.plan;
};

/**
 * Starts the scripts the server's consent state already lets run. An
 * inline script runs the setup of each one with a `serverStart` and
 * inserts it after first paint, before hydration, and the loader adopts
 * it. In the browser it only hydrates the inline script.
 *
 * It suspends on a streamed state, and on the server on its module, inside
 * its own boundary, so the rest of the page, and the boot data, stream and
 * hydrate without it.
 */
const ServerScriptStart = ({
	options,
}: {
	options: ConsentProviderOptions;
}): ReactNode => {
	const { prefetch } = options;
	const state = isPending(prefetch as ConsentState | Promise<ConsentState>)
		? read(settledState(prefetch as Promise<ConsentState>))
		: (prefetch as ConsentState | undefined);
	// A streamed state that rejects, or resolves to a shared one, renders no
	// start script, on the server and in the browser alike.
	if (!startsFromHTML(state)) {
		return null;
	}
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
	// Suspends in its own boundary (`AfterPage`), so the boot data never
	// waits for the module or falls back with it.
	const module = read(importScriptServerStart());
	// A failed import still renders the empty script the browser hydrates.
	const code = module ? renderPlan(module, options, state).code : undefined;
	return (
		// Runs a granted vendor's setup and inserts its tag before the page
		// hydrates. The script loader adopts the tag.
		<script
			// oxlint-disable-next-line react/no-danger -- c15t's own code; serverScriptStart escapes `<` in every value.
			dangerouslySetInnerHTML={{ __html: code ?? '' }}
			nonce={options.nonce}
			suppressHydrationWarning
		/>
	);
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
 * cannot start), so the browser starts the engine's download as its chunk
 * runs. Never suspends on the start module: a synchronous first render in
 * a process, before it loads, keeps the boot data and leaves no check.
 */
const CheckedBootData = ({
	options,
	serverStart,
}: {
	options: ConsentProviderOptions;
	/** Whether the render emits the server start, and so has its plan. */
	serverStart: boolean;
}): ReactNode => {
	if (typeof document !== 'undefined') {
		return <ConsentBootData storedChoice />;
	}
	const { prefetch } = options;
	const state = isPending(prefetch as ConsentState | Promise<ConsentState>)
		? read(settledState(prefetch as Promise<ConsentState>))
		: (prefetch as ConsentState | undefined);
	const loaded = importScriptServerStart();
	const module =
		startsFromHTML(state) && loaded.status === 'fulfilled'
			? loaded.value
			: undefined;
	const render = renderFor(options, state);
	return (
		<ConsentBootData
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
const useRootOptions = function useRootOptions({
	state,
	scripts,
	vendors,
	scriptLoader,
	clearOnRevocation,
	networkBlocker,
	persistence,
	options,
}: ConsentRootProps) {
	// Initial-only, like the provider's own `mode`.
	const [mode, setMode] = useState(() =>
		resolveMode(state, options?.mode, options?.overrides)
	);
	void setMode;

	const providerOptions: ConsentProviderOptions = {
		...options,
		__debugPkg: '@inth/tanstack-start',
		// A returning visitor's state often lets a script run. Start the
		// script loader's download during the first render, not after
		// hydration, a round trip later.
		__preloadScriptLoader: preloadScriptLoaderWith,
		// `state` is often a promise the server streams in. Apply it with
		// code from the engine's chunk: loading that code after hydration
		// would hold the banner back by a round trip.
		__resolveStreamedInit: resolveStreamedInit,
		clearOnRevocation,
		mode,
		networkBlocker,
		persistence,
		prefetch: state,
		scriptLoader,
		scripts,
		vendors,
	};
	const serverStart = Boolean(
		scripts?.length &&
		startsFromHTML(state) &&
		scriptLoader?.serverStart !== false
	);
	// Shared HTML (a prerendered state, or the static root's `{}`) leaves no
	// boot data: the browser renders the whole root at once.
	const bootData = startsFromHTML(state);
	return { bootData, providerOptions, serverStart };
};

/**
 * What the server renders after the page, in one Suspense boundary: the
 * snapshots a deferred root reads, then the scripts the server starts.
 * After the page: an inline script waits for the stylesheets, so ahead of
 * the content it would hold back first paint. With a streamed state the
 * boundary follows in a later chunk of the response.
 */
const AfterPage = ({
	bootData,
	options,
	serverStart,
}: {
	bootData: boolean;
	options: ConsentProviderOptions;
	serverStart: boolean;
}) => (
	<>
		{/* No engine preload: see `loadEngine` in `./root`. */}
		{bootData ? (
			<CheckedBootData
				options={options}
				serverStart={serverStart}
			/>
		) : null}
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
export const EagerConsentRoot = (props: ConsentRootProps) => {
	const { bootData, providerOptions, serverStart } = useRootOptions(props);
	return (
		// `resolveMode` threw already when there is no backend.
		<ConsentProvider
			options={providerOptions as WithProjectUrl<ConsentProviderOptions>}
		>
			{props.children}
			<Suspense fallback={null}>
				<AfterPage
					bootData={bootData}
					options={providerOptions}
					serverStart={serverStart}
				/>
			</Suspense>
		</ConsentProvider>
	);
};

/**
 * The engine a deferred root loads: the provider, attached to the root's
 * stand-in kernel, hydrating what the server rendered after the page.
 *
 * @internal
 */
export const DeferredEngineRoot = (
	props: ConsentRootProps & {
		attach: (engine: DeferredEngine) => void;
		/** A banner choice the root recorded before this loaded. */
		committed?: DeferredCommitted;
	}
) => {
	const { bootData, providerOptions, serverStart } = useRootOptions(props);
	return (
		<DeferredEngineHost
			attach={props.attach}
			committed={props.committed}
			options={providerOptions}
		>
			<AfterPage
				bootData={bootData}
				options={providerOptions}
				serverStart={serverStart}
			/>
		</DeferredEngineHost>
	);
};
