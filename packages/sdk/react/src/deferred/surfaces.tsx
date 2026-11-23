'use client';

/**
 * The stock banner and dialog for a deferred root.
 *
 * The server renders each one in full, so the banner is in the first HTML
 * and paints with it. In the browser a surface's code loads with the
 * engine; until then React keeps the server's markup, and the banner's
 * inline script records taps and hides it. Under a provider that is not
 * deferred, a surface loads its code at once.
 *
 * @packageDocumentation
 * @internal
 */

import type { ComponentType, ReactNode } from 'react';
import { Suspense, createElement, useContext } from 'react';

import type * as DialogModuleNamespace from '../aggregate-components';
import type { ConsentDialogProps } from '../components/dialog/consent-dialog.model';
import type * as BannerModuleNamespace from '../components/prompt/index';
import type { ConsentBannerProps } from '../components/prompt/index';
import {
	DeferredSessionContext,
	read,
	recordOnce,
} from './deferred-session-context';

// oxlint-disable-next-line typescript/no-explicit-any -- Props pass through unchanged.
type AnyComponent = ComponentType<any>;

/** A surface's props, passed through unchanged. */
type SurfaceProps = Record<string, unknown>;

/** What a deferred root's engine module offers the surfaces. */
interface EngineSurfaces {
	ConsentBanner: AnyComponent;
	ConsentDialog: AnyComponent;
	OptOutConfirmation: AnyComponent;
	/** Loads the container the server rendered the banner in. */
	preloadServerContainer?: () => Promise<void>;
}

const deferredSurface = function deferredSurface<Module>(
	key: string,
	load: () => Promise<Module>,
	pick: (component: Record<string, AnyComponent>) => AnyComponent,
	root: (module: Module) => AnyComponent,
	engineKey: keyof EngineSurfaces
): AnyComponent {
	// Started at module evaluation on the server, so a render finds it
	// loaded rather than suspending the surface into a later chunk.
	const loadDirect = recordOnce(load);
	if (typeof window === 'undefined') {
		loadDirect();
	}
	const fromEngine = async (engine: unknown): Promise<AnyComponent> => {
		const surfaces = engine as EngineSurfaces;
		// The banner hydrates over the server's markup: its container must be
		// in before it renders, or the container suspends inside a boundary
		// that is still hydrating, and an update there makes React replace
		// the server's banner with a client render.
		if (engineKey === 'ConsentBanner') {
			await surfaces.preloadServerContainer?.();
		}
		return pick(surfaces[engineKey] as unknown as Record<string, AnyComponent>);
	};
	const Gate = (props: SurfaceProps): ReactNode => {
		const session = useContext(DeferredSessionContext);
		// Under a deferred root the surface comes from the engine's module,
		// once the engine attached; elsewhere from its own.
		const component =
			typeof window === 'undefined' || !session
				? pick(
						root(read(loadDirect())) as unknown as Record<string, AnyComponent>
					)
				: read(session.surface(key, fromEngine));
		return createElement(component, props);
	};
	const Surface = (props: SurfaceProps) => (
		<Suspense fallback={null}>
			<Gate {...props} />
		</Suspense>
	);
	return Surface;
};

/** A deferred surface with lazily created deferred parts under `names`. */
export const surfaceWithParts = function surfaceWithParts<Module>(
	key: keyof EngineSurfaces,
	load: () => Promise<Module>,
	root: (module: Module) => AnyComponent,
	names: readonly string[]
): AnyComponent {
	const component = deferredSurface(
		key,
		load,
		(surface) => surface as unknown as AnyComponent,
		root,
		key
	);
	const cache: Record<string, AnyComponent> = {};
	for (const name of names) {
		Object.defineProperty(component, name, {
			configurable: true,
			enumerable: true,
			get() {
				cache[name] ??= deferredSurface(
					`${key}.${name}`,
					load,
					(surface) => surface[name] as AnyComponent,
					root,
					key
				);
				return cache[name];
			},
		});
	}
	return component;
};

type BannerModule = typeof BannerModuleNamespace;

/**
 * `ConsentBanner` whose code loads with a deferred root's engine.
 *
 * @internal
 */
export const DeferredConsentBanner = surfaceWithParts(
	'ConsentBanner',
	async (): Promise<BannerModule> => {
		const module = await import('../components/prompt/index');
		// The container the server rendered loads with the banner, so
		// hydration keeps the server's markup without a second wait.
		await module.preloadServerContainer();
		return module;
	},
	(module) => module.ConsentBanner,
	[]
) as ComponentType<ConsentBannerProps>;

type DialogModule = typeof DialogModuleNamespace;

/**
 * `ConsentDialog` whose wrapper loads with a deferred root's engine. The
 * dialog itself loads when it opens, as before.
 *
 * @internal
 */
export const DeferredConsentDialog = surfaceWithParts(
	'ConsentDialog',
	(): Promise<DialogModule> => import('../aggregate-components'),
	(module) => module.ConsentDialog,
	[]
) as ComponentType<ConsentDialogProps>;
