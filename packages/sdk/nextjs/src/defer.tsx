'use client';

/**
 * Loads an app's consent UI after the page's largest image.
 *
 * On a slow connection inth's client chunks share bandwidth with the hero
 * image and delay Largest Contentful Paint. `deferConsent()` wraps the app's
 * own `'use client'` consent module in `React.lazy`. The server imports it at
 * once, so the banner's HTML and CSS stay in the first response and paint
 * with it. The browser keeps that HTML and loads the module only when a
 * trigger fires, then hydrates it in place.
 *
 * This module imports nothing from the consent runtime, so the first-load
 * chunk only carries the trigger logic.
 *
 * Taps before hydration: inth's banner already records taps on its stock
 * actions with an inline script and replays the choice once the runtime
 * starts. The script this module adds wakes the loader on the first input
 * inside the island and queues clicks on its other controls, which it
 * replays after hydration.
 */

import { createElement, lazy, Suspense, useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';

/**
 * What starts loading the consent module. The first one to fire wins.
 *
 * - `image`: the first `img[fetchpriority="high"]` finished loading, or
 *   failed. Without one it waits for `load`.
 * - `load`: the window `load` event.
 * - `idle`: `requestIdleCallback`. On a throttled phone the main thread
 *   idles while the network is still busy, so this fires early.
 * - `interaction`: input inside the consent island only. Input always
 *   wakes the loader, whatever the list holds.
 */
export type ConsentLoadTrigger = 'image' | 'load' | 'idle' | 'interaction';

/** Options for {@link deferConsent}. */
export interface DeferConsentOptions {
	/**
	 * Triggers that start loading the module, or a function that returns
	 * them in the browser. Defaults to `['image']`.
	 */
	until?: readonly ConsentLoadTrigger[] | (() => readonly ConsentLoadTrigger[]);
	/**
	 * Milliseconds after which the module loads even if no trigger fired.
	 * `0` turns it off. Defaults to 10000.
	 */
	timeout?: number;
	/** CSP nonce for the inline script that captures early input. */
	nonce?: string;
}

/** Window state the inline script and the loader share. @internal */
interface DeferState {
	/** Queued clicks on controls other than the stock banner actions. */
	q: HTMLElement[];
	/** Input arrived before the loader listened. */
	w: boolean;
	/** The island hydrated; the script stops intercepting. */
	h: boolean;
	/** Wakes the loader. */
	f?: () => void;
}

/** @internal */
export const DEFER_WINDOW_KEY = '__inthDefer';

/** Attribute on the island's wrapper element. @internal */
export const DEFER_ATTRIBUTE = 'data-inth-deferred';

/**
 * Inline script that runs at parse time, before any chunk. Plain ES5.
 * Leaves `[data-action]` buttons in the stock banner to inth's early-tap
 * script, which hides the banner and replays the choice. @internal
 */
export const DEFER_CAPTURE_SCRIPT = `(function(w,k){if(w[k])return;var s=w[k]={q:[],w:false,h:false};function inside(e){var t=e.target;return t&&t.closest&&t.closest('[${DEFER_ATTRIBUTE}]')}function wake(){s.w=true;if(s.f)s.f()}['pointerdown','keydown','focusin'].forEach(function(n){w.addEventListener(n,function(e){if(!s.h&&inside(e))wake()},true)});w.addEventListener('click',function(e){if(s.h||!inside(e))return;wake();var b=e.target.closest('button,a,[role=button],input,label,summary');if(!b||b.closest('[data-testid="consent-banner-root"] [data-action]'))return;e.preventDefault();e.stopImmediatePropagation();if(s.q.indexOf(b)<0){s.q.push(b);b.setAttribute('aria-busy','true')}},true)})(window,'${DEFER_WINDOW_KEY}')`;

const readState = (): DeferState => {
	const host = window as unknown as Record<string, DeferState | undefined>;
	host[DEFER_WINDOW_KEY] ??= { h: false, q: [], w: false };
	return host[DEFER_WINDOW_KEY];
};

/**
 * Resolves when the first trigger fires, on input inside the island, or
 * after `timeout`.
 *
 * @internal
 */
export const waitForTrigger = (
	until: readonly ConsentLoadTrigger[],
	timeout: number
): Promise<void> =>
	new Promise((resolve) => {
		const state = readState();
		const fire = (): void => {
			state.f = undefined;
			resolve();
		};
		state.f = fire;
		if (state.w) {
			fire();
			return;
		}
		const onLoad = (): void => {
			if (document.readyState === 'complete') {
				fire();
			} else {
				window.addEventListener('load', fire, { once: true });
			}
		};
		for (const trigger of until) {
			if (trigger === 'load') {
				onLoad();
			} else if (trigger === 'image') {
				const image = document.querySelector<HTMLImageElement>(
					'img[fetchpriority="high"]'
				);
				if (!image) {
					onLoad();
				} else if (image.complete) {
					fire();
				} else {
					image.addEventListener('load', fire, { once: true });
					image.addEventListener('error', fire, { once: true });
				}
			} else if (trigger === 'idle') {
				if (typeof window.requestIdleCallback === 'function') {
					window.requestIdleCallback(fire);
				} else {
					setTimeout(fire, 0);
				}
			}
		}
		if (timeout > 0) {
			setTimeout(fire, timeout);
		}
	});

/** Stops intercepting and replays clicks queued before hydration. */
const replayQueued = (): void => {
	const state = readState();
	state.h = true;
	for (const element of state.q.splice(0)) {
		element.removeAttribute('aria-busy');
		if (element.isConnected) {
			element.click();
		}
	}
};

/**
 * Wraps a consent module so its JavaScript loads after the page's largest
 * image, while the server still renders its HTML.
 *
 * Call it at module scope in a `'use client'` file. The loaded component
 * should hold everything that uses Inth: `ConsentRoot`, the banner, the
 * dialog, and any component that calls Inth hooks. Render the page itself
 * outside it, so the page hydrates without waiting for Inth.
 *
 * Until the module loads, the banner shows but its buttons only record
 * taps. Scripts that `ConsentRoot` starts on the server for a returning
 * visitor still start at parse time; scripts a client component registers
 * with `useScriptLoader` start after the module loads.
 *
 * @param load - Imports the consent module. Use a dynamic `import()` so the
 * bundler keeps it out of the first-load chunks.
 * @param options - Triggers, timeout, and CSP nonce.
 * @returns A component that takes the loaded component's props.
 *
 * @example
 * ```tsx
 * // app/consent-island.tsx
 * 'use client';
 * import { deferConsent } from '@inth/nextjs/defer';
 *
 * export const ConsentIsland = deferConsent(async () => ({
 *   default: (await import('./consent')).Consent,
 * }));
 *
 * // app/layout.tsx (Server Component)
 * <body>
 *   {children}
 *   <ConsentIsland state={resolveConsent()} />
 * </body>
 * ```
 */
export const deferConsent = function deferConsent<Props extends object>(
	load: () => Promise<{ default: (props: Props) => ReactNode }>,
	options: DeferConsentOptions = {}
): (props: Props) => ReactNode {
	// oxlint-disable-next-line typescript/no-explicit-any -- `lazy` erases the props type; `Deferred` restores it.
	const Lazy = lazy<ComponentType<any>>(async () => {
		if (typeof window !== 'undefined') {
			const until =
				typeof options.until === 'function'
					? options.until()
					: (options.until ?? ['image']);
			await waitForTrigger(until, options.timeout ?? 10_000);
		}
		const Inner = (await load()).default as ComponentType<Props>;
		const Hydrated = (props: Props): ReactNode => {
			useEffect(replayQueued, []);
			return createElement(Inner, props);
		};
		return { default: Hydrated };
	});
	const Deferred = (props: Props): ReactNode =>
		createElement(
			'div',
			{ [DEFER_ATTRIBUTE]: '', style: { display: 'contents' } },
			createElement('script', {
				// oxlint-disable-next-line react/no-danger -- inth's own constant script, no interpolated input.
				dangerouslySetInnerHTML: {
					// The server's script already ran; the browser keeps it.
					__html: typeof window === 'undefined' ? DEFER_CAPTURE_SCRIPT : '',
				},
				nonce: options.nonce,
				suppressHydrationWarning: true,
			}),
			createElement(Suspense, { fallback: null }, createElement(Lazy, props))
		);
	return Deferred;
};
