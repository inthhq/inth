'use client';

/**
 * `ConsentBanner` for a page with the static banner (`#consent-banner`, as
 * `consentManifest()` resolves it in that build): the stock banner whose
 * code loads in a chunk of its own, not in the page's first-load
 * JavaScript. Every other build imports the banner itself.
 *
 * Under a client-rendered root (`deferred/client-provider.tsx`) the code
 * loads with the code that reads the `/v1/consent/init` answer, or, while the page's
 * static banner stands in, once the state shows the banner. Until then the page's static banner, when `consentManifest()`
 * put one in `index.html`, stands in for it, and it takes that banner's
 * place when it renders. Under any other provider the code loads at first
 * render. While hydrating a banner the server rendered, it waits for its
 * code, so React keeps the server's markup.
 *
 * Compound parts (`ConsentBanner.Root`, ...) load the same code at first
 * render.
 *
 * @packageDocumentation
 * @internal
 */

import type { ComponentType, ReactNode } from 'react';
import {
	createElement,
	useCallback,
	useContext,
	useEffect,
	useSyncExternalStore,
} from 'react';

import type * as BannerModuleNamespace from '../components/prompt/index';
import type { ConsentBannerCompoundComponent } from '../components/prompt/index';
import { KernelContext } from '../context';
import { useIsHydrated } from '../hooks/use-is-hydrated';
import { useServerSnapshot } from '../kernel-selector';
import { DeferredSessionContext, read, recordOnce } from './session';
import { addSurfaceWarmer } from './surface-warmers';

type BannerModule = typeof BannerModuleNamespace;

// oxlint-disable-next-line typescript/no-explicit-any -- Props pass through unchanged.
type AnyComponent = ComponentType<any>;

/**
 * Imports the banner's chunk. An object, so a test can make the import
 * fail.
 *
 * @internal
 */
export const bannerChunk = {
	load: (): Promise<BannerModule> => import('../components/prompt/index'),
};

let loaded: BannerModule | undefined;
const listeners = new Set<() => void>();

/**
 * Starts loading the banner's code once per page, retrying a failed import
 * as `recordOnce` does.
 *
 * @returns The module, recorded for `read`.
 * @internal
 */
export const loadClientBanner = recordOnce(async (): Promise<BannerModule> => {
	const module = await bannerChunk.load();
	loaded = module;
	for (const listener of listeners) {
		listener();
	}
	return module;
});

addSurfaceWarmer(() => {
	loadClientBanner();
});

const subscribeLoaded = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
const getLoaded = () => loaded;
const noSubscription = () => () => undefined;

interface GateProps {
	pick: (module: BannerModule) => AnyComponent;
	/** Load at first render, whatever the state shows. */
	eager: boolean;
	props: Record<string, unknown>;
}

const Gate = ({ eager, pick, props }: GateProps): ReactNode => {
	const module = useSyncExternalStore(subscribeLoaded, getLoaded, getLoaded);
	const hydrated = useIsHydrated();
	const session = useContext(DeferredSessionContext);
	const kernel = useContext(KernelContext);
	const serverSnapshot = useServerSnapshot(kernel);
	const subscribe = useCallback(
		(listener: () => void) =>
			kernel ? kernel.subscribe(() => listener()) : noSubscription(),
		[kernel]
	);
	const showing = useSyncExternalStore(
		subscribe,
		() => kernel?.getSnapshot().activeUI === 'banner',
		() => false
	);
	const load = eager || !session || showing;
	useEffect(() => {
		if (!load) {
			return;
		}
		let active = true;
		// After a failed download, ask again: `loadClientBanner` waits before
		// it retries and returns the same failure once it gave up.
		const wait = async (loading: Promise<BannerModule>): Promise<void> => {
			try {
				await loading;
			} catch {
				if (!active) {
					return;
				}
				const next = loadClientBanner();
				if (next !== loading) {
					await wait(next);
				}
			}
		};
		void wait(loadClientBanner());
		return () => {
			active = false;
		};
	}, [load]);
	if (module) {
		return createElement(pick(module), props);
	}
	if (!hydrated && (eager || serverSnapshot()?.activeUI === 'banner')) {
		// Hydrating a banner the server rendered: keep its markup until the
		// code is in.
		return createElement(pick(read(loadClientBanner())), props);
	}
	return null;
};

const PARTS = [
	'Root',
	'Card',
	'Header',
	'Title',
	'Description',
	'PolicyActions',
	'Footer',
	'FooterSubGroup',
	'RejectButton',
	'CustomizeButton',
	'AcceptButton',
	'DismissButton',
	'Rights',
	'RightLink',
	'Overlay',
] as const;

const pickBanner = (module: BannerModule): AnyComponent => module.ConsentBanner;

const ClientConsentBanner = (props: Record<string, unknown>): ReactNode =>
	createElement(Gate, { eager: false, pick: pickBanner, props });

for (const name of PARTS) {
	const pickPart = (module: BannerModule): AnyComponent =>
		module.ConsentBanner[name] as AnyComponent;
	const Part = (props: Record<string, unknown>): ReactNode =>
		createElement(Gate, { eager: true, pick: pickPart, props });
	Object.defineProperty(ClientConsentBanner, name, {
		configurable: true,
		enumerable: true,
		value: Part,
	});
}

/**
 * The stock consent banner. See `ConsentBanner` in
 * `components/prompt/index.ts` for its props and parts.
 *
 * @internal
 */
export const ConsentBanner =
	ClientConsentBanner as unknown as ConsentBannerCompoundComponent;
