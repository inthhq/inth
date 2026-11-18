'use client';

/**
 * `ConsentProvider` for client-rendered apps, whose consent engine loads
 * after the page's priority images when the visitor still has to choose.
 *
 * The page renders at once, under a stand-in kernel (`deferred-kernel.ts`).
 * The `/init` request, from the inline prefetch that `consentManifest()` or
 * `buildPrefetchScript()` put in the HTML or else started by the provider
 * as it first renders, carries the policy and the copy, so once it
 * answers, the stand-in takes the snapshot the kernel would compute from
 * it and the stock banner renders from that. The code that reads the
 * answer, and the stock banner's, load in a chunk after the page's: at
 * once, or, when `index.html` already shows the static banner, once the
 * page's priority images loaded or the visitor acts, so on a slow
 * connection they do not delay Largest Contentful Paint. Taps on the
 * banner hide it and load the engine, which applies them. A returning
 * visitor, or a configuration the stand-in cannot serve, loads the engine
 * at once.
 *
 * @packageDocumentation
 * @internal
 */

import type {
	ConsentSnapshot,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import {
	hasGlobalPrivacyControlSignal,
	hasStoredConsent,
	pendingBootSnapshot,
	startPrefetchedHostedInit,
	startPrefetchedInit,
} from '@inth/sdk/runtime/deferred-boot';
import type { DeferredSnapshotOptions } from '@inth/sdk/runtime/deferred-snapshot';
import type { ReactNode } from 'react';
import { Suspense, useState } from 'react';

import {
	isStaticBannerShown,
	removeStaticBanner,
} from '../components/prompt/static-banner-shell';
import { useIsHydrated } from '../hooks/use-is-hydrated';
import type {
	ConsentProviderOptions,
	ConsentProviderProps,
	OwnedRuntimeProviderProps,
} from '../provider';
import { canDeferEngine, rootNeedsEngine } from './boot';
import type * as ClientEngine from './client-engine';
import type { DeferredCommitConfig } from './committed';
import type { DeferredKernelHandle } from './deferred-kernel';
import { read, recordOnce } from './session';
import { DeferredConsentShell } from './shell';
import { warmSurfaces } from './surface-warmers';
import { scheduleDeferredEngine } from './trigger';

type EngineModule = typeof ClientEngine;

/**
 * Options the stand-in cannot serve before the engine loads: each needs
 * the runtime from the first render, or changes what a fresh visitor's
 * page may do before they choose.
 */
const needsEngine = function needsEngine(
	options: ConsentProviderOptions
): boolean {
	return Boolean(
		rootNeedsEngine({ networkBlocker: options.networkBlocker, options }) ||
		options.prefetch ||
		options.consentSource ||
		options.scripts?.length ||
		options.vendors?.length ||
		options.__resolveStreamedInit
	);
};

const storageKeyOf = function storageKeyOf(
	options: ConsentProviderOptions
): string | undefined {
	const { persistence } = options;
	return (
		(typeof persistence === 'object'
			? persistence.storageConfig?.storageKey
			: undefined) ?? options.storageConfig?.storageKey
	);
};

/**
 * What a banner accept or reject before the engine is recorded with (see
 * `commit.ts`), or `undefined` when the engine has to record it.
 */
const commitConfig = function commitConfig(
	options: ConsentProviderOptions
): DeferredCommitConfig | undefined {
	const { persistence } = options;
	if (persistence === false || options.consentSource) {
		return undefined;
	}
	return {
		callbacks: options.callbacks,
		nonce: options.nonce,
		storageConfig:
			(typeof persistence === 'object'
				? persistence.storageConfig
				: undefined) ?? options.storageConfig,
	};
};

interface DeferredPlan {
	pending: ConsentSnapshot;
	/** Hydrating server HTML: no engine slot until mounted. */
	hydrating: boolean;
	/** Load the engine during the first render: a returning visitor. */
	now: boolean;
	schedule: (
		start: () => void,
		handle: DeferredKernelHandle,
		onTap?: (pressed?: string) => void
	) => () => void;
}

/**
 * Removes the static banner from `index.html` once the root's state, the
 * stand-in's or the engine's, no longer shows the banner, or a choice is
 * recorded: no client banner then takes its place.
 *
 * @returns Stops following.
 */
const followStaticBanner = function followStaticBanner(
	handle: DeferredKernelHandle
): () => void {
	let judged = false;
	let unsubscribe = (): void => undefined;
	const apply = (snapshot: ConsentSnapshot): void => {
		if (!(judged || snapshot.policyPending)) {
			judged = true;
			if (snapshot.activeUI !== 'banner') {
				removeStaticBanner();
			}
		}
		if (snapshot.explicitChoice !== null) {
			unsubscribe();
			removeStaticBanner();
		}
	};
	unsubscribe = handle.kernel.subscribe(apply);
	apply(handle.kernel.getSnapshot());
	return () => unsubscribe();
};

/**
 * How a provider render starts: deferred with a stand-in, or with the
 * engine. Read once, at mount.
 */
const plan = function plan(
	props: ConsentProviderProps,
	clientRender: boolean
): DeferredPlan | undefined {
	if (props.runtime || !props.options) {
		return undefined;
	}
	const { options } = props as OwnedRuntimeProviderProps;
	if (needsEngine(options)) {
		return undefined;
	}
	// The browser's Global Privacy Control signal, as the engine reads it:
	// the stand-in evaluates the policy under it, and a tap before the
	// engine records the choice under it, or leaves it to the engine.
	const snapshotOptions: DeferredSnapshotOptions = {
		consentCategories: options.consentCategories,
		gpc: hasGlobalPrivacyControlSignal(),
		overrides: options.overrides,
		translationOverrides: options.i18n?.messages,
	};
	// Without an inline prefetch in the page, the provider sends that
	// request itself, so the banner waits for `/init` alone, not for the
	// engine's chunk and then `/init`.
	// Picked as the engine will, without building the hosted transport's
	// factory: the first load needs only the backend URL.
	const selected = options.mode;
	// `hosted()` is data; a `testing()` value carries its transport.
	let mode: ProviderTransportFactory | undefined;
	if (typeof selected === 'function') {
		mode = selected;
	} else if (selected && 'transport' in selected) {
		mode = selected.transport;
	}
	const request = {
		journey: options.journey,
		storageKey: storageKeyOf(options),
	};
	let prefetched: ReturnType<typeof startPrefetchedInit>;
	if (mode) {
		prefetched = startPrefetchedInit(mode, options.overrides, request);
	} else if (options.projectUrl !== undefined) {
		prefetched = startPrefetchedHostedInit(
			options.projectUrl,
			options.overrides,
			request
		);
	}
	// Hydrating what the provider rendered on the server, with no prefetch
	// to read: the stand-in renders the same pending state, and the engine
	// loads at once.
	const hydrating = !clientRender;
	if (!(prefetched || hydrating)) {
		return undefined;
	}
	const persisted = options.persistence !== false;
	const now =
		!prefetched || (persisted && hasStoredConsent(storageKeyOf(options)));
	let openRead = (): void => undefined;
	const readOpened = new Promise<void>((resolve) => {
		openRead = resolve;
	});
	// The `/init` answer, read once `openRead` ran, with the code that reads
	// it: a chunk after the page's own.
	const resolved: Promise<ConsentSnapshot | undefined> = (async () => {
		await readOpened;
		try {
			const [{ snapshotFromPrefetchedInit }, init] = await Promise.all([
				import('@inth/sdk/runtime/deferred-snapshot'),
				prefetched,
			]);
			return snapshotFromPrefetchedInit(init, snapshotOptions);
		} catch {
			// The engine loads instead, and reports what failed.
			return undefined;
		}
	})();
	if (hydrating) {
		// Surfaces the server rendered hydrate with their code.
		warmSurfaces();
	}
	return {
		hydrating,
		now,
		pending: pendingBootSnapshot(snapshotOptions),
		schedule(start, handle, onTap) {
			let live = true;
			const cleanups: (() => void)[] = [];
			const cleanup = (): void => {
				for (const done of cleanups.splice(0)) {
					done();
				}
			};
			let unwait = (): void => undefined;
			const staticBanner = isStaticBannerShown();
			if (staticBanner) {
				// The static banner from `index.html` already shows. Nothing
				// more loads until it no longer shares the connection with the
				// page's priority images, or until the visitor acts. Then the
				// engine and the stock surfaces load in one go, and the engine
				// reads the answer itself. A press on the banner, or a tap its
				// script recorded, reads the answer first instead, so the tap
				// commits as soon as that small chunk is in.
				cleanups.push(followStaticBanner(handle));
				unwait = scheduleDeferredEngine(
					() => {
						warmSurfaces();
						start();
					},
					() => openRead()
				);
				cleanups.push(() => unwait());
			} else {
				// The banner waits for the answer and its own code: both load
				// now, side by side.
				warmSurfaces();
				openRead();
			}
			void (async () => {
				const snapshot = await resolved;
				if (!live || handle.attached()) {
					return;
				}
				if (snapshot?.activeUI !== 'banner') {
					// The static banner from `index.html` stands in for a
					// banner this state does not show.
					removeStaticBanner();
				}
				if (!(snapshot && canDeferEngine(snapshot))) {
					start();
					return;
				}
				// The banner's input is the root's to route from here on.
				unwait();
				handle.setSnapshot(snapshot);
				if (!staticBanner) {
					// A static banner the page revealed after this was
					// scheduled goes with a choice, as the one above does.
					cleanups.push(followStaticBanner(handle));
				}
				// With `onTap`, banner input routes a tap instead of loading
				// the engine: an accept or reject commits without it.
				cleanups.push(scheduleDeferredEngine(start, onTap));
			})();
			return () => {
				live = false;
				cleanup();
			};
		},
	};
};

/**
 * Builds `ConsentProvider` around the engine import it loads.
 *
 * @param importEngine - Imports the engine's module. Defaults to
 * `import('./client-engine')`, which keeps it out of the first-load chunk.
 * @returns The provider. Each loads its engine once per page.
 * @internal
 */
export const createConsentProvider = function createConsentProvider(
	importEngine: () => Promise<EngineModule> = () => import('./client-engine')
): (props: ConsentProviderProps) => ReactNode {
	/**
	 * Starts loading the engine once per page, retrying a failed import as
	 * `recordOnce` does.
	 */
	const loadEngine = recordOnce(importEngine);

	const EngineProvider = (props: ConsentProviderProps): ReactNode => {
		const loaded = read(loadEngine());
		return <loaded.ConsentProvider {...props} />;
	};

	const Provider = (props: ConsentProviderProps): ReactNode => {
		const clientRender = useIsHydrated();
		// oxlint-disable-next-line react/hook-use-state -- Read once, at mount.
		const [deferred] = useState(() => plan(props, clientRender));
		if (!deferred) {
			return (
				<Suspense fallback={null}>
					<EngineProvider {...props} />
				</Suspense>
			);
		}
		const { children } = props;
		const { options } = props as OwnedRuntimeProviderProps;
		return (
			<DeferredConsentShell<EngineModule>
				boot={{ s: deferred.pending }}
				commit={commitConfig(options)}
				defer={!deferred.now}
				loadEngine={loadEngine}
				options={options}
				prefetch={undefined}
				renderEngine={(loaded, attach, committed) => (
					<loaded.DeferredEngineHost
						attach={attach}
						committed={committed}
						options={options}
					/>
				)}
				schedule={deferred.schedule}
				slotAfterMount={deferred.hydrating}
			>
				{children}
			</DeferredConsentShell>
		);
	};
	return Provider;
};

/**
 * Provides consent state to the tree under it.
 *
 * With a `hosted()` mode, the page renders at once and the consent engine
 * loads after the page's priority images, or on the first input on the
 * banner, for a visitor who still has to choose. The banner shows as soon
 * as `/init` answers: the request an inline prefetch already sent (the
 * `consentManifest()` setup), or else the one the provider sends as it
 * first renders, which the engine then reuses. A returning visitor's
 * engine loads at once. Every other setup renders once the engine has
 * loaded.
 *
 * See `ConsentProvider` in `@inth/react/provider` for the options. That
 * entry loads the engine with the page.
 */
export const ConsentProvider = createConsentProvider();
