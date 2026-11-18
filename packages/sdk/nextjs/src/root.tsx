'use client';

/**
 * Client root for the Next.js adapter.
 *
 * The consent engine (kernel, persistence, provider runtime) is not in the
 * first-load chunk: `./root-engine` holds it and loads with `import()`.
 *
 * - The server renders the whole root (`EagerConsentRoot`): the banner, its
 *   styles and the scripts the server starts are in the first HTML, as
 *   before, plus the snapshots the page rendered from.
 * - The browser renders the page at once, with inth's hooks reading those
 *   snapshots. Hook actions ask for the engine and run when it attaches.
 * - When the visitor still has to choose and nothing optional is granted,
 *   nothing the engine does can show before a tap, so it loads after the
 *   page's priority images, or at the first input on the banner. Otherwise
 *   it loads at once.
 * - A root the shell cannot stand in for (an experiment, a network blocker,
 *   `enabled: false`, no server state) waits for the engine before it
 *   hydrates, as a statically imported root would.
 */
import userConfig from '@inth/nextjs/user-config';
import {
	DeferredConsentShell,
	canDeferEngine,
	engineNeededAtLoad,
	iabProviderLoaded,
	liveRootKey,
	learnEngineChunks,
	read,
	recordOnce,
	rootNeedsEngine,
	scriptsNeedEngine,
	startsScriptsWithoutEngine,
	useConsentBootPlan,
	whenIABProviderLoads,
} from '@inth/react/deferred';
import type {
	ConsentBoot,
	DeferredCommitConfig,
	Recorded,
} from '@inth/react/deferred';

import { engineNow } from '#engine-now';

import { NEXT_CHUNKS } from './engine-chunks';
import type * as RootEngine from './root-engine';
import { mergeOptions } from './root-options';
import type { ConsentRootProps } from './root-options';

export type { ConsentRootProps } from './root-options';

type EngineModule = typeof RootEngine;

let engineModule: Recorded<EngineModule> | undefined;

/**
 * Imports the engine's chunk. An object, so a test can make the import
 * fail.
 *
 * @internal
 */
export const engineChunk = {
	load: (): Promise<EngineModule> => import('./root-engine'),
};

// In the browser, records the engine's chunk URLs, which the server
// preloads for a later visitor it must serve at once.
const importEngine = recordOnce(() =>
	typeof document === 'undefined'
		? engineChunk.load()
		: learnEngineChunks(() => engineChunk.load(), NEXT_CHUNKS)
);

/** The engine's module, loading once, or again after a failed import. */
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
	return importEngine();
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
} else if (engineNeededAtLoad()) {
	// A visitor the engine must serve at once, or an app that loaded
	// `IABProvider`: start the download as soon as this chunk runs, ahead
	// of hydration.
	loadEngine();
} else {
	// `IABProvider` loading after this chunk needs the engine too: the
	// root renders it eagerly, so its download starts then.
	whenIABProviderLoads(() => {
		loadEngine();
	});
}

/**
 * What a banner choice tapped before the engine loads is recorded with, so
 * it needs no engine (see `@inth/react/deferred`). None when the engine has
 * to record it: persistence off, or a consent source.
 */
const commitConfig = function commitConfig(
	merged: ConsentRootProps
): DeferredCommitConfig | undefined {
	const { options, persistence, scriptLoader, scripts } = merged;
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

type Plan =
	| { kind: 'eager' }
	| {
			kind: 'shell';
			boot: ConsentBoot;
			defer: boolean;
			startScripts: boolean;
	  };

/** How the browser renders this root, decided at its first render. */
const planRoot = function planRoot(
	merged: ConsentRootProps & { options?: ConsentRootProps['options'] },
	// `useConsentBootPlan` gives the boot data only to the mount that
	// hydrates the server's HTML: a remount after a client-side navigation
	// gets `null` and takes the eager engine.
	boot: ConsentBoot | null
): Plan {
	const { state } = merged;
	const snapshot = boot && (boot.r ?? boot.s);
	if (
		!snapshot ||
		state === undefined ||
		rootNeedsEngine(merged) ||
		// IAB state lives in `IABProvider`'s handle on the engine's kernel,
		// which a stand-in cannot serve.
		snapshot.model === 'iab' ||
		iabProviderLoaded()
	) {
		return { kind: 'eager' };
	}
	const serverStart = merged.scriptLoader?.serverStart !== false;
	// A returning visitor who chose: the shell starts the plain scripts
	// their choice allows, and the engine waits for the priority images.
	const startScripts = startsScriptsWithoutEngine(snapshot);
	return {
		boot: boot as ConsentBoot,
		// A script the loader may run now would wait for the trigger. The
		// shell starts the root's plain `scripts` itself only with a commit
		// path to read them from.
		defer:
			(canDeferEngine(snapshot) || startScripts) &&
			!scriptsNeedEngine(
				merged.scripts,
				snapshot,
				serverStart,
				startScripts && commitConfig(merged) !== undefined
			),
		kind: 'shell',
		startScripts,
	};
};

const ClientConsentRoot = (props: ConsentRootProps) => {
	const config = props.config ?? userConfig;
	const merged = {
		...config,
		...props,
		options: mergeOptions(config?.options, props.options),
	};
	const plan = useConsentBootPlan((boot) => planRoot(merged, boot));
	if (plan.kind === 'eager') {
		const { EagerConsentRoot } = read(loadEngine());
		return <EagerConsentRoot {...props} />;
	}
	return (
		<DeferredConsentShell
			boot={plan.boot}
			commit={commitConfig(merged)}
			defer={plan.defer}
			live={liveRootKey(merged)}
			loadEngine={loadEngine}
			startScripts={plan.startScripts}
			options={merged.options ?? {}}
			prefetch={merged.state}
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
 * Mounts the consent provider for a Next.js app. Render it once, near the
 * top of the tree. It reads `inth.config.ts` itself, so a Server Component
 * layout renders it directly with the `state` it resolved.
 *
 * Props win over the config's browser options of the same name. `options`
 * merges one key at a time, and `options.callbacks` one callback at a time.
 *
 * The consent engine loads after the page. Components under the root that
 * call inth's hooks render from the server's consent state until then, and
 * their actions run once it has loaded. For a visitor the banner asks to
 * choose, it loads after the page's priority images, or at the first tap.
 *
 * @throws {Error} When `manifest()` or `hosted()` has no backend URL: no
 * `inth.config.ts` sets one and `NEXT_PUBLIC_INTH_PROJECT_URL` is unset.
 * `local()` needs none.
 *
 * @example
 * ```tsx
 * // app/layout.tsx (Server Component)
 * import { ConsentBanner, ConsentDialog, ConsentRoot } from '@inth/nextjs';
 * import { resolveConsent } from '@inth/nextjs/server';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <ConsentRoot state={resolveConsent()}>
 *           {children}
 *           <ConsentBanner />
 *           <ConsentDialog />
 *         </ConsentRoot>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export const ConsentRoot = (props: ConsentRootProps) => {
	if (typeof document === 'undefined') {
		const { EagerConsentRoot } = read(loadEngine());
		return <EagerConsentRoot {...props} />;
	}
	return <ClientConsentRoot {...props} />;
};
