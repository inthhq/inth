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
 * Compound parts (`ConsentBanner.Root`, `ConsentDialog.Card`, ...) work
 * the same way, each in a Suspense boundary of its own.
 *
 * @packageDocumentation
 * @internal
 */

import type { ComponentType, ReactNode } from 'react';
import { Suspense, createElement, useContext } from 'react';

import type * as DialogModuleNamespace from '../aggregate-components';
import type { ConsentDialogCompoundComponent } from '../components/panel';
import type * as BannerModuleNamespace from '../components/prompt/index';
import type { ConsentBannerCompoundComponent } from '../components/prompt/index';
import { DeferredSessionContext, read, record } from './session';
import type { Recorded } from './session';

// oxlint-disable-next-line typescript/no-explicit-any -- Props pass through unchanged.
type AnyComponent = ComponentType<any>;

/** A surface's props, passed through unchanged. */
type SurfaceProps = Record<string, unknown>;

/** What a deferred root's engine module offers the surfaces. */
interface EngineSurfaces {
	ConsentBanner: AnyComponent;
	ConsentDialog: AnyComponent;
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
	let direct: Recorded<Module> | undefined =
		typeof window === 'undefined' ? record(load()) : undefined;
	const loadDirect = (): Recorded<Module> => {
		direct ??= record(load());
		return direct;
	};
	const fromEngine = (engine: unknown) =>
		pick(
			(engine as EngineSurfaces)[engineKey] as unknown as Record<
				string,
				AnyComponent
			>
		);
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
const surfaceWithParts = function surfaceWithParts<Module>(
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
	(): Promise<BannerModule> => import('../components/prompt/index'),
	(module) => module.ConsentBanner,
	[
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
	]
) as ConsentBannerCompoundComponent;

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
	[
		'Card',
		'Header',
		'HeaderTitle',
		'HeaderDescription',
		'Content',
		'Footer',
		'ConsentCustomizationCard',
		'ConsentDialogFooter',
		'ConsentDialogHeader',
		'ConsentDialogHeaderTitle',
		'ConsentDialogHeaderDescription',
		'ConsentDialogContent',
		'Overlay',
		'Root',
	]
) as ConsentDialogCompoundComponent;
