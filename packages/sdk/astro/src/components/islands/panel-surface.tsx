/**
 * The on-demand React dialog island.
 *
 * Mounted with `createRoot()` the first time something opens a dialog —
 * never with `client:load` — so a visitor who never opens the preference
 * centre downloads no React from us at all.
 *
 * The provider renders against the page's runtime rather than building one
 * of its own: Astro islands cannot see each other's context, so the kernel
 * has to be owned outside the component tree. `<InthProvider runtime>`
 * borrows it and leaves `start()`/`dispose()` to the owner.
 */

import { InthProvider } from '@inth/react';
import type { LegalLinks } from '@inth/sdk/engine';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

import type { DialogPresentationOptions } from '../../ui/provider-props';
import type { IABDialogSurfaceProps } from './iab-dialog-surface';

// The TCF surface is the larger half of this island and only an IAB site
// ever opens it, so it arrives on its own chunk.
let loadedIABSurface: ComponentType<IABDialogSurfaceProps> | undefined;
let iabSurfacePromise:
	| Promise<ComponentType<IABDialogSurfaceProps>>
	| undefined;
const loadIABSurface = () => {
	iabSurfacePromise ??= (async () => {
		const module = await import('./iab-dialog-surface');
		loadedIABSurface = module.default;
		return loadedIABSurface;
	})();
	return iabSurfacePromise;
};

type PreferencesDialog = ComponentType<{
	legalLinks?: (keyof LegalLinks)[] | null;
}>;

// React's `ConsentDialog` arrives on its own chunk, so an IAB page never
// downloads it. It stages its own draft and hosts the opt-in confirmation
// and the opt-out receipt.
let loadedDialog: PreferencesDialog | undefined;
let dialogPromise: Promise<PreferencesDialog> | undefined;

/**
 * Download the dialog. The adapter awaits it before it mounts, so the
 * island renders the dialog on its first commit; a failed download is
 * forgotten, so the next open tries again.
 *
 * @internal
 */
export const preloadDialog =
	function preloadDialog(): Promise<PreferencesDialog> {
		dialogPromise ??= (async () => {
			try {
				const component = (await import('@inth/react/consent-dialog'))
					.ConsentDialog as PreferencesDialog;
				loadedDialog = component;
				return component;
			} catch (error) {
				dialogPromise = undefined;
				throw error;
			}
		})();
		return dialogPromise;
	};

const PreferencesDialogSurface = ({
	legalLinks,
}: {
	legalLinks?: (keyof LegalLinks)[] | null;
}) => {
	const [loadedComponent, setLoadedComponent] = useState(() => loadedDialog);
	const [failure, setFailure] = useState<{ error: unknown }>();
	useEffect(() => {
		if (loadedComponent) {
			return;
		}
		let active = true;
		void (async () => {
			try {
				const loaded = await preloadDialog();
				if (active) {
					setLoadedComponent(() => loaded);
				}
			} catch (error) {
				if (active) {
					setFailure({ error });
				}
			}
		})();
		return () => {
			active = false;
		};
	}, [loadedComponent]);
	if (failure) {
		throw failure.error;
	}
	const Component = loadedComponent;
	// Its footer shows the regime's one legal link, which `legalLinks` may
	// hide.
	return Component ? <Component legalLinks={legalLinks} /> : null;
};

// This island only mounts in the browser. Resolve its component through state
// so the first open does not wait for React's Suspense retry throttle.
const IABDialogSurface = (props: IABDialogSurfaceProps) => {
	const [loadedComponent, setLoadedComponent] = useState(
		() => loadedIABSurface
	);
	const [failure, setFailure] = useState<{ error: unknown }>();
	useEffect(() => {
		if (loadedComponent) {
			return;
		}
		let active = true;
		void (async () => {
			try {
				const loaded = await loadIABSurface();
				if (active) {
					setLoadedComponent(() => loaded);
				}
			} catch (error) {
				if (active) {
					setFailure({ error });
				}
			}
		})();
		return () => {
			active = false;
		};
	}, [loadedComponent]);
	if (failure) {
		throw failure.error;
	}
	const Component = loadedComponent;
	return Component ? <Component {...props} /> : null;
};

/** Props the React dialog adapter passes in. */
export interface ConsentDialogSurfaceProps {
	/** The page-level runtime. The provider borrows it, it does not own it. */
	runtime: ConsentRuntime;
	/** Presentation options forwarded to the provider. */
	options: DialogPresentationOptions;
	/** Which dialog to render. */
	kind?: 'preferences' | 'iab';
	/** Which IAB preference-centre tab to open on. */
	tab?: 'purposes' | 'vendors';
	/** Which legal links the preferences dialog shows. */
	legalLinks?: (keyof LegalLinks)[] | null;
}

const ConsentDialogSurface = ({
	runtime,
	options,
	kind = 'preferences',
	tab,
	legalLinks,
}: ConsentDialogSurfaceProps) => {
	const surface =
		kind === 'iab' ? (
			<IABDialogSurface tab={tab} />
		) : (
			<PreferencesDialogSurface legalLinks={legalLinks} />
		);
	return (
		<InthProvider
			runtime={runtime}
			options={options}
		>
			{surface}
		</InthProvider>
	);
};

export default ConsentDialogSurface;
