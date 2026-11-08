'use client';

/**
 * Client root for the TanStack Start adapter.
 *
 * The consent engine (kernel, persistence, provider runtime) is not in the
 * first-load chunk: `./root-engine` holds it and loads with `import()`.
 *
 * - The server renders the whole root (`EagerConsentRoot`): the banner, its
 *   styles and the scripts the server starts are in the first HTML, plus
 *   the snapshots the page rendered from.
 * - The browser renders the page at once, with c15t's hooks reading those
 *   snapshots. Hook actions ask for the engine and run when it attaches.
 * - When the visitor still has to choose and nothing optional is granted,
 *   nothing the engine does can show before a tap, so it loads after the
 *   page's priority images, or at the first input or scroll. A banner
 *   accept or reject before then is recorded in the tap's own task.
 *   Otherwise the engine loads at once.
 * - A root the shell cannot stand in for (an experiment option, a network
 *   blocker, `enabled: false`, IAB, or shared HTML with no boot data, such
 *   as the static root's `{}`) waits for the engine before it hydrates, as
 *   a statically imported root would.
 */
import {
	DeferredConsentShell,
	canDeferEngine,
	iabProviderLoaded,
	learnEngineChunks,
	read,
	readConsentBoot,
	record,
	rootNeedsEngine,
	scriptsNeedEngine,
} from '@c15t/react/deferred';
import type {
	ConsentBoot,
	DeferredCommitConfig,
	Recorded,
} from '@c15t/react/deferred';
import { useState } from 'react';

import { engineNow } from '#engine-now';

import type * as RootEngine from './root-engine';
import type { ConsentRootProps } from './root-options';

export type { ConsentRootProps } from './root-options';

type EngineModule = typeof RootEngine;

let engineModule: Recorded<EngineModule> | undefined;

/** The engine's module, loading once. */
const loadEngine = (): Recorded<EngineModule> => {
	if (engineNow) {
		// Outside browser bundles the engine is already in: a server render
		// reads it without suspending.
		engineModule ??= Object.assign(Promise.resolve(engineNow), {
			status: 'fulfilled' as const,
			value: engineNow,
		});
		return engineModule;
	}
	// In the browser, records the engine's chunk URLs, which the server
	// preloads for a later visitor it must serve at once.
	engineModule ??= record(
		typeof document === 'undefined'
			? import('./root-engine')
			: learnEngineChunks(() => import('./root-engine'))
	);
	return engineModule;
};

/**
 * Loads `ConsentRoot`'s engine now. A root that must render its engine at
 * once (a client-only render, or one the shell cannot stand in for) then
 * renders without suspending. Tests use it before a synchronous render.
 *
 * @returns The engine's module.
 * @internal
 */
export const preloadConsentRoot = (): Promise<EngineModule> => loadEngine();

if (typeof document === 'undefined') {
	// A server render finds it loaded instead of suspending the page.
	loadEngine();
} else {
	// A visitor the engine must serve at once: start the download as soon
	// as this chunk runs, ahead of hydration.
	const boot = readConsentBoot();
	if (boot && !canDeferEngine(boot.r ?? boot.s)) {
		loadEngine();
	}
}

type Plan =
	| { kind: 'eager' }
	| { kind: 'shell'; boot: ConsentBoot; defer: boolean };

/** How the browser renders this root, decided at its first render. */
const planRoot = function planRoot(props: ConsentRootProps): Plan {
	const boot = readConsentBoot();
	const snapshot = boot && (boot.r ?? boot.s);
	if (
		!snapshot ||
		rootNeedsEngine(props) ||
		// IAB state lives in `IABProvider`'s handle on the engine's kernel,
		// which a stand-in cannot serve.
		snapshot.model === 'iab' ||
		iabProviderLoaded()
	) {
		return { kind: 'eager' };
	}
	return {
		boot: boot as ConsentBoot,
		// A script the loader may run now would wait for the trigger.
		defer:
			canDeferEngine(snapshot) &&
			!scriptsNeedEngine(
				props.scripts,
				snapshot,
				props.scriptLoader?.serverStart !== false
			),
		kind: 'shell',
	};
};

/**
 * What a banner choice tapped before the engine loads is recorded with, so
 * it needs no engine (see `@c15t/react/deferred`). None when the engine has
 * to record it: persistence off, or a consent source.
 */
const commitConfig = function commitConfig(
	props: ConsentRootProps
): DeferredCommitConfig | undefined {
	const { options, persistence, scriptLoader, scripts } = props;
	if (persistence === false || options?.consentSource) {
		return undefined;
	}
	return {
		callbacks: options?.callbacks,
		nonce: options?.nonce,
		onDebug: scriptLoader?.onDebug,
		scripts,
		storageConfig:
			(typeof persistence === 'object'
				? persistence.storageConfig
				: undefined) ?? options?.storageConfig,
	};
};

const ClientConsentRoot = (props: ConsentRootProps) => {
	// oxlint-disable-next-line react/hook-use-state -- Decided once, at mount.
	const [plan] = useState(() => planRoot(props));
	if (plan.kind === 'eager') {
		const { EagerConsentRoot } = read(loadEngine());
		return <EagerConsentRoot {...props} />;
	}
	return (
		<DeferredConsentShell
			boot={plan.boot}
			commit={commitConfig(props)}
			defer={plan.defer}
			loadEngine={loadEngine}
			options={props.options ?? {}}
			prefetch={props.state}
			renderEngine={(engine: EngineModule, attach, committed) => (
				<engine.DeferredEngineRoot
					{...props}
					attach={attach}
					committed={committed}
				/>
			)}
		>
			{props.children}
		</DeferredConsentShell>
	);
};

/**
 * Wraps the app in a consent provider seeded with the server-resolved state.
 *
 * The consent engine loads after the page. Components under the root that
 * call c15t's hooks render from the server's consent state until then, and
 * their actions run once it has loaded. For a visitor the banner asks to
 * choose, it loads after the page's priority images, or at the first input
 * or scroll; a banner accept or reject before then is recorded at once.
 *
 * @example
 * ```tsx
 * // src/routes/__root.tsx
 * import { ConsentRoot } from '@c15t/tanstack-start';
 *
 * function RootComponent() {
 *   const { consent } = Route.useLoaderData();
 *   return (
 *     <ConsentRoot state={consent}>
 *       <Outlet />
 *     </ConsentRoot>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Stream the page without waiting for the consent backend.
 * export const Route = createRootRoute({
 *   ...consentLoaderOptions,
 *   loader: () => ({ consent: getConsentState() }),
 *   component: RootComponent,
 * });
 * ```
 *
 * @throws {Error} When the mode needs a backend URL and neither the state
 * nor `consentManifest()` provides one.
 */
export const ConsentRoot = (props: ConsentRootProps) => {
	if (typeof document === 'undefined') {
		const { EagerConsentRoot } = read(loadEngine());
		return <EagerConsentRoot {...props} />;
	}
	return <ClientConsentRoot {...props} />;
};
