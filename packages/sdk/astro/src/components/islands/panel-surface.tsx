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
 *
 * `<ConsentDraftProvider>` is what makes Save work. `useConsentDraft()`
 * falls back to a draft per hook call when no provider is in scope, so the
 * category toggles and the Save button would each stage into their own
 * copy: the switch would flip, and the save would commit nothing.
 */

import { ConsentDraftProvider, InthProvider } from '@inth/react';
import { ConsentDialog } from '@inth/react/components/consent-dialog';
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

// React's stock dialog, which renders its Privacy Choices dialog when the
// design opts in. Only a Privacy Choices site loads it, on its own chunk;
// the classic dialog below stays the one every other site mounts.
type StockDialog = ComponentType<Record<string, never>>;
let loadedPrivacyChoicesDialog: StockDialog | undefined;
let privacyChoicesDialogPromise: Promise<StockDialog> | undefined;
const loadPrivacyChoicesDialog = () => {
	privacyChoicesDialogPromise ??= (async () => {
		const module = await import('@inth/react/consent-dialog');
		loadedPrivacyChoicesDialog = module.ConsentDialog as StockDialog;
		return loadedPrivacyChoicesDialog;
	})();
	return privacyChoicesDialogPromise;
};

const PrivacyChoicesDialogSurface = () => {
	const [loadedComponent, setLoadedComponent] = useState(
		() => loadedPrivacyChoicesDialog
	);
	const [failure, setFailure] = useState<{ error: unknown }>();
	useEffect(() => {
		if (loadedComponent) {
			return;
		}
		let active = true;
		void (async () => {
			try {
				const loaded = await loadPrivacyChoicesDialog();
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
	return Component ? <Component /> : null;
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
	/**
	 * `'privacy-choices'` renders React's Privacy Choices dialog, as the
	 * stock `ConsentDialog` does under that design.
	 */
	design?: 'classic' | 'privacy-choices';
}

const ConsentDialogSurface = ({
	runtime,
	options,
	kind = 'preferences',
	tab,
	legalLinks,
	design = 'classic',
}: ConsentDialogSurfaceProps) => {
	let surface;
	if (kind === 'iab') {
		surface = <IABDialogSurface tab={tab} />;
	} else if (design === 'privacy-choices') {
		surface = <PrivacyChoicesDialogSurface />;
	} else {
		surface = (
			<ConsentDraftProvider>
				<ConsentDialog legalLinks={legalLinks} />
			</ConsentDraftProvider>
		);
	}
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
