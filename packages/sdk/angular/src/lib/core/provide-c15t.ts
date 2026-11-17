import { isPlatformBrowser } from '@angular/common';
import {
	inject,
	makeEnvironmentProviders,
	PLATFORM_ID,
	provideAppInitializer,
	provideEnvironmentInitializer,
} from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';

import { ConsentManager } from './consent-manager';
import { ConsentStyles } from './consent-styles';
import { ConsentTheme } from './consent-theme';
import type { DeferredRuntime } from './deferred/deferred-runtime';
import { HeadlessConsent } from './headless-consent';
import { C15T_OPTIONS } from './options';
import type { C15tProviderOptions } from './options';

/**
 * Set up c15t consent management for an application.
 *
 * Provides {@link ConsentManager}, {@link HeadlessConsent},
 * {@link ConsentTheme} and {@link ConsentStyles}, and creates the consent
 * state with the application, so gated scripts and the network blocker
 * follow consent even before any consent component renders. The consent
 * engine loads in a chunk of its own and starts in the browser after the
 * first render; after a server render it can wait for the page's largest
 * image. The server renders from the engine's initial state.
 *
 * Works with zoneless change detection and with zone.js. It provides no
 * change detection itself: the application chooses.
 *
 * @param options - The backend (`backendURL`, `mode` or `testing`) and the
 *   provider options, or an
 * external `runtime` its owner starts and disposes.
 * @returns Providers for `bootstrapApplication`'s `providers`, an
 * `ApplicationConfig`, or a route's `providers`.
 *
 * @example
 * ```ts
 * import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
 * import { hosted, provideC15t } from '@c15t/angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideZonelessChangeDetection(),
 *     provideC15t({ backendURL: '/api/c15t' }),
 *   ],
 * };
 * ```
 */
export const provideC15t = function provideC15t(
	options: C15tProviderOptions
): EnvironmentProviders {
	return makeEnvironmentProviders([
		{ provide: C15T_OPTIONS, useValue: options },
		ConsentManager,
		HeadlessConsent,
		ConsentTheme,
		ConsentStyles,
		// Create the runtime and theme with the application, not on first
		// injection: script gating and color scheme apply without any surface.
		// Not on the server, where neither runs: there the manager is created
		// by the render, after `provideC15tServer()` resolved the request.
		provideEnvironmentInitializer(() => {
			if (!isPlatformBrowser(inject(PLATFORM_ID))) {
				return;
			}
			inject(ConsentManager);
			inject(ConsentTheme);
		}),
		// A page with no server render to hydrate whose app hands over the
		// visitor's state (`prefetch`) renders the surfaces from it on the
		// first render: bootstrap waits for the engine's chunk, which builds
		// that state. Without `prefetch` the policy needs `/init` anyway.
		provideAppInitializer(async () => {
			if (!isPlatformBrowser(inject(PLATFORM_ID))) {
				return;
			}
			const consent = inject(ConsentManager);
			if (!consent.ɵwaitsForEngine()) {
				return;
			}
			await (consent.runtime as DeferredRuntime).ready;
		}),
	]);
};
